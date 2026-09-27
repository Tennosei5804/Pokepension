// Le Pokédex de PixelmonWorld — où l'on croise quoi, sur le serveur.
//
// Script classique (pas de module ES), chargé APRÈS dex.js (analyserRecherche,
// sansAccents, loadTypes, TYPES_PAR_NOM, ETATS_RECHERCHE) et fiche.js
// (puceType, TYPE_COULEURS, openPreview). compte.js, qui porte `invoke`, vient
// après lui : on ne l'appelle donc qu'une fois la page chargée.
//
// ─── CE QUI EST RÉUTILISÉ, ET CE QUI EST NEUF ─────────────────────────────────
//
// Réutilisé tel quel, sans copie :
//   · la recherche — analyserRecherche() de dex.js, mot pour mot. Taper
//     « feu », « gen3 » ou « legendaire » fait ici exactement ce que ça fait
//     dans le Pokédex des jeux, parce que c'est le même analyseur ;
//   · les types — loadTypes(), qui lit la réserve embarquée et ne va donc pas
//     sur le réseau ;
//   · les cartes — les classes .card, .card-sprite, .card-id, .card-name du
//     Pokédex, sa case .chip-check et son .is-owned, et la chaîne de repli des
//     sprites de noyau.js ;
//   · la collection — un seau de allProgress, comme chaque Pokédex de jeu.
//     Voir « La collection du joueur » plus bas ;
//   · la jauge — .stat-bar et .gauge, celles du Pokédex des jeux ;
//   · les pastilles — .filtre-chip, celles de « Plus de filtres » et de la
//     page Lieux ; les onglets — .strat-onglet, ceux de la Stratégie ;
//   · la fiche — openPreview(), la vraie. Le bloc des apparitions s'ajoute
//     dans « Où l'obtenir », au même endroit et avec les mêmes classes que
//     celui de Cobblemon.
//
// Neuf, parce que rien n'en faisait déjà l'affaire :
//   · les étoiles. Le dépôt n'en avait aucune : `rarete.js` parle de la
//     rareté SOCIALE — combien de dresseurs possèdent l'espèce — et Cobblemon
//     affiche ses quatre paliers en toutes lettres. Les cinq paliers de
//     PixelmonWorld sont convertis EN BASE (voir api/src/pixelmonworld.js) ;
//     ici on ne fait que les dessiner ;
//   · les filtres à valeurs multiples — type, rareté, génération, lieu,
//     statut — que le Pokédex des jeux n'a pas : ses lieux vivent sur la page
//     Lieux, et ses menus ne prennent qu'une valeur.
//
// ─── LA HIÉRARCHIE ────────────────────────────────────────────────────────────
//
//     Zone  →  Sous-zone  →  Apparition
//
// Une même espèce peut revenir dans plusieurs zones, plusieurs sous-zones, et
// DEUX FOIS DANS LA MÊME ZONE à des conditions différentes. Chaque apparition
// est une ligne indépendante : c'est le cas Minidraco, surface et profondeurs
// du même lac, deux raretés.

// Combien de cartes par lot, au premier dessin comme à chaque « Afficher plus ».
// Cinquante-trois, demandés tels quels — le Pokédex des jeux en pose 55, et il
// n'y a aucune raison technique pour que les deux soient d'accord.
const PW_LOT = 53;

let pwDroits = null;               // { lire, admin, gestionAcces }
let pwReserve = null;              // ce que l'API rend : zones + espèces + spawns
let pwParEspece = new Map();       // clé de forme -> { espèce, spawns }
let pwEntreesConnues = [];         // une par entrée du serveur, indexée — voir pwIndexer()
let pwLieux = new Map();           // clé de lieu -> la zone ou la sous-zone qu'elle désigne
let pwCatalogue = null;            // les valeurs que le panneau propose, tirées des données
let pwFiltrees = [];
let pwCompteurs = null;            // ce que chaque valeur rendrait — voir pwEvaluer()
let pwDessinees = 0;
let pwEnVol = null;

// ---- La collection du joueur ------------------------------------------------
//
// CE N'EST PAS UNE COLLECTION DE PLUS, C'EST UN POKÉDEX DE PLUS. PokéPension
// tient une collection par Pokédex — `allProgress`, un seau par clé, que la
// sauvegarde de l'aventure emporte au serveur (buildSavePayload) et dont le
// serveur tire le journal des captures. PixelmonWorld y prend sa place sous sa
// propre clé, exactement comme Écarlate ou Cobblemon : même stockage, même
// synchronisation, même journal, et pas une table ni une route de plus.
//
// POURQUOI PAS LA COLLECTION HOME. On n'a pas attrapé sur le serveur ce qu'on
// a attrapé dans Écarlate : tenir pour « obtenu » ici tout ce que HOME contient
// dirait quelque chose de faux. C'est la raison pour laquelle ce Pokédex ne
// cochait rien jusqu'ici ; elle vaut toujours, et c'est elle qui donne au
// serveur son propre seau plutôt que celui d'un autre.
//
// LA CLÉ D'UNE CASE EST SA FORME — « rattata » et « rattata-alola » sont deux
// cases, comme deux fiches sur le site du serveur. Jamais le numéro national,
// que les formes régionales partagent avec leur espèce.
const PW_COLLECTION = 'pixelmonworld';

function pwCollection(){ return bucketFor(PW_COLLECTION); }

function pwPossede(x){ return pwCollection().caught.has(x.cle); }

// Le mot de l'aventure ouverte — « Capturé », « Vu » ou « En boîte ». Le seau ne
// retient qu'une chose par Pokémon ; c'est le mode de l'aventure qui dit ce
// qu'elle veut dire, comme sur les cartes des Pokédex de jeux. Aucun autre état
// n'est proposé : PokéPension ne saurait pas le déterminer.
function pwMode(){ return infoMode(modeCourant()); }

function pwStatuts(){
  return [
    { cle: 'tous', libelle: 'Tous' },
    { cle: 'obtenus', libelle: pwMode().pluriel },
    { cle: 'manquants', libelle: 'Manquants' },
  ];
}

// ---- L'état des filtres -----------------------------------------------------
//
// UNE SEULE VÉRITÉ POUR TOUT CE QUI FILTRE. La grille, les pastilles du
// panneau, la ligne des filtres actifs, le compteur et l'adresse se déduisent
// d'ici ; aucun d'eux ne garde de valeur à lui. Les anciens menus tenaient
// chacun la sienne, et c'est ainsi que celui des types a pu vivre sans que le
// filtrage ne le lise jamais : choisir « Dragon » redessinait la grille entière,
// inchangée.
//
// UN ENSEMBLE PAR CATÉGORIE, et la règle tient en une ligne : OU à l'intérieur
// d'une catégorie, ET entre elles.
//
//     (Eau OU Glace) ET (Gén. 3 OU Gén. 4) ET (Rare OU Épique)
//                    ET (Océan OU Lac Rime) ET manquant
//
// Cocher une valeur de plus dans une catégorie montre donc PLUS de Pokémon ;
// cocher une catégorie de plus en montre moins. La recherche garde son champ —
// le même analyseur que le Pokédex des jeux — et se cumule au reste, en ET.
const pwEtat = {
  vue: 'serveur',          // 'serveur' : le Pokédex du serveur ; 'joueur' : le tien
  types: new Set(),        // identifiants PokeAPI, ceux de TYPES_FR
  raretes: new Set(),      // nombres d'étoiles, ceux de la table RARETES de l'API
  generations: new Set(),  // générations telles que le serveur les donne
  lieux: new Set(),        // clés de lieu, zone entière ou sous-zone — voir pwIndexer()
  statut: 'tous',          // 'tous' | 'obtenus' | 'manquants' — vue joueur seulement
};

// ---- Les étoiles ------------------------------------------------------------
//
// ON NE DESSINE QUE LES ÉTOILES GAGNÉES. Un Pokémon à une étoile s'écrit « ★ »,
// et non « ★☆☆☆☆ ».
//
// La forme complète a existé ici, au motif que la place vide dit qu'il y a plus
// rare ailleurs. Maxime a tranché l'inverse, et il a le dernier mot sur ce qui
// se lit : quatre étoiles creuses derrière chaque Magicarpe, sur neuf cent
// cinquante et une cartes, font surtout du bruit. L'échelle reste sur cinq —
// c'est le titre et l'étiquette accessible qui la rappellent, « 1 étoile sur
// 5 », plutôt que le dessin.
//
// ZÉRO ÉTOILE N'EST PAS « COMMUN ». Quand la base ne sait pas, elle écrit 0, et
// on affiche un tiret — aucune étoile aurait voulu dire « moins que commun »,
// ce qui n'existe pas.
const PW_ETOILES_MAX = 5;

function pwEtoiles(n, titre){
  const combien = Math.max(0, Math.min(PW_ETOILES_MAX, Number(n) || 0));
  const el = document.createElement('span');
  el.className = 'pw-etoiles' + (combien ? ' etoiles-' + combien : ' etoiles-inconnu');
  if(!combien){
    el.textContent = '—';
    el.title = titre || 'Rareté inconnue sur le serveur';
    el.setAttribute('aria-label', 'rareté inconnue');
    return el;
  }
  const pleines = document.createElement('span');
  pleines.className = 'pw-etoiles-pleines';
  pleines.textContent = '★'.repeat(combien);
  el.appendChild(pleines);
  el.title = titre || (combien + ' étoile' + (combien > 1 ? 's' : '') + ' sur ' + PW_ETOILES_MAX);
  el.setAttribute('aria-label', el.title);
  return el;
}

// ---- Charger ----------------------------------------------------------------

/**
 * Les droits, puis le Pokédex.
 *
 * DEUX APPELS ET PAS UN. `pw_moi` répond à tout le monde et dit seulement si
 * l'on a le droit ; `pw_pokedex` n'existe pas pour qui ne l'a pas. Les fondre
 * obligerait la page à traiter un 404 « pas le droit » et un 404 « service
 * en panne » de la même façon, et elle ne saurait pas les distinguer.
 */
async function pwChargerDroits(){
  if(pwDroits) return pwDroits;
  if(typeof invoke !== 'function') return null;
  try{
    pwDroits = await invoke('pw_moi');
  }catch(e){
    // Pas de session, ou API plus ancienne : aucun droit, et on n'insiste pas.
    pwDroits = { lire: false, admin: false, gestionAcces: false };
  }
  return pwDroits;
}

function pwChargerReserve(){
  if(pwReserve) return Promise.resolve(pwReserve);
  if(pwEnVol) return pwEnVol;
  pwEnVol = invoke('pw_pokedex').then(function(r){
    pwReserve = r || { zones: [], especes: [], raretes: [] };
    pwIndexer();
    return pwReserve;
  });
  pwEnVol.catch(function(){ pwEnVol = null; });
  return pwEnVol;
}

/**
 * Relier ce que dit le serveur à ce que l'application connaît.
 *
 * LA CLÉ EST LE NOM DE FORME DE POKEAPI — « magikarp », « exeggutor-alola ».
 * C'est celui que le site de PixelmonWorld écrit dans le nom de ses images
 * (ses adresses sont en français depuis Kaura 2.0), et celui que porte
 * `entry.name` ici : le relevé les accorde, sans traduction. Un nom français
 * aurait demandé une table, et une table aurait dérivé.
 *
 * UNE ESPÈCE QUE L'APPLICATION NE CONNAÎT PAS EST GARDÉE QUAND MÊME, avec ce
 * que le serveur en dit. Elle n'aura ni sprite local ni fiche — c'est mieux
 * que de la faire disparaître d'un Pokédex qui l'annonce.
 *
 * TOUT CE QUE LE FILTRAGE LIT EST CALCULÉ ICI, UNE FOIS PAR SESSION : la
 * génération, les lieux de chaque entrée, le texte cherchable. Filtrer ne
 * fait ensuite que comparer des ensembles, sans rien reconstruire à chaque
 * pastille.
 */
