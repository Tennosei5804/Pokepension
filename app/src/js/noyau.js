// Elements du DOM, constantes, stockage local et sprites.
// Script classique (pas de module ES) : l'app reste ouvrable en file://

const listEl = document.getElementById('list');
const stateMsg = document.getElementById('state-msg');
const searchEl = document.getElementById('search');
const sortEl = document.getElementById('sort');
// Vrai des qu'on a touche au menu de tri soi-meme. Tant qu'il est faux, le tri
// suit l'onglet — « N° du jeu » dans un jeu, alphabetique ailleurs. Une fois
// vrai, plus rien ne le defait : un tri choisi est un choix.
let triChoisi = false;
const filterEl = document.getElementById('filter');
const genFilterEl = document.getElementById('genFilter');
const shinyViewBtn = document.getElementById('shinyView');
const niveauFormesEl = document.getElementById('niveauFormes');
const typeFilterEl = document.getElementById('typeFilter');
const bulkBar = document.getElementById('bulkBar');
const bulkLabel = document.getElementById('bulkLabel');
const bulkCheckBtn = document.getElementById('bulkCheck');
const bulkUncheckBtn = document.getElementById('bulkUncheck');
const themeBtn = document.getElementById('themeBtn');
// La langue se règle dans les Paramètres. Le bouton « Français » de l'en-tête
// n'existe plus : il disait une langue sans dire de quoi, et occupait la barre
// en permanence pour un choix qu'on fait une fois.
const langueChoix = document.getElementById('langueChoix');
const clocheBtn = document.getElementById('clocheBtn');
const clochePastille = document.getElementById('clochePastille');
const clochePanneau = document.getElementById('clochePanneau');
const clocheListe = document.getElementById('clocheListe');
const clocheToutLu = document.getElementById('clocheToutLu');

// Les échanges : la barre de proposition au pied de l'entraide, la liste sur la
// page des amis, et la discussion.
const trocBarre = document.getElementById('trocBarre');
const trocVeux = document.getElementById('trocVeux');
const trocDonne = document.getElementById('trocDonne');
const trocMot = document.getElementById('trocMot');
const trocJeu = document.getElementById('trocJeu');
const trocEnvoyer = document.getElementById('trocEnvoyer');
const trocEtat = document.getElementById('trocEtat');
const trocListe = document.getElementById('trocListe');

// Le plan de rangement, sur la fiche.
const ficheRangement = document.getElementById('ficheRangement');

// « Ce qui te bloquera », sur le Pokédex d'un jeu.
const blocagesBtn = document.getElementById('blocagesBtn');
const blocagesOverlay = document.getElementById('blocagesOverlay');
const blocagesEyebrow = document.getElementById('blocagesEyebrow');
const blocagesTitre = document.getElementById('blocagesTitre');
const blocagesListe = document.getElementById('blocagesListe');
const blocagesFermer = document.getElementById('blocagesFermer');

// « Je cherche » : le marqueur sur la fiche, et la liste sur la page des amis.
const ficheCherche = document.getElementById('ficheCherche');
const rechercheTitre = document.getElementById('rechercheTitre');
const rechercheListe = document.getElementById('rechercheListe');

// Le défi du jour, et l'historique de ceux d'avant.
const defiBloc = document.getElementById('defiBloc');
const defisOverlay = document.getElementById('defisOverlay');
const defisGrille = document.getElementById('defisGrille');
const defisNote = document.getElementById('defisNote');
const defisFermer = document.getElementById('defisFermer');

// Les photos de chasse.
const photoFichier = document.getElementById('photoFichier');
const photoOverlay = document.getElementById('photoOverlay');
const photoImage = document.getElementById('photoImage');
const photoLegende = document.getElementById('photoLegende');
const photoFermer = document.getElementById('photoFermer');
const photoRetirer = document.getElementById('photoRetirer');
const photosPlace = document.getElementById('photosPlace');
const murOverlay = document.getElementById('murOverlay');
const murEyebrow = document.getElementById('murEyebrow');
const murTitre = document.getElementById('murTitre');
const murNote = document.getElementById('murNote');
const murGrille = document.getElementById('murGrille');
const murFermer = document.getElementById('murFermer');
const aPortee = document.getElementById('aPortee');
const accueilAventure = document.getElementById('accueilAventure');
const accueilJournal = document.getElementById('accueilJournal');

