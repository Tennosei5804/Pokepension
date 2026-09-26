// Compteurs, filtres, types, actions groupees, rendu d une carte.
// Script classique (pas de module ES) : l'app reste ouvrable en file://

function updateProgress(){
  // Les compteurs de la page Dex parlent du scope affiché : sur l'onglet
  // Épée/Bouclier, « 12 / 664 » veut dire 12 sur les 664 de ce jeu.
  const total = scopeEntries.length;
  let caught = 0, shiny = 0;
  scopeEntries.forEach(function(entry){
    if(caughtSet.has(entry.name)) caught++;
    if(shinySet.has(entry.name)) shiny++;
  });
  const shinyTotal = total;
  // La jauge suit le mode actif, sur le périmètre affiché.
  const done = shinyView ? shiny : caught;
  const base = shinyView ? shinyTotal : total;
  const pct = base ? Math.round((done / base) * 100) : 0;
  const offset = GAUGE_CIRCUMFERENCE * (1 - pct / 100);
  gaugeFill.style.strokeDashoffset = String(offset);
  gaugeValue.textContent = pct + '%';
  caughtCountEl.textContent = String(caught);
  shinyCountEl.textContent = String(shiny);
  totalCountEl.textContent = String(total);
  totalCountShinyEl.textContent = String(shinyTotal);
  statLineNormal.classList.toggle('active', !shinyView);
  statLineShiny.classList.toggle('active', shinyView);
  // L'accueil n'est recalculé que s'il est visible : inutile de reconstruire
  // ses barres à chaque case cochée dans le Dex.
  if(currentPage === 'home') updateHome();
  // La barre de comparaison compte sur le périmètre et la forme affichés :
  // basculer en vue shiny, changer de Pokédex ou cocher une case la laissait
  // sur ses anciens chiffres, à côté d'une grille qui, elle, avait suivi.
  // (partage.js est chargé après ce fichier ; l'appel, lui, est tardif.)
  if(typeof majBarreComparaison === 'function') majBarreComparaison();
  // Le Pokédex du joueur de PixelmonWorld lit la collection de l'aventure : en
  // ouvrir une autre depuis le menu du compte doit le repeindre, pas seulement
  // la grille des jeux. (pixelmonworld.js, chargé après ; appel tardif.)
  if(currentPage === 'pixelmonworld' && typeof pwRafraichir === 'function') pwRafraichir();
}

// ---- Loads French species names in bulk from PokeAPI's open dataset
// (one CSV fetch instead of one request per Pokémon).
// Le meme CSV porte toutes les langues : on en tire le francais et l'anglais
// d'un seul passage, pour que le bouton de langue n'ait rien a telecharger.
async function loadFrenchNames(){
  const namesById = {};
  const namesEnById = {};
  try{
    const speciesListRes = await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=1500');
    const speciesListData = await speciesListRes.json();
    const slugToId = {};
    speciesListData.results.forEach(function(s){
      slugToId[s.name] = extractId(s.url);
    });

    const csvRes = await fetch('https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv');
    const csvText = await csvRes.text();
    const lines = csvText.split('\n');
    // header: pokemon_species_id,local_language_id,name,genus
    for(let i=1;i<lines.length;i++){
      const line = lines[i];
      if(!line) continue;
      const cells = line.split(',');
      if(cells.length < 3) continue;
      const speciesId = parseInt(cells[0], 10);
      const langId = cells[1];
      if(langId === '5') namesById[speciesId] = cells[2];        // francais
      else if(langId === '9') namesEnById[speciesId] = cells[2]; // anglais
    }
    return { namesById: namesById, namesEnById: namesEnById, slugToId: slugToId };
  }catch(e){
    console.error('Noms indisponibles, repli sur les identifiants PokeAPI.', e);
    return { namesById: {}, namesEnById: {}, slugToId: {} };
  }
}

// La liste complète des entrées, noms français résolus. Elle vit ici, à côté
// de la résolution des noms, et non dans le démarrage : le script qui fabrique
// les données embarquées (outils/generer-donnees.html) appelle exactement la
// même fonction que l'application. Deux versions du même calcul finiraient par
// diverger, et l'écart ne se verrait qu'à l'usage.
async function construireEntrees(){
  const [listRes, frData] = await Promise.all([
    fetch('https://pokeapi.co/api/v2/pokemon?limit=2000'),
    loadFrenchNames()
  ]);
  if(!listRes.ok) throw new Error('Réponse réseau invalide');
  const listData = await listRes.json();

  return listData.results.map(function(p){
    const id = extractId(p.url);
    const fr = resolveFrenchDisplay(p.name, frData.slugToId, frData.namesById);
    // Les suffixes de forme ne sont pas traduits cote anglais : titleCase suffit,
    // « decidueye-hisui » donnant « Decidueye (Hisui) ».
    const en = resolveFrenchDisplay(p.name, frData.slugToId, frData.namesEnById, null);
    const speciesId = fr.speciesId || id;
    return {
      id: id,
      speciesId: speciesId,
      name: p.name,
      display: fr.display,
      displayEn: en.display,
      gen: getGeneration(speciesId)
    };
  }).filter(function(e){ return !isNaN(e.id); });
}

// « suffixes » vaut SUFFIX_FR par defaut. Passer null demande des suffixes non
// traduits — c'est ce qu'on veut du cote anglais, ou « hisui » doit rester
// « Hisui » et non devenir « de Hisui ».
function resolveFrenchDisplay(entryName, slugToId, namesById, suffixes){
  const table = suffixes === undefined ? SUFFIX_FR : (suffixes || {});
  const parts = entryName.split('-');
  let speciesSlug = null;
  let suffixParts = [];
  for(let k = parts.length; k >= 1; k--){
    const candidate = parts.slice(0, k).join('-');
    if(Object.prototype.hasOwnProperty.call(slugToId, candidate)){
      speciesSlug = candidate;
      suffixParts = parts.slice(k);
      break;
    }
  }
  if(!speciesSlug){
    return { display: titleCase(parts.join(' ')), speciesId: null };
  }
  const speciesId = slugToId[speciesSlug];
  const baseName = namesById[speciesId] || titleCase(speciesSlug);
  if(suffixParts.length === 0){
    return { display: baseName, speciesId: speciesId };
  }
  const translatedSuffix = suffixParts
    .map(function(w){ return Object.prototype.hasOwnProperty.call(table, w) ? table[w] : titleCase(w); })
    .filter(Boolean)
    .join(' ');
  return { display: baseName + (translatedSuffix ? ' (' + translatedSuffix + ')' : ''), speciesId: speciesId };
}