function pwIndexer(){
  pwParEspece = new Map();
  pwLieux = new Map();
  pwCatalogue = null;

  // LA CLÉ D'UN LIEU EST CELLE DU RELEVÉ. « zone-7 », « ocean » pour une zone ;
  // pour une sous-zone, la clé de sa zone suivie de la sienne — « zone-1-eau »,
  // « bull-o-biome-cascade » —, c'est-à-dire exactement celle que le site du
  // serveur donne à son libellé plat. Elle ne dépend ni d'un identifiant de
  // base, qui changerait d'une installation à l'autre, ni d'une orthographe :
  // c'est elle que l'adresse de la page transporte.
  //
  // Une zone désigne TOUT ce qui s'y trouve, sous-zones comprises : « Zone 1 »
  // retient aussi Zone 1 Eau et Zone 1 Forêt. C'était déjà le sens du menu des
  // zones, dont « Toutes les sous-zones » était la valeur par défaut.
  const sousCle = new Map();
  (pwReserve.zones || []).forEach(function(z){
    const genre = z.genre || 'lieu';
    if(!pwLieux.has(z.cle)){
      pwLieux.set(z.cle, { cle: z.cle, nom: z.nom, libelle: z.nom, genre: genre,
                           note: z.description || '', zone: z, sous: null });
    }
    (z.sousZones || []).forEach(function(s){
      const cle = z.cle + '-' + s.cle;
      sousCle.set(s.id, cle);
      if(pwLieux.has(cle)) return;
      pwLieux.set(cle, { cle: cle, nom: s.nom, libelle: z.nom + ' · ' + s.nom, genre: genre,
                         note: s.description || '', zone: z, sous: s });
    });
  });

  (pwReserve.especes || []).forEach(function(e){
    pwParEspece.set(e.espece, e);
  });

  const parNom = new Map();
  (typeof allEntries !== 'undefined' ? allEntries : []).forEach(function(en){
    parNom.set(en.name, en);
  });

  pwEntreesConnues = (pwReserve.especes || []).map(function(e){
    const entry = parNom.get(e.espece) || null;
    // Les lieux de l'entrée, sous les deux clés qui peuvent les désigner : sa
    // zone, et sa sous-zone quand elle en a une. Karaclée en porte trois —
    // « bull-o », « bull-o-biome-cascade » et « zone-9 » — et sort donc que
    // l'on coche Zone 9 ou Bull'o Biome Cascade.
    const lieux = new Set();
    (e.spawns || []).forEach(function(s){
      s.pwCleZone = s.zoneCle;
      s.pwCleSous = s.sousZoneId !== null && s.sousZoneId !== undefined
        ? (sousCle.get(s.sousZoneId) || '') : '';
      lieux.add(s.pwCleZone);
      if(s.pwCleSous) lieux.add(s.pwCleSous);
    });
    return {
      pw: e,
      entry: entry,
      // La case de la collection : la forme, pas le numéro — voir PW_COLLECTION.
      cle: e.espece,
      // LA GÉNÉRATION DU SERVEUR, pas celle de l'espèce : il range Rattata
      // d'Alola en septième, là où la réserve le laisse en première avec
      // Rattata. C'est lui la référence de ce Pokédex, et la recherche « gen7 »
      // le lisait déjà ainsi.
      gen: Number(e.generation) || 0,
      lieux: lieux,
      types: null,                  // voir pwTypesDe(), qui attend la réserve
      // De quoi chercher sans ouvrir la fiche : le nom français du serveur, le
      // nom anglais, et celui que l'application afficherait.
      cherchable: sansAccents([e.nomFr, e.nomEn, e.espece,
        entry ? entry.display : '', entry ? entry.displayEn : ''].join(' ')),
    };
  });
}

/**
 * Les types d'une entrée, lus dans la réserve de l'application.
 *
 * PAS CEUX DU SERVEUR. Sur les 951 entrées, douze diffèrent : Otaria y est
 * Eau/Glace, Spiritomb y perd Ténèbres, Miaouss d'Alola y gagne Normal. La
 * réserve suit PokeAPI forme par forme, et c'est elle que la fiche affiche —
 * filtrer sur l'autre ferait sortir un Pokémon dont la fiche dit qu'il n'a pas
 * ce type.
 *
 * Sans entrée connue, aucun type : la recherche « feu » l'excluait déjà.
 */
function pwTypesDe(x){
  if(x.types) return x.types;
  if(!x.entry || typeof typesByPokemonId === 'undefined' || !typesByPokemonId) return [];
  x.types = typesByPokemonId.get(x.entry.id) || [];
  return x.types;
}

