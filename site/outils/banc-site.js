// Ce que le banc du site vérifie. Chargé par outils/banc.py, jamais par le site.
//
// LA RÈGLE, la même que pour le banc de l'application : un bug est passé, on
// écrit la vérification qui l'aurait arrêté. Pas de tests écrits « au cas où »
// — ils vieillissent mal et personne ne les relit. Chaque entrée ci-dessous
// porte donc le nom du problème réel qu'elle surveille, et la plupart sont des
// défauts rencontrés en bâtissant ce site.
//
// DEUX FAMILLES. Le pont se vérifie ici même, en appelant ses commandes. La
// mise en page demande une largeur : on la mesure dans une iframe dimensionnée,
// parce que les requêtes de média répondent à la taille de la fenêtre qui les
// contient — c'est le seul moyen d'éprouver le 375 px sans redimensionner la
// vraie fenêtre.

// TOUT DANS UNE FERMETURE. Les scripts de l'application sont classiques et
// partagent la portee globale : compte.js y declare deja « invoke », et un
// second const du meme nom fait echouer le fichier entier au chargement — le
// banc ne se lancait pas, sans un mot dans la page. On n'expose donc que le
// resultat, a la fin.
(function(){
'use strict';

const BANC = [];
function verifier(titre, quoi, fn){ BANC.push({ titre: titre, quoi: quoi, fn: fn }); }

// Celui de l'application, deja pose par le pont : le redeclarer est ce qui
// cassait tout.
const invoke = window.__TAURI__.core.invoke;
const CLE = 'pokearchive-site-v1';

/** Repartir d'une réserve vide, pour que l'ordre des vérifications ne compte pas. */
function neuf(){ localStorage.removeItem(CLE); }

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Le pont ---------------------------------------------------------------

verifier('Le pont',
  'Les trente-deux commandes répondent — aucune n’est absente du pont',
  async function(){
    // La liste est celle que l'application appelle réellement, relevée par
    // « grep invoke(' » sur app/src/js. Une commande oubliée ici se voyait
    // seulement le jour où l'écran qui s'en sert était ouvert.
    const toutes = ['amis','amis_fil','amis_nouveautes','amis_vu','changer_pseudo',
      'changer_visibilite','connexion','creer_profil','deconnexion','dex_de',
      'dresseurs','ecrire_dex','etat','exporter','fermer_les_autres','fermer_session',
      'historique','journal','lire_dex','modifier_profil','moi','ne_plus_suivre',
      'presence_effacer','presence_maj','profils','profils_de','renommer_dresseur',
      'retrospective','sessions','succes_de','suivre','supprimer_profil'];
    neuf();
    await invoke('connexion', { pseudo: 'Banc' });
    const absentes = [];
    for(const c of toutes){
      try{ await invoke(c, {}); }
      catch(e){
        // Un refus métier est une réponse ; « absente du pont » n'en est pas une.
        if(String(e.message || e).indexOf('absente du pont') > -1) absentes.push(c);
      }
    }
    if(absentes.length) return 'échec : ' + absentes.length + ' absente(s) — ' + absentes.join(', ');
    return toutes.length + ' commandes, toutes présentes';
  });

verifier('Le pont',
  'Un dex neuf répond « Aucun dex en ligne » — l’application attend ce refus précis',
  async function(){
    neuf();
    await invoke('connexion', { pseudo: 'Banc' });
    try{
      await invoke('lire_dex', { profil: null });
      return 'échec : la lecture a réussi là où elle devait refuser';
    }catch(e){
      const m = String(e.message || e);
      if(m.indexOf('Aucun dex') === -1) return 'échec : refus inattendu — ' + m;
      return 'refus attendu, message conforme';
    }
  });

verifier('Le pont',
  'Une aventure existe sans qu’on l’ait demandée',
  async function(){
    neuf();
    await invoke('connexion', { pseudo: 'Banc' });
    const p = await invoke('profils');
    if(p.profils.length !== 1) return 'échec : ' + p.profils.length + ' aventure(s)';
    if(!p.profils[0].par_defaut) return 'échec : la première n’est pas celle par défaut';
    return '« ' + p.profils[0].nom +' », par défaut';
  });

verifier('Le journal',
  'Un Pokémon coché normal ET chromatique fait deux lignes, comme dans l’API',
  async function(){
    neuf();
    await invoke('connexion', { pseudo: 'Banc' });
    const d = { version: 1, dex: { rby: { caught: ['bulbasaur','pikachu'], shiny: ['pikachu'] } } };
    await invoke('ecrire_dex', { donnees: d, profil: null });
    const h = await invoke('historique', {});
    // nouveautes() côté serveur pousse une ligne par (jeu, champ, nom) : pikachu
    // compte donc deux fois, « attrapé » et « attrapé en chromatique ».
    if(h.total !== 3) return 'échec : ' + h.total + ' ligne(s) au lieu de 3';
    const chroma = h.lignes.filter((l) => l.chromatique).length;
    if(chroma !== 1) return 'échec : ' + chroma + ' chromatique(s) au lieu de 1';
    return '3 lignes, dont 1 chromatique';
  });

verifier('Le journal',
  'Ré-enregistrer à l’identique n’ajoute rien',
  async function(){
    neuf();
    await invoke('connexion', { pseudo: 'Banc' });
    const d = { version: 1, dex: { rby: { caught: ['bulbasaur'], shiny: [] } } };
    await invoke('ecrire_dex', { donnees: d, profil: null });
    const avant = (await invoke('historique', {})).total;
    await invoke('ecrire_dex', { donnees: d, profil: null });
    await invoke('ecrire_dex', { donnees: d, profil: null });
    const apres = (await invoke('historique', {})).total;
    if(apres !== avant) return 'échec : ' + avant + ' → ' + apres;
    return 'toujours ' + apres + ' après trois enregistrements';
  });

verifier('Le journal',
  'Décocher ne journalise pas — c’est une correction, pas un événement',
  async function(){
    neuf();
    await invoke('connexion', { pseudo: 'Banc' });
    await invoke('ecrire_dex', { profil: null,
      donnees: { version: 1, dex: { rby: { caught: ['bulbasaur','pikachu'], shiny: [] } } } });
    const avant = (await invoke('historique', {})).total;
    await invoke('ecrire_dex', { profil: null,
      donnees: { version: 1, dex: { rby: { caught: ['bulbasaur'], shiny: [] } } } });
    const h = await invoke('historique', {});
    if(h.total !== avant) return 'échec : le retrait a ajouté une ligne';
    // Le compte de l'aventure, lui, suit ce qui est coché maintenant.
    const p = await invoke('profils');
    if(p.profils[0].captures !== 1) return 'échec : ' + p.profils[0].captures + ' capture(s) au lieu de 1';
    return 'journal figé à ' + h.total + ', compte descendu à 1';
  });

verifier('Le journal',
  'La pagination se fait sur l’identifiant et non sur un décalage',
  async function(){
    // LE BUG : le pont lisait « depuis » quand l'application passe « avant ».
    // La première page marchait, et « voir plus » resservait la même
    // indéfiniment. Passé inaperçu jusqu'à la relecture du contrat de l'API.
    neuf();
    await invoke('connexion', { pseudo: 'Banc' });
    const noms = [];
    for(let i = 0; i < 8; i++) noms.push('espece-' + i);
    await invoke('ecrire_dex', { profil: null,
      donnees: { version: 1, dex: { rby: { caught: noms, shiny: [] } } } });

    const p1 = await invoke('historique', {});
    if(p1.lignes.length !== 8) return 'échec : première page de ' + p1.lignes.length;
    const dernier = p1.lignes[p1.lignes.length - 1].id;
    const p2 = await invoke('historique', { avant: dernier });
    if(p2.lignes.length !== 0) return 'échec : ' + p2.lignes.length + ' ligne(s) après la dernière';

    // Le vrai piège : demander à partir du milieu doit rendre ce qui PRÉCÈDE.
    const milieu = p1.lignes[3].id;
    const p3 = await invoke('historique', { avant: milieu });
    if(!p3.lignes.length) return 'échec : rien avant le milieu';
    if(p3.lignes.some((l) => l.id >= milieu)) return 'échec : une ligne rendue n’est pas antérieure';
    if(p3.lignes[0].id !== milieu - 1) return 'échec : la suite reprend à ' + p3.lignes[0].id;
    return 'curseur respecté, ' + p3.lignes.length + ' ligne(s) avant le milieu';
  });

verifier('Le journal',
  '« journal » couvre toutes les aventures et les nomme ; « historique » non',
  async function(){
    // Deux commandes, deux questions. Le pont rendait une liste vide pour
    // « journal », et la page paraissait cassée plutôt que de dire pourquoi.
    neuf();
    await invoke('connexion', { pseudo: 'Banc' });
    const un = (await invoke('profils')).profils[0];
    await invoke('ecrire_dex', { profil: un.id,
      donnees: { version: 1, dex: { rby: { caught: ['bulbasaur'], shiny: [] } } } });
    const deux = (await invoke('creer_profil', { nom: 'Seconde' })).profil;
    await invoke('ecrire_dex', { profil: deux.id,
      donnees: { version: 1, dex: { gsc: { caught: ['hoothoot','sentret'], shiny: [] } } } });

    const tout = await invoke('journal', {});
    if(tout.lignes.length !== 3) return 'échec : ' + tout.lignes.length + ' ligne(s) au lieu de 3';
    const sansNom = tout.lignes.filter((l) => !l.aventure);
    if(sansNom.length) return 'échec : ' + sansNom.length + ' ligne(s) sans nom d’aventure';

    const sien = await invoke('historique', { id: deux.id });
    if(sien.total !== 2) return 'échec : historique rend ' + sien.total + ' au lieu de 2';
    if(sien.lignes.some((l) => l.dex !== 'gsc')) return 'échec : une ligne d’une autre aventure';
    return '3 lignes nommées au total, 2 pour la seconde aventure';
  });

verifier('Le pont',
  'Ce qui est coché est retrouvé tel quel dans la réserve',
  async function(){
    neuf();
    await invoke('connexion', { pseudo: 'Tennôsei' });
    const d = { version: 1, dex: { rby: { caught: ['bulbasaur'], shiny: ['pikachu'] } } };
    await invoke('ecrire_dex', { donnees: d, profil: null });

    const relu = await invoke('lire_dex', { profil: null });
    if(JSON.stringify(relu.dex) !== JSON.stringify(d.dex)) return 'échec : le dex relu diffère';

    // Et dans le stockage lui-même : c'est lui qui survit au rechargement.
    const brut = localStorage.getItem(CLE);
    if(!brut) return 'échec : rien n’est écrit dans localStorage';
    const etat = JSON.parse(brut);
    if(!etat.dresseur || etat.dresseur.pseudo !== 'Tennôsei') return 'échec : le pseudo n’est pas gardé';
    if(!etat.dex || !etat.dex[relu.profilId]) return 'échec : le dex n’est pas gardé';
    if(etat.journal.length !== 2) return 'échec : ' + etat.journal.length + ' ligne(s) de journal gardée(s)';
    return Math.round(brut.length / 1024) + ' Ko en réserve, pseudo et dex compris';
  });

verifier('Le pont',
  'Se déconnecter oublie le nom, sans fermer la porte ni vider la collection',
  async function(){
    // DEUX CHOSES ICI, ET LA SECONDE A CHANGÉ.
    //
    // La collection reste : il n'y a pas de serveur d'où la retélécharger,
    // l'effacer serait définitif, et personne ne s'attend à ça en cliquant
    // « déconnexion ».
    //
    // Mais le site n'a PLUS d'écran de connexion — on y arrive et on coche.
    // `etat` répond donc toujours « connecté », y compris après une
    // déconnexion : c'est ce qui empêche l'application de dresser un mur là où
    // il n'y a rien derrière. Cette vérification attendait l'inverse et
    // signalait un échec sur un comportement voulu ; elle surveille désormais
    // qu'on ne réintroduise pas ce mur par accident.
    neuf();
    await invoke('connexion', { pseudo: 'Banc' });
    await invoke('ecrire_dex', { profil: null,
      donnees: { version: 1, dex: { rby: { caught: ['bulbasaur'], shiny: [] } } } });
    await invoke('deconnexion');

    if(!(await invoke('etat')).connecte){
      return 'échec : le site redemande une connexion qu’il ne sait pas faire';
    }
    const etat = JSON.parse(localStorage.getItem(CLE));
    if(!etat.dex || !Object.keys(etat.dex).length) return 'échec : le dex est parti avec le nom';
    if(etat.journal.length !== 1) return 'échec : le journal est parti';
    // `etat` a reposé un dresseur par défaut : c'est lui qu'on doit retrouver,
    // et surtout pas « Banc ».
    if(etat.dresseur && etat.dresseur.pseudo === 'Banc') return 'échec : le nom est resté';
    return 'nom oublié, dex et journal gardés, aucun mur de connexion';
  });

verifier('Le pont',
  'Ce qui demande d’autres joueurs se tait, au lieu de planter',
  async function(){
    neuf();
    await invoke('connexion', { pseudo: 'Banc' });
    // Vides : l'application affiche déjà « Personne d'autre pour l'instant ».
    const vides = { dresseurs: 'dresseurs', amis: 'amis' };
    for(const c of Object.keys(vides)){
      const r = await invoke(c, {});
      if(!Array.isArray(r[vides[c]])) return 'échec : ' + c + ' ne rend pas de liste';
      if(r[vides[c]].length) return 'échec : ' + c + ' invente ' + r[vides[c]].length + ' entrée(s)';
    }
    // Celles qui n'ont aucune réponse honnête doivent échouer franchement.
    for(const c of ['dex_de', 'profils_de', 'succes_de']){
      let jete = false;
      try{ await invoke(c, { pseudo: 'X' }); }catch(e){ jete = true; }
      if(!jete) return 'échec : ' + c + ' a répondu quelque chose';
    }
    return 'listes vides sans invention, visites refusées franchement';
  });

verifier('Le pont',
  'La rétrospective compte les mêmes jours que le journal',
  async function(){
    neuf();
    await invoke('connexion', { pseudo: 'Banc' });
    await invoke('ecrire_dex', { profil: null,
      donnees: { version: 1, dex: { rby: { caught: ['a','b','c'], shiny: ['a'] } } } });
    const r = await invoke('retrospective');
    if(r.total !== 4) return 'échec : total ' + r.total + ' au lieu de 4';
    if(r.jours.length !== 1) return 'échec : ' + r.jours.length + ' jour(s)';
    if(r.jours[0].chromatiques !== 1) return 'échec : ' + r.jours[0].chromatiques + ' chromatique(s)';
    if(!r.premier) return 'échec : aucun premier jour';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.jours[0].jour)) return 'échec : jour mal formé — ' + r.jours[0].jour;
    return '4 captures, 1 jour, 1 chromatique, date au format du serveur';
  });