// ---- Types --------------------------------------------------------------
// Un seul CSV pour les 1351 entrées, chargé à la première utilisation du
// filtre : inutile de ralentir le démarrage pour une option facultative.
let typesByPokemonId = null;

async function loadTypes(){
  if(typesByPokemonId) return typesByPokemonId;

  const enCache = cacheLire('types');
  if(enCache){
    typesByPokemonId = new Map(enCache);
    return typesByPokemonId;
  }

  const rows = await fetchCsvRows('pokemon_types.csv');
  const map = new Map();
  rows.forEach(function(r){
    const pid = parseInt(r[0], 10), tid = parseInt(r[1], 10);
    if(!map.has(pid)) map.set(pid, []);
    map.get(pid).push(tid);
  });
  typesByPokemonId = map;
  cacheEcrire('types', Array.from(map.entries()));
  return map;
}

function entryHasType(entry, typeId){
  if(!typesByPokemonId) return true;   // pas encore chargé : on ne filtre pas
  const list = typesByPokemonId.get(entry.id);
  return !!list && list.indexOf(typeId) !== -1;
}

Object.keys(TYPES_FR).forEach(function(id){
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = TYPES_FR[id];
  typeFilterEl.appendChild(opt);
});

typeFilterEl.addEventListener('change', async function(){
  if(typeFilterEl.value !== 'all' && !typesByPokemonId){
    typeFilterEl.disabled = true;
    try{
      await loadTypes();
    }catch(e){
      console.error('Types indisponibles :', e);
      prevenirErreur('Types indisponibles',
        'Ils n\'ont pas pu être téléchargés. Vérifie ta connexion : le filtre '
        + 'par type revient à « Tous » en attendant.');
      typeFilterEl.value = 'all';
    }
    typeFilterEl.disabled = false;
  }
  markActiveFilters();
  renderList(true);
  listEl.scrollTop = 0;
});

// ---- Actions groupées ---------------------------------------------------
// Elles agissent sur la liste filtrée entière, pas seulement sur les cartes
// déjà affichées : c'est tout l'intérêt quand on enregistre une sauvegarde
// existante de plusieurs centaines de Pokémon.
function bulkTargets(){
  const target = activeSet();
  const eligible = currentFiltered.slice();
  return {
    eligible: eligible,
    toCheck: eligible.filter(function(e){ return !target.has(e.name); }),
    toUncheck: eligible.filter(function(e){ return target.has(e.name); })
  };
}

// Le Pokédex actuellement affiché, en toutes lettres.
function currentDexLabel(){
  const game = gameByKey[currentTab];
  return game
    ? game.title + ' — ' + (activeVariant() ? activeVariant().label : 'Pokédex régional')
    : 'Pokémon HOME';
}

/**
 * Le même libellé, plus la boîte affichée — et RIEN D'AUTRE ne doit s'en servir.
 *
 * En vue boîtes, les actions groupées ne portent que sur les trente cases à
 * l'écran : « Tout coché » sur un Pokédex entier et sur une boîte ne sont pas
 * du tout le même geste, et la barre doit le dire.
 *
 * Les autres écrans, eux, parlent du Pokédex entier. La fenêtre d'entraide
 * annonçait « Sur Pokémon HOME — boîte 1 » alors que ses deux listes couvrent
 * tout le périmètre : le libellé mentait sur ce qu'il montrait, parce qu'il
 * portait une précision qui n'appartenait qu'à un seul appelant.
 */
function porteeGroupee(){
  const base = currentDexLabel();
  if(typeof vueBoites !== 'undefined' && vueBoites){
    return base + ' — boîte ' + (boiteCourante + 1);
  }
  return base;
}

function updateBulkBar(){
  if(!playerName){ bulkBar.style.display = 'none'; return; }
  bulkBar.style.display = '';
  const t = bulkTargets();
  const forme = shinyView ? 'shiny' : 'normale';
  bulkLabel.innerHTML = '<b>' + t.eligible.length + '</b> Pokémon · forme ' + forme
    + ' · <b>' + t.toCheck.length + '</b> à cocher, <b>' + t.toUncheck.length + '</b> cochés';
  bulkLabel.title = 'Portée : ' + porteeGroupee();
  bulkCheckBtn.disabled = t.toCheck.length === 0;
  bulkUncheckBtn.disabled = t.toUncheck.length === 0;
}

async function applyBulk(add){
  if(!exigeCompte('cocher des captures')) return;
  const t = bulkTargets();
  const list = add ? t.toCheck : t.toUncheck;
  if(!list.length) return;
  const forme = shinyView ? 'chromatique' : 'normale';
  const verbe = add ? 'Cocher' : 'Décocher';
  // On nomme le Pokédex concerné : l'action ne touche que lui, jamais les
  // autres onglets, et il vaut mieux le dire avant de cocher 400 cases.
  if(list.length > 20){
    const ok = await demanderConfirmation({
      eyebrow: 'Action groupée',
      titre: verbe + ' ' + list.length + ' Pokémon en forme ' + forme + ' ?',
      // Décocher retire ce qu'on avait ; cocher n'ôte rien à personne.
      danger: !add,
      resume: [
        { cle: 'Pokémon', valeur: list.length },
        { cle: 'forme ' + forme, valeur: shinyView ? '✨' : '⬤' }
      ],
      pertes: null,
      note: 'Portée : ' + porteeGroupee() + '. Seule la sélection filtrée de ce '
        + 'Pokédex est touchée — les autres onglets ne bougent pas.',
      libelleAction: verbe + ' les ' + list.length
    });
    if(!ok) return;
  }
  const target = activeSet();
  list.forEach(function(e){ if(add) target.add(e.name); else target.delete(e.name); });
  updateProgress();
  renderList(true);
  queueSave();
}

bulkCheckBtn.addEventListener('click', function(){ applyBulk(true); });
bulkUncheckBtn.addEventListener('click', function(){ applyBulk(false); });

// ---- L'obtention, d'après le relevé Pokékalos ----------------------------
// La réserve des lieux pèse 355 Ko : elle ne se charge pas au démarrage, mais à
// la première grille d'un jeu — c'est là, et seulement là, que la question
// « capturable ici ? » a un sens. Le Pokédex HOME n'est pas un jeu.
let lieuxDuJeu = null;        // speciesId -> { categorie, mentions }
let lieuxDuJeuCle = null;     // pour quel onglet cette table a été construite
let lieuxDemandes = false;