// Nombre de cartes de chaque Pokédex, renseigné au fur et à mesure qu'on les
// ouvre : l'accueil s'en sert pour dessiner ses barres.
const gameTotals = {};
const loadMoreBtn = document.getElementById('loadMore');
// Le menu du compte, en en-tête : identité, aventures, réinitialisation,
// déconnexion. Exporter et importer ont disparu — tout est sur le compte.
const compteMenu = document.getElementById('compteMenu');
const comptePanneau = document.getElementById('comptePanneau');
const comptePseudo = document.getElementById('comptePseudo');
const compteAventure = document.getElementById('compteAventure');
const gaugeFill = document.getElementById('gaugeFill');
const gaugeValue = document.getElementById('gaugeValue');
const caughtCountEl = document.getElementById('caughtCount');
const totalCountEl = document.getElementById('totalCount');
const shinyCountEl = document.getElementById('shinyCount');
const totalCountShinyEl = document.getElementById('totalCountShiny');
const statLineNormal = document.getElementById('statLineNormal');
const statLineShiny = document.getElementById('statLineShiny');
const pageNav = document.getElementById('pageNav');
const scopeHead = document.getElementById('scopeHead');
const scopeTitle = document.getElementById('scopeTitle');
const scopeVariant = document.getElementById('scopeVariant');
const scopeBascule = document.getElementById('scopeBascule');
const scopeSecondNom = document.getElementById('scopeSecondNom');
const scopeNote = document.getElementById('scopeNote');
const pageDexEl = document.getElementById('page-dex');
const pageHomeEl = document.getElementById('page-home');
// Propres à PokéPension : la page de partage et la connexion Discord.
const pageDresseursEl = document.getElementById('page-dresseurs');
const pageAmisEl = document.getElementById('page-amis');
const amisQ = document.getElementById('amisQ');
const amisSuivre = document.getElementById('amisSuivre');
const amisPropositions = document.getElementById('amisPropositions');
const amisErreur = document.getElementById('amisErreur');
const amisListe = document.getElementById('amisListe');
const amisFil = document.getElementById('amisFil');
const amisPlus = document.getElementById('amisPlus');
const amisNotif = document.getElementById('amisNotif');
const visibleDresseurs = document.getElementById('visibleDresseurs');
const visibleEtat = document.getElementById('visibleEtat');
const trocContre = document.getElementById('trocContre');
const pageMessagesEl = document.getElementById('page-messages');
const galerieResume = document.getElementById('galerieResume');
const galerieFiltres = document.getElementById('galerieFiltres');
const galerieGrille = document.getElementById('galerieGrille');
const releveResume = document.getElementById('releveResume');
const releveCorps = document.getElementById('releveCorps');
const pageGalerieEl = document.getElementById('page-galerie');
const pageReleveEl = document.getElementById('page-releve');
const trocRappels = document.getElementById('trocRappels');
const trocHistorique = document.getElementById('trocHistorique');
const trocHistoriqueBloc = document.getElementById('trocHistoriqueBloc');
const msgRecherche = document.getElementById('msgRecherche');
const ficheEnvoyer = document.getElementById('ficheEnvoyer');
const msgPokeGen = document.getElementById('msgPokeGen');
const menuMessages = document.getElementById('menuMessages');
const messagesPastille = document.getElementById('messagesPastille');
const messagesDe = document.getElementById('messagesDe');
const messagesDeEtat = document.getElementById('messagesDeEtat');
const echangesOuverts = document.getElementById('echangesOuverts');
const echangesOuvertsEtat = document.getElementById('echangesOuvertsEtat');
const retroBloc = document.getElementById('retroBloc');
const succesBloc = document.getElementById('succesBloc');
const succesBtn = document.getElementById('succesBtn');
const succesResume = document.getElementById('succesResume');
const succesOverlay = document.getElementById('succesOverlay');
const succesTitre = document.getElementById('succesTitre');
const succesEyebrow = document.getElementById('succesEyebrow');
const succesFermer = document.getElementById('succesFermer');
const tableEre = document.getElementById('tableEre');
const tableEreNote = document.getElementById('tableEreNote');
const nouveautesBtn = document.getElementById('nouveautesBtn');
const nouveautesOverlay = document.getElementById('nouveautesOverlay');
const nouveautesListe = document.getElementById('nouveautesListe');
const nouveautesFermer = document.getElementById('nouveautesFermer');
const pageLieuxEl = document.getElementById('page-lieux');
const lieuxJeu = document.getElementById('lieuxJeu');
const lieuxRestants = document.getElementById('lieuxRestants');
const lieuxQ = document.getElementById('lieuxQ');
const lieuxResume = document.getElementById('lieuxResume');
const lieuxMods = document.getElementById('lieuxMods');
const lieuxModsBascule = document.getElementById('lieuxModsBascule');
const lieuxTri = document.getElementById('lieuxTri');
const lieuxTriBascule = document.getElementById('lieuxTriBascule');
const lieuxListe = document.getElementById('lieuxListe');
const pageProfilEl = document.getElementById('page-profil');
const pageParametresEl = document.getElementById('page-parametres');
const pageChasseEl = document.getElementById('page-chasse');
const pageJeuxEl = document.getElementById('page-jeux');
const pageVerrousEl = document.getElementById('page-verrous');
const pageCadeauxEl = document.getElementById('page-cadeaux');
const pageStrategieEl = document.getElementById('page-strategie');
const pageReproductionEl = document.getElementById('page-reproduction');
const pageTransfertsEl = document.getElementById('page-transferts');
const pageObtenirEl = document.getElementById('page-obtenir');
const ficheEffort = document.getElementById('ficheEffort');
const ficheOeufs = document.getElementById('ficheOeufs');
const authOverlay = document.getElementById('authOverlay');
const authErreur = document.getElementById('authErreur');
const authConnexion = document.getElementById('authConnexion');
const authLibelle = document.getElementById('authLibelle');
const homePlayerEl = document.getElementById('homePlayer');
const homeSummaryEl = document.getElementById('homeSummary');
const homeGensEl = document.getElementById('homeGens');
const homeModeEl = document.getElementById('homeMode');
const homeGaugeNormal = document.getElementById('homeGaugeNormal');
const homeGaugeNormalValue = document.getElementById('homeGaugeNormalValue');
const homeGaugeShiny = document.getElementById('homeGaugeShiny');
const homeGaugeShinyValue = document.getElementById('homeGaugeShinyValue');
const homeNormalCount = document.getElementById('homeNormalCount');
const homeNormalTotal = document.getElementById('homeNormalTotal');
const homeShinyCount = document.getElementById('homeShinyCount');
const homeShinyTotal = document.getElementById('homeShinyTotal');
const readoutLeft = document.getElementById('readout-left');
const playerBadge = document.getElementById('playerBadge');
const playerNameText = document.getElementById('playerNameText');
const importCodeBtn = document.getElementById('importCodeBtn');
const compareBar = document.getElementById('compareBar');
const compareLabel = document.getElementById('compareLabel');
const compareQuitBtn = document.getElementById('compareQuit');
const ficheTypes = document.getElementById('ficheTypes');
const ficheAffinites = document.getElementById('ficheAffinites');
const ficheStats = document.getElementById('ficheStats');
const ficheTalents = document.getElementById('ficheTalents');
const ficheEvolution = document.getElementById('ficheEvolution');
const ficheObtention = document.getElementById('ficheObtention');
const ficheBlocJeux = document.getElementById('ficheBlocJeux');
const fichePremier = document.getElementById('fichePremier');
const ficheJeux = document.getElementById('ficheJeux');
const ficheAttaquesJeux = document.getElementById('ficheAttaquesJeux');
const ficheAttaques = document.getElementById('ficheAttaques');
const ficheAttaquesNav = document.getElementById('ficheAttaquesNav');
const ficheAttaquesFiltre = document.getElementById('ficheAttaquesFiltre');
const ficheObtentionNav = document.getElementById('ficheObtentionNav');
const previewOverlay = document.getElementById('previewOverlay');
const previewClose = document.getElementById('previewClose');
const previewFrame = document.getElementById('previewFrame');
const portraitCri = document.getElementById('portraitCri');
const portraitSon = document.getElementById('portraitSon');
const portraitVolume = document.getElementById('portraitVolume');
const apparenceListe = document.getElementById('apparenceListe');
const apparenceRaz = document.getElementById('apparenceRaz');
const previewImg = document.getElementById('previewImg');
const previewNo = document.getElementById('previewNo');
const previewName = document.getElementById('previewName');
const previewMeta = document.getElementById('previewMeta');
const previewStates = document.getElementById('previewStates');
const ficheNomAutre = document.getElementById('ficheNomAutre');
const ficheGabarit = document.getElementById('ficheGabarit');
const ficheDexRegionaux = document.getElementById('ficheDexRegionaux');
const ficheNotice = document.getElementById('ficheNotice');
const ficheBlocNotice = document.getElementById('ficheBlocNotice');
const fichePaliers = document.getElementById('fichePaliers');
const portraitSource = document.getElementById('portraitSource');