verifier('La synchro',
  'L’export rend le format d’échange, celui que l’application sait lire',
  async function(){
    // LE BUG : le pont rendait le dex brut. donnees-perso.js lit
    // contenu.aventures pour annoncer « n aventures enregistrées », et en
    // comptait zéro — le fichier produit par le site était illisible par
    // l'application, sans que rien ne le dise.
    neuf();
    await invoke('connexion', { pseudo: 'Banc' });
    await invoke('ecrire_dex', { profil: null,
      donnees: { version: 1, dex: { rby: { caught: ['bulbasaur'], shiny: ['pikachu'] } } } });
    await invoke('creer_profil', { nom: 'Seconde', mode: 'living' });

    const x = await invoke('exporter');
    if(x.format !== 'pokearchive-1') return 'échec : format « ' + x.format + ' »';
    if(!Array.isArray(x.aventures)) return 'échec : aucune liste d’aventures';
    if(x.aventures.length !== 2) return 'échec : ' + x.aventures.length + ' aventure(s) au lieu de 2';
    if(!x.dresseur || x.dresseur.pseudo !== 'Banc') return 'échec : le dresseur manque';
    if(!x.exporteLe) return 'échec : aucune date d’export';

    const une = x.aventures[0];
    // Les champs que l'API rend, et que l'application ou une reprise attendent.
    for(const champ of ['nom','mode','niveau_formes','dex','historique']){
      if(!(champ in une)) return 'échec : « ' + champ + ' » absent d’une aventure';
    }
    if(!une.dex || !une.dex.dex || !une.dex.dex.rby) return 'échec : le dex n’est pas dans l’aventure';
    if(une.historique.length !== 2) return 'échec : ' + une.historique.length + ' ligne(s) d’historique';
    if(!une.historique[0].ajoute_le) return 'échec : une ligne d’historique sans date';
    // Un identifiant de base n'a aucun sens hors de la base : l'API le retire.
    if('id' in une) return 'échec : un identifiant d’aventure est sorti';
    return 'format pokearchive-1, 2 aventures, dex et historique compris';
  });

