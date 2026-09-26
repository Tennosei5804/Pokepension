// Le pont Minecraft — ce que `/ps` demande depuis le jeu.
//
// Script classique (pas de module ES), chargé APRÈS pixelmonworld.js
// (pwChargerDroits, pwChargerReserve, pwPreparer, pwOuvrirSur, pwCatalogue,
// pwLieux, pwParEspece), grille.js (openPreview, closePreview), accueil.js
// (showPage, qui appelle chargerMinecraftParametres) et amis.js (pontNotif,
// bullePermise).
//
// ─── CE QUI SE PASSE ───────────────────────────────────────────────────────────
//
//     Minecraft ──HTTP 127.0.0.1──► Rust (minecraft.rs) ──événement──► ici
//                                                         ◄──commande──
//
// Le mod « PokéPension Bridge » tape à la porte locale ; le cœur Rust vérifie
// qui frappe, et nous passe la demande. On y répond avec ce que l'application
// sait déjà, et avec les fonctions qu'elle a déjà :
//
//   · « catalogue » — les noms que `/ps` doit pouvoir compléter : les entrées
//     de la réserve (formes comprises), les lieux, raretés et générations du
//     Pokédex du serveur, les types. Tout vient d'ici : le mod n'embarque
//     AUCUNE liste, et ne peut donc pas se désaccorder de l'application ;
//   · « ouvrir » — une fiche (openPreview, la vraie), ou le Pokédex du serveur
//     sur un état de filtres écrit comme son adresse (pwOuvrirSur, qui passe
//     par pwAppliquerRequete). Il n'y a pas de second système de filtres.
//
// Le mod a déjà résolu les noms tapés en clés — « Méga Dracaufeu X » en
// `charizard-mega-x`, « Zone01 » en `zone-1` — à partir de ce même catalogue.
// Ici on ne fait que VÉRIFIER qu'elles existent : une clé inconnue est
// refusée, jamais devinée.

// Combien de temps attendre la réserve au démarrage. Lancée par le mod,
// l'application reçoit sa première demande pendant qu'elle se charge.
const MC_ATTENTE_ENTREES_MS = 20000;