function majLieuxDuJeu(){
  lieuxDuJeu = null;
  lieuxDuJeuCle = currentTab;
  if(typeof DONNEES_LIEUX === 'undefined') return;
  const table = DONNEES_LIEUX.jeux[currentTab];
  if(!table) return;
  lieuxDuJeu = new Map();
  Object.keys(table).forEach(function(id){
    const ligne = table[id];
    lieuxDuJeu.set(parseInt(id, 10), {
      categorie: DONNEES_LIEUX.categories[ligne[1]],
      mentions: (ligne[2] || []).map(function(i){ return DONNEES_LIEUX.mentions[i]; })
    });
  });
}

// Une même obtention se dit de deux façons : par la catégorie, tirée du texte
// du Pokédex, et par une mention, venue d'une page dédiée. Les huit Pokémon
// échangeables de Diamant/Perle sont catégorisés « sauvage » — ils se croisent
// aussi dans l'herbe — et ne portent l'échange qu'en mention. Filtrer sur la
// seule catégorie ne rendait donc rien du tout.
const MENTIONS_DE_LA_CATEGORIE = {
  sauvage: ['fixe', 'troupeau', 'rare', 'raid', 'apparition', 'poke-radar',
            'distorsion', 'peche', 'surf', 'meteo', 'jour', 'nuit', 'saison'],
  offert: ['offert'],
  echange: ['echange'],
  evolution: ['evolution'],
  oeuf: ['oeuf'],
  indisponible: ['introuvable']
};

// Ce que le relevé dit de cette entrée dans le jeu ouvert, ou null.
//
// Une espèce sans ligne ne se capture pas — mais seulement là où le Pokédex du
// jeu a été relevé, puisqu'il les liste toutes. Ailleurs — HeartGold, Noire 2,
// Ultra-Soleil, dont seules les pages annexes existent — l'absence de ligne
// n'est qu'une absence de source, et la donner pour une absence du jeu serait
// inventer. D'où « pokedexReleve », que la réserve porte pour le dire.
function obtentionDe(entry){
  if(lieuxDuJeuCle !== currentTab) majLieuxDuJeu();
  if(!lieuxDuJeu) return null;
  // La forme d'abord, l'espèce à défaut : le relevé donne sa propre clef à
  // Rattata d'Alola, qui n'a pas la même disponibilité que celui de Kanto.
  const connue = lieuxDuJeu.get(entry.id) || lieuxDuJeu.get(entry.speciesId);
  if(connue) return connue;
  const releve = (typeof DONNEES_LIEUX !== 'undefined' && DONNEES_LIEUX.pokedexReleve) || [];
  if(releve.indexOf(currentTab) === -1) return null;
  return SANS_LIGNE;
}

// Une seule et même valeur pour toutes : elle ne porte rien de particulier, et
// se reconnaît à l'identité dans le dessin de la carte.
const SANS_LIGNE = { categorie: 'indisponible', mentions: [], sansLigne: true };

// Le filtre demande la réserve si elle n'est pas là, puis redessine une fois.
// Sans ce détour, choisir « Capturable » ne montrerait rien du tout et l'on
// croirait le relevé vide.
function assurerLieux(){
  if(typeof DONNEES_LIEUX !== 'undefined' || lieuxDemandes) return;
  if(typeof chargerLieux !== 'function') return;
  lieuxDemandes = true;
  chargerLieux().then(function(){
    majLieuxDuJeu();
    renderList(true);
  }).catch(function(){ lieuxDemandes = false; });
}

// ---- La recherche à jetons --------------------------------------------------
//
// Le champ ne cherchait qu'un nom, et quatre menus portaient tout le reste.
// Quelqu'un qui connaît ses Pokémon tape plus vite qu'il ne déroule un menu.
//
// AUCUNE GRAMMAIRE N'EST INVENTÉE. On reconnaît les jetons connus — un numéro,
// un type, une génération, un état, un mot-clé — et TOUT LE RESTE redevient un
// morceau de nom. Un mot inconnu ne fait donc jamais disparaître la grille
// pour une raison qu'on ne comprend pas : il cherche, exactement comme avant.
//
// Les menus ne bougent pas : ils restent là pour qui préfère cliquer, et se
// cumulent avec les jetons. Un jeton n'écrit jamais dans un menu — voir un
// menu changer tout seul parce qu'on a tapé un mot serait déroutant.

function sansAccents(s){
  // Les signes diacritiques combinants, U+0300 a U+036F. La classe est
  // construite depuis une chaine plutot qu'ecrite en clair : ces caracteres
  // sont invisibles dans un fichier, et un editeur les avale.
  return String(s).toLowerCase().normalize('NFD')
    .replace(new RegExp('[\u0300-\u036f]', 'g'), '');
}

// Type français → identifiant PokeAPI. Construite depuis TYPES_FR, jamais
// recopiée : ajouter un type au tableau suffirait.
const TYPES_PAR_NOM = (function(){
  const m = {};
  Object.keys(TYPES_FR).forEach(function(id){ m[sansAccents(TYPES_FR[id])] = parseInt(id, 10); });
  // Deux orthographes qu'on tape sans y penser.
  m['electrique'] = m['electrik'];
  m['tenebre'] = m['tenebres'];
  return m;
})();

// Les régions ne servent QUE pour les six premières générations. À partir
// d'Alola, le nom de région est aussi celui d'une forme régionale, et « alola »
// veut alors dire « les formes d'Alola » et non « la septième génération » —
// c'est ce que quelqu'un qui tape ce mot dans un Pokédex cherche.
const REGIONS_GEN = {
  kanto: 1, johto: 2, hoenn: 3, sinnoh: 4, unys: 5, unova: 5, kalos: 6
};

// Les lignées de départ, par plages : chacune fait neuf numéros d'affilée.
const PLAGES_STARTERS = [[1, 9], [152, 160], [252, 260], [387, 395], [495, 503],
                         [650, 658], [722, 730], [810, 818], [906, 914]];

// Les fossiles, relevés à la main : ils n'ont aucun marqueur dans la réserve,
// et la liste ne bouge qu'à la sortie d'une génération.
const FOSSILES = new Set([138, 139, 140, 141, 142, 345, 346, 347, 348,
                          408, 409, 410, 411, 564, 565, 566, 567,
                          696, 697, 698, 699, 880, 881, 882, 883]);