verifier('Le pont HTTP',
  'Une photo part avec son aventure, et revient en adresse `data:`',
  async function(){
    // LE BUG, ET IL TOUCHAIT TOUTES LES PHOTOS DU SITE. L'écran fait
    // `img.src = await invoke('image_charger', …)` sans regarder ce qu'il
    // reçoit : le Rust rend une adresse `data:`, le pont HTTP rendait un objet
    // `{ mime, octets }`. Le navigateur écrivait donc « [object Object] » dans
    // l'attribut et n'affichait rien — sans erreur, sans console, sans indice.
    //
    // ON CHARGE LE VRAI PONT, celui que le site livre, dans une fenêtre à part :
    // le charger ici remplacerait `window.__TAURI__` sous les autres
    // vérifications, qui parlent encore à l'ancien pont local.
    const octets = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-9999px;top:0;border:0;width:10px;height:10px;';
    f.srcdoc = '<!doctype html><meta charset="utf-8"><body></body>';
    document.body.appendChild(f);
    try{
      await new Promise(function(r){ f.onload = r; });
      const w = f.contentWindow;

      // Le serveur simulé : on n'éprouve pas l'API ici, mais ce que le pont
      // fait des octets qu'elle rend.
      w.fetch = async function(){
        return {
          ok: true, status: 200,
          headers: { get: function(n){
            return /content-type/i.test(n) ? 'image/png' : null; } },
          arrayBuffer: async function(){ return octets.buffer; },
        };
      };
      // UNE IFRAME srcdoc PARTAGE L'ORIGINE DE LA PAGE, donc son localStorage.
      // Poser ce jeton d'essai écrase la vraie session de qui lance le banc, et
      // le retirer le déconnecte. On garde donc ce qui était là pour le rendre.
      const jetonAvant = w.localStorage.getItem('pokearchive-jeton');
      w.localStorage.setItem('pokearchive-jeton', 'jeton-de-banc');

      await new Promise(function(tenir, rejeter){
        const s = w.document.createElement('script');
        s.src = '/js/pont-api.js';
        s.onload = tenir;
        s.onerror = function(){ rejeter(new Error('pont-api.js absent de public/')); };
        w.document.body.appendChild(s);
      });

      // L'ENVOI D'ABORD : l'aventure et le sujet doivent voyager dans l'adresse,
      // comme le fait le Rust. Sans eux le serveur retombait sur l'aventure PAR
      // DÉFAUT et sur le sujet « chasse » — une photo posée depuis une seconde
      // aventure atterrissait dans la première, où le ménage l'effaçait au
      // prochain enregistrement ; et une image de message, déposée en
      // « chasse », subissait le même sort.
      let vue = null;
      w.fetch = async function(url){
        vue = String(url);
        return {
          ok: true, status: 200,
          headers: { get: function(n){
            return /content-type/i.test(n) ? 'image/png' : null; } },
          json: async function(){ return { ok: true, id: 7 }; },
          arrayBuffer: async function(){ return octets.buffer; },
        };
      };
      await w.__TAURI__.core.invoke('image_envoyer',
        { profil: 42, sujet: 'message', mime: 'image/png', octets: [1, 2, 3] });
      if(vue.indexOf('sujet=message') === -1){
        return 'échec : le sujet ne voyage pas — ' + vue;
      }
      if(vue.indexOf('profil=42') === -1){
        return 'échec : l’aventure ne voyage pas — ' + vue;
      }

      const rendu = await w.__TAURI__.core.invoke('image_charger', { id: 1 });
      if(typeof rendu !== 'string'){
        return 'échec : le pont rend un ' + typeof rendu + ' — img.src écrirait « [object Object] »';
      }
      if(rendu.indexOf('data:image/png;base64,') !== 0){
        return 'échec : adresse inattendue — ' + rendu.slice(0, 40);
      }
      // Et les octets sont bien ceux du serveur, pas une chaîne tronquée.
      if(w.atob(rendu.split(',')[1]).length !== octets.length){
        return 'échec : les octets ne survivent pas au passage en base64';
      }
      return 'sujet et aventure dans l’adresse ; data:image/png, '
        + octets.length + ' octets intacts';
    } finally {
      try{
        if(jetonAvant === null) f.contentWindow.localStorage.removeItem('pokearchive-jeton');
        else f.contentWindow.localStorage.setItem('pokearchive-jeton', jetonAvant);
      }catch(e){ /* déjà partie */ }
      f.remove();
    }
  });