function mcPause(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

/** Les entrées de l'application, quand elles sont là. */
async function mcAttendreEntrees(){
  const fin = Date.now() + MC_ATTENTE_ENTREES_MS;
  while(Date.now() < fin){
    if(typeof allEntries !== 'undefined' && allEntries.length) return true;
    await mcPause(100);
  }
  return false;
}

// Pourquoi le Pokédex du serveur manque, quand il manque : le mod ne dit pas la
// même chose à qui n'a pas de compte, à qui n'a pas l'accès, et à qui n'a
// simplement pas de réseau.
let mcEtatPW = 'ok';

/**
 * Le Pokédex du serveur, s'il est ouvert à ce compte. Rend vrai quand la
 * réserve est là et reliée — voir pwPreparer().
 *
 * UN REFUS RETENU N'EST PAS DÉFINITIF. pwChargerDroits() garde sa réponse pour
 * la session, y compris « pas d'accès » quand l'API n'a pas répondu : lancée
 * hors ligne, l'application refuserait les zones jusqu'à son redémarrage. On
 * redemande donc une fois, et une vraie réponse remplace la fausse.
 */
async function mcPokedexServeur(){
  if(typeof pwChargerDroits !== 'function') return false;
  let droits = await pwChargerDroits();
  if(!droits || !droits.lire){
    if(typeof sessionOuverte !== 'undefined' && !sessionOuverte){
      mcEtatPW = 'sans-compte';
      return false;
    }
    try{
      droits = await window.__TAURI__.core.invoke('pw_moi');
      pwDroits = droits;
      if(typeof pwMajOngletAdmin === 'function') pwMajOngletAdmin();
    }catch(e){
      mcEtatPW = 'hors-ligne';
      return false;
    }
    if(!droits || !droits.lire){
      mcEtatPW = 'refuse';
      return false;
    }
  }
  try{
    await pwChargerReserve();
    await pwPreparer();
    mcEtatPW = pwCatalogue ? 'ok' : 'hors-ligne';
    return !!pwCatalogue;
  }catch(e){
    mcEtatPW = 'hors-ligne';
    return false;
  }
}

/**
 * Ce que `/ps` peut compléter.
 *
 * COMPACT, parce qu'il traverse la boucle locale à chaque rafraîchissement du
 * cache du mod : une entrée est `[nom, clé, surLeServeur, alias…]`. Le nom est
 * le français de la réserve — « Dracaufeu (Méga X) » — et les alias sont ce
 * qu'on pourrait taper d'autre : le nom anglais, et celui du Pokédex du
 * serveur quand il s'écrit autrement (« Rattata d'Alola », « M.Mime »).
 */
async function mcCatalogue(){
  const entrees = await mcAttendreEntrees();
  const pw = await mcPokedexServeur();

  const pokemon = [];
  const vus = new Set();
  (entrees ? allEntries : []).forEach(function(e){
    const serveur = pw && pwParEspece.has(e.name) ? pwParEspece.get(e.name) : null;
    const alias = [];
    if(e.displayEn && e.displayEn !== e.display) alias.push(e.displayEn);
    if(serveur && serveur.nomFr && serveur.nomFr !== e.display) alias.push(serveur.nomFr);
    pokemon.push([e.display, e.name, serveur ? 1 : 0].concat(alias));
    vus.add(e.name);
  });
  // Une espèce du serveur que la réserve ne connaît pas garde sa place : on
  // l'ouvrira par la recherche du Pokédex du serveur, faute de fiche.
  if(pw){
    pwParEspece.forEach(function(e, cle){
      if(!vus.has(cle) && e.nomFr) pokemon.push([e.nomFr, cle, 1]);
    });
  }

  const cat = pw ? pwCatalogue : null;
  return {
    ok: true,
    connecte: typeof sessionOuverte !== 'undefined' ? !!sessionOuverte : false,
    pixelmonworld: pw,
    // 'ok', 'sans-compte', 'refuse' ou 'hors-ligne' : ce que le mod dira.
    etatPixelmonworld: pw ? 'ok' : mcEtatPW,
    pokemon: pokemon,
    zones: cat ? cat.lieux.map(function(g){
      return {
        nom: g.lieu.nom, cle: g.lieu.cle, horsCarte: g.lieu.genre === 'hors-carte',
        sous: g.sous.map(function(s){ return { nom: s.nom, cle: s.cle }; }),
      };
    }) : [],
    raretes: cat ? cat.raretes.map(function(r){
      return { libelle: r.libelle, cle: r.cle, slug: r.slug, etoiles: r.etoiles };
    }) : [],
    // Dans l'ordre du panneau : alphabétique, comme on les cherche.
    types: (cat ? cat.types : []).map(function(t){ return TYPES_FR[t]; }),
    generations: cat ? cat.generations.slice() : [],
  };
}

/** Une fiche restée ouverte masquerait ce qu'on vient demander. */
function mcFermerFiche(){
  if(typeof previewOverlay !== 'undefined' && previewOverlay
     && previewOverlay.style.display === 'flex' && typeof closePreview === 'function'){
    closePreview();
  }
}

/**
 * Les filtres demandés, en paramètres d'adresse du Pokédex du serveur.
 *
 * CHAQUE VALEUR EST VÉRIFIÉE contre le catalogue, et une seule inconnue fait
 * refuser toute la demande : ouvrir « Zone 1, Rare » quand on avait demandé
 * « Zone 1, Rare, Épiqeu » montrerait un résultat faux sans le dire. Le mod a
 * déjà validé avec le même catalogue ; ce refus ne sert que s'ils divergent.
 */
function mcRequeteFiltres(d){
  const cat = pwCatalogue;
  const refus = [];
  const lieux = (d.lieux || []).filter(function(c){
    if(pwLieux.has(c)) return true;
    refus.push(c); return false;
  });
  const raretes = (d.raretes || []).map(function(v){
    const nu = pwSlug(v);
    const r = cat.raretes.find(function(x){ return x.slug === nu || pwSlug(x.cle) === nu; });
    if(!r) refus.push(v);
    return r ? r.slug : null;
  }).filter(Boolean);
  const types = (d.types || []).map(function(v){
    const id = TYPES_PAR_NOM[sansAccents(v)];
    if(id === undefined || cat.types.indexOf(id) === -1){ refus.push(v); return null; }
    return pwCleType(id);
  }).filter(Boolean);
  const generations = (d.generations || []).filter(function(g){
    if(cat.generations.indexOf(g) !== -1) return true;
    refus.push('génération ' + g); return false;
  });
  if(refus.length) return { refus: refus };

  const bouts = [];
  const liste = function(nom, valeurs){
    if(valeurs.length) bouts.push(nom + '=' + valeurs.map(encodeURIComponent).join(','));
  };
  liste('types', types);
  liste('generations', generations.map(String));
  liste('raretes', raretes);
  liste('lieux', lieux);

  // Ce que la page va montrer, dit en une ligne pour le chat du jeu.
  const titre = [
    lieux.map(function(c){ return pwLieux.get(c).libelle; }).join(', '),
    (d.raretes || []).length ? raretes.map(function(s){
      return cat.raretes.find(function(r){ return r.slug === s; }).libelle;
    }).join(', ') : '',
    types.length ? (d.types || []).map(function(v){ return TYPES_FR[TYPES_PAR_NOM[sansAccents(v)]]; }).join(', ') : '',
    generations.length ? 'Gén. ' + generations.join(', ') : '',
  ].filter(Boolean).join(' · ');

  return { recherche: bouts.length ? '?' + bouts.join('&') : '', titre: titre || 'Pokédex PixelmonWorld' };
}

async function mcOuvrir(d){
  await mcAttendreEntrees();
  const pw = await mcPokedexServeur();
  mcFermerFiche();

  if(d.cible === 'accueil'){
    // L'accueil pertinent, pour quelqu'un qui tape `/ps` depuis PixelmonWorld,
    // c'est le Pokédex du serveur — tel qu'il l'avait laissé.
    showPage(pw ? 'pixelmonworld' : 'home');
    return { ok: true, titre: pw ? 'Pokédex PixelmonWorld' : 'PokéPension' };
  }

  if(d.cible === 'pokemon'){
    const entree = allEntries.find(function(e){ return e.name === d.cle; });
    if(!entree){
      // Connue du serveur seulement : pas de fiche, mais sa carte dans la grille.
      const serveur = pw ? pwParEspece.get(d.cle) : null;
      if(!serveur) return { ok: false, erreur: 'introuvable' };
      pwOuvrirSur('?q=' + encodeURIComponent(serveur.nomFr || d.cle));
      return { ok: true, titre: serveur.nomFr || d.cle };
    }
    // OUVERTE DEPUIS LE POKÉDEX DU SERVEUR, la fiche dit où il apparaît sur
    // PixelmonWorld — voir ficheSurPixelmonWorld(). C'est la question qu'on se
    // pose en jeu ; la page sous la fiche garde les filtres qu'elle avait.
    if(pw) showPage('pixelmonworld');
    openPreview(entree);
    return { ok: true, titre: nomAffiche(entree) };
  }

  if(d.cible === 'filtres'){
    if(!pw) return { ok: false, erreur: 'pixelmonworld', etat: mcEtatPW };
    const r = mcRequeteFiltres(d);
    if(r.refus) return { ok: false, erreur: 'inconnu', valeurs: r.refus };
    pwOuvrirSur(r.recherche);
    return { ok: true, titre: r.titre };
  }

  return { ok: false, erreur: 'cible' };
}

// ---- Le mod dans Minecraft : un bouton, pas un automatisme -------------------
//
// RIEN SANS UN CLIC. Poser un mod dans le Minecraft de quelqu'un est une
// décision à lui : la section « Minecraft » des Paramètres l'installe et le
// retire. Au lancement, l'application ne fait que METTRE À JOUR un mod déjà
// posé — jamais en poser un là où il n'est pas. Le cœur Rust trouve les
// instances de Prism Launcher : voir minecraft_installation.rs, qui dit ce qu'il
// touche et ce qu'il respecte.
//
// La section ne se montre qu'à qui a accès au Pokédex de PixelmonWorld, dans
// l'application de bureau : ailleurs, il n'y a ni Minecraft à relier ni pont.

/** Le pont vers Rust, ou null hors de l'application de bureau. */
function mcInvoke(){
  const T = window.__TAURI__;
  if(!T || !T.core || typeof T.core.invoke !== 'function' || window.PONT_HTTP || window.PONT_WEB) return null;
  return T.core.invoke;
}

function mcNoms(instances){
  return instances.map(function(i){ return '« ' + i.instance + ' »'; }).join(', ');
}

/** Ce que les Paramètres disent et proposent, d'après l'état des instances. */
function mcDessinerEtat(rapport, message){
  const etat = document.getElementById('mcEtat');
  const installer = document.getElementById('mcInstaller');
  const retirer = document.getElementById('mcRetirer');
  if(!etat || !installer || !retirer) return;
  const instances = (rapport && rapport.instances) || [];
  const posees = instances.filter(function(i){ return i.versionInstallee && i.action !== 'desactive'; });
  const desactivees = instances.filter(function(i){ return i.action === 'desactive'; });
  const absentes = instances.filter(function(i){ return i.action === 'absent'; });
  const anciennes = posees.filter(function(i){ return i.action === 'different'; });

  let texte;
  if(!instances.length){
    texte = rapport && rapport.prism
      ? 'Aucune instance PixelmonWorld (Minecraft 1.16.5, Forge) trouvée dans Prism Launcher.'
      : 'Prism Launcher est introuvable sur cet ordinateur.';
  }else if(posees.length){
    texte = 'Installé dans ' + mcNoms(posees) + ' — version '
      + posees[0].versionInstallee + '. Au prochain lancement de Minecraft, tape /ps dans le chat.';
    if(anciennes.length) texte += ' Une mise à jour est prête.';
  }else if(desactivees.length){
    texte = 'Désactivé dans Prism Launcher pour ' + mcNoms(desactivees)
      + ' : réactive-le dans Prism, ou retire-le ici.';
  }else{
    texte = 'Pas installé. Instance trouvée : ' + mcNoms(absentes) + '.';
  }
  etat.textContent = message ? message + ' ' + texte : texte;

  installer.hidden = !(absentes.length || anciennes.length);
  installer.textContent = anciennes.length && !absentes.length
    ? '⬆ Mettre à jour le mod' : '⬇ Installer dans Minecraft';
  retirer.hidden = !(posees.length || desactivees.length);
}

/** Ce qui vient de se passer, en une phrase. */
function mcPhrase(rapport, geste){
  const instances = (rapport && rapport.instances) || [];
  const avec = function(code){ return instances.filter(function(i){ return i.action === code; }); };
  if(avec('occupe').length){
    return 'Minecraft est ouvert sur ' + mcNoms(avec('occupe')) + ' : ferme-le, puis réessaie.';
  }
  if(avec('erreur').length) return 'Impossible d’écrire dans le dossier mods de ' + mcNoms(avec('erreur')) + '.';
  if(geste === 'installer' && (avec('installe').length || avec('mis-a-jour').length)){
    return 'C’est fait.';
  }
  if(geste === 'retirer' && avec('retire').length) return 'Retiré.';
  return '';
}

async function mcGeste(geste){
  const invoke = mcInvoke();
  if(!invoke) return;
  const installer = document.getElementById('mcInstaller');
  const retirer = document.getElementById('mcRetirer');
  if(installer) installer.disabled = true;
  if(retirer) retirer.disabled = true;
  try{
    const fait = await invoke('pont_minecraft_mod', { action: geste });
    const message = mcPhrase(fait, geste);
    // L'état relu après coup : c'est lui qui décide des boutons à montrer.
    mcDessinerEtat(await invoke('pont_minecraft_mod', { action: 'etat' }), message);
  }catch(e){
    const etat = document.getElementById('mcEtat');
    if(etat) etat.textContent = 'Échec : ' + e;
  }finally{
    if(installer) installer.disabled = false;
    if(retirer) retirer.disabled = false;
  }
}

/** À l'ouverture des Paramètres — voir showPage(). */
async function chargerMinecraftParametres(){
  const section = document.getElementById('mcSection');
  const invoke = mcInvoke();
  if(!section) return;
  const droits = invoke && typeof pwChargerDroits === 'function' ? await pwChargerDroits() : null;
  section.hidden = !(droits && droits.lire);
  if(section.hidden) return;
  const etat = document.getElementById('mcEtat');
  if(etat) etat.textContent = 'Recherche de Prism Launcher…';
  try{
    mcDessinerEtat(await invoke('pont_minecraft_mod', { action: 'etat' }));
  }catch(e){
    if(etat) etat.textContent = 'Impossible de lire les instances de Minecraft.';
  }
}

/**
 * Au lancement : un mod déjà posé suit la version de l'application. On ne le
 * dit que s'il a changé — une bulle du système, rien quand il était à jour.
 */
async function mcMettreAJourLeMod(){
  const invoke = mcInvoke();
  if(!invoke) return;
  let rapport;
  try{ rapport = await invoke('pont_minecraft_mod', { action: 'mettre-a-jour' }); }
  catch(e){ return; }
  const faites = ((rapport && rapport.instances) || []).filter(function(i){ return i.action === 'mis-a-jour'; });
  if(!faites.length || typeof pontNotif !== 'function') return;
  const pont = pontNotif();
  if(!pont || !(await bullePermise(pont))) return;
  try{
    pont.sendNotification({
      title: 'PokéPension Bridge mis à jour',
      body: 'Dans ' + mcNoms(faites) + ', en version ' + rapport.version + '.',
    });
  }catch(e){ /* une bulle refusée ne change rien à la mise à jour */ }
}

(function(){
  const installer = document.getElementById('mcInstaller');
  const retirer = document.getElementById('mcRetirer');
  if(installer) installer.addEventListener('click', function(){ mcGeste('installer'); });
  if(retirer) retirer.addEventListener('click', function(){ mcGeste('retirer'); });
})();

// ---- Le branchement ---------------------------------------------------------

(function(){
  const T = window.__TAURI__;
  // Ni le site ni les pages de génération n'ont de cœur Rust : pas de pont.
  if(!T || !T.event || !T.core || window.PONT_HTTP || window.PONT_WEB) return;
  const invoke = T.core.invoke;

  const actions = { catalogue: mcCatalogue, ouvrir: mcOuvrir };

  T.event.listen('pont-minecraft', function(e){
    const demande = (e && e.payload) || {};
    const action = actions[demande.action];
    Promise.resolve()
      .then(function(){ return action ? action(demande.donnees || {}) : { ok: false, erreur: 'action' }; })
      .catch(function(err){ return { ok: false, erreur: String((err && err.message) || err) }; })
      .then(function(reponse){
        return invoke('pont_minecraft_reponse', { id: demande.id, reponse: reponse });
      })
      .catch(function(){ /* la demande a expiré côté Rust : personne n'attend plus */ });
  }).then(function(){
    // L'écouteur est posé : le pont peut nous passer des demandes.
    return invoke('pont_minecraft_pret');
  }).catch(function(e){
    console.warn('Pont Minecraft indisponible :', e);
  });

  // Après le démarrage, pour ne pas lui disputer le disque.
  setTimeout(mcMettreAJourLeMod, 8000);
})();
