// Le Pokédex de PixelmonWorld — où l'on croise quoi, sur le serveur.
//
// Script classique (pas de module ES), chargé APRÈS dex.js (analyserRecherche,
// sansAccents, loadTypes, entryHasType), fiche.js (puceType, openPreview) et
// compte.js (invoke).
//
// ─── CE QUI EST RÉUTILISÉ, ET CE QUI EST NEUF ─────────────────────────────────
//
// Réutilisé tel quel, sans copie :
//   · la recherche — analyserRecherche() de dex.js, mot pour mot. Taper
//     « feu », « gen3 » ou « legendaire » fait ici exactement ce que ça fait
//     dans le Pokédex des jeux, parce que c'est le même analyseur ;
//   · les types — loadTypes()/entryHasType(), qui lisent la réserve embarquée
//     et ne vont donc pas sur le réseau ;
//   · les cartes — les classes .card, .card-sprite, .card-id, .card-name du
//     Pokédex, et la chaîne de repli des sprites de noyau.js ;
//   · la fiche — openPreview(), la vraie. Le bloc des apparitions s'ajoute
//     dans « Où l'obtenir », au même endroit et avec les mêmes classes que
//     celui de Cobblemon ;
//   · les menus — un <select> nu, que menus.js habille tout seul.
//
// Neuf, parce que rien n'en faisait déjà l'affaire :
//   · les étoiles. Le dépôt n'en avait aucune : `rarete.js` parle de la
//     rareté SOCIALE — combien de dresseurs possèdent l'espèce — et Cobblemon
//     affiche ses quatre paliers en toutes lettres. Les cinq paliers de
//     PixelmonWorld sont convertis EN BASE (voir api/src/pixelmonworld.js) ;
//     ici on ne fait que les dessiner ;
//   · les filtres zone et sous-zone, que le Pokédex des jeux n'a pas — ses
//     lieux vivent sur la page Lieux, pas dans sa barre.
//
// ─── LA HIÉRARCHIE ────────────────────────────────────────────────────────────
//
//     Zone  →  Sous-zone  →  Apparition
//
// Une même espèce peut revenir dans plusieurs zones, plusieurs sous-zones, et
// DEUX FOIS DANS LA MÊME ZONE à des conditions différentes. Chaque apparition
// est une ligne indépendante : c'est le cas Minidraco, surface et profondeurs
// du même lac, deux raretés.

const PW_LOT = 60;                 // cartes par lot, comme BATCH_SIZE au Pokédex

let pwDroits = null;               // { lire, admin, gestionAcces }
let pwReserve = null;              // ce que l'API rend : zones + espèces + spawns
let pwParEspece = new Map();       // clé de forme -> { espèce, spawns }
let pwEntreesConnues = [];         // les entrées de l'application, filtrées
let pwFiltrees = [];
let pwDessinees = 0;
let pwEnVol = null;

// ---- Les étoiles ------------------------------------------------------------
//
// CINQ CRANS, TOUJOURS CINQ. Une rareté à trois étoiles s'écrit « ★★★☆☆ » et
// non « ★★★ » : c'est la place vide qui dit qu'il y a plus rare ailleurs, et
// sans elle deux lignes voisines ne se comparent plus d'un coup d'œil.
//
// ZÉRO ÉTOILE N'EST PAS « COMMUN ». Quand la base ne sait pas, elle écrit 0, et
// on ne dessine alors AUCUNE étoile — cinq étoiles creuses annonceraient un
// Pokémon banal, ce qu'on ignore justement.
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
  const creuses = document.createElement('span');
  creuses.className = 'pw-etoiles-creuses';
  creuses.textContent = '☆'.repeat(PW_ETOILES_MAX - combien);
  el.appendChild(pleines);
  el.appendChild(creuses);
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
 * C'est celui que le site de PixelmonWorld écrit dans ses adresses, et celui
 * que porte `entry.name` ici : les deux tombent juste sans traduction. Un nom
 * français aurait demandé une table, et une table aurait dérivé.
 *
 * UNE ESPÈCE QUE L'APPLICATION NE CONNAÎT PAS EST GARDÉE QUAND MÊME, avec ce
 * que le serveur en dit. Elle n'aura ni sprite local ni fiche — c'est mieux
 * que de la faire disparaître d'un Pokédex qui l'annonce.
 */