verifier('Le pont HTTP',
  'Ce que l’appelant passe arrive vraiment dans le corps de la requête',
  async function(){
    // LE DÉFAUT QUI A COÛTÉ DES COLLECTIONS, et la vérification qui l'aurait
    // arrêté le premier jour.
    //
    // La table ROUTES nomme l'argument qu'elle lit — `a => a.donnees`. Rien ne
    // garantissait que ce nom soit celui que l'appelant écrit. Trois routes
    // étaient fausses : `ecrire_dex` lisait `a.dex` quand compte.js envoie
    // `donnees`, `importer` lisait `a.donnees` quand donnees-perso.js envoie
    // `contenu`, `modifier_profil` lisait `a.champs` quand les six appelants
    // passent leurs champs à plat.
    //
    // Conséquence : la requête partait SANS CORPS. Pour `ecrire_dex`, l'API
    // recevait le `{}` d'express et remplaçait le Pokédex par un dex vide —
    // sans erreur, sans console. Pour les deux autres, renommer une aventure,
    // la rendre publique ou importer un fichier ne faisait rien du tout.
    //
    // ON PASSE LES ARGUMENTS EXACTS DES VRAIS APPELANTS. Les recopier ici est
    // le point : si quelqu'un renomme un argument d'un côté sans l'autre, la
    // vérification tombe.
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-9999px;top:0;border:0;width:10px;height:10px;';
    f.srcdoc = '<!doctype html><meta charset="utf-8"><body></body>';
    document.body.appendChild(f);
    try{
      await new Promise(function(r){ f.onload = r; });
      const w = f.contentWindow;
      // UNE IFRAME srcdoc PARTAGE L'ORIGINE DE LA PAGE, donc son localStorage.
      // Poser ce jeton d'essai écrase la vraie session de qui lance le banc, et
      // le retirer le déconnecte. On garde donc ce qui était là pour le rendre.
      const jetonAvant = w.localStorage.getItem('pokearchive-jeton');
      w.localStorage.setItem('pokearchive-jeton', 'jeton-de-banc');

      let vu = null;
      w.fetch = async function(url, opt){
        vu = { url: String(url), corps: opt && opt.body ? JSON.parse(opt.body) : null };
        return { ok: true, status: 200, text: async function(){ return '{}'; } };
      };

      await new Promise(function(tenir, rejeter){
        const s = w.document.createElement('script');
        s.src = '/js/pont-api.js';
        s.onload = tenir;
        s.onerror = function(){ rejeter(new Error('pont-api.js absent de public/')); };
        w.document.body.appendChild(s);
      });
      const invoquer = w.__TAURI__.core.invoke;

      // 1. La sauvegarde. C'est celle qui détruisait.
      await invoquer('ecrire_dex',
        { donnees: { version: 1, captures: ['pikachu'] }, profil: 3 });
      if(!vu.corps) return 'échec : ecrire_dex part sans corps — le dex serait écrasé';
      if(vu.corps.version !== 1 || !vu.corps.captures){
        return 'échec : ecrire_dex n’emporte pas la sauvegarde — ' + JSON.stringify(vu.corps);
      }
      if(vu.url.indexOf('profil=3') === -1) return 'échec : l’aventure ne voyage pas';

      // 2. L'import.
      await invoquer('importer', { contenu: { version: 1, profils: [] } });
      if(!vu.corps || vu.corps.version !== 1){
        return 'échec : importer part sans le fichier — ' + JSON.stringify(vu.corps);
      }

      // 3. Modifier une aventure : les champs sont à plat, et seuls ceux
      //    qu'on donne doivent partir.
      await invoquer('modifier_profil', { id: 7, public: true });
      if(!vu.corps) return 'échec : modifier_profil part sans corps — publier ne ferait rien';
      if(vu.corps.public !== true){
        return 'échec : « public » ne part pas — ' + JSON.stringify(vu.corps);
      }
      if('nom' in vu.corps){
        return 'échec : un champ non demandé part quand même — il écraserait le nom';
      }
      if(vu.url.indexOf('/api/profils/7') === -1) return 'échec : mauvais chemin — ' + vu.url;

      // Et le carnet vidé à la main est un effacement voulu, pas une absence.
      await invoquer('modifier_profil', { id: 7, notes: '' });
      if(!vu.corps || vu.corps.notes !== ''){
        return 'échec : vider le carnet ne part pas — ' + JSON.stringify(vu.corps);
      }

      // 4. Le garde-fou : une route dont le corps sort indéfini doit LEVER,
      //    et non partir à vide.
      const routes = w.__TAURI__.core.invoke;
      try{
        await routes('ecrire_dex', { profil: 1 });    // « donnees » manque
        return 'échec : un corps absent est parti sans un mot';
      }catch(e){
        if(String(e).indexOf('ecrire_dex') === -1){
          return 'échec : la levée ne nomme pas la commande — ' + e;
        }
      }
      return 'dex, import et champs d’aventure arrivent ; un corps absent lève';
    } finally {
      try{
        if(jetonAvant === null) f.contentWindow.localStorage.removeItem('pokearchive-jeton');
        else f.contentWindow.localStorage.setItem('pokearchive-jeton', jetonAvant);
      }catch(e){ /* déjà partie */ }
      f.remove();
    }
  });