const STORAGE_KEY = 'living-dex-progress';
// Combien de cartes par lot, au premier dessin comme à chaque « Afficher plus ».
const BATCH_SIZE = 55;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 31; // r=31 dans le SVG



let allEntries = [];       // {id, speciesId, name, display, gen}

// ---- Progression, séparée par Pokédex -----------------------------------
// Chaque onglet a sa propre collection : posséder Bulbizarre dans Épée ne le
// donne pas dans Écarlate. « national » est la collection Pokémon HOME, qui
// reste la vue d'ensemble mais ne se remplit plus toute seule.
// caughtSet / shinySet pointent toujours sur la collection de l'onglet
// courant : tout le reste du code continue de les utiliser sans rien savoir
// de ce découpage.
// Une collection par Pokedex, deduite de GAMES : ajouter un jeu suffit, il n'y
// a pas de seconde liste a tenir a jour. Elle etait figee sur les huit jeux
// d'origine, si bien que les douze ajoutes ensuite n'avaient pas de collection
// creee au demarrage.
const DEX_KEYS = ['national'].concat(GAMES.map(function(g){ return g.key; }));
let allProgress = {};
let caughtSet = new Set();
let shinySet = new Set();

function bucketFor(key){
  if(!allProgress[key]) allProgress[key] = { caught: new Set(), shiny: new Set() };
  return allProgress[key];
}