function pwIndexer(){
  pwParEspece = new Map();
  (pwReserve.especes || []).forEach(function(e){
    pwParEspece.set(e.espece, e);
  });

  const parNom = new Map();
  (typeof allEntries !== 'undefined' ? allEntries : []).forEach(function(en){
    parNom.set(en.name, en);
  });

  pwEntreesConnues = (pwReserve.especes || []).map(function(e){
    const entry = parNom.get(e.espece) || null;
    return {
      pw: e,
      entry: entry,
      // De quoi chercher sans ouvrir la fiche : le nom français du serveur, le
      // nom anglais, et celui que l'application afficherait.
      cherchable: sansAccents([e.nomFr, e.nomEn, e.espece,
        entry ? entry.display : '', entry ? entry.displayEn : ''].join(' ')),
    };
  });
}

// ---- Les filtres ------------------------------------------------------------

function pwEl(id){ return document.getElementById(id); }

/** Les zones, pour le menu. Les non-lieux passent en fin de liste. */
function pwZonesTriees(){
  return (pwReserve && pwReserve.zones ? pwReserve.zones : []).slice();
}

/**
 * Le menu des sous-zones suit la zone choisie.
 *
 * Il se vide et se cache quand la zone n'en a pas : un menu « Toutes les
 * sous-zones » seul en dessous d'« Océan » laisse croire qu'il en existe.
 */
function pwMajSousZones(){
  const zoneEl = pwEl('pwZone');
  const sousEl = pwEl('pwSousZone');
  if(!zoneEl || !sousEl) return;
  const zone = pwZonesTriees().find(function(z){ return String(z.id) === zoneEl.value; });
  const sous = zone ? (zone.sousZones || []) : [];
  const avant = sousEl.value;
  sousEl.innerHTML = '<option value="all">Toutes les sous-zones</option>';
  sous.forEach(function(s){
    const o = document.createElement('option');
    o.value = String(s.id);
    o.textContent = s.nom + ' (' + s.spawns + ')';
    sousEl.appendChild(o);
  });
  sousEl.value = sous.some(function(s){ return String(s.id) === avant; }) ? avant : 'all';
  // Le conteneur, et non le <select> : menus.js l'habille d'un bouton, et
  // cacher le seul <select> laisserait le bouton tout seul à l'écran.
  const enveloppe = sousEl.closest('.select-wrap') || sousEl;
  enveloppe.hidden = sous.length === 0;
  // menus.js habille le <select> et affiche SON libellé : reconstruire les
  // options ne le prévient pas, et le bouton garderait le nom d'une sous-zone
  // qui n'est plus dans la liste.
  if(typeof syncSelects === 'function') syncSelects();
}

/**
 * Les apparitions d'une espèce qui passent le filtre de lieu.
 *
 * Rendues plutôt que comptées : la carte affiche la rareté de CE QU'ON
 * CHERCHE. Filtrer sur « Zone 4 » et montrer la rareté d'une apparition de
 * Zone 9 serait la bonne espèce avec le mauvais chiffre.
 */