/** « Peu commun » → « peu-commun » : la forme d'une valeur dans l'adresse. */
function pwSlug(texte){
  return sansAccents(String(texte || '')).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function pwCleType(id){ return pwSlug(TYPES_FR[id]); }

/**
 * Ce que le panneau propose, tiré des données et d'elles seules.
 *
 * RIEN N'EST ÉCRIT À LA MAIN ICI. Les raretés viennent de la table de l'API,
 * les générations et les lieux de ce que le relevé contient vraiment, les types
 * de TYPES_FR. Le jour où le serveur ouvre une zone ou une génération, elle
 * apparaît dans le panneau sans qu'on y touche ; une zone restée vide, elle,
 * n'y est pas — la cocher ne rendrait rien.
 */
function pwConstruireCatalogue(){
  // Dans l'ordre alphabétique, parce que c'est ainsi qu'on les cherche : Acier,
  // Combat, Dragon… L'ordre de PokeAPI (Normal, Combat, Vol) ne se devine pas.
  const types = Object.keys(TYPES_FR).map(Number).sort(function(a, b){
    return TYPES_FR[a].localeCompare(TYPES_FR[b], 'fr');
  });

  const raretes = (pwReserve.raretes || []).map(function(r){
    return { etoiles: Number(r.etoiles) || 0, libelle: r.libelle, cle: r.cle, slug: pwSlug(r.libelle) };
  }).filter(function(r){ return r.etoiles > 0; });
  // ZÉRO ÉTOILE N'EST PAS UNE RARETÉ, c'est une ignorance. On ne la propose que
  // si le relevé en contient : un filtre « Inconnue » qui ne rend rien n'a rien
  // à faire dans le panneau.
  if(pwEntreesConnues.some(function(x){ return !x.pw.etoiles; })){
    raretes.push({ etoiles: 0, libelle: 'Rareté inconnue', cle: 'inconnue', slug: 'inconnue' });
  }

  const generations = [];
  pwEntreesConnues.forEach(function(x){
    if(x.gen && generations.indexOf(x.gen) === -1) generations.push(x.gen);
  });
  generations.sort(function(a, b){ return a - b; });

  // Les zones dans l'ordre de l'API, qui est celui de la carte du serveur, et
  // chacune avec ses sous-zones — c'est ainsi que le panneau les regroupe.
  const lieux = [];
  (pwReserve.zones || []).forEach(function(z){
    if(!z.spawns) return;
    lieux.push({
      lieu: pwLieux.get(z.cle),
      sous: (z.sousZones || []).filter(function(s){ return s.spawns; })
        .map(function(s){ return pwLieux.get(z.cle + '-' + s.cle); })
        .filter(Boolean),
    });
  });

  pwCatalogue = { types: types, raretes: raretes, generations: generations, lieux: lieux };
}

/** Les clés de lieu dans l'ordre du panneau : zone, puis ses sous-zones. */
function pwLieuxDansLOrdre(){
  const out = [];
  (pwCatalogue ? pwCatalogue.lieux : []).forEach(function(g){
    out.push(g.lieu.cle);
    g.sous.forEach(function(s){ out.push(s.cle); });
  });
  return out;
}

// ---- Les filtres ------------------------------------------------------------

function pwEl(id){ return document.getElementById(id); }

/** Une apparition passe-t-elle le filtre de lieu ? */
function pwSpawnRetenu(s){
  const lieux = pwEtat.lieux;
  return !lieux.size || lieux.has(s.pwCleZone) || (!!s.pwCleSous && lieux.has(s.pwCleSous));
}

/**
 * Les apparitions d'une espèce qui passent le filtre de lieu.
 *
 * Rendues plutôt que comptées : la carte affiche la rareté de CE QU'ON
 * CHERCHE. Filtrer sur « Zone 4 » et montrer la rareté d'une apparition de
 * Zone 9 serait la bonne espèce avec le mauvais chiffre.
 */
function pwSpawnsRetenus(e){
  const liste = e.spawns || [];
  return pwEtat.lieux.size ? liste.filter(pwSpawnRetenu) : liste;
}

/** Les étoiles à afficher pour une espèce, compte tenu du filtre de lieu. */
function pwEtoilesRetenues(e){
  const retenus = pwSpawnsRetenus(e);
  if(!retenus.length) return e.etoiles || 0;
  // LA PLUS FAVORABLE, comme la page Lieux le fait déjà pour Cobblemon : entre
  // deux endroits, on retient celui qui donne le plus de chances. Annoncer la
  // plus rare ferait passer son chemin devant un Pokémon commun à côté.
  return retenus.reduce(function(min, s){
    const n = s.etoiles || 0;
    if(!n) return min;
    return min === 0 ? n : Math.min(min, n);
  }, 0) || (e.etoiles || 0);
}

/** Deux ensembles ont-ils un élément en commun ? On parcourt le plus petit. */
function pwSeCroisent(a, b){
  const petit = a.size <= b.size ? a : b;
  const grand = petit === a ? b : a;
  for(const v of petit){ if(grand.has(v)) return true; }
  return false;
}

/**
 * Un état tapé dans la recherche — « manquants », « captures », « shiny ».
 *
 * IL PARLE DE LA COLLECTION DU SERVEUR. Dans le Pokédex des jeux, ces mots
 * visent la collection de l'onglet ouvert ; ici, la page a la sienne, et c'est
 * d'elle qu'on parle — « manquants » sur PixelmonWorld ne peut pas vouloir dire
 * « manquants dans HOME ». On reconnaît le test à son identité : l'analyseur
 * rend ceux de ETATS_RECHERCHE tels quels, alias déjà suivis.
 */
function pwEtatDeRecherche(test, x, seau){
  if(typeof ETATS_RECHERCHE !== 'undefined'){
    if(test === ETATS_RECHERCHE.manquant.test) return !seau.caught.has(x.cle);
    if(test === ETATS_RECHERCHE.capture.test) return seau.caught.has(x.cle);
    if(test === ETATS_RECHERCHE.shiny.test) return seau.shiny.has(x.cle);
  }
  return x.entry ? test(x.entry) : true;
}

/** La recherche tapée, seule. Elle se cumule aux pastilles, en ET. */
function pwRepondALaRecherche(x, requete, seau){
  const e = x.pw;
  // LE NUMÉRO EST CELUI DU POKÉDEX NATIONAL, comme sur le site du serveur : « 19 »
  // rend Rattata ET Rattata d'Alola, qui le partagent.
  if(requete.numero !== null && e.numero !== requete.numero) return false;
  if(requete.gen !== null && x.gen !== requete.gen) return false;
  if(requete.typeId !== null && pwTypesDe(x).indexOf(requete.typeId) === -1) return false;
  if(requete.etats.length
     && !requete.etats.some(function(t){ return pwEtatDeRecherche(t, x, seau); })) return false;
  // Les mots-clés (« legendaire », « alola ») valent ici comme au Pokédex : ce
  // sont les mêmes tests. Sans entrée connue, on ne peut rien en dire — on
  // laisse passer plutôt que d'exclure sur une ignorance.
  if(x.entry && requete.categories.length
     && !requete.categories.some(function(t){ return t(x.entry); })) return false;
  for(let i = 0; i < requete.mots.length; i++){
    if(x.cherchable.indexOf(requete.mots[i]) === -1) return false;
  }
  return true;
}

/**
 * Le filtrage, et combien chaque pastille rendrait.
 *
 * UN SEUL PASSAGE SUR LES 951 ENTRÉES. Chacune est jugée catégorie par
 * catégorie, une fois ; le résultat et les compteurs du panneau sortent du même
 * tour. Rien n'est recalculé au dessin d'une carte ni au survol d'une pastille.
 *
 * LE COMPTEUR D'UNE CATÉGORIE IGNORE SA PROPRE SÉLECTION. « Rare (12) » dit
 * combien on en aurait en cochant Rare, avec tout le reste tel qu'il est — pas
 * combien il en resterait une fois Rare décoché. C'est ce qui laisse cocher une
 * deuxième valeur dans une catégorie sans voir les autres tomber à zéro, et
 * c'est la seule lecture compatible avec le OU qui règne à l'intérieur d'elle.
 */
function pwEvaluer(){
  const brut = pwEl('pwRecherche') ? pwEl('pwRecherche').value.trim() : '';
  const requete = typeof analyserRecherche === 'function'
    ? analyserRecherche(brut) : { numero: null, typeId: null, gen: null, etats: [], categories: [], mots: [] };

  const f = pwEtat;
  const statut = f.vue === 'joueur' ? f.statut : 'tous';
  const seau = pwCollection();
  const compteurs = { types: new Map(), raretes: new Map(), generations: new Map(),
                      lieux: new Map(), statut: { obtenus: 0, manquants: 0 } };
  const plus = function(table, cle){ table.set(cle, (table.get(cle) || 0) + 1); };
  const sortie = [];

  pwEntreesConnues.forEach(function(x){
    if(!pwRepondALaRecherche(x, requete, seau)) return;

    const types = pwTypesDe(x);
    const etoiles = pwEtoilesRetenues(x.pw);
    const possede = seau.caught.has(x.cle);

    // OU dans chaque catégorie : UN type du Pokémon suffit — Eau/Sol sort pour
    // Eau comme pour Sol —, UN de ses lieux suffit.
    const okType = !f.types.size || types.some(function(t){ return f.types.has(t); });
    const okGen = !f.generations.size || f.generations.has(x.gen);
    const okRarete = !f.raretes.size || f.raretes.has(etoiles);
    const okLieu = !f.lieux.size || pwSeCroisent(x.lieux, f.lieux);
    const okStatut = statut === 'tous' || ((statut === 'obtenus') === possede);

    if(okGen && okRarete && okLieu && okStatut){
      types.forEach(function(t){ plus(compteurs.types, t); });
    }
    if(okType && okRarete && okLieu && okStatut) plus(compteurs.generations, x.gen);
    if(okType && okGen && okLieu && okStatut) plus(compteurs.raretes, etoiles);
    if(okType && okGen && okRarete && okStatut){
      x.lieux.forEach(function(l){ plus(compteurs.lieux, l); });
    }
    if(okType && okGen && okRarete && okLieu) compteurs.statut[possede ? 'obtenus' : 'manquants']++;

    // ET entre les catégories.
    if(okType && okGen && okRarete && okLieu && okStatut) sortie.push(x);
  });

  pwTrier(sortie);
  return { resultats: sortie, compteurs: compteurs };
}

function pwTrier(sortie){
  const tri = pwEl('pwTri') ? pwEl('pwTri').value : 'numero';
  sortie.sort(function(a, b){
    if(tri === 'nom'){
      return (a.pw.nomFr || '').localeCompare(b.pw.nomFr || '', 'fr');
    }
    if(tri === 'rarete'){
      // Du plus rare au plus commun : c'est ce qu'on vient chercher quand on
      // trie par rareté. Les inconnues (zéro étoile) ferment la marche plutôt
      // que d'ouvrir le bal en se faisant passer pour des légendaires.
      const ea = pwEtoilesRetenues(a.pw) || 0;
      const eb = pwEtoilesRetenues(b.pw) || 0;
      if(ea !== eb) return (eb || -1) - (ea || -1);
      return a.pw.numero - b.pw.numero;
    }
    if(tri === 'zones'){
      const za = (a.pw.spawns || []).length, zb = (b.pw.spawns || []).length;
      if(za !== zb) return zb - za;
      return a.pw.numero - b.pw.numero;
    }
    if(a.pw.numero !== b.pw.numero) return a.pw.numero - b.pw.numero;
    return (a.pw.espece || '').localeCompare(b.pw.espece || '');
  });
  return sortie;
}

/** Combien de valeurs sont cochées, toutes catégories confondues. */
function pwNombreDeFiltres(){
  return pwEtat.types.size + pwEtat.raretes.size + pwEtat.generations.size + pwEtat.lieux.size
    + (pwEtat.vue === 'joueur' && pwEtat.statut !== 'tous' ? 1 : 0);
}

/**
 * Les filtres posés, dans l'ordre du panneau, avec de quoi retirer chacun.
 *
 * La recherche en fait partie : « Tout réinitialiser » la vide aussi, et on
 * doit pouvoir la retirer d'un clic comme le reste.
 */
function pwFiltresActifs(){
  const out = [];
  const champ = pwEl('pwRecherche');
  const brut = champ ? champ.value.trim() : '';
  if(brut){
    out.push({ libelle: '🔎 « ' + brut + ' »', titre: 'la recherche',
               retirer: function(){ champ.value = ''; } });
  }
  const cat = pwCatalogue;
  if(!cat) return out;
  cat.types.forEach(function(t){
    if(!pwEtat.types.has(t)) return;
    out.push({ libelle: TYPES_FR[t], titre: 'le type ' + TYPES_FR[t],
               retirer: function(){ pwEtat.types.delete(t); } });
  });
  cat.raretes.forEach(function(r){
    if(!pwEtat.raretes.has(r.etoiles)) return;
    out.push({ libelle: (r.etoiles ? '★'.repeat(r.etoiles) + ' ' : '') + r.libelle,
               titre: 'la rareté ' + r.libelle,
               retirer: function(){ pwEtat.raretes.delete(r.etoiles); } });
  });
  cat.generations.forEach(function(g){
    if(!pwEtat.generations.has(g)) return;
    out.push({ libelle: 'Gén. ' + g, titre: 'la génération ' + g,
               retirer: function(){ pwEtat.generations.delete(g); } });
  });
  pwLieuxDansLOrdre().forEach(function(cle){
    if(!pwEtat.lieux.has(cle)) return;
    const l = pwLieux.get(cle);
    out.push({ libelle: (l.genre === 'hors-carte' ? '' : '📍 ') + l.libelle, titre: l.libelle,
               retirer: function(){ pwEtat.lieux.delete(cle); } });
  });
  if(pwEtat.vue === 'joueur' && pwEtat.statut !== 'tous'){
    const s = pwStatuts().find(function(x){ return x.cle === pwEtat.statut; });
    out.push({ libelle: s ? s.libelle : pwEtat.statut, titre: 'le statut',
               retirer: function(){ pwEtat.statut = 'tous'; } });
  }
  return out;
}

/** Tout ce qui filtre revient à zéro. La vue et le tri restent : ce ne sont pas des filtres. */
function pwToutReinitialiser(){
  const champ = pwEl('pwRecherche');
  if(champ) champ.value = '';
  pwEtat.types.clear();
  pwEtat.raretes.clear();
  pwEtat.generations.clear();
  pwEtat.lieux.clear();
  pwEtat.statut = 'tous';
  pwApresChangement();
}

/**
 * Après chaque geste qui change le filtrage : on redessine, et l'adresse suit.
 *
 * `pousser` fait de ce geste une étape de l'historique — Précédent le défait,
 * comme sur le site du serveur, où chaque filtre est un lien. La frappe dans
 * la recherche, elle, ne pousse rien : une entrée par lettre rendrait le
 * bouton Précédent inutilisable.
 */
function pwApresChangement(){
  pwDessiner(true);
  pwEcrireAdresse('pousser');
}

// ---- La grille --------------------------------------------------------------

/**
 * Le sprite d'une carte, avec la chaîne de repli de l'application.
 *
 * On ne réécrit pas la chaîne : local → PokeOS → Showdown est déjà celle de
 * noyau.js, et un second chemin aurait affiché d'autres images que le reste
 * de l'application pour les mêmes Pokémon.
 */
function pwSprite(x){
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = x.pw.nomFr || x.pw.espece;
  const entry = x.entry;

  if(!entry){
    // Inconnue de la réserve : il reste le rendu du serveur, qui la connaît.
    // Le relevé donne son chemin sous /media/pokedex/pokemon/ — « sprite/… »
    // ou « image/… » ; le www du site répond 500 depuis Kaura 2.0.
    img.src = 'https://pixelmonworld.fr/media/pokedex/pokemon/' + (x.pw.sprite || '');
    return img;
  }

  const etapes = [];
  if(typeof spritesLocauxPossibles === 'function' && spritesLocauxPossibles()
     && typeof localSpriteUrl === 'function'){
    etapes.push(function(){ return localSpriteUrl(entry.name, false); });
  }
  if(typeof pokeosHomeUrl === 'function'){
    etapes.push(function(){ return pokeosHomeUrl(entry.id, false); });
  }
  if(typeof showdownSpriteUrl === 'function' && typeof toShowdownSlug === 'function'){
    etapes.push(function(){ return showdownSpriteUrl(toShowdownSlug(entry.name), false); });
  }

  let i = 0;
  const suivante = function(){
    if(i >= etapes.length){ img.style.visibility = 'hidden'; return; }
    img.src = etapes[i++]();
  };
  img.addEventListener('error', suivante);
  suivante();
  return img;
}

// Au-delà, la carte cesse d'avoir la hauteur de ses voisines. Quatre suffisent
// pour 951 espèces sur 951 moins une : la plus fournie après Métamorph en a
// cinq, et la cinquième tient sur la ligne « + 1 autre zone ».
const PW_ZONES_MONTREES = 4;

/**
 * Les apparitions, regroupées par zone.
 *
 * « Zone 1 », « Zone 1 Colline », « Zone 1 Eau », « Zone 1 Forêt » sont QUATRE
 * apparitions et UN endroit où se rendre. Les empiler telles quelles ferait
 * quatre lignes qui commencent toutes par le même mot ; regroupées, elles en
 * font une seule — « Zone 1 · Colline, Eau, Forêt » —, et c'est ainsi qu'on y
 * pense en jouant.
 *
 * L'ordre des zones est celui de l'API, qui est celui de la carte du serveur.
 */
function pwGrouperParZone(spawns){
  const parZone = new Map();
  spawns.forEach(function(s){
    if(!parZone.has(s.zoneId)){
      parZone.set(s.zoneId, { zone: s.zone, genre: s.zoneGenre, sous: [], etoiles: s.etoiles });
    }
    const g = parZone.get(s.zoneId);
    if(s.sousZone && g.sous.indexOf(s.sousZone) === -1) g.sous.push(s.sousZone);
    // La plus favorable des sous-zones : c'est celle qui décide si l'on y va.
    if(s.etoiles && (!g.etoiles || s.etoiles < g.etoiles)) g.etoiles = s.etoiles;
  });
  return [...parZone.values()];
}

/**
 * Une ligne de lieu sur la carte.
 *
 * LE GENRE CHANGE CE QU'ON LIT. « Zone 4 » est un endroit où aller ;
 * « Évolution » et « Tour de Combat » n'en sont pas, et une puce de lieu
 * devant eux enverrait chercher une évolution sur la carte du serveur.
 */
function pwLigneLieu(g){
  const ligne = document.createElement('div');
  ligne.className = 'pw-carte-lieu'
    + (g.genre === 'hors-carte' ? ' pw-carte-lieu-autre' : '');

  const zone = document.createElement('span');
  zone.className = 'pw-carte-lieu-zone';
  zone.textContent = g.zone;
  ligne.appendChild(zone);

  if(g.sous.length){
    const sous = document.createElement('span');
    sous.className = 'pw-carte-lieu-sous';
    sous.textContent = g.sous.join(', ');
    ligne.appendChild(sous);
  }
  ligne.title = g.zone + (g.sous.length ? ' · ' + g.sous.join(', ') : '')
    + (g.genre === 'hors-carte' ? ' — ce n’est pas un endroit où se rendre' : '');
  return ligne;
}

function pwCarte(x){
  const e = x.pw;
  const carte = document.createElement('div');
  carte.className = 'card pw-carte';

  const cadre = document.createElement('div');
  cadre.className = 'card-sprite';

  const numero = document.createElement('span');
  numero.className = 'card-id';
  numero.textContent = '#' + String(e.numero || 0).padStart(4, '0');
  cadre.appendChild(numero);
  cadre.appendChild(pwSprite(x));

  const nom = document.createElement('div');
  nom.className = 'card-name';
  // Le nom de l'application quand elle connaît l'espèce : c'est celui que la
  // langue choisie décide, et il doit rester le même d'un écran à l'autre.
  nom.textContent = x.entry && typeof nomAffiche === 'function'
    ? nomAffiche(x.entry) : (e.nomFr || e.espece);

  // SOUS LE NOM : la rareté, puis TOUS LES ENDROITS.
  //
  // Le format des cartes du Pokédex des jeux, adapté à ce que ce serveur
  // répond. Là-bas, la carte porte une case à cocher et une pastille
  // d'obtention ; ici il n'y a rien à cocher — ce n'est pas un Pokédex de
  // collection — et la vraie question est « où je vais le chercher ».
  //
  // TOUTES LES ZONES, ET C'EST POSSIBLE : 839 espèces sur 951 n'en ont qu'une,
  // et cinq au plus pour toutes les autres. Une seule fait exception,
  // Métamorph, qui sort dans quarante et une — d'où la coupure plus bas.
  const bas = document.createElement('div');
  bas.className = 'pw-carte-bas';
  const retenus = pwSpawnsRetenus(e);
  const etoiles = pwEtoilesRetenues(e);

  // Les étoiles, puis le mot. Les étoiles restent l'indicateur — c'est elles
  // qu'on compare d'une carte à l'autre —, et le mot ne fait que les nommer
  // pour qui préfère lire « Épique ».
  const rarete = document.createElement('div');
  rarete.className = 'pw-carte-rarete';
  rarete.appendChild(pwEtoiles(etoiles, e.rarete
    ? e.rarete + ' — ' + etoiles + ' étoile' + (etoiles > 1 ? 's' : '') + ' sur 5'
    : ''));
  if(e.rarete){
    const mot = document.createElement('span');
    mot.className = 'pw-carte-rarete-mot';
    mot.textContent = e.rarete;
    rarete.appendChild(mot);
  }
  bas.appendChild(rarete);

  const lieux = document.createElement('div');
  lieux.className = 'pw-carte-lieux';
  const groupes = pwGrouperParZone(retenus.length ? retenus : (e.spawns || []));
  if(!groupes.length){
    const rien = document.createElement('div');
    rien.className = 'pw-carte-lieu pw-carte-sans-lieu';
    rien.textContent = 'Aucun endroit connu';
    lieux.appendChild(rien);
  }
  groupes.slice(0, PW_ZONES_MONTREES).forEach(function(g){
    lieux.appendChild(pwLigneLieu(g));
  });
  // MÉTAMORPH, ET LUI SEUL. Quarante et une zones feraient une carte quatre
  // fois plus haute que ses voisines, et la grille cesserait d'être une
  // grille. Le reste s'annonce, et la fiche les donne tous.
  if(groupes.length > PW_ZONES_MONTREES){
    const reste = document.createElement('div');
    reste.className = 'pw-carte-lieu pw-carte-lieu-reste';
    const n = groupes.length - PW_ZONES_MONTREES;
    reste.textContent = '+ ' + n + ' autre' + (n > 1 ? 's' : '') + ' zone' + (n > 1 ? 's' : '');
    reste.title = groupes.slice(PW_ZONES_MONTREES).map(function(g){
      return g.zone + (g.sous.length ? ' · ' + g.sous.join(', ') : '');
    }).join(' · ');
    lieux.appendChild(reste);
  }
  bas.appendChild(lieux);

  carte.appendChild(cadre);
  carte.appendChild(nom);
  carte.appendChild(bas);

  // DANS LE POKÉDEX DU JOUEUR, LA CARTE DIT SI ON L'A. Le vert de .is-owned,
  // celui des Pokédex de jeux, pour ce qu'on possède ; le sprite en gris pour
  // ce qui manque, comme sur la page d'un lien de partage. Et la case du
  // Pokédex, au même endroit et avec le même mot, pour le cocher d'ici.
  if(pwEtat.vue === 'joueur'){
    const possede = pwPossede(x);
    carte.classList.toggle('is-owned', possede);
    carte.classList.toggle('pw-manquant', !possede);
    carte.appendChild(pwCaseACocher(x, carte, possede));
  }

  if(x.entry && typeof openPreview === 'function'){
    const ouvrir = function(){
      // `currentTab` ne change pas : la fiche garde le Pokédex ouvert par
      // ailleurs, et c'est `currentPage` qui lui dit qu'on est sur le serveur.
      openPreview(x.entry);
    };
    cadre.addEventListener('click', ouvrir);
    nom.addEventListener('click', ouvrir);
    cadre.style.cursor = 'zoom-in';
    nom.style.cursor = 'zoom-in';
  } else {
    carte.classList.add('pw-inconnue');
    carte.title = 'Le serveur l’annonce, mais l’application ne connaît pas '
      + 'cette forme : pas de fiche à ouvrir.';
  }
  return carte;
}

/**
 * La case « Capturé » d'une carte du Pokédex du joueur.
 *
 * CELLE DES POKÉDEX DE JEUX, geste compris : exigeCompte() avant que rien ne
 * bouge, le seau modifié, puis queueSave() — le même chemin vers le serveur
 * que n'importe quelle case cochée. Le mot suit l'aventure : « Capturé »,
 * « Vu » ou « En boîte ».
 *
 * LA CARTE NE QUITTE PAS LA GRILLE quand elle change d'état, même sous le
 * filtre « Manquants » : la voir disparaître sous le doigt ferait perdre sa
 * place dans la liste. C'est ce que fait déjà le Pokédex des jeux ; le filtre
 * se réapplique au geste suivant.
 */
function pwCaseACocher(x, carte, possede){
  const mode = pwMode();
  const nomDeLaCarte = x.entry && typeof nomAffiche === 'function'
    ? nomAffiche(x.entry) : (x.pw.nomFr || x.pw.espece);

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const chip = document.createElement('label');
  chip.className = 'chip-check' + (possede ? ' checked' : '');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = possede;
  input.setAttribute('aria-label', mode.action + ' sur PixelmonWorld : ' + nomDeLaCarte);
  chip.appendChild(input);
  chip.appendChild(document.createTextNode(mode.verbe));

  input.addEventListener('change', function(){
    // Avant que la case ne change d'état : la remettre après coup ferait
    // clignoter l'écran, et l'on aurait vu son geste accepté.
    if(typeof exigeCompte === 'function' && !exigeCompte('cocher une capture')){
      input.checked = !input.checked;
      return;
    }
    const seau = pwCollection().caught;
    if(input.checked) seau.add(x.cle); else seau.delete(x.cle);
    chip.classList.toggle('checked', input.checked);
    carte.classList.toggle('is-owned', input.checked);
    carte.classList.toggle('pw-manquant', !input.checked);
    pwMajProgression();
    pwMajResume();
    if(typeof queueSave === 'function') queueSave();
  });

  actions.appendChild(chip);
  return actions;
}

/**
 * Le compteur au-dessus de la grille : combien de Pokémon correspondent.
 *
 * Il suit chaque geste, et dans le Pokédex du joueur il dit aussi combien de
 * ceux-là on a déjà — c'est la question qu'on se pose en filtrant sa collection.
 */
function pwMajResume(){
  const resume = pwEl('pwResume');
  if(!resume) return;
  const n = pwFiltrees.length;
  // Aucun résultat : l'état vide le dit déjà, en plus grand, et propose d'en
  // sortir. Un « 0 Pokémon » au-dessus serait la même phrase en plus petit.
  if(!n){ resume.textContent = ''; return; }
  const spawns = pwFiltrees.reduce(function(t, x){ return t + pwSpawnsRetenus(x.pw).length; }, 0);
  let texte = n + ' Pokémon trouvé' + (n > 1 ? 's' : '')
    + ' · ' + spawns + ' apparition' + (spawns > 1 ? 's' : '');
  if(pwEtat.vue === 'joueur'){
    const seau = pwCollection().caught;
    const pris = pwFiltrees.filter(function(x){ return seau.has(x.cle); }).length;
    const mode = pwMode();
    texte += ' · ' + pris + ' ' + (pris > 1 ? mode.pluriel.toLowerCase() : mode.verbeMin);
  }
  resume.textContent = texte;
}

function pwDessiner(remiseAZero){
  const grille = pwEl('pwGrille');
  if(!grille) return;
  if(remiseAZero){
    // UN FILTRE QUI CHANGE RAMÈNE AU PREMIER LOT. La liste n'est plus la même :
    // garder les cent cinquante cartes déjà déroulées laisserait sous les yeux
    // une position qui ne correspond plus à rien — et, filtrée assez fort, à
    // une page qui n'existe plus.
    const r = pwEvaluer();
    pwFiltrees = r.resultats;
    pwCompteurs = r.compteurs;
    pwDessinees = 0;
    grille.innerHTML = '';
    grille.scrollTop = 0;
    pwMajJetons();
    pwMajPanneau();
    pwMajActifs();
    pwMajProgression();
    pwMajResume();
  }

  if(!pwFiltrees.length){
    grille.innerHTML = '';
    const vide = document.createElement('div');
    vide.className = 'state-msg pw-vide';
    const actifs = pwFiltresActifs().length > 0;
    vide.appendChild(document.createTextNode(actifs
      ? 'Aucun Pokémon ne correspond à ces filtres.'
      : 'Aucun Pokémon à afficher.'));
    if(actifs){
      // La sortie est sous la phrase qui constate l'impasse : on ne remonte pas
      // chercher un bouton quand la grille vient de se vider.
      const raz = document.createElement('button');
      raz.type = 'button';
      raz.className = 'toggle-btn pw-vide-raz';
      raz.textContent = '♻ Tout réinitialiser';
      raz.addEventListener('click', pwToutReinitialiser);
      vide.appendChild(raz);
    }
    grille.appendChild(vide);
    const plus = pwEl('pwPlus'); if(plus) plus.style.display = 'none';
    return;
  }

  const lot = pwFiltrees.slice(pwDessinees, pwDessinees + PW_LOT);
  const fragment = document.createDocumentFragment();
  lot.forEach(function(x){ fragment.appendChild(pwCarte(x)); });
  grille.appendChild(fragment);
  pwDessinees += lot.length;

  const plus = pwEl('pwPlus');
  if(plus) plus.style.display = pwDessinees < pwFiltrees.length ? 'block' : 'none';
}

/**
 * La collection a pu changer ailleurs — une autre aventure ouverte depuis le
 * menu du compte. On redessine sans toucher aux filtres.
 */
function pwRafraichir(){
  if(!pwEntreesConnues.length || !pwCatalogue) return;
  pwDessiner(true);
}

// La ligne « Compris : », reprise du Pokédex. C'est la même fonction qui
// remplit les deux — jetonsCompris est posé par analyserRecherche().
function pwMajJetons(){
  const el = pwEl('pwJetons');
  if(!el) return;
  const jetons = typeof jetonsCompris !== 'undefined' ? jetonsCompris : [];
  el.hidden = !jetons.length;
  el.innerHTML = jetons.length
    ? '<span class="jeton-titre">Compris :</span>'
      + jetons.map(function(j){ return '<span class="jeton">' + escapeHtml(j) + '</span>'; }).join('')
    : '';
}

// ---- L'autocomplétion -------------------------------------------------------

/**
 * L'autocomplétion : un <datalist> rempli une fois.
 *
 * Le natif plutôt qu'une liste déroulante écrite à la main : le navigateur
 * filtre, navigue au clavier et se ferme tout seul, et l'application n'a rien
 * à tenir ouvert au-dessus de la grille. Neuf cent cinquante et une entrées y
 * passent sans qu'on s'en aperçoive.
 */
function pwRemplirAutocompletion(){
  const liste = pwEl('pwNoms');
  if(!liste || liste.childElementCount) return;
  const fragment = document.createDocumentFragment();
  pwEntreesConnues.forEach(function(x){
    const o = document.createElement('option');
    o.value = x.entry && typeof nomAffiche === 'function'
      ? nomAffiche(x.entry) : (x.pw.nomFr || x.pw.espece);
    o.label = '#' + String(x.pw.numero).padStart(4, '0');
    fragment.appendChild(o);
  });
  liste.appendChild(fragment);
}

// ---- Le panneau des filtres -------------------------------------------------
//
// LE PANNEAU DE « PLUS DE FILTRES », AGRANDI. Un bouton qui l'ouvre, des
// pastilles .filtre-chip qui s'allument en rouge une fois cochées, et sur
// téléphone une hauteur plafonnée qui défile chez elle plutôt que de pousser la
// grille hors de l'écran. Aucun composant de plus : c'est le panneau que le
// Pokédex des jeux et la page Lieux ouvrent déjà.
//
// IL SE CONSTRUIT UNE FOIS, et chaque geste ne fait ensuite que mettre à jour
// l'état et le compte des pastilles existantes : quatre-vingts boutons
// reconstruits à chaque clic, c'est autant de focus perdus au clavier.

const PW_FILTRES_OUVERTS_CLE = 'pa.pw.filtres-ouverts';

// Ouvert ou fermé, retenu d'une visite à l'autre comme « Plus de filtres ».
// Sans réglage retenu, il s'ouvre sur un écran large — c'est là que vivaient
// les menus qu'il remplace, visibles d'emblée — et reste fermé sur un
// téléphone, où il mangerait l'écran avant la première carte.
let pwFiltresOuverts = (function(){
  let garde = null;
  try{ garde = localStorage.getItem(PW_FILTRES_OUVERTS_CLE); }catch(e){ /* stockage refusé */ }
  if(garde === '1' || garde === '0') return garde === '1';
  try{ return window.matchMedia('(min-width: 821px)').matches; }catch(e){ return true; }
})();

let pwPuces = [];                  // { el, categorie, valeur, nom, n }
let pwPanneauDe = null;            // le catalogue sur lequel le panneau a été bâti

/** Un groupe du panneau : son titre, puis ses pastilles. */
function pwGroupe(panneau, categorie, titre){
  const groupe = document.createElement('div');
  groupe.className = 'pw-filtres-groupe';
  groupe.dataset.categorie = categorie;
  groupe.setAttribute('role', 'group');
  groupe.setAttribute('aria-label', titre);
  const t = document.createElement('span');
  t.className = 'pw-filtres-titre';
  t.textContent = titre;
  groupe.appendChild(t);
  const valeurs = document.createElement('div');
  valeurs.className = 'pw-filtres-valeurs';
  groupe.appendChild(valeurs);
  panneau.appendChild(groupe);
  return valeurs;
}

/**
 * Une pastille : un bouton qui coche ou décoche UNE valeur d'UNE catégorie.
 *
 * Le compte qu'elle porte vient de pwEvaluer() : combien de Pokémon on aurait
 * en la cochant, le reste des filtres tel qu'il est. Une pastille à zéro reste
 * cliquable — elle s'éteint seulement, pour ne pas envoyer dans une impasse
 * sans prévenir.
 */
function pwPuce(conteneur, categorie, valeur, libelle, titre, classe){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'filtre-chip pw-puce' + (classe ? ' ' + classe : '');
  b.setAttribute('aria-pressed', 'false');
  // Ce que la pastille désigne, lisible sans son libellé : trois « Eau »
  // voisinent dans les lieux, et seule la clé dit de quelle zone.
  b.dataset.categorie = categorie;
  b.dataset.valeur = String(valeur);
  if(titre) b.title = titre;
  const nom = document.createElement('span');
  nom.className = 'pw-puce-nom';
  nom.textContent = libelle;
  const n = document.createElement('span');
  n.className = 'pw-puce-n';
  b.appendChild(nom);
  b.appendChild(n);
  b.addEventListener('click', function(){ pwBasculer(categorie, valeur); });
  conteneur.appendChild(b);
  pwPuces.push({ el: b, categorie: categorie, valeur: valeur, nom: nom, n: n });
  return b;
}

function pwConstruirePanneau(){
  const panneau = pwEl('pwFiltres');
  if(!panneau || !pwCatalogue || pwPanneauDe === pwCatalogue) return;
  panneau.innerHTML = '';
  pwPuces = [];
  const cat = pwCatalogue;

  // LE STATUT D'ABORD, et seulement dans le Pokédex du joueur : « manquants »
  // est la question qu'on vient poser à sa collection avant toute autre. Trois
  // choix exclusifs — on n'est pas à la fois capturé et manquant.
  const statut = pwGroupe(panneau, 'statut', 'Statut');
  pwStatuts().forEach(function(s){
    pwPuce(statut, 'statut', s.cle, s.libelle, '', 'filtre-etat');
  });

  const types = pwGroupe(panneau, 'types', 'Types');
  cat.types.forEach(function(t){
    const b = pwPuce(types, 'types', t, TYPES_FR[t],
      'Type ' + TYPES_FR[t] + ' — un Pokémon double type sort pour chacun des deux', 'pw-puce-type');
    // La pastille porte la couleur du type, en pastille : celle des puces de la
    // fiche, lue dans la même table.
    if(typeof TYPE_COULEURS !== 'undefined' && TYPE_COULEURS[t]){
      b.style.setProperty('--pw-type', TYPE_COULEURS[t]);
    }
  });

  const raretes = pwGroupe(panneau, 'raretes', 'Rareté');
  cat.raretes.forEach(function(r){
    pwPuce(raretes, 'raretes', r.etoiles,
      (r.etoiles ? '★'.repeat(r.etoiles) + ' ' : '— ') + r.libelle,
      r.etoiles ? r.etoiles + ' étoile' + (r.etoiles > 1 ? 's' : '') + ' sur 5'
                : 'Le Pokédex du serveur ne donne pas sa rareté');
  });

  const gens = pwGroupe(panneau, 'generations', 'Génération');
  cat.generations.forEach(function(g){
    const plage = typeof GEN_RANGES !== 'undefined'
      ? GEN_RANGES.find(function(x){ return x.gen === g; }) : null;
    pwPuce(gens, 'generations', g, 'Gén. ' + g, plage ? plage.name : 'Génération ' + g);
  });

  // LES LIEUX, EN DEUX FAMILLES. Les zones où l'on se rend, chacune suivie de
  // ses sous-zones ; puis ce qui n'est pas un endroit — Évolution, Quête, Tour
  // de Combat —, que les données distinguent déjà par leur genre. Ils restent
  // DANS la même catégorie : « Océan » et « Quête » répondent tous deux à « où
  // l'obtient-on ? », et les cocher ensemble veut dire l'un OU l'autre.
  const lieux = pwGroupe(panneau, 'lieux', 'Lieux');
  const autres = [];
  cat.lieux.forEach(function(g){
    if(g.lieu.genre === 'hors-carte'){ autres.push(g); return; }
    const bloc = document.createElement('span');
    bloc.className = 'pw-zone';
    pwPuce(bloc, 'lieux', g.lieu.cle, g.lieu.nom,
      g.sous.length ? g.lieu.nom + ' — toute la zone, sous-zones comprises' : g.lieu.nom,
      'pw-puce-zone');
    g.sous.forEach(function(s){
      pwPuce(bloc, 'lieux', s.cle, s.nom, s.libelle, 'pw-puce-sous');
    });
    lieux.appendChild(bloc);
  });
  if(autres.length){
    const sep = document.createElement('span');
    sep.className = 'pw-filtres-sous-titre';
    sep.textContent = 'Autres moyens d’obtention';
    lieux.appendChild(sep);
    autres.forEach(function(g){
      pwPuce(lieux, 'lieux', g.lieu.cle, g.lieu.nom,
        g.lieu.note || 'Ce n’est pas un endroit où se rendre', 'pw-puce-autre');
    });
  }

  pwPanneauDe = cat;
}

function pwValeurCochee(categorie, valeur){
  if(categorie === 'statut') return pwEtat.statut === valeur;
  return pwEtat[categorie].has(valeur);
}

function pwCompte(categorie, valeur){
  const c = pwCompteurs;
  if(!c) return 0;
  if(categorie === 'statut'){
    if(valeur === 'tous') return c.statut.obtenus + c.statut.manquants;
    return c.statut[valeur] || 0;
  }
  return c[categorie].get(valeur) || 0;
}

/** L'état et le compte de chaque pastille, sans rien reconstruire. */
function pwMajPanneau(){
  const joueur = pwEtat.vue === 'joueur';
  const statuts = pwStatuts();
  pwPuces.forEach(function(p){
    const cochee = pwValeurCochee(p.categorie, p.valeur);
    const n = pwCompte(p.categorie, p.valeur);
    p.el.setAttribute('aria-pressed', String(cochee));
    p.n.textContent = String(n);
    p.el.classList.toggle('vide', !n && !cochee);
    // Le mot du statut suit l'aventure ouverte : « Capturés » devient « Vus »
    // en passant sur une aventure de rencontres.
    if(p.categorie === 'statut'){
      const s = statuts.find(function(x){ return x.cle === p.valeur; });
      if(s) p.nom.textContent = s.libelle;
    }
  });
  const panneau = pwEl('pwFiltres');
  if(panneau){
    const statut = panneau.querySelector('.pw-filtres-groupe[data-categorie="statut"]');
    if(statut) statut.hidden = !joueur;
  }
  pwMajBascule();
}

/** Le bouton « Filtres » : ouvert ou fermé, et combien de valeurs sont cochées. */
function pwMajBascule(){
  const bouton = pwEl('pwFiltresBascule');
  const panneau = pwEl('pwFiltres');
  const n = pwNombreDeFiltres();
  if(bouton){
    // Le nombre se lit sans ouvrir : panneau fermé, c'est lui qui dit que la
    // grille est filtrée — sans lui, une grille amputée passe pour une grille
    // vide. Même idée que « 🧩 Mods (2) » sur la page Lieux.
    bouton.textContent = '🧲 Filtres' + (n ? ' (' + n + ')' : '');
    bouton.setAttribute('aria-expanded', String(pwFiltresOuverts));
    bouton.classList.toggle('filtering', n > 0);
  }
  if(panneau && pwCatalogue) panneau.hidden = !pwFiltresOuverts;
}

function pwBasculer(categorie, valeur){
  if(categorie === 'statut'){
    // Des boutons radio : recliquer celui qui est allumé ne l'éteint pas. Un
    // statut, il y en a toujours un — « Tous » en est un.
    if(pwEtat.statut === valeur) return;
    pwEtat.statut = valeur;
  } else {
    const ensemble = pwEtat[categorie];
    if(ensemble.has(valeur)) ensemble.delete(valeur); else ensemble.add(valeur);
  }
  pwApresChangement();
}

// ---- Les filtres actifs -----------------------------------------------------
//
// LA LIGNE « COMPRIS : » DU POKÉDEX, POUR LES PASTILLES. Une pastille par
// valeur cochée, chacune avec sa croix : on retire « Gén. 4 » sans rouvrir le
// panneau ni décocher le reste. Et « Tout réinitialiser » au bout de la ligne,
// là où l'œil finit de lire ce qui filtre.

function pwMajActifs(){
  const bloc = pwEl('pwActifs');
  const liste = pwEl('pwActifsListe');
  if(!bloc || !liste) return;
  const actifs = pwFiltresActifs();
  bloc.hidden = !actifs.length;
  liste.innerHTML = '';
  actifs.forEach(function(a, i){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'jeton pw-jeton-actif';
    b.title = 'Retirer ' + a.titre;
    b.setAttribute('aria-label', 'Retirer ' + a.titre + ' : ' + a.libelle);
    const nom = document.createElement('span');
    nom.textContent = a.libelle;
    const croix = document.createElement('span');
    croix.className = 'pw-jeton-croix';
    croix.setAttribute('aria-hidden', 'true');
    croix.textContent = '×';
    b.appendChild(nom);
    b.appendChild(croix);
    b.addEventListener('click', function(){
      a.retirer();
      pwApresChangement();
      // Le bouton cliqué n'existe plus : le focus va au suivant, ou au champ de
      // recherche s'il n'en reste aucun — jamais nulle part.
      const suivants = liste.querySelectorAll('.pw-jeton-actif');
      const cible = suivants[Math.min(i, suivants.length - 1)] || pwEl('pwRecherche');
      if(cible) cible.focus();
    });
    liste.appendChild(b);
  });
}

// ---- Les deux Pokédex -------------------------------------------------------
//
// « Pokédex PixelmonWorld » montre ce que le serveur fait apparaître, comme
// avant ; « Pokédex du joueur » montre la même liste, vue depuis ta collection.
// Mêmes filtres, même grille : seuls la jauge, le statut et la case à cocher
// s'ajoutent. Ce sont les onglets de la Stratégie, et non deux pages, parce
// que c'est une manière de regarder la même chose.

function pwChoisirVue(vue){
  if(vue !== 'joueur') vue = 'serveur';
  if(pwEtat.vue === vue) return;
  pwEtat.vue = vue;
  pwMajVues();
  pwApresChangement();
}

function pwMajVues(){
  const joueur = pwEtat.vue === 'joueur';
  [['pwVueServeur', !joueur], ['pwVueJoueur', joueur]].forEach(function(o){
    const b = pwEl(o[0]);
    if(!b) return;
    b.classList.toggle('active', o[1]);
    b.setAttribute('aria-selected', String(o[1]));
  });
  const progression = pwEl('pwProgression');
  if(progression) progression.hidden = !joueur;
  const grille = pwEl('pwGrille');
  if(grille) grille.classList.toggle('pw-vue-joueur', joueur);
}

/**
 * La jauge du Pokédex du joueur : combien d'entrées du serveur sont à toi.
 *
 * LE TOTAL EST CELUI DU RELEVÉ, JAMAIS UN NOMBRE ÉCRIT ICI. Chaque forme y est
 * une entrée — Rattata et Rattata d'Alola font deux —, et le jour où le serveur
 * en ajoute, le total suit. Ce que la collection contient hors de ce Pokédex
 * (une espèce que le serveur a retirée depuis) ne compte pas : on mesure le
 * Pokédex du serveur, pas la collection.
 */
function pwMajProgression(){
  if(pwEtat.vue !== 'joueur') return;
  const total = pwEntreesConnues.length;
  const seau = pwCollection().caught;
  let n = 0;
  pwEntreesConnues.forEach(function(x){ if(seau.has(x.cle)) n++; });
  let pct = total ? Math.round(n / total * 100) : 0;
  // « 100 % » sur un Pokédex incomplet serait un mensonge d'arrondi : à 950
  // sur 951, il en manque encore un.
  if(pct === 100 && n < total) pct = 99;

  const jauge = pwEl('pwJauge');
  if(jauge && typeof GAUGE_CIRCUMFERENCE !== 'undefined'){
    jauge.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - pct / 100));
  }
  const mode = pwMode();
  const poser = function(id, texte){ const el = pwEl(id); if(el) el.textContent = texte; };
  poser('pwJaugeValeur', pct + '%');
  poser('pwProgresNombre', String(n));
  poser('pwProgresTotal', String(total));
  poser('pwProgresMot', n > 1 ? mode.pluriel.toLowerCase() : mode.verbeMin);
  poser('pwProgresPct', pct + ' % complété');
  // L'aventure est nommée : la collection lui appartient, et en changer change
  // la jauge. Sans le nom, deux aventures donneraient deux chiffres sans dire
  // pourquoi.
  const aventure = (typeof profilCourant !== 'undefined' && profilCourant && profilCourant.nom)
    ? profilCourant.nom : '';
  poser('pwProgressionTitre', 'Ta collection PixelmonWorld' + (aventure ? ' — ' + aventure : ''));
  const aide = pwEl('pwProgresAide');
  if(aide) aide.hidden = n > 0;
}