// Bascule les deux variables partagées sur la collection d'un Pokédex.
function useDexProgress(key){
  const b = bucketFor(key === 'home' ? 'national' : key);
  caughtSet = b.caught;
  shinySet = b.shiny;
}

// Repartir de zéro : aucune capture, aucune chasse. Cette fonction ne lit
// rien — elle vide.
//
// Elle portait un bloc qui tentait de recharger les chasses depuis « data »,
// recopié de progressFromJSON où ce paramètre existe. Ici il n'existait pas :
// l'appel levait un ReferenceError qui interrompait la fonction avant
// useDexProgress, et ouvrir une aventure laissait le dex à moitié réinitialisé.
function resetAllProgress(){
  allProgress = {};
  DEX_KEYS.forEach(bucketFor);
  if(typeof chasses !== 'undefined'){
    chasses = [];
    if(typeof chassesFinies !== 'undefined') chassesFinies = [];
    if(typeof dessinerChasses === 'function') dessinerChasses();
  }
  if(typeof objectifs !== 'undefined'){
    objectifs = [];
    if(typeof dessinerObjectifs === 'function') dessinerObjectifs();
  }
  if(typeof defis !== 'undefined'){
    defis = [];
    if(typeof dessinerDefi === 'function') dessinerDefi();
  }
  if(typeof recherches !== 'undefined'){
    recherches = [];
    if(typeof dessinerRecherches === 'function') dessinerRecherches();
  }
  if(typeof detailsCapture !== 'undefined') detailsCapture = {};
  useDexProgress(typeof currentTab !== 'undefined' ? currentTab : 'national');
}