// ---- La mise en page --------------------------------------------------------
//
// Dans une iframe dimensionnée : les requêtes de média répondent à la taille de
// la fenêtre qui les contient, et c'est le seul moyen d'éprouver le 375 px sans
// redimensionner la vraie fenêtre. L'iframe charge le site avec ?banc=non, ce
// qui empêche le banc de s'y relancer — sans quoi il s'appellerait sans fin.

function dansUneFenetre(largeur, hauteur, quoi){
  return new Promise(function(tenir, rejeter){
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-9999px;top:0;border:0;'
                    + 'width:' + largeur + 'px;height:' + hauteur + 'px;';
    f.src = 'index.html?banc=non';
    const minuteur = setTimeout(function(){
      f.remove(); rejeter(new Error('la fenêtre de ' + largeur + ' px n’a pas chargé'));
    }, 15000);
    f.onload = async function(){
      clearTimeout(minuteur);
      try{
        // Laisser l'application se dessiner : ses scripts posent la page au
        // DOMContentLoaded, et l'onload de l'iframe arrive parfois avant.
        await attendre(350);
        const r = quoi(f.contentWindow, f.contentDocument);
        tenir(r);
      }catch(e){ rejeter(e); }
      finally{ f.remove(); }
    };
    document.body.appendChild(f);
  });
}