// ---- L'adresse --------------------------------------------------------------
//
// SUR LE SITE SEULEMENT. L'application de bureau n'a pas de barre d'adresse, et
// la table des adresses (window.POKEPENSION_ADRESSES) n'est posée que dans les
// pages du site — voir site/source/adresses.js. Sans elle, rien ne s'écrit ni
// ne se lit ici, et les filtres vivent en mémoire comme avant.
//
// L'ADRESSE DIT TOUT CE QUI FILTRE :
//
//     /pixelmonworld?vue=joueur&types=eau,glace&generations=3,4
//                   &raretes=rare,epique&lieux=lac-rime,ocean&statut=manquants
//
// Les mots sont ceux qu'on taperait : « eau » comme dans la recherche,
// « peu-commun » comme sur la pastille, et pour les lieux la clé du relevé du
// serveur. Une valeur que les données ne connaissent pas est ignorée, puis
// l'adresse est réécrite sans elle : un vieux lien ne vide pas la grille sans
// dire pourquoi.
//
// QUI A LE DERNIER MOT. Arriver sur l'adresse — un lien collé, un
// rafraîchissement, Précédent — la lit : c'est elle qui décide. Revenir par un
// onglet garde les filtres qu'on avait, et les écrit dans l'adresse. Chaque
// geste l'écrit à son tour, pour que ce qu'on copie soit ce qu'on voit.