function progressToJSON(){
  const out = {};
  Object.keys(allProgress).forEach(function(k){
    out[k] = {
      caught: Array.from(allProgress[k].caught),
      shiny: Array.from(allProgress[k].shiny)
    };
  });
  return out;
}

// Accepte le nouveau format (dex par dex) comme l'ancien (une seule liste,
// qui devient alors la collection Pokémon HOME).
function progressFromJSON(data){
  allProgress = {};
  DEX_KEYS.forEach(bucketFor);
  if(data && data.dex){
    Object.keys(data.dex).forEach(function(k){
      const b = bucketFor(k);
      b.caught = new Set(data.dex[k].caught || []);
      b.shiny = new Set(data.dex[k].shiny || []);
    });
  } else if(data && (data.caught || data.shiny)){
    const b = bucketFor('national');
    b.caught = new Set(data.caught || []);
    b.shiny = new Set(data.shiny || []);
  }

  // Les chasses voyagent avec le dex — buildSavePayload les y écrit depuis le
  // début. Personne ne les relisait : c'est ici leur place, la seule fonction
  // qui reçoive la sauvegarde.
  if(typeof chasses !== 'undefined'){
    chasses = Array.isArray(data && data.chasses) ? data.chasses : [];
    // Les chasses enregistrées avant la refonte des méthodes sont traduites à
    // la lecture : elles gardent leur compteur et retrouvent leur taux.
    if(typeof migrerChasse === 'function') chasses.forEach(migrerChasse);
    // Les chasses abouties suivent le même chemin. Une sauvegarde antérieure
    // au tableau de chasse n'en a pas : la liste vide est la bonne réponse,
    // et non une erreur — on n'a simplement rien gardé de ce temps-là.
    if(typeof chassesFinies !== 'undefined'){
      chassesFinies = Array.isArray(data && data.chassesFinies) ? data.chassesFinies : [];
      if(typeof migrerChasse === 'function') chassesFinies.forEach(migrerChasse);
    }
    if(typeof dessinerChasses === 'function') dessinerChasses();
  }

  // Les objectifs sur mesure voyagent avec le dex, pour la meme raison que les
  // chasses : ils appartiennent a l'aventure, et changer de machine doit les
  // retrouver. Une sauvegarde anterieure n'en a pas — la liste vide est alors
  // la bonne reponse, et non une erreur.
  if(typeof objectifs !== 'undefined'){
    objectifs = Array.isArray(data && data.objectifs) ? data.objectifs : [];
    if(typeof dessinerObjectifs === 'function') dessinerObjectifs();
  }

  // Les défis relevés, même chemin et même raison.
  if(typeof defis !== 'undefined'){
    defis = Array.isArray(data && data.defis) ? data.defis : [];
    if(typeof dessinerDefi === 'function') dessinerDefi();
  }

  // Et la liste d'envies.
  if(typeof recherches !== 'undefined'){
    recherches = Array.isArray(data && data.recherches) ? data.recherches : [];
    if(typeof dessinerRecherches === 'function') dessinerRecherches();
  }

  // Les fiches de capture, rangées par Pokedex puis par nom. Une sauvegarde
  // qui n'en a pas rend un objet vide — c'est le cas de toutes celles d'avant.
  if(typeof detailsCapture !== 'undefined'){
    const d = data && data.detailsCapture;
    detailsCapture = (d && typeof d === 'object' && !Array.isArray(d)) ? d : {};
  }

  useDexProgress(typeof currentTab !== 'undefined' ? currentTab : 'national');
}