verifier('La mise en page',
  'La bascule d’époque tient dans son cadre à 375 px',
  function(){
    // LE BUG : flex-wrap seul ne suffisait pas. Un conteneur flex n'enroule que
    // lorsque sa PROPRE largeur le contraint, et celui-ci se dimensionnait sur
    // son contenu — 388 px dans un parent de 302. Le troisième bouton se
    // faisait couper de vingt-et-un pixels par le overflow:hidden de .screen.
    return dansUneFenetre(375, 900, function(w, d){
      w.showPage('strategie');
      const ere = d.querySelector('.table-ere');
      if(!ere) return 'échec : bascule introuvable';
      const parent = ere.parentElement.getBoundingClientRect();
      const boutons = [...ere.querySelectorAll('button')];
      if(boutons.length !== 3) return 'échec : ' + boutons.length + ' bouton(s) au lieu de 3';
      const dehors = boutons.filter((b) => b.getBoundingClientRect().right > parent.right + 1);
      if(dehors.length) return 'échec : ' + dehors.length + ' bouton(s) coupé(s), dont « '
        + dehors[0].textContent.trim() + ' »';
      const lignes = new Set(boutons.map((b) => Math.round(b.getBoundingClientRect().top))).size;
      return 'trois boutons entiers sur ' + lignes + ' ligne(s), cadre de '
        + Math.round(ere.getBoundingClientRect().width) + ' px';
    });
  });