function pwAdresse(){
  const table = window.POKEPENSION_ADRESSES;
  if(!table) return null;
  for(const nom in table){
    if(Object.prototype.hasOwnProperty.call(table, nom) && table[nom] === 'pixelmonworld') return nom;
  }
  return null;
}

/** La barre d'adresse montre-t-elle le Pokédex du serveur ? Même lecture qu'adresses.js. */
function pwSurSonAdresse(){
  const nom = pwAdresse();
  if(!nom) return false;
  const bout = location.pathname.replace(/\/+$/, '').split('/').pop() || '';
  return bout.replace(/\.html$/, '') === nom;
}

/** L'état, en paramètres. Dans l'ordre du panneau, pour qu'un même état fasse une même adresse. */
function pwRequete(){
  const bouts = [];
  const liste = function(nom, valeurs){
    if(valeurs.length) bouts.push(nom + '=' + valeurs.map(encodeURIComponent).join(','));
  };
  if(pwEtat.vue === 'joueur') bouts.push('vue=joueur');
  const champ = pwEl('pwRecherche');
  const q = champ ? champ.value.trim() : '';
  if(q) bouts.push('q=' + encodeURIComponent(q));
  const cat = pwCatalogue || { types: [], raretes: [], generations: [] };
  liste('types', cat.types.filter(function(t){ return pwEtat.types.has(t); }).map(pwCleType));
  liste('generations', cat.generations.filter(function(g){ return pwEtat.generations.has(g); })
    .map(String));
  liste('raretes', cat.raretes.filter(function(r){ return pwEtat.raretes.has(r.etoiles); })
    .map(function(r){ return r.slug; }));
  liste('lieux', pwLieuxDansLOrdre().filter(function(c){ return pwEtat.lieux.has(c); }));
  if(pwEtat.vue === 'joueur' && pwEtat.statut !== 'tous') bouts.push('statut=' + pwEtat.statut);
  const tri = pwEl('pwTri');
  if(tri && tri.value && tri.value !== 'numero') bouts.push('tri=' + encodeURIComponent(tri.value));
  return bouts.length ? '?' + bouts.join('&') : '';
}