// ---- Langue des noms de Pokemon -----------------------------------------
// Elle ne touche QUE les noms d'especes et de formes : l'interface reste en
// francais. Le choix vit dans localStorage, comme le theme — c'est une
// preference d'affichage propre a l'appareil, pas une donnee de progression.
const LANGUE_KEY = 'pokearchive-langue-noms';
let langueNoms = 'fr';

// Le nom a afficher pour une entree. Les donnees embarquees anciennes n'ont
// pas de « displayEn » : on retombe alors sur le francais plutot que sur rien.
function nomAffiche(entry){
  if(langueNoms === 'en') return entry.displayEn || entry.display;
  return entry.display;
}

let playerName = '';

/**
 * Ce geste demande-t-il un compte ? Ici, jamais.
 *
 * VALEUR PAR DEFAUT, DESTINEE A ETRE ECRASEE. compte.js redeclare cette
 * fonction et repond alors vraiment ; charge apres noyau.js, sa declaration
 * l'emporte. C'est l'idiome deja employe dans ce depot pour les fonctions qui
 * parlent au serveur, et il sert ici deux clients qui n'ont pas de compte :
 *
 *   les pages de generation  retirent compte.js — sans ce defaut, la premiere
 *                            case cochee levait une ReferenceError.
 *   le site web              le garde, mais son pont repond « connecte: true »
 *                            puisque la collection tient dans le navigateur et
 *                            qu'il n'y a aucun compte a creer.
 *
 * Repondre « oui » par defaut est le bon sens du refus : un client qui ne
 * connait pas les comptes ne doit pas se retrouver bride par eux.
 */
function exigeCompte(){ return true; }
let shinyView = false;
let renderedCount = 0;
let currentFiltered = [];
let lastGenHeader = null;
let saveTimer = null;

// ---- Sprite resolution -------------------------------------------------
// Priority order, tried in the browser via onerror fallbacks:
//   1) A local file in ./Sprites/ (or ./Sprites/shiny/), for anyone who
//      dropped their own rips from spriters-resource.com next to this file
//   2) PokeOS's Pokémon HOME renders, keyed by PokeAPI id (forms included)
//   3) PokeAPI's official artwork mirror (high-resolution, ~475x475)
//   4) Pokémon Showdown's "home" sprite set (smaller, but very complete)
//   5) A generic placeholder icon if nothing loads
function localSpriteUrl(name, shiny){
  return 'Sprites/' + (shiny ? 'shiny/' : '') + name + '.png';
}

// Le dossier Sprites/ existe pour qui dépose ses propres rips — et il est VIDE
// dans une installation ordinaire. Chaque carte y perdait donc une requête : mille
// trois cents 404 au premier Pokédex, un journal de console illisible, et
// l'erreur utile noyée au milieu des autres. Les images finissaient par
// s'afficher, ce qui rendait le gaspillage invisible.
//
// ON N'ABANDONNE QUE SI L'ON N'A JAMAIS RIEN TROUVÉ. Une collection partielle —
// seulement les sprites de première génération, par exemple — donne des séries
// d'échecs sur les autres pages sans que le dossier soit vide pour autant :
// couper au premier échec priverait cette personne de ses propres fichiers.
//
// CE QUE LE SEUIL NE FAIT PAS, ET IL FAUT LE SAVOIR : il n'épargne pas le
// PREMIER lot. Les cinquante-cinq vignettes reçoivent leur adresse d'un seul
// tenant, avant qu'aucune erreur ne soit revenue — le compteur est encore à zéro
// quand la dernière part. Mesuré : cinquante-cinq échecs au premier lot, puis
// zéro sur tous les suivants. On passe d'environ mille trois cents requêtes
// perdues à cinquante-cinq, une fois par session, et non à huit.
//
// Le compteur ne vit qu'une session. Quelqu'un qui dépose ses sprites pendant
// qu'elle tourne les retrouve au prochain lancement, sans réglage à changer.
let spritesLocauxTrouves = 0;
let spritesLocauxEchecs = 0;
const SPRITES_LOCAUX_ABANDON = 8;

/** Vaut-il encore la peine de tenter le dossier local ? */
function spritesLocauxPossibles(){
  return spritesLocauxTrouves > 0 || spritesLocauxEchecs < SPRITES_LOCAUX_ABANDON;
}