function pwSpawnsRetenus(e){
  const zone = pwEl('pwZone') ? pwEl('pwZone').value : 'all';
  const sous = pwEl('pwSousZone') ? pwEl('pwSousZone').value : 'all';
  let liste = e.spawns || [];
  if(zone !== 'all') liste = liste.filter(function(s){ return String(s.zoneId) === zone; });
  if(sous !== 'all') liste = liste.filter(function(s){ return String(s.sousZoneId) === sous; });
  return liste;
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

function pwFiltrer(){
  const brut = pwEl('pwRecherche') ? pwEl('pwRecherche').value.trim() : '';
  const requete = typeof analyserRecherche === 'function'
    ? analyserRecherche(brut) : { numero: null, typeId: null, gen: null, etats: [], categories: [], mots: [] };
  if(requete.typeId !== null && typeof assurerTypes === 'function') assurerTypes();

  const zone = pwEl('pwZone') ? pwEl('pwZone').value : 'all';
  const sous = pwEl('pwSousZone') ? pwEl('pwSousZone').value : 'all';
  const etoilesVoulues = pwEl('pwRarete') ? pwEl('pwRarete').value : 'all';

  const sortie = pwEntreesConnues.filter(function(x){
    const e = x.pw;

    if(zone !== 'all' || sous !== 'all'){
      if(!pwSpawnsRetenus(e).length) return false;
    }
    if(etoilesVoulues !== 'all' && String(pwEtoilesRetenues(e)) !== etoilesVoulues) return false;

    // LE NUMÉRO EST CELUI DU POKÉDEX NATIONAL, comme sur le site du serveur.
    if(requete.numero !== null && e.numero !== requete.numero) return false;
    if(requete.gen !== null && e.generation !== requete.gen) return false;

    // Le type passe par la table de l'application : le serveur donne les
    // siens, mais en anglais et sans les formes — celle de la réserve connaît
    // « exeggutor-alola » et ses deux types.
    if(requete.typeId !== null){
      if(!x.entry) return false;
      if(typeof entryHasType === 'function' && !entryHasType(x.entry, requete.typeId)) return false;
    }

    // Les états (« manquants », « shiny ») et les mots-clés (« legendaire »)
    // valent ici comme au Pokédex : ce sont les mêmes tests, sur la même
    // collection. Sans entrée connue, on ne peut rien en dire — on laisse
    // passer plutôt que d'exclure sur une ignorance.
    if(x.entry){
      if(requete.etats.length && !requete.etats.some(function(t){ return t(x.entry); })) return false;
      if(requete.categories.length
         && !requete.categories.some(function(t){ return t(x.entry); })) return false;
    }

    if(requete.mots.length){
      for(let i = 0; i < requete.mots.length; i++){
        if(x.cherchable.indexOf(requete.mots[i]) === -1) return false;
      }
    }
    return true;
  });

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
    img.src = 'https://www.pixelmonworld.fr/images/pokedex/still/' + (x.pw.sprite || '');
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

function pwDessiner(remiseAZero){
  const grille = pwEl('pwGrille');
  if(!grille) return;
  if(remiseAZero){
    pwFiltrees = pwFiltrer();
    pwDessinees = 0;
    grille.innerHTML = '';
    pwMajJetons();
  }

  const resume = pwEl('pwResume');
  if(resume){
    const spawns = pwFiltrees.reduce(function(n, x){ return n + pwSpawnsRetenus(x.pw).length; }, 0);
    resume.textContent = pwFiltrees.length
      ? pwFiltrees.length + ' Pokémon · ' + spawns + ' apparition'
        + (spawns > 1 ? 's' : '')
      : '';
  }

  if(!pwFiltrees.length){
    grille.innerHTML = '<div class="state-msg">Aucun Pokémon ne correspond '
      + 'à cette recherche.</div>';
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

// ---- La page ----------------------------------------------------------------

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

function pwRemplirMenus(){
  const zoneEl = pwEl('pwZone');
  if(zoneEl && !zoneEl.dataset.rempli){
    zoneEl.innerHTML = '<option value="all">Toutes les zones</option>';
    pwZonesTriees().forEach(function(z){
      const o = document.createElement('option');
      o.value = String(z.id);
      // Le genre se dit, parce qu'il change le sens de la réponse : « Quête »
      // n'est pas un endroit où se rendre.
      o.textContent = z.nom + (z.genre === 'hors-carte' ? ' (hors carte)' : '')
        + ' (' + z.spawns + ')';
      zoneEl.appendChild(o);
    });
    zoneEl.dataset.rempli = '1';
  }

  const typeEl = pwEl('pwType');
  if(typeEl && !typeEl.dataset.rempli && typeof TYPES_FR !== 'undefined'){
    Object.keys(TYPES_FR).forEach(function(id){
      const o = document.createElement('option');
      o.value = id;
      o.textContent = TYPES_FR[id];
      typeEl.appendChild(o);
    });
    typeEl.dataset.rempli = '1';
  }

  const rareteEl = pwEl('pwRarete');
  if(rareteEl && !rareteEl.dataset.rempli && pwReserve){
    // BÂTI SUR LA TABLE DE L'API, jamais écrit à la main : le jour où le
    // serveur ajoute un palier, il apparaît ici sans qu'on y touche.
    (pwReserve.raretes || []).slice().reverse().forEach(function(r){
      const o = document.createElement('option');
      o.value = String(r.etoiles);
      o.textContent = '★'.repeat(r.etoiles) + '☆'.repeat(5 - r.etoiles) + '  ' + r.libelle;
      rareteEl.appendChild(o);
    });
    rareteEl.dataset.rempli = '1';
  }

  pwMajSousZones();
}

/** Ce que voit quelqu'un qui n'a pas le droit — et il n'y a rien à voir. */
function pwMontrerRefus(message){
  const grille = pwEl('pwGrille');
  const barre = pwEl('pwBarre');
  if(barre) barre.hidden = true;
  if(grille){
    grille.innerHTML = '<div class="state-msg">' + escapeHtml(message) + '</div>';
  }
  const resume = pwEl('pwResume'); if(resume) resume.textContent = '';
}

async function chargerPagePW(){
  const droits = await pwChargerDroits();
  if(!droits || !droits.lire){
    pwMontrerRefus('Ce Pokédex est réservé. Demande l’accès à l’administrateur : '
      + 'il l’ouvre par identifiant Discord.');
    pwMajOngletAdmin();
    return;
  }
  const barre = pwEl('pwBarre');
  if(barre) barre.hidden = false;

  try{
    await pwChargerReserve();
  }catch(e){
    pwMontrerRefus('Le Pokédex du serveur n’a pas répondu. Réessaie dans un moment.');
    return;
  }

  // Les types viennent de la réserve embarquée (cacheLire y retombe) : aucun
  // aller-retour réseau, et le filtre marche hors ligne.
  if(typeof loadTypes === 'function') loadTypes().catch(function(){ /* sans filtre de type */ });

  pwRemplirMenus();
  pwRemplirAutocompletion();
  pwMajOngletAdmin();
  pwDessiner(true);
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
  const pwType = document.getElementById('pwType');
  const pwRarete = document.getElementById('pwRarete');
  const pwZone = document.getElementById('pwZone');
  const pwSousZone = document.getElementById('pwSousZone');
  const pwPlus = document.getElementById('pwPlus');
  const pwRaz = document.getElementById('pwRaz');

  if(pwRecherche) pwRecherche.addEventListener('input', function(){ pwDessiner(true); });
  if(pwTri) pwTri.addEventListener('change', function(){ pwDessiner(true); });
  if(pwType) pwType.addEventListener('change', function(){ pwDessiner(true); });
  if(pwRarete) pwRarete.addEventListener('change', function(){ pwDessiner(true); });
  if(pwZone) pwZone.addEventListener('change', function(){ pwMajSousZones(); pwDessiner(true); });
  if(pwSousZone) pwSousZone.addEventListener('change', function(){ pwDessiner(true); });
  if(pwPlus) pwPlus.addEventListener('click', function(){ pwDessiner(false); });
  if(pwRaz) pwRaz.addEventListener('click', function(){
    ['pwRecherche'].forEach(function(id){ const el = pwEl(id); if(el) el.value = ''; });
    ['pwType', 'pwRarete', 'pwZone', 'pwSousZone'].forEach(function(id){
      const el = pwEl(id);
      if(el) el.value = 'all';
    });
    // Une valeur changée par le code ne lève pas « change » : sans ce rappel,
    // les boutons de menus.js garderaient l'ancien libellé.
    if(typeof syncSelects === 'function') syncSelects();
    pwMajSousZones();
    pwDessiner(true);
  });

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
// déjà : PixelmonWorld ne publie pas de pourcentage, et « ★★★☆☆ » décide de la
// même chose — rester ici, ou passer son chemin.
//
// AUCUNE COLLECTION N'EST COCHÉE ICI, et c'est voulu. Les collections de
// PokéPension sont celles des jeux ; ce serveur n'en est pas un, et marquer
// « déjà pris » depuis le Pokédex national dirait quelque chose de faux — on
// n'a pas attrapé sur PixelmonWorld ce qu'on a attrapé dans Écarlate.

let pwLieuxOuvert = null;           // la zone dépliée

/** « ★★★☆☆ » — la même échelle à cinq crans que partout ailleurs ici. */
function pwChaineEtoiles(n){
  const combien = Math.max(0, Math.min(PW_ETOILES_MAX, Number(n) || 0));
  return '★'.repeat(combien) + '☆'.repeat(PW_ETOILES_MAX - combien);
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