/**
 * L'adresse, lue et appliquée à l'état.
 *
 * Elle attend le catalogue : les raretés et les lieux ne se reconnaissent qu'une
 * fois la réserve du serveur arrivée. D'où pwRequeteEnAttente, que
 * chargerPagePW() applique au bon moment.
 */
function pwAppliquerRequete(recherche){
  const p = new URLSearchParams(recherche || '');
  const valeurs = function(nom){
    return String(p.get(nom) || '').split(',')
      .map(function(v){ return v.trim(); }).filter(Boolean);
  };
  const cat = pwCatalogue || { types: [], raretes: [], generations: [] };

  pwEtat.vue = p.get('vue') === 'joueur' ? 'joueur' : 'serveur';
  const champ = pwEl('pwRecherche');
  if(champ) champ.value = p.get('q') || '';

  // Les types par leur nom français, comme dans la recherche — TYPES_PAR_NOM
  // connaît aussi « electrique » et « tenebre ».
  pwEtat.types = new Set(valeurs('types').map(function(v){
    return typeof TYPES_PAR_NOM !== 'undefined' ? TYPES_PAR_NOM[sansAccents(v)] : undefined;
  }).filter(function(t){ return cat.types.indexOf(t) !== -1; }));

  // Les raretés par leur mot, par la clé de l'API (« epic ») ou par le nombre
  // d'étoiles : trois écritures, une seule table pour les reconnaître.
  pwEtat.raretes = new Set(valeurs('raretes').map(function(v){
    const nu = pwSlug(v);
    const r = cat.raretes.find(function(x){
      return x.slug === nu || pwSlug(x.cle) === nu || String(x.etoiles) === nu;
    });
    return r ? r.etoiles : null;
  }).filter(function(v){ return v !== null; }));

  pwEtat.generations = new Set(valeurs('generations').map(Number)
    .filter(function(g){ return cat.generations.indexOf(g) !== -1; }));

  // « Zone 7 », « zone-7 » et « Océan » désignent le même lieu que sa clé.
  pwEtat.lieux = new Set(valeurs('lieux').map(pwSlug)
    .filter(function(c){ return pwLieux.has(c); }));

  const statut = pwSlug(p.get('statut'));
  pwEtat.statut = (statut === 'obtenus' || statut === 'manquants') ? statut : 'tous';

  const tri = pwEl('pwTri');
  if(tri){
    const voulu = p.get('tri') || 'numero';
    tri.value = Array.prototype.some.call(tri.options, function(o){ return o.value === voulu; })
      ? voulu : 'numero';
    // Une valeur changée par le code ne lève pas « change » : sans ce rappel,
    // le bouton de menus.js garderait l'ancien libellé.
    if(typeof syncSelects === 'function') syncSelects();
  }
}

/**
 * L'état, écrit dans la barre d'adresse.
 *
 * `pousser` ajoute une étape à l'historique ; `remplacer` corrige l'étape en
 * cours. Une adresse déjà juste n'écrit rien : un rafraîchissement ne doit pas
 * empiler des doublons sous Précédent.
 */
function pwEcrireAdresse(mode){
  if(!pwSurSonAdresse() || !pwCatalogue) return;
  const voulue = location.pathname + pwRequete();
  if(voulue === location.pathname + location.search) return;
  try{
    if(mode === 'pousser') history.pushState({ page: 'pixelmonworld' }, '', voulue);
    else history.replaceState(history.state, '', voulue);
  }catch(e){ /* adresse refusée : les filtres marchent quand même */ }
}

// L'adresse d'arrivée — un lien, un rafraîchissement. Lue ici, au chargement du
// script : adresses.js ouvrira l'écran ensuite, et chargerPagePW() l'appliquera
// une fois la réserve là.
let pwRequeteEnAttente = pwSurSonAdresse() ? location.search : null;

// PRÉCÉDENT ET SUIVANT. Ce fichier est chargé avant adresses.js : cet écouteur
// passe donc avant le sien, qui rouvre l'écran — et chargerPagePW() trouve
// l'adresse de l'étape à appliquer. Une étape sans paramètre veut dire « sans
// filtre », et c'est bien ce qu'elle rétablit.
window.addEventListener('popstate', function(){
  if(pwSurSonAdresse()) pwRequeteEnAttente = location.search;
});

// ---- La page ----------------------------------------------------------------

/** Ce que voit quelqu'un qui n'a pas le droit — et il n'y a rien à voir. */
function pwMontrerRefus(message){
  const grille = pwEl('pwGrille');
  ['pwBarre', 'pwVues', 'pwProgression', 'pwFiltres', 'pwActifs', 'pwJetons'].forEach(function(id){
    const el = pwEl(id);
    if(el) el.hidden = true;
  });
  if(grille){
    grille.innerHTML = '<div class="state-msg">' + escapeHtml(message) + '</div>';
  }
  const resume = pwEl('pwResume'); if(resume) resume.textContent = '';
  const plus = pwEl('pwPlus'); if(plus) plus.style.display = 'none';
}

/**
 * La réserve reliée aux entrées de l'application, et le catalogue du panneau.
 *
 * À PART DE LA PAGE, parce que la page n'est pas seule à en avoir besoin : le
 * pont Minecraft (minecraft.js) répond aux suggestions de `/ps` avec ce même
 * catalogue, sans qu'on ait ouvert l'écran. Suppose la réserve chargée.
 */
async function pwPreparer(){
  // LA TABLE DES TYPES AVANT LE PREMIER DESSIN. Elle vient de la réserve
  // embarquée (cacheLire y retombe) : aucun aller-retour réseau, et le filtre
  // marche hors ligne. L'attendre évite une grille dessinée une fois sans types,
  // puis une seconde avec.
  if(typeof loadTypes === 'function'){
    try{ await loadTypes(); }catch(e){ /* sans elle, un filtre de type ne retient rien */ }
  }

  // La réserve a pu arriver avant les entrées de l'application — par la fiche,
  // ouverte tôt. Reliée à une liste vide, elle aurait tout cru inconnu : on la
  // relie de nouveau, maintenant que la liste est là.
  if(typeof allEntries !== 'undefined' && allEntries.length && pwEntreesConnues.length
     && !pwEntreesConnues.some(function(x){ return x.entry; })){
    pwIndexer();
  }
  if(!pwCatalogue) pwConstruireCatalogue();
}