function noterSpriteLocal(trouve){
  if(trouve) spritesLocauxTrouves++;
  else spritesLocauxEchecs++;
}
function pokeosHomeUrl(id, shiny){
  const base = 'https://s3.pokeos.com/pokeos-uploads/assets/pokemon/home/render/';
  return base + (shiny ? 'shiny/' : '') + id + '.png?v=3';
}
function officialArtworkUrl(id, shiny){
  const base = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';
  return base + (shiny ? 'shiny/' : '') + id + '.png';
}
// ---- Les sprites d'époque -----------------------------------------------
// Showdown héberge un jeu de sprites par génération, sur le même domaine que
// celui déjà utilisé en dernier repli : rien à télécharger, rien à ajouter au
// CSP, et le nom de fichier se calcule avec toShowdownSlug() comme le reste.
//
// Deux limites tiennent à la source, pas au code :
//   · la première génération n'a pas de chromatiques — sur Rouge/Bleu et
//     Jaune, la vue shiny garde le sprite normal ;
//   · à partir de X/Y il n'existe plus de sprite 2D : le bouton disparaît, et
//     les rendus HOME restent seuls.
const SPRITES_DE_JEU = {
  rby:      { normal: 'gen1rb',   shiny: null },
  jaune:    { normal: 'gen1',     shiny: null },
  gsc:      { normal: 'gen2g',    shiny: 'gen2-shiny' },
  cristal:  { normal: 'gen2',     shiny: 'gen2-shiny' },
  rse:      { normal: 'gen3rs',   shiny: 'gen3-shiny' },
  emeraude: { normal: 'gen3',     shiny: 'gen3-shiny' },
  frlg:     { normal: 'gen3frlg', shiny: 'gen3-shiny' },
  dp:       { normal: 'gen4',     shiny: 'gen4-shiny' },
  pt:       { normal: 'gen4',     shiny: 'gen4-shiny' },
  hgss:     { normal: 'gen4',     shiny: 'gen4-shiny' },
  bw:       { normal: 'gen5',     shiny: 'gen5-shiny' },
  b2w2:     { normal: 'gen5',     shiny: 'gen5-shiny' }
};

function spritesDuJeu(cleJeu){
  return SPRITES_DE_JEU[cleJeu] || null;
}

// L'adresse du sprite d'époque, ou null si le jeu n'en a pas.
function spriteEpoqueUrl(cleJeu, slug, shiny){
  const jeu = spritesDuJeu(cleJeu);
  if(!jeu) return null;
  const dossier = (shiny && jeu.shiny) || jeu.normal;
  return 'https://play.pokemonshowdown.com/sprites/' + dossier + '/' + slug + '.png';
}

// Le sprite animé : 85 × 98, quarante-quatre images, sur le domaine déjà
// interrogé pour les sprites d'époque. La fiche le double exactement, au plus
// proche voisin — étiré à la taille d'un rendu HOME, il baverait.
function spriteAnimeUrl(slug, shiny){
  return 'https://play.pokemonshowdown.com/sprites/'
    + (shiny ? 'ani-shiny/' : 'ani/') + slug + '.gif';
}

// Le rendu HOME ANIME, chez PokeOS, a cote du rendu fixe. Il existe pour la
// quasi-totalite des especes, forme chromatique comprise.
//
// IL EST ENORME, ET C'EST LA DONNEE QUI COMMANDE TOUT LE RESTE. Mesure :
// 731 Ko pour Pikachu, 3 568 Ko pour l'entree n° 1000, contre 77 Ko pour le
// rendu fixe. Une grille de cinquante-cinq vignettes visibles demanderait donc
// des dizaines de megaoctets, et ferait tourner cinquante-cinq decodages en
// boucle. C'est pour cela que la grille ne le pose qu'au survol — voir dex.js.
function homeAnimeUrl(id, shiny){
  const base = 'https://s3.pokeos.com/pokeos-uploads/assets/pokemon/home/animated/';
  return base + (shiny ? 'shiny/' : '') + id + '.gif';
}