// Un mot-clé : son libellé pour la ligne des jetons, et le test qu'il pose.
const MOTS_CLES_RECHERCHE = {
  legendaire: { libelle: '👑 Légendaires',
    test: function(e){ return typeof LEGENDAIRES !== 'undefined' && LEGENDAIRES.has(e.speciesId); } },
  fabuleux: { libelle: '✴ Fabuleux',
    test: function(e){ return typeof FABULEUX !== 'undefined' && FABULEUX.has(e.speciesId); } },
  mythique: { alias: 'fabuleux' },
  starter: { libelle: '🌱 Lignées de départ',
    test: function(e){
      return PLAGES_STARTERS.some(function(p){ return e.speciesId >= p[0] && e.speciesId <= p[1]; });
    } },
  fossile: { libelle: '🦴 Fossiles',
    test: function(e){ return FOSSILES.has(e.speciesId); } },
  mega: { libelle: '💠 Méga-Évolutions',
    test: function(e){ return e.name.indexOf('-mega') !== -1; } },
  gigamax: { libelle: '🔺 Gigamax',
    test: function(e){ return e.name.slice(-5) === '-gmax'; } },
  gmax: { alias: 'gigamax' },
  alola: { libelle: '🌴 Formes d\'Alola',
    test: function(e){ return e.name.slice(-6) === '-alola'; } },
  galar: { libelle: '🏰 Formes de Galar',
    test: function(e){ return e.name.slice(-6) === '-galar'; } },
  hisui: { libelle: '🏔 Formes de Hisui',
    test: function(e){ return e.name.slice(-6) === '-hisui'; } },
  paldea: { libelle: '🍊 Formes de Paldea',
    test: function(e){ return e.name.indexOf('-paldea') !== -1; } },
  rare: { libelle: '💎 Mes pièces rares',
    test: function(e){
      // CE QUE TU AS, et que peu d'autres ont. Sans la première condition, le
      // jeton retiendrait aussi tout ce que personne ne possède — c'est-à-dire
      // presque tout le Pokédex, ce qui ne se regarde pas.
      //
      // Sans la table — hors ligne, ou trop peu de collections publiques — il
      // ne retient rien plutôt que de tout retenir : un filtre qui ne filtre
      // pas ment sur ce qu'il montre.
      if(typeof rangRarete !== 'function') return false;
      if(typeof rareteTable === 'undefined' || !rareteTable || !rareteTable.dresseurs) return false;
      if(!activeSet().has(e.name)) return false;
      return rangRarete(e) < 0.20;
    } },
  // Il avait disparu avec l'ancienne table des verrous ; il revient sur la
  // nouvelle. Le sens SUIT LE POKÉDEX OUVERT — voir verrouillePour() dans
  // donnees-verrous.js, qui porte la raison de cette distinction.
  verrouille: { libelle: '🔒 Shiny-lockés',
    test: function(e){
      if(typeof verrouillePour !== 'function') return false;
      const dansUnJeu = typeof gameByKey !== 'undefined'
        && typeof currentTab !== 'undefined' && gameByKey[currentTab];
      return verrouillePour(e.speciesId, dansUnJeu ? currentTab : null);
    } },
  'shiny-lock': { alias: 'verrouille' },
};

// Les états. Ils parlent de la collection ouverte, comme le menu « Filtrer ».
const ETATS_RECHERCHE = {
  manquant:    { libelle: '☐ Manquants',    test: function(e){ return !activeSet().has(e.name); } },
  manquants:   { alias: 'manquant' },
  restant:     { alias: 'manquant' },
  restants:    { alias: 'manquant' },
  capture:     { libelle: '☑ Dans la collection', test: function(e){ return activeSet().has(e.name); } },
  captures:    { alias: 'capture' },
  coche:       { alias: 'capture' },
  coches:      { alias: 'capture' },
  vu:          { alias: 'capture' },
  vus:         { alias: 'capture' },
  shiny:       { libelle: '✨ Chromatiques obtenus', test: function(e){ return shinySet.has(e.name); } },
  chromatique: { alias: 'shiny' },
  chromatiques:{ alias: 'shiny' },
  brillant:    { alias: 'shiny' },
  brillants:   { alias: 'shiny' }
};

function suivreAlias(table, cle){
  let x = table[cle];
  let garde = 0;
  while(x && x.alias && garde++ < 4) x = table[x.alias];
  return x && x.test ? x : null;
}

// Ce que la dernière analyse a reconnu, pour la ligne des jetons.
let jetonsCompris = [];
let rechercheVeutTypes = false;

/**
 * Découpe la saisie en une requête.
 *
 * Rend { numero, typeId, gen, tests, mots } : les tests sont des prédicats sur
 * une entrée, et « mots » ce qui n'a rien de particulier et cherche un nom.
 */