/**
 * Ouvre le Pokédex du serveur sur un état donné, écrit comme son adresse.
 *
 * C'EST LE CHEMIN D'UN LIEN COLLÉ, et le pont Minecraft l'emprunte tel quel :
 * `/ps zone Zone 1 rare Rare type Feu` devient `?lieux=zone-1&raretes=rare&
 * types=feu`, que pwAppliquerRequete() lit comme n'importe quelle adresse. Il
 * n'y a pas de second système de filtres.
 *
 * Le tri n'est pas un filtre : on garde celui que le joueur avait choisi.
 */
function pwOuvrirSur(recherche){
  const tri = pwEl('pwTri');
  const garde = tri && tri.value && tri.value !== 'numero'
    ? (recherche ? '&' : '?') + 'tri=' + encodeURIComponent(tri.value) : '';
  pwRequeteEnAttente = (recherche || '') + garde;
  showPage('pixelmonworld');
}

async function chargerPagePW(){
  const droits = await pwChargerDroits();
  if(!droits || !droits.lire){
    pwMontrerRefus('Ce Pokédex est réservé. Demande l’accès à l’administrateur : '
      + 'il l’ouvre par identifiant Discord.');
    pwMajOngletAdmin();
    return;
  }

  try{
    await pwChargerReserve();
  }catch(e){
    pwMontrerRefus('Le Pokédex du serveur n’a pas répondu. Réessaie dans un moment.');
    return;
  }

  await pwPreparer();
  pwConstruirePanneau();

  // L'adresse d'arrivée, maintenant que les lieux et les raretés se
  // reconnaissent. Ouvert par un onglet, il n'y en a pas : on garde ce qu'on
  // avait.
  if(pwRequeteEnAttente !== null){
    pwAppliquerRequete(pwRequeteEnAttente);
    pwRequeteEnAttente = null;
  }

  ['pwBarre', 'pwVues'].forEach(function(id){
    const el = pwEl(id);
    if(el) el.hidden = false;
  });
  pwRemplirAutocompletion();
  pwMajOngletAdmin();
  pwMajVues();
  pwDessiner(true);
  pwEcrireAdresse('remplacer');
}

/**
 * Les deux onglets que la réponse de l'API décide.
 *
 * « Serveurs » pour qui a le droit de lire ; « Admin » pour le seul
 * administrateur. AVOIR ACCÈS NE DONNE PAS LE DROIT D'EN DONNER — sinon la
 * première personne autorisée ouvrirait la porte à toutes les autres.
 *
 * Les deux sont CACHÉS, pas désactivés : un onglet qui ne mène qu'à un refus
 * n'a rien à faire dans la barre. Ce n'est pas une protection — c'est l'API
 * qui refuse, et elle refuserait tout autant si on le laissait visible.
 */
function pwMajOngletAdmin(){
  // L'onglet s'appelle « Serveurs » et non « PixelmonWorld » : il réunit les
  // deux écrans du serveur, et en réunira d'autres. C'est le même montage que
  // l'onglet « Outils ».
  const onglet = document.querySelector('.page-tab[data-page="serveurs"]');
  if(onglet) onglet.hidden = !(pwDroits && pwDroits.lire);
  const admin = document.querySelector('.page-tab[data-page="admin"]');
  if(admin) admin.hidden = !(pwDroits && pwDroits.gestionAcces);
}

/**
 * L'onglet, au démarrage.
 *
 * ON DEMANDE AVANT QUE QUICONQUE NE CLIQUE, et c'est voulu : un onglet qui
 * apparaît au premier clic n'est pas un onglet, c'est une devinette. La
 * réponse est un seul appel, et elle ne coûte rien à qui n'a pas de session —
 * `invoke` échoue tout de suite et l'onglet reste caché.
 */
function pwDepart(){
  ['serveurs', 'admin'].forEach(function(nom){
    const onglet = document.querySelector('.page-tab[data-page="' + nom + '"]');
    if(onglet) onglet.hidden = true;
  });
  pwChargerDroits().then(pwMajOngletAdmin);
}

// ---- Le bloc des apparitions, dans la fiche ---------------------------------
//
// Il se pose dans « Où l'obtenir », avec les classes du relevé — .obt-groupe,
// .obt-ligne, .obt-lieu, .obt-cat, .obt-mention, .obt-precision. Rien de neuf
// n'y est dessiné : c'est la même forme que les lieux des jeux et que les
// biomes de Cobblemon, et c'est ce qui fait qu'elle se lit sans apprendre.

/**
 * Faut-il parler de PixelmonWorld sur cette fiche ?
 *
 * Oui depuis ses deux écrans, oui sur le Pokédex d'ensemble — c'est là qu'on
 * compare les sources — et non sur le Pokédex d'un jeu : on y demande où
 * trouver l'espèce DANS CE JEU, et un serveur Minecraft n'y répond pas. C'est
 * exactement la règle que suit déjà le bloc de Cobblemon.
 *
 * LA PAGE OUVERTE SUFFIT À SAVOIR D'OÙ L'ON VIENT — voir
 * ficheSurPixelmonWorld() dans fiche.js. Un drapeau posé au clic aurait fallu
 * le remettre à zéro à chaque façon de fermer la fiche, et la première oubliée
 * aurait suffi à tout fausser.
 */
function pwFicheConcernee(){
  if(!pwDroits || !pwDroits.lire) return false;
  if(typeof ficheSurPixelmonWorld === 'function' && ficheSurPixelmonWorld()) return true;
  const jeu = typeof gameByKey !== 'undefined' && typeof currentTab !== 'undefined'
    ? gameByKey[currentTab] : null;
  return !jeu;
}

/**
 * La collection que la fiche doit lire, ou null pour celle de l'onglet.
 *
 * OUVERTE DEPUIS LE SERVEUR, LA FICHE PARLE DU SERVEUR — c'était déjà sa règle
 * pour les blocs qu'elle montre, et elle vaut pour ses deux états « Normal » et
 * « Shiny ». Sans elle, une fiche ouverte depuis le Pokédex du joueur cochait
 * « Normal ✓ » d'après HOME juste au-dessus d'un « Pas encore capturé » tiré du
 * serveur : deux vérités dans la même fenêtre. Voir dessinerPreviewEtats().
 */
function pwSeauDeLaFiche(){
  if(typeof ficheSurPixelmonWorld !== 'function' || !ficheSurPixelmonWorld()) return null;
  return pwCollection();
}

async function dessinerSpawnsPW(entry){
  if(!entry || typeof ficheObtention === 'undefined' || !ficheObtention) return;
  if(!pwFicheConcernee()) return;

  try{ await pwChargerReserve(); }
  catch(e){ return; }                          // réserve absente : rien à dire
  if(typeof previewEntry !== 'undefined' && previewEntry !== entry) return;

  const e = pwParEspece.get(entry.name);
  if(!e) return;                               // absent du Pokédex du serveur

  const groupe = document.createElement('div');
  groupe.className = 'obt-groupe obt-releve obt-pw';

  const titre = document.createElement('div');
  titre.className = 'obt-jeu-titre';
  const nom = document.createElement('span');
  nom.textContent = '🌍 PixelmonWorld — où il apparaît';
  titre.appendChild(nom);
  if((e.spawns || []).length){
    const compte = document.createElement('span');
    compte.className = 'obt-compte';
    compte.textContent = String(e.spawns.length);
    titre.appendChild(compte);
  }
  groupe.appendChild(titre);

  // OUVERTE DEPUIS LE POKÉDEX DU JOUEUR, la fiche dit d'abord si on l'a — c'est
  // la question qu'on se posait en cliquant. Le mot est celui de l'aventure.
  if(typeof ficheSurPixelmonWorld === 'function' && ficheSurPixelmonWorld()
     && pwEtat.vue === 'joueur'){
    const mode = pwMode();
    const possede = pwCollection().caught.has(e.espece);
    const etat = document.createElement('div');
    etat.className = 'pw-fiche-etat ' + (possede ? 'obtenu' : 'manquant');
    etat.textContent = possede
      ? '✓ ' + mode.verbe + ' sur le serveur'
      : '✗ Pas encore ' + mode.verbeMin + ' sur le serveur';
    groupe.appendChild(etat);
  }

  // La rareté de l'espèce, telle que le Pokédex du serveur la publie. Elle
  // vaut pour l'espèce entière ; celle des lignes ci-dessous vaut pour un
  // endroit, et les deux peuvent différer.
  if(e.etoiles){
    const bande = document.createElement('div');
    bande.className = 'pw-rarete-espece';
    bande.appendChild(document.createTextNode('Rareté sur le serveur '));
    bande.appendChild(pwEtoiles(e.etoiles, e.rarete));
    if(e.rarete){
      const mot = document.createElement('span');
      mot.className = 'obt-mention';
      mot.textContent = e.rarete;
      bande.appendChild(mot);
    }
    groupe.appendChild(bande);
  }

  if(!(e.spawns || []).length){
    const vide = document.createElement('div');
    vide.className = 'obt-ligne';
    const lieu = document.createElement('div');
    lieu.className = 'obt-lieu';
    lieu.textContent = 'Le Pokédex du serveur ne lui donne aucun endroit. '
      + 'Il s’obtient autrement — le panneau permet de le préciser.';
    vide.appendChild(lieu);
    groupe.appendChild(vide);
  }

  (e.spawns || []).forEach(function(s){
    groupe.appendChild(pwLigneSpawn(s));
  });

  ficheObtention.appendChild(groupe);
}

/**
 * Une apparition, sur une ligne.
 *
 * L'ORDRE DE LECTURE EST CELUI DE LA QUESTION : où (zone, puis sous-zone),
 * à quel point c'est rare (les étoiles), puis à quelles conditions. Les
 * précisions qui ne tiennent pas en pastille finissent en bas de ligne.
 */
function pwLigneSpawn(s){
  const bloc = document.createElement('div');
  bloc.className = 'obt-ligne pw-ligne'
    + (s.zoneGenre === 'hors-carte' ? ' pw-hors-carte' : '');

  const lieu = document.createElement('div');
  lieu.className = 'obt-lieu';
  const zone = document.createElement('strong');
  zone.textContent = s.zone;
  lieu.appendChild(zone);
  if(s.sousZone){
    // Le même séparateur que le relevé des jeux — « Lac Ouragan • Hautes
    // herbes ». Une seule écriture pour « le lieu, puis son détail ».
    lieu.appendChild(document.createTextNode(' • ' + s.sousZone));
  }
  bloc.appendChild(lieu);

  if(s.etoiles){
    const chip = document.createElement('span');
    chip.className = 'obt-cat pw-rarete etoiles-' + s.etoiles;
    chip.appendChild(pwEtoiles(s.etoiles, s.rarete));
    if(s.rarete) chip.appendChild(document.createTextNode(' ' + s.rarete));
    bloc.appendChild(chip);
  } else if(s.rarete){
    const chip = document.createElement('span');
    chip.className = 'obt-cat';
    chip.textContent = s.rarete;
    bloc.appendChild(chip);
  }

  // NI NIVEAUX, NI HEURE, NI MÉTÉO — et ce n'est pas un trou dans les données.
  // Le Pokédex de PixelmonWorld ne publie que l'espèce, sa rareté et ses
  // zones : afficher des champs vides ferait croire à une information perdue
  // là où il n'y a rien à perdre. Le jour où le site en dira plus, le relevé,
  // la table et cette ligne grandiront ensemble.
  return bloc;
}

// ---- Les gestes -------------------------------------------------------------