verifier('La mise en page',
  'Aucune page ne déborde horizontalement à 375 px',
  function(){
    return dansUneFenetre(375, 800, function(w, d){
      const pages = ['accueil','dex','lieux','dresseurs','amis','chasse','cadeau',
                     'strategie','repro','profil'];
      const fautives = [];
      pages.forEach(function(p){
        try{ w.showPage(p); }catch(e){ fautives.push(p + ' (showPage a échoué)'); return; }
        if(d.documentElement.scrollWidth > w.innerWidth + 1){
          fautives.push(p + ' (' + d.documentElement.scrollWidth + ' px)');
        }
      });
      if(fautives.length) return 'échec : ' + fautives.join(', ');
      return pages.length + ' pages, aucune ne déborde';
    });
  });

verifier('La mise en page',
  'Le décor rétrécit avec la fenêtre, sans toucher au bureau',
  function(){
    // Les maxima des clamp() sont les valeurs historiques : à 1280 px, tout
    // doit retrouver exactement 14 / 20 / 8 / 16 et un rayon de 26. Une retouche
    // qui déborderait sur le bureau se verrait ici.
    return dansUneFenetre(1280, 800, function(w, d){
      const v = (sel, prop) => w.getComputedStyle(d.querySelector(sel))[prop];
      const attendu = [
        ['body', 'paddingLeft', '14px'],
        ['.dex', 'paddingLeft', '20px'],
        ['.dex', 'borderTopLeftRadius', '26px'],
        ['.screen-frame', 'paddingLeft', '8px'],
        ['.screen', 'paddingLeft', '16px'],
      ];
      const ecarts = attendu.filter(([s, p, a]) => v(s, p) !== a)
                            .map(([s, p, a]) => s + ' ' + p + ' = ' + v(s, p) + ' au lieu de ' + a);
      if(ecarts.length) return 'échec : ' + ecarts.join(' ; ');
      return 'les cinq valeurs du bureau sont intactes';
    });
  });

