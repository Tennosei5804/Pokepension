// Le service worker du site : PokéPension hors ligne, et sur l'écran d'accueil.
//
// GABARIT — outils/assembler.py y injecte la version et la liste de la
// coquille au moment de l'assemblage, en remplaçant les deux marqueurs
// soulignés qui figurent plus bas.
//
// Ne pas éditer site/public/sw.js : il est réécrit à chaque assemblage, comme
// tout le reste de public/. C'est CE fichier-ci qu'on modifie.
//
// POURQUOI. C'est sur le téléphone posé à côté de la Switch qu'on coche, pas
// sur l'ordinateur. Le site s'adaptait déjà à la fenêtre — mesuré : 302 px
// utiles sur un écran de 375, cibles tactiles à 44 px sous « pointer: coarse »
// — mais il ne s'installait pas, ne s'ouvrait pas hors ligne, et vivait dans
// un onglet qu'on perd. Un tracker qu'on ouvre en deux secondes se remplit ;
// un onglet perdu ne se remplit pas.
//
// DEUX STRATÉGIES, ET LA RAISON DE CHACUNE :
//
//   · LA COQUILLE — index.html, les feuilles, les scripts du premier
//     chargement, les polices, les bannières — est mise en cache à
//     l'installation. C'est ce qu'il faut pour que l'application s'ouvre sans
//     réseau, et c'est ce que l'assembleur sait énumérer sans se tromper : il
//     lit les balises de la page qu'il vient d'écrire.
//
//   · LES RÉSERVES À LA DEMANDE — les lieux, les attaques, les notices,
//     Cobblemon, à elles seules 5,3 Mo — sont mises en cache au premier usage.
//     Les précharger tripleraient l'installation pour des panneaux qu'on
//     n'ouvre pas toujours, ce qui est exactement le raisonnement qui les avait
//     sorties du démarrage.
//
// LA VERSION EST CELLE DES FICHIERS, pas un numéro tenu à la main. Un numéro
// s'oublie, et un cache qu'on oublie de purger sert du code mort en croyant
// bien faire — c'est le même piège que celui qu'évite déjà `genereLe` pour le
// cache local de l'application.

const VERSION = '__VERSION__';
const CACHE = 'pokepension-' + VERSION;
const COQUILLE = __COQUILLE__;

self.addEventListener('install', function(e){
  e.waitUntil((async function(){
    const c = await caches.open(CACHE);
    // Un par un plutôt que addAll : addAll abandonne TOUT si un seul fichier
    // manque, et une coquille de quarante fichiers ne doit pas tomber entière
    // parce qu'une bannière a été renommée.
    await Promise.all(COQUILLE.map(function(url){
      return c.add(new Request(url, { cache: 'reload' })).catch(function(){});
    }));
    // On prend la main tout de suite : sans cela, la première visite installe
    // un worker qui ne servira qu'au rechargement suivant, et « ça marche
    // hors ligne » resterait faux jusque-là.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function(e){
  e.waitUntil((async function(){
    const noms = await caches.keys();
    await Promise.all(noms.map(function(n){
      // Tout ce qui porte notre préfixe sans être la version du jour part :
      // c'est la purge, et elle se déclenche d'elle-même à chaque assemblage.
      return (n.indexOf('pokepension-') === 0 && n !== CACHE) ? caches.delete(n) : null;
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function(e){
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  // Les sprites viennent de PokeOS et de Showdown : on ne s'en mêle pas. Les
  // mettre en cache ferait grossir sans fin un stockage qu'on ne purge jamais,
  // et le navigateur les garde déjà très bien tout seul.
  if(url.origin !== self.location.origin) return;

  // Une navigation : on rend la page en cache dès qu'on ne peut pas mieux.
  // Sans cette branche, ouvrir l'application hors ligne montre l'écran de
  // dinosaure du navigateur, et non l'application.
  if(req.mode === 'navigate'){
    e.respondWith((async function(){
      try{
        return await fetch(req);
      }catch(err){
        const c = await caches.open(CACHE);
        // DEUX PAGES, DEUX REPLIS. Le site a une page d'accueil sur « / » et le
        // Pokedex sur « /dex ». Rendre l'accueil a quelqu'un qui rouvre son
        // Pokedex dans le metro serait lui reprendre l'application pour lui
        // remettre la vitrine — hors ligne, c'est le Pokedex qu'on veut.
        const versLeDex = url.pathname.indexOf('/dex') !== -1;
        const replis = versLeDex
          ? ['./dex.html', './dex', './index.html']
          : ['./index.html', './'];
        for(const r of replis){
          const p = await c.match(r);
          if(p) return p;
        }
        return Response.error();
      }
    })());
    return;
  }

  e.respondWith((async function(){
    const c = await caches.open(CACHE);
    const enCache = await c.match(req, { ignoreSearch: true });
    if(enCache) return enCache;
    try{
      const reponse = await fetch(req);
      // On garde ce qui a réussi, y compris les réserves à la demande : c'est
      // là qu'elles entrent dans le cache, à leur première ouverture.
      if(reponse && reponse.status === 200 && reponse.type === 'basic'){
        c.put(req, reponse.clone());
      }
      return reponse;
    }catch(err){
      // Ni en cache ni en ligne. Une réponse d'erreur explicite vaut mieux
      // qu'une promesse rejetée : le code qui charge les réserves sait déjà
      // se taire proprement sur un échec.
      return new Response('', { status: 504, statusText: 'Hors ligne' });
    }
  })());
});