function showdownSpriteUrl(slug, shiny){
  const base = 'https://play.pokemonshowdown.com/sprites/';
  return (shiny ? base + 'home-shiny/' : base + 'home/') + slug + '.png';
}


// Showdown colle en un seul bloc les suffixes de formes cosmétiques
// (« vivillon-icy-snow » devient « vivillon-icysnow ») et s'arrête parfois
// à une partie du suffixe : il dessine « alcremie-caramelswirl » sans le
// bonbon, faute d'illustration distincte. On propose donc des slugs de plus
// en plus courts, du plus précis au plus générique, et on garde le premier
// qui répond — ça couvre Charmilly, Météno ou Tapatoès sans cas particulier.
function showdownFormCandidates(pokeApiName){
  const parts = toShowdownSlug(pokeApiName).split('-');
  const out = [];
  for(let k = parts.length; k >= 2; k--){
    out.push(parts[0] + '-' + parts.slice(1, k).join(''));
  }
  out.push(parts[0]);
  return out;
}

function toShowdownSlug(pokeApiName){
  let s = pokeApiName;
  SHOWDOWN_COMPRESSIONS.forEach(function(pair){ s = s.split(pair[0]).join(pair[1]); });
  s = s.replace('mega-x','megax').replace('mega-y','megay');
  s = s.replace('-female','-f');
  return s;
}

function titleCase(word){
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function getGeneration(speciesId){
  for(let i=0;i<GEN_RANGES.length;i++){
    if(speciesId >= GEN_RANGES[i].min && speciesId <= GEN_RANGES[i].max) return GEN_RANGES[i].gen;
  }
  return 0;
}

function extractId(url){
  const parts = url.split('/').filter(Boolean);
  return parseInt(parts[parts.length - 1], 10);
}

// ---- Depuis quand ---------------------------------------------------------
// Treize lignes de calcul de date, sans un mot de compte ni de session. Elle
// vivait dans compte.js, que les pages de génération ne chargent pas : une
// chasse datée y cassait la liste entière. Elle sert des deux côtés — la liste
// des chasses et le journal du profil — et sa place est donc ici.
function depuisQuand(iso){
  const d = new Date(iso);
  if(isNaN(d)) return '';
  const jours = Math.floor((Date.now() - d.getTime()) / 86400000);
  if(jours <= 0) return "aujourd'hui";
  if(jours === 1) return 'hier';
  if(jours < 31) return 'il y a ' + jours + ' jours';
  const mois = Math.floor(jours / 30);
  return 'il y a ' + mois + (mois === 1 ? ' mois' : ' mois');
}

// ---- Le stockage local ------------------------------------------------------
//
// La progression de secours, celle qui survit a une API injoignable. Elle
// double la sauvegarde serveur : voir serveur.js, seul appelant des deux
// fonctions.
//
// ELLES RESTENT `async` alors que localStorage est synchrone. Ce n'est pas un
// oubli : leurs appelants les attendent, et le jour ou le stockage passe a
// autre chose — IndexedDB, un fichier Tauri — la signature n'aura pas a bouger.
//
// Il y avait ici une seconde voie, vers `window.storage`, heritee de l'epoque
// ou cette page etait un artifact. Elle ne pouvait s'executer nulle part :
// l'objet n'existe ni dans une fenetre Tauri ni dans un navigateur. Deux
// chemins dont un mort, c'etait un chemin de trop a lire.
//
// ON N'AVALE PAS LES ECHECS D'ECRITURE EN SILENCE. Un stockage refuse —
// navigation privee, quota plein — laisse croire que tout est garde alors que
// rien ne l'est. La lecture, elle, peut rendre null sans bruit : l'appelant
// sait quoi faire d'une reserve absente.
async function storageGet(key){
  try{ return localStorage.getItem(key); }catch(e){ return null; }
}

async function storageSet(key, value){
  try{ localStorage.setItem(key, value); }
  catch(e){ console.error('Erreur de sauvegarde locale :', e); }
}