verifier('La mise en page',
  'Le boîtier rend de la place quand l’écran est étroit',
  function(){
    // Mesuré avant l'adaptation : 253 px utiles sur 375, le tiers de l'écran
    // parti en coque. Le seuil est posé sous le résultat obtenu, pour attraper
    // une régression sans casser au premier pixel près.
    return dansUneFenetre(375, 800, function(w, d){
      w.showPage('dex');
      const l = d.getElementById('list');
      const utile = l.getBoundingClientRect().width;
      if(utile < 285) return 'échec : ' + Math.round(utile) + ' px utiles sur 375';
      const colonnes = w.getComputedStyle(l).gridTemplateColumns.split(' ').length;
      if(colonnes < 2) return 'échec : ' + colonnes + ' colonne(s)';
      return Math.round(utile) + ' px utiles, ' + colonnes + ' colonnes';
    });
  });

// ---- Le rapport --------------------------------------------------------------

async function jouer(){
  const boite = document.createElement('div');
  boite.id = 'bancSite';
  boite.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;'
    + 'background:#12141b;color:#e8eaf0;font:12px/1.6 ui-monospace,Menlo,Consolas,monospace;'
    + 'padding:18px 22px;';
  boite.innerHTML = '<div style="font-weight:700;letter-spacing:.18em;color:#7d8598">'
    + 'BANC DU SITE</div><div id="bancSiteCorps" style="margin-top:14px"></div>';
  document.body.appendChild(boite);
  const corps = boite.querySelector('#bancSiteCorps');

  let echecs = 0, titre = null;
  for(const v of BANC){
    if(v.titre !== titre){
      titre = v.titre;
      const t = document.createElement('div');
      t.style.cssText = 'margin:14px 0 6px;color:#7d8598;letter-spacing:.14em;text-transform:uppercase';
      t.textContent = titre;
      corps.appendChild(t);
    }
    let sortie;
    try{ sortie = await v.fn(); }
    catch(e){ sortie = 'échec : ' + (e && e.message ? e.message : e); }
    const rate = String(sortie).indexOf('échec') === 0;
    if(rate) echecs++;
    const ligne = document.createElement('div');
    ligne.style.margin = '0 0 7px';
    ligne.innerHTML = '<span style="color:' + (rate ? '#e4665a' : '#6ec38a') + '">'
      + (rate ? '✕' : '●') + '</span> ' + v.quoi
      + '<div style="color:#7d8598;padding-left:14px">' + sortie + '</div>';
    corps.appendChild(ligne);
  }

  const fin = document.createElement('div');
  fin.style.cssText = 'margin-top:18px;font-weight:700;color:'
    + (echecs ? '#e4665a' : '#6ec38a');
  fin.textContent = BANC.length + ' vérifications, '
    + (echecs ? echecs + ' échec' + (echecs > 1 ? 's' : '') : 'aucun échec');
  corps.appendChild(fin);

  // Lisible par un outil, pas seulement par un œil.
  window.__bancFini = true;
  window.__bancEchecs = echecs;
  window.__bancTotal = BANC.length;
}

// Jamais dans les iframes de mesure : le banc s'y relancerait sans fin.
if(new URLSearchParams(location.search).get('banc') !== 'non'){
  // La réserve du site est écrasée par les vérifications. On la range et on la
  // remet : quelqu'un qui lance le banc ne doit pas y perdre sa collection.
  const sauve = localStorage.getItem(CLE);
  window.addEventListener('load', function(){
    setTimeout(async function(){
      try{ await jouer(); }
      finally{
        if(sauve === null) localStorage.removeItem(CLE);
        else localStorage.setItem(CLE, sauve);
      }
    }, 300);
  });
}

})();