(function(){
  // CHAQUE ÉLÉMENT EST NOMMÉ EN CLAIR, et non passé à une petite fabrique.
  // outils/verifier.py relit ces branchements pour signaler un bouton muet ;
  // un identifiant caché derrière une variable lui échappe, et il signalait
  // « #pwRaz » et « #pwPlus » comme non branchés alors qu'ils l'étaient.
  const pwRecherche = document.getElementById('pwRecherche');
  const pwTri = document.getElementById('pwTri');
  const pwPlus = document.getElementById('pwPlus');
  const pwRaz = document.getElementById('pwRaz');
  const pwFiltresBascule = document.getElementById('pwFiltresBascule');
  const pwVueServeur = document.getElementById('pwVueServeur');
  const pwVueJoueur = document.getElementById('pwVueJoueur');

  // La frappe filtre à chaque lettre, mais n'écrit l'adresse qu'une fois la
  // main levée : une réécriture par lettre ne sert à rien, et Safari finit par
  // refuser un historique qu'on sollicite cent fois en trente secondes.
  let minuterieAdresse = null;
  if(pwRecherche) pwRecherche.addEventListener('input', function(){
    pwDessiner(true);
    clearTimeout(minuterieAdresse);
    minuterieAdresse = setTimeout(function(){ pwEcrireAdresse('remplacer'); }, 350);
  });
  // Le tri n'est pas un filtre : il ne pousse pas d'étape, il corrige l'adresse.
  if(pwTri) pwTri.addEventListener('change', function(){
    pwDessiner(true);
    pwEcrireAdresse('remplacer');
  });
  if(pwPlus) pwPlus.addEventListener('click', function(){ pwDessiner(false); });
  if(pwRaz) pwRaz.addEventListener('click', pwToutReinitialiser);
  if(pwFiltresBascule) pwFiltresBascule.addEventListener('click', function(){
    pwFiltresOuverts = !pwFiltresOuverts;
    pwMajBascule();
    try{ localStorage.setItem(PW_FILTRES_OUVERTS_CLE, pwFiltresOuverts ? '1' : '0'); }
    catch(e){ /* stockage refusé */ }
  });
  if(pwVueServeur) pwVueServeur.addEventListener('click', function(){ pwChoisirVue('serveur'); });
  if(pwVueJoueur) pwVueJoueur.addEventListener('click', function(){ pwChoisirVue('joueur'); });

  // APRÈS LE CHARGEMENT, ET PAS TOUT DE SUITE. `invoke` est déclaré dans
  // compte.js, qui est chargé APRÈS ce fichier : l'appeler maintenant lèverait
  // une erreur de portée temporelle, et l'onglet ne se montrerait jamais.
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', pwDepart);
  } else {
    pwDepart();
  }
})();

// ---- Les lieux du serveur ---------------------------------------------------
//
// LA MÊME QUESTION QUE LA PAGE LIEUX DES JEUX, ET DONC LA MÊME PAGE. Le Pokédex
// répond à « où trouve-t-on ce Pokémon ? » ; ici on est SUR une zone et l'on
// veut savoir ce qu'on y croise. C'est l'index retourné.
//
// LES PASTILLES SONT CELLES DE lieux.js — puceEspece(), telle quelle. Elle
// attend { entry, sous, taux, niveaux, quand } et rend la pastille qu'on voit
// déjà sur les vingt-trois jeux et sur Cobblemon : même forme, même clic vers
// la fiche, même style. En écrire une seconde aurait donné deux pastilles
// d'espèce à tenir d'accord — la dérive que `menus.js` raconte en toutes
// lettres à la fin de son fichier.
//
// LES ÉTOILES PRENNENT LA PLACE DU TAUX, comme la rareté de Cobblemon le fait
// déjà : PixelmonWorld ne publie pas de pourcentage, et « ★★★ » décide de la
// même chose — rester ici, ou passer son chemin.
//
// AUCUNE COLLECTION N'EST COCHÉE ICI. Marquer « déjà pris » depuis le Pokédex
// national dirait quelque chose de faux — on n'a pas attrapé sur PixelmonWorld
// ce qu'on a attrapé dans Écarlate. Le serveur a maintenant sa propre
// collection (voir PW_COLLECTION), celle que le Pokédex du joueur coche ; cette
// page ne la lit pas encore.

let pwLieuxOuvert = null;           // la zone dépliée

/** « ★★★ » — que les étoiles gagnées, comme partout ailleurs ici. */
function pwChaineEtoiles(n){
  return '★'.repeat(Math.max(0, Math.min(PW_ETOILES_MAX, Number(n) || 0)));
}

function pwLieuxIndex(){
  const zones = [];
  (pwReserve && pwReserve.zones ? pwReserve.zones : []).forEach(function(z){
    // Les apparitions de cette zone, rangées par sous-zone. Celles qui n'en ont
    // pas ouvrent la liste : « quelque part dans la zone » est la réponse la
    // plus large, et c'est par elle qu'on commence.
    const sansSous = [];
    const parSous = new Map();
    (z.sousZones || []).forEach(function(s){ parSous.set(s.id, { sous: s, especes: [] }); });

    pwEntreesConnues.forEach(function(x){
      (x.pw.spawns || []).forEach(function(s){
        if(s.zoneId !== z.id) return;
        if(!x.entry) return;       // sans entrée, puceEspece n'a rien à ouvrir
        // `niveaux` et `quand` restent vides : le site ne les publie pas, et
        // puceEspece() ne dessine que ce qu'on lui donne.
        const puce = {
          entry: x.entry,
          sous: '',
          // Les étoiles à la place du taux : voir l'en-tête de ce bloc.
          taux: s.etoiles ? [{ valeur: pwChaineEtoiles(s.etoiles), version: '' }] : [],
          niveaux: '',
          quand: '',
        };
        const groupe = s.sousZoneId !== null ? parSous.get(s.sousZoneId) : null;
        if(groupe) groupe.especes.push(puce); else sansSous.push(puce);
      });
    });

    const groupes = [];
    parSous.forEach(function(g){ if(g.especes.length) groupes.push(g); });
    const total = sansSous.length
      + groupes.reduce(function(n, g){ return n + g.especes.length; }, 0);
    if(total) zones.push({ zone: z, sansSous: sansSous, groupes: groupes, total: total });
  });
  return zones;
}

function pwBlocZone(bloc){
  const z = bloc.zone;
  const el = document.createElement('div');
  el.className = 'lieu';

  const tete = document.createElement('button');
  tete.type = 'button';
  tete.className = 'lieu-tete';
  tete.setAttribute('aria-expanded', String(pwLieuxOuvert === z.id));

  const titre = document.createElement('span');
  titre.className = 'lieu-titre';
  const nom = document.createElement('span');
  nom.className = 'lieu-nom';
  nom.textContent = z.nom;
  titre.appendChild(nom);
  // « Évolution », « Quête », « Tour de Combat » ne sont pas des endroits où se
  // rendre. L'étiquette le dit, au même endroit que le nom du mod sur la page
  // Lieux — sans elle, on chercherait une évolution sur la carte.
  if(z.genre === 'hors-carte'){
    const marque = document.createElement('span');
    marque.className = 'lieu-mod';
    marque.textContent = 'pas un lieu';
    titre.appendChild(marque);
  }
  tete.appendChild(titre);

  const total = document.createElement('span');
  total.className = 'lieu-total';
  total.textContent = bloc.total + ' espèce' + (bloc.total > 1 ? 's' : '');
  tete.appendChild(total);

  // À la place du « reste à prendre » de la page Lieux : le nombre de
  // sous-zones. C'est ce qui décide si l'on déplie — une zone à quatre
  // sous-zones ne se parcourt pas comme une zone qui n'en a aucune.
  const compteur = document.createElement('span');
  compteur.className = 'lieu-compteur';
  const nb = document.createElement('b');
  nb.className = 'lieu-compteur-nb';
  nb.textContent = bloc.groupes.length ? String(bloc.groupes.length) : '—';
  const mot = document.createElement('span');
  mot.className = 'lieu-compteur-mot';
  mot.textContent = bloc.groupes.length > 1 ? 'sous-zones'
    : (bloc.groupes.length === 1 ? 'sous-zone' : 'sans sous-zone');
  compteur.setAttribute('aria-label', bloc.groupes.length
    ? bloc.groupes.length + ' sous-zone' + (bloc.groupes.length > 1 ? 's' : '')
    : 'aucune sous-zone');
  compteur.appendChild(nb);
  compteur.appendChild(mot);
  tete.appendChild(compteur);
  el.appendChild(tete);

  const corps = document.createElement('div');
  corps.className = 'lieu-corps';
  corps.hidden = pwLieuxOuvert !== z.id;

  bloc.sansSous.forEach(function(x){ corps.appendChild(puceEspece(x, false)); });
  bloc.groupes.forEach(function(g){
    // Le même trait que la page Lieux pose entre « à prendre » et « déjà pris »,
    // ici entre deux sous-zones : c'est ce qui permet à l'œil de trouver la
    // frontière au milieu de trente pastilles.
    const sep = document.createElement('span');
    sep.className = 'lieu-separateur';
    sep.textContent = g.sous.nom;
    corps.appendChild(sep);
    g.especes.forEach(function(x){ corps.appendChild(puceEspece(x, false)); });
  });

  el.appendChild(corps);
  tete.addEventListener('click', function(){
    pwLieuxOuvert = (pwLieuxOuvert === z.id) ? null : z.id;
    pwDessinerLieux();
  });
  return el;
}

function pwDessinerLieux(){
  const liste = pwEl('pwLieuxListe');
  if(!liste) return;
  const q = pwEl('pwLieuxQ') ? sansAccents(pwEl('pwLieuxQ').value.trim()) : '';
  const horsCarte = pwEl('pwLieuxHorsCarte') ? pwEl('pwLieuxHorsCarte').checked : false;

  let blocs = pwLieuxIndex();
  // ÉTEINT PAR DÉFAUT. « Évolution » porte à lui seul trois cent quatre-vingts
  // espèces — de loin la plus grosse entrée — et ce n'est pas un endroit où
  // aller. En tête d'une page qui répond à « où aller », il noierait les zones.
  if(!horsCarte) blocs = blocs.filter(function(b){ return b.zone.genre !== 'hors-carte'; });
  if(q){
    // Le nom de la zone OU celui d'un Pokémon qui s'y trouve : on tape
    // « Dracaufeu » pour savoir où il sort, « Zone 7 » pour voir ce qu'il y a.
    blocs = blocs.filter(function(b){
      if(sansAccents(b.zone.nom).indexOf(q) !== -1) return true;
      let dedans = b.sansSous.slice();
      b.groupes.forEach(function(g){ dedans = dedans.concat(g.especes); });
      return dedans.some(function(x){
        return sansAccents(nomAffiche(x.entry)).indexOf(q) !== -1;
      });
    });
  }

  const resume = pwEl('pwLieuxResume');
  if(resume){
    const especes = blocs.reduce(function(n, b){ return n + b.total; }, 0);
    resume.textContent = blocs.length
      ? blocs.length + ' zone' + (blocs.length > 1 ? 's' : '') + '  ·  '
        + especes + ' apparition' + (especes > 1 ? 's' : '')
      : '';
  }

  liste.innerHTML = '';
  if(!blocs.length){
    liste.innerHTML = '<div class="state-msg">Aucune zone ne correspond.</div>';
    return;
  }
  const fragment = document.createDocumentFragment();
  blocs.forEach(function(b){ fragment.appendChild(pwBlocZone(b)); });
  liste.appendChild(fragment);
}

async function chargerPagePWLieux(){
  const droits = await pwChargerDroits();
  const barre = pwEl('pwLieuxBarre');
  const liste = pwEl('pwLieuxListe');
  if(!droits || !droits.lire){
    if(barre) barre.hidden = true;
    if(liste){
      liste.innerHTML = '<div class="state-msg">Ces lieux sont réservés. '
        + 'Demande l’accès à l’administrateur : il l’ouvre par identifiant '
        + 'Discord.</div>';
    }
    return;
  }
  if(barre) barre.hidden = false;
  try{
    await pwChargerReserve();
  }catch(e){
    if(liste) liste.innerHTML = '<div class="state-msg">Le serveur n’a pas répondu.</div>';
    return;
  }
  pwDessinerLieux();
}

(function(){
  const pwLieuxQ = document.getElementById('pwLieuxQ');
  const pwLieuxHorsCarte = document.getElementById('pwLieuxHorsCarte');

  if(pwLieuxQ) pwLieuxQ.addEventListener('input', pwDessinerLieux);
  if(pwLieuxHorsCarte) pwLieuxHorsCarte.addEventListener('change', pwDessinerLieux);
})();