function analyserRecherche(brut){
  // DEUX PANIERS, PAS UN SEUL. Ils étaient mélangés dans `tests`, et il fallait
  // alors que TOUT passe : demander « fossile » et « légendaire » ne rendait
  // rien, puisque aucun Pokémon n'est les deux. Les séparer permet de croiser
  // les paniers sans croiser leur contenu — voir getFiltered().
  const q = { numero: null, typeId: null, gen: null,
              etats: [], categories: [], mots: [] };
  jetonsCompris = [];
  const morceaux = String(brut || '').trim().split(/\s+/).filter(Boolean);

  morceaux.forEach(function(morceau){
    const nu = sansAccents(morceau.replace(/^#/, ''));

    // Un numéro : celui du Pokédex national, ou celui du jeu ouvert.
    if(/^\d+$/.test(nu)){
      q.numero = parseInt(nu, 10);
      jetonsCompris.push('N° ' + q.numero);
      return;
    }

    // Une génération : « gen3 », « gen 3 » (deux morceaux) ou une région.
    const gen = /^g(?:en)?(\d)$/.exec(nu);
    if(gen && gen[1] >= '1' && gen[1] <= '9'){
      q.gen = parseInt(gen[1], 10);
      jetonsCompris.push('Gén. ' + q.gen);
      return;
    }
    if(Object.prototype.hasOwnProperty.call(REGIONS_GEN, nu)){
      q.gen = REGIONS_GEN[nu];
      jetonsCompris.push('Gén. ' + q.gen + ' — ' + morceau);
      return;
    }

    // Un type.
    if(Object.prototype.hasOwnProperty.call(TYPES_PAR_NOM, nu)){
      q.typeId = TYPES_PAR_NOM[nu];
      jetonsCompris.push('Type ' + TYPES_FR[q.typeId]);
      return;
    }

    // Un état de la collection.
    const etat = suivreAlias(ETATS_RECHERCHE, nu);
    if(etat){ q.etats.push(etat.test); jetonsCompris.push(etat.libelle); return; }

    // Un mot-clé.
    const cle = suivreAlias(MOTS_CLES_RECHERCHE, nu);
    if(cle){ q.categories.push(cle.test); jetonsCompris.push(cle.libelle); return; }

    // Rien de connu : c'est un morceau de nom.
    q.mots.push(nu);
  });

  // Un type demandé exige la table des types, qui n'est pas chargée d'emblée.
  // Sans ce rappel, taper « feu » ne filtrerait rien et l'on croirait le jeton
  // ignoré — entryHasType() laisse tout passer tant qu'elle manque.
  rechercheVeutTypes = q.typeId !== null;
  return q;
}

// La ligne qui dit ce qui a été compris. Sans elle, un mot qui filtre en
// silence est indiscernable d'un mot qui ne fait rien.
function majJetonsRecherche(){
  const el = document.getElementById('rechercheJetons');
  if(!el) return;
  el.hidden = jetonsCompris.length === 0;
  if(el.hidden){ el.innerHTML = ''; return; }
  el.innerHTML = '<span class="jeton-titre">Compris :</span>'
    + jetonsCompris.map(function(j){
        return '<span class="jeton">' + escapeHtml(j) + '</span>';
      }).join('');
}

// Les pastilles de filtres.js s'alignent sur le champ au même moment que la
// ligne des jetons : une recherche tapée à la main, une remise à zéro venue
// d'un autre écran ou un changement d'onglet les mettent d'accord.
function majJetonsEtFiltres(){
  majJetonsRecherche();
  if(typeof majFiltresActifs === 'function') majFiltresActifs();
}

// Le pendant d'assurerLieux() pour la table des types : on la demande, et la
// grille se redessine une fois qu'elle est là.
let typesDemandes = false;
function assurerTypes(){
  if(typesByPokemonId || typesDemandes) return;
  typesDemandes = true;
  loadTypes().then(function(){ renderList(true); })
             .catch(function(){ typesDemandes = false; });
}

function getFiltered(){
  const rawQuery = searchEl.value.trim();
  const requete = analyserRecherche(rawQuery);
  if(rechercheVeutTypes) assurerTypes();
  // Une recherche entièrement numérique vise un numéro de Pokédex, pas un nom.
  const queryNumber = requete.numero;
  const filterMode = filterEl.value;
  const genMode = genFilterEl.value;
  const typeMode = typeFilterEl.value;
  const sortMode = sortEl.value;

  // Un objectif ouvert restreint la grille à sa liste figée, AVANT les
  // filtres — qui continuent de s'appliquer par-dessus. On ne rejoue pas les
  // filtres d'origine : l'objectif est justement ce qui ne bouge pas, et les
  // rejouer le laisserait dériver avec le relevé.
  const surObjectif = (typeof objectifAffiche !== 'undefined' && objectifAffiche)
    ? new Set(objectifAffiche.entrees || []) : null;

  // On part du scope courant (National, ou le Pokédex du jeu sélectionné).
  let result = scopeEntries.filter(function(entry){
    if(surObjectif && !surObjectif.has(entry.name)) return false;
    if(queryNumber !== null){
      // On accepte le n° national comme celui du Pokédex du jeu affiché.
      const gameNo = dexNumber ? dexNumber.get(entry.speciesId) : null;
      if(entry.speciesId !== queryNumber && gameNo !== queryNumber) return false;
    }
    // Les mots que l'analyse n'a pas reconnus cherchent dans le nom, et TOUS
    // doivent s'y trouver : « pikachu casquette » demande les deux. La
    // comparaison ignore les accents — « ptera » trouve Ptéra, et personne ne
    // tape les accents dans un champ de recherche.
    if(requete.mots.length){
      const nom = sansAccents(nomAffiche(entry));
      for(let i = 0; i < requete.mots.length; i++){
        if(nom.indexOf(requete.mots[i]) === -1) return false;
      }
    }
    // Les jetons reconnus. Ils se cumulent avec les menus.
    if(requete.typeId !== null && !entryHasType(entry, requete.typeId)) return false;
    if(requete.gen !== null && entry.gen !== requete.gen) return false;

    // PLUSIEURS FILTRES D'UNE MÊME FAMILLE S'ADDITIONNENT AU LIEU DE SE
    // RESTREINDRE. « Fossiles » et « Légendaires » ensemble montrent les deux
    // listes ; avant, la grille se vidait, puisque aucun Pokémon n'est les
    // deux à la fois. Un filtre de plus doit montrer plus, pas moins.
    //
    // Les deux familles, elles, se croisent : « Manquants » + « Fossiles »
    // veut dire « les fossiles qui me manquent », et c'est bien ce qu'on
    // demande en cochant les deux. Tout mettre en OU aurait rendu la question
    // impossible à poser.
    if(requete.etats.length){
      let un = false;
      for(let i = 0; i < requete.etats.length && !un; i++){
        if(requete.etats[i](entry)) un = true;
      }
      if(!un) return false;
    }
    if(requete.categories.length){
      let une = false;
      for(let i = 0; i < requete.categories.length && !une; i++){
        if(requete.categories[i](entry)) une = true;
      }
      if(!une) return false;
    }
    if(typeMode !== 'all' && !entryHasType(entry, parseInt(typeMode, 10))) return false;
    // « Capturés » / « Manquants » parlent de la forme du mode actif.
    if(filterMode === 'caught' && !activeSet().has(entry.name)) return false;
    if(filterMode === 'uncaught' && activeSet().has(entry.name)) return false;
    if(filterMode === 'normal-not-shiny' &&
       !(caughtSet.has(entry.name) && !shinySet.has(entry.name))) return false;
    // « Obtention » ne parle que du jeu ouvert : sur HOME, la question n'a pas
    // de réponse — le filtre ne retient alors rien plutôt que de mentir.
    if(filterMode.indexOf('obt-') === 0){
      const voulu = filterMode.slice(4);
      const obt = obtentionDe(entry);
      if(!obt) return false;
      // Un « return true » ici sauterait les filtres qui suivent — génération,
      // type : on ne sort que sur un refus.
      const equivalentes = MENTIONS_DE_LA_CATEGORIE[voulu] || [];
      const correspond = (voulu === 'shiny-lock')
        ? obt.mentions.indexOf('shiny-lock') !== -1
        : (obt.categorie === voulu
           || obt.mentions.some(function(m){ return equivalentes.indexOf(m) !== -1; }));
      if(!correspond) return false;
    }
    // Filtres de comparaison : ils n'existent que pendant une comparaison.
    if(filterMode === 'ami-oui-moi-non' &&
       !(amiPossede(entry) === true && !activeSet().has(entry.name))) return false;
    if(filterMode === 'moi-oui-ami-non' &&
       !(amiPossede(entry) === false && activeSet().has(entry.name))) return false;
    if(genMode !== 'all' && String(entry.gen) !== genMode) return false;
    return true;
  });

  return trierEntrees(result, sortMode);
}

// Le tri, à part : la vue boîtes en a besoin sans les filtres. Une boîte se lit
// par la PLACE d'un Pokémon, et filtrer déplacerait tout le monde d'un cran.
function trierEntrees(result, sortMode){
  result.sort(function(a, b){
    if(sortMode === 'name') return nomAffiche(a).localeCompare(nomAffiche(b), langueNoms);
    // Du plus rare au plus repandu. Sans la table — hors ligne, ou moins de
    // cinq collections publiques — rangRarete() rend 1 pour tout le monde et
    // le tri retombe sur le numero national, ce qui vaut mieux qu'un ordre au
    // hasard qui aurait l'air d'un classement.
    if(sortMode === 'rarete' && typeof rangRarete === 'function'){
      const ra = rangRarete(a), rb = rangRarete(b);
      if(ra !== rb) return ra - rb;
      return a.id - b.id;
    }
    if(sortMode === 'gen'){
      if(a.gen !== b.gen) return a.gen - b.gen;
      return a.id - b.id;
    }
    if(sortMode === 'game' && dexRank){
      // Ordre du Pokédex du jeu. Les formes d'une même espèce partagent son
      // rang : on les départage ensuite par n° national pour qu'elles
      // restent groupées derrière leur forme de base.
      const ra = dexRank.get(a.speciesId), rb = dexRank.get(b.speciesId);
      if(ra !== rb) return ra - rb;
      return a.id - b.id;
    }
    return a.id - b.id;
  });

  return result;
}

function genHeaderLabel(gen){
  const found = GEN_RANGES.find(function(g){ return g.gen === gen; });
  return found ? found.name : 'Formes spéciales';
}

// Un caractère par catégorie : la grille est dense, un mot y prendrait la
// place d'un sprite. Le titre au survol dit la même chose en toutes lettres.
const PASTILLES_OBTENTION = {
  sauvage: '🌿', evolution: '⬆', offert: '🎁',
  echange: '⇄', oeuf: '🥚', indisponible: '✖'
};
const LIBELLES_OBTENTION = {
  sauvage: 'Capturable dans ce jeu',
  evolution: 'Ne se capture pas — s\'obtient par évolution',
  offert: 'Ne se capture pas — Pokémon offert',
  echange: 'Ne se capture pas — s\'obtient par échange',
  oeuf: 'Ne se capture pas — s\'obtient par œuf',
  indisponible: 'Ne se capture pas — à transférer d\'un autre jeu'
};

// La légende des pastilles. Six symboles sur une carte de 90 pixels ne se
// devinent pas : la ligne les nomme, et ne s'affiche que là où ils existent.
const LEGENDE_OBTENTION = '🌿 capturable ici · ⬆ par évolution · 🎁 offert · '
  + '⇄ par échange · 🥚 par œuf · ✖ ne se capture pas · ✨ shiny-lock';

let legendeOuverte = false;
// ---- Les images de la grille ------------------------------------------------
//
// UN SEUL JEU D'IMAGES : LE RENDU HOME. Il a existe un menu a quatre styles —
// rendu HOME, HOME anime, sprite du jeu, sprite anime — et il a ete retire le
// jour meme, a la demande de Maxime. Ce que la grille fait desormais tient en
// deux phrases : elle pose le rendu HOME fixe partout, et elle echange contre
// le rendu HOME ANIME la carte que le curseur designe.
//
// LES SPRITES D'EPOQUE NE SONT PLUS PROPOSES ICI. `spriteEpoqueUrl()` et
// `spriteAnimeUrl()` restent dans noyau.js : la fiche s'en sert pour son propre
// bouton « Sprite anime », et verrous.js pour illustrer un verrou chromatique.
// C'est la GRILLE qui n'en veut plus.
//
// POURQUOI LE SURVOL ET NON L'AFFICHAGE CONTINU. Mesure sur ces fichiers-la :
// 731 Ko pour Pikachu, 3 568 Ko pour l'entree n° 1000, contre 77 Ko pour le
// rendu fixe. Cinquante-cinq vignettes visibles, ce sont des dizaines de
// megaoctets et autant de decodages en boucle. On montre donc l'animation la ou
// l'on regarde : une seule a la fois, celle qu'on a demandee du regard.

// `prefers-reduced-motion` est le reglage de qui ne supporte pas le mouvement,
// et une grille de vignettes qui s'agitent est exactement ce qu'il vise.
// `saveData` dit qu'on compte ses octets, et ces GIF se comptent en megaoctets.
// Dans les deux cas, le survol n'anime rien : la carte garde son rendu fixe.
function animesRefuses(){
  try{
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      return true;
    }
  }catch(e){ /* matchMedia absent : on continue */ }
  const c = navigator.connection;
  return !!(c && c.saveData);
}

// LA TAILLE DU PLUS GRAND RENDU HOME ANIME, en pixels. Releve sur un
// echantillon choisi pour ses extremes : n° 1000 en 545 x 1081, n° 1008 en
// 695 x 1051, Meloetta 959 x 635, Pikachu 437 x 449. Rien ne depasse 1081.
//
// Il sert de reference d'echelle : ces rendus sont decoupes au plus pres du
// Pokemon et portent donc leur taille dans leurs dimensions. Etires a la meme
// case, un petit Pokemon paraissait aussi gros qu'un grand.
const HOME_ANIME_REF = 1081;

/**
 * Rend au sprite anime son echelle, une fois le fichier arrive.
 *
 * EN JAVASCRIPT ET NON EN CSS, parce que la taille n'est connue qu'au
 * chargement : elle vit dans le fichier, pas dans le document. On la pose en
 * POURCENTAGE du cadre et non en pixels, pour que la grille reste elastique —
 * les cartes retrecissent avec la fenetre, et des pixels figes ici auraient
 * debordé sur un ecran etroit.
 */
function poserEchelleAnime(img){
  const l = img.naturalWidth, h = img.naturalHeight;
  if(!l || !h) return;
  img.style.width = (100 * l / HOME_ANIME_REF) + '%';
  img.style.height = (100 * h / HOME_ANIME_REF) + '%';
}

/**
 * Anime la carte que le curseur designe, et la rend a son rendu fixe apres.
 *
 * TOUT CE QU'IL FAUT SAVOIR EST DANS LES DEUX ATTRIBUTS `data-` : on garde
 * l'adresse ET l'etape de l'image fixe sur l'element lui-meme, plutot que dans
 * une fermeture. Le gestionnaire d'erreur de la chaine principale en a besoin
 * aussi, et deux ecouteurs d'erreur qui se marchent dessus, c'est le genre de
 * chose qui rend un repli imprevisible.
 *
 * `focus` autant que `mouseenter` : on parcourt aussi cette grille au clavier,
 * et une animation reservee a la souris serait une animation refusee a qui n'en
 * a pas.
 */
function poserSurvolAnime(carte, img, entry){
  // Les formes cosmetiques et les variantes n'ont pas de rendu HOME : elles
  // sont indexees par nom chez Showdown, pas par n° d'entree chez PokeOS.
  if(entry.spriteOnly || animesRefuses()) return;
  const montrer = function(){
    if(img.dataset.stage === 'home-anime' || img.dataset.sansAnime) return;
    img.dataset.fixe = img.src;
    img.dataset.etapeFixe = img.dataset.stage || 'pokeos';
    img.dataset.stage = 'home-anime';
    img.src = homeAnimeUrl(entry.id, shinyView);
  };
  const rendre = function(){
    if(img.dataset.stage !== 'home-anime' || !img.dataset.fixe) return;
    img.dataset.stage = img.dataset.etapeFixe || 'pokeos';
    // L'echelle posee pour l'anime s'en va avec lui : le rendu fixe est cadre
    // comme tous les autres, et lui laisser ces pourcentages le deformerait.
    img.style.width = '';
    img.style.height = '';
    img.src = img.dataset.fixe;
  };
  carte.addEventListener('mouseenter', montrer);
  carte.addEventListener('mouseleave', rendre);
  carte.addEventListener('focusin', montrer);
  carte.addEventListener('focusout', rendre);
}

function majLegendeObtention(){
  const el = document.getElementById('legendeObtention');
  const bouton = document.getElementById('legendeBtn');
  if(!el) return;
  // Les pastilles n'existent que sur le Pokédex d'un jeu : ailleurs, le bouton
  // n'aurait rien à expliquer, et disparaît plutôt que de rester inerte.
  const possible = !!(lieuxDuJeu && gameByKey[currentTab]);
  if(bouton){
    bouton.hidden = !possible;
    bouton.setAttribute('aria-pressed', String(legendeOuverte && possible));
    bouton.textContent = (legendeOuverte && possible)
      ? '🏷️ Masquer les pastilles' : '🏷️ Voir les pastilles';
  }
  el.hidden = !(possible && legendeOuverte);
  // Les points de séparation passent en gris : ce sont les symboles qu'on vient
  // lire, pas la ponctuation. D'où le HTML plutôt qu'un textContent.
  if(!el.hidden && !el.childNodes.length){
    el.innerHTML = LEGENDE_OBTENTION.split(' · ')
      .map(function(bout){ return '<span>' + bout + '</span>'; })
      .join('<span class="sep">·</span>');
  }
}

// Le bouton vit à côté de « Comparer » : les deux répondent à « qu'est-ce que
// je regarde ? », l'un pour les cartes d'un ami, l'autre pour ses propres
// pastilles.
(function(){
  const bouton = document.getElementById('legendeBtn');
  if(!bouton) return;
  bouton.addEventListener('click', function(){
    legendeOuverte = !legendeOuverte;
    majLegendeObtention();
  });
})();

function renderCard(entry){
  // La vue active décide de la forme qu'on édite ; l'autre n'est qu'affichée.
  const ownedHere = activeSet().has(entry.name);
  const ownedThere = otherSet().has(entry.name);

  const card = document.createElement('div');
  card.className = 'card' + (ownedHere ? ' is-owned' : '');

  const spriteFrame = document.createElement('div');
  spriteFrame.className = 'card-sprite';

  const nationalNo = String(entry.speciesId || entry.id).padStart(4, '0');
  const idBadge = document.createElement('span');
  idBadge.className = 'card-id';
  // Sur un Pokédex de jeu, la carte porte le numéro du jeu — sinon un tri
  // « N° du jeu » afficherait des numéros nationaux dans le désordre.
  const gameNo = dexNumber ? dexNumber.get(entry.speciesId) : null;
  if(gameNo != null){
    idBadge.textContent = '#' + String(gameNo).padStart(3, '0');
    idBadge.title = 'N° ' + gameNo + ' dans ce Pokédex · n° national ' + nationalNo;
  } else {
    idBadge.textContent = '#' + nationalNo;
  }
  spriteFrame.appendChild(idBadge);

  const otherFlag = document.createElement('span');
  otherFlag.className = 'card-other-flag' + (ownedThere ? ' on' : '');
  otherFlag.textContent = shinyView ? '⬤' : '✨';
  otherFlag.setAttribute('role', 'img');
  const otherLabel = (shinyView ? 'forme normale' : 'forme shiny');
  const modeAutre = infoMode(modeCourant());
  otherFlag.title = ownedThere
    ? 'Déjà ' + modeAutre.verbeMin + ' en ' + otherLabel + '.'
    : 'Pas encore ' + modeAutre.verbeMin + ' en ' + otherLabel
      + ' — bascule de vue pour le cocher.';
  otherFlag.setAttribute('aria-label', otherFlag.title);
  spriteFrame.appendChild(otherFlag);

  // La pastille d'obtention : elle répond sans ouvrir la fiche à « celui-là,
  // je peux l'attraper ici ? ». Elle ne s'affiche que sur le Pokédex d'un jeu,
  // et seulement si le relevé connaît cette espèce.
  const obt = obtentionDe(entry);
  if(obt){
    const pastille = document.createElement('span');
    const chromatiqueVerrouille = obt.mentions.indexOf('shiny-lock') !== -1;
    pastille.className = 'card-obtention obt-' + obt.categorie
      + (chromatiqueVerrouille ? ' shiny-lock' : '');
    pastille.textContent = PASTILLES_OBTENTION[obt.categorie] || '?';
    pastille.title = (obt.sansLigne
        ? 'Ne se capture pas — aucune source ne le donne dans ce jeu'
        : (LIBELLES_OBTENTION[obt.categorie] || obt.categorie))
      + (chromatiqueVerrouille ? ' · shiny-lock : jamais chromatique ici' : '');
    spriteFrame.appendChild(pastille);
  }

  // En comparaison, un bandeau indique qui possède ce Pokémon. On garde la
  // référence : cocher la carte doit le repeindre, pas seulement la colorer.
  let temoinCompare = null;
  if(amiPossede(entry) !== null){
    temoinCompare = document.createElement('span');
    peindreTemoinComparaison(temoinCompare, entry, ownedHere);
    card.appendChild(temoinCompare);
    card.classList.add('en-comparaison');
  }

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = nomAffiche(entry);
  const showdownSlug = toShowdownSlug(entry.name);
  const formCandidates = entry.spriteOnly ? showdownFormCandidates(entry.name) : null;
  let candidateIndex = 0;
  // Fallback chain: local sprite -> PokeOS HOME -> official artwork -> Showdown home -> hide.
  // Le maillon local se saute quand la session a déjà prouvé qu'il ne donne
  // rien : voir spritesLocauxPossibles() dans noyau.js.
  const apresLocal = function(){
    if(entry.spriteOnly){
      img.dataset.stage = 'form';
      img.src = showdownSpriteUrl(formCandidates[candidateIndex], shinyView);
    } else {
      img.dataset.stage = 'pokeos';
      img.src = pokeosHomeUrl(entry.id, shinyView);
    }
  };

  if(spritesLocauxPossibles()){
    img.src = localSpriteUrl(entry.name, shinyView);
    img.dataset.stage = 'local';
  } else {
    apresLocal();
  }

  // Un sprite local qui CHARGE se signale : c'est ce qui empêche d'abandonner
  // le dossier de quelqu'un qui l'a vraiment rempli.
  img.addEventListener('load', function(){
    if(img.dataset.stage === 'local') noterSpriteLocal(true);
    // L'echelle n'appartient qu'au rendu ANIME, decoupe au plus pres du sujet.
    // Le rendu HOME fixe, lui, est en 512 x 512 avec le Pokemon centre et deja
    // mis a l'echelle par son producteur : lui en imposer une le rapetisserait.
    if(img.dataset.stage === 'home-anime') poserEchelleAnime(img);
  });

  img.addEventListener('error', function(){
    if(img.dataset.stage === 'home-anime'){
      // PokeOS n'a pas de rendu anime pour tout — l'entree n° 1017 manque, la
      // forme chromatique de la 1025 aussi. On revient a l'image qu'on avait
      // sous la main, et on retient de ne plus la redemander : sans ca, chaque
      // passage du curseur relancerait la meme requete perdue.
      img.dataset.sansAnime = '1';
      img.dataset.stage = img.dataset.etapeFixe || 'pokeos';
      img.style.width = '';
      img.style.height = '';
      img.src = img.dataset.fixe || pokeosHomeUrl(entry.id, shinyView);
    } else if(img.dataset.stage === 'local'){
      noterSpriteLocal(false);
      // Les formes cosmétiques et les variantes ♀ n'ont ni rendu PokeOS ni
      // artwork officiel (tous deux indexés par n° d'entrée) : seul Showdown
      // les distingue, on saute donc directement à lui.
      apresLocal();
    } else if(img.dataset.stage === 'form'){
      candidateIndex++;
      if(candidateIndex < formCandidates.length){
        img.src = showdownSpriteUrl(formCandidates[candidateIndex], shinyView);
      } else {
        img.style.display = 'none';
      }
    } else if(img.dataset.stage === 'pokeos'){
      img.dataset.stage = 'official';
      img.src = officialArtworkUrl(entry.id, shinyView);
    } else if(img.dataset.stage === 'official'){
      img.dataset.stage = 'showdown';
      img.src = showdownSpriteUrl(showdownSlug, shinyView);
    } else {
      img.style.display = 'none';
    }
  });
  spriteFrame.appendChild(img);

  const nameEl = document.createElement('div');
  nameEl.className = 'card-name';
  nameEl.textContent = nomAffiche(entry);

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const chip = document.createElement('label');
  chip.className = 'chip-check' + (ownedHere ? ' checked' : '');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = ownedHere;
  // Tabulation mobile : poserTabulation() rendra une seule case atteignable au
  // Tab, et les flèches feront le reste. Voir grille.js.
  input.tabIndex = -1;
  const formLabel = shinyView ? 'shiny' : 'normale';
  // Le mot suit l'aventure ouverte : « Capturé » sur un Pokédex ordinaire,
  // « Vu » sur un dex de rencontres, « En boîte » sur un Living Dex — où la
  // question n'est pas de l'avoir eu, mais de l'avoir encore.
  const mode = infoMode(modeCourant());
  input.setAttribute('aria-label',
    mode.action + ' — forme ' + formLabel + ' : ' + nomAffiche(entry));
  chip.appendChild(input);
  chip.appendChild(document.createTextNode(
    mode.verbe + (shinyView ? ' (shiny)' : ' (normal)')));

  // Les deux formes sont indépendantes : cocher l'une ne touche jamais l'autre.
  input.addEventListener('change', function(){
    // Avant que la case ne change d'etat : la remettre apres coup ferait
    // clignoter l'ecran, et l'utilisateur aurait vu son geste accepte.
    if(!exigeCompte('cocher une capture')){ input.checked = !input.checked; return; }
    const target = activeSet();
    if(input.checked) target.add(entry.name);
    else target.delete(entry.name);
    chip.classList.toggle('checked', input.checked);
    card.classList.toggle('is-owned', input.checked);
    if(temoinCompare) peindreTemoinComparaison(temoinCompare, entry, input.checked);
    updateProgress();
    // La barre du haut compte ce qui reste à cocher : sans ce rappel, elle
    // gardait le chiffre d'avant jusqu'au prochain filtre, et l'on cochait
    // vingt cartes en lisant toujours « 147 à cocher ».
    updateBulkBar();
    queueSave();
  });

  actions.appendChild(chip);

  // Le clic sur l'image ou le nom agrandit le Pokémon. La case à cocher et
  // le témoin gardent leur propre comportement, d'où le test sur la cible.
  function maybeOpenPreview(e){
    if(e.target.closest('.chip-check') || e.target.closest('.card-other-flag')) return;
    // On ne transmet l'image de la carte que si elle s'est réellement chargée.
    const ok = img.naturalWidth > 0 && img.style.display !== 'none';
    openPreview(entry, ok ? img.src : null);
  }
  spriteFrame.addEventListener('click', maybeOpenPreview);
  nameEl.addEventListener('click', maybeOpenPreview);
  spriteFrame.style.cursor = 'zoom-in';
  nameEl.style.cursor = 'zoom-in';

  card.appendChild(spriteFrame);
  card.appendChild(nameEl);
  card.appendChild(actions);
  // Le survol anime la carte : pose en dernier, quand tout est en place.
  poserSurvolAnime(card, img, entry);
  return card;
}

