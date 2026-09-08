// Les lieux — où aller maintenant.
//
// Le relevé répond à « où trouve-t-on Abra ? ». Quand on joue, la question est
// l'inverse : on est SUR une route, et on veut savoir ce qu'il reste à y
// attraper. Cette page retourne l'index.
//
// LE DÉCOUPAGE, ET POURQUOI IL MARCHE. Un texte de lieux est une rencontre par
// ligne, chacune de la forme « lieu (niveaux, fréquence) » — c'est texte_de()
// dans relever-lieux.py qui les assemble ainsi. Découper sur les sauts de ligne
// rend donc les rencontres une à une, sans rien deviner.
//
// Le « • » sépare ensuite le lieu de sa sous-zone : « Lac Ouragan • Hautes
// herbes » et « Lac Ouragan • Pokémon cachés » sont le même endroit. On
// regroupe sur la partie de gauche, et la sous-zone devient un détail. Mesuré
// sur les vingt-deux jeux : 3 243 lieux ainsi regroupés, contre près du double
// sans. Rouge et Bleu passe de 197 à 50 — et cinquante lieux, ça se parcourt.
//
// SEULEMENT LES RENCONTRES SAUVAGES. Une évolution, un œuf ou un échange n'ont
// pas de lieu où se rendre ; les faire figurer dans une liste d'endroits où
// aller serait un contresens. La catégorie 0 du relevé est la seule retenue.
//
// LA COLLECTION N'EST PAS CELLE DU DEX OUVERT. Cette page a son propre choix de
// jeu, indépendant de l'onglet du Pokédex : on lit donc allProgress[jeu] et non
// caughtSet, qui ne parle que du dex affiché ailleurs.

const LIEUX_MONTRES = 60;             // au-delà, la liste ne se parcourt plus

let lieuxIndex = null;                // { cleJeu: [lieu, ...] }, à la demande
let lieuxJeuCourant = null;
let lieuxOuvert = null;               // le lieu déplié
let lieuxParId = null;                // id d'espèce -> entrée

// Un taux lisible sans equivoque : une seule valeur dans la parenthese.
//
// Le releve y met aussi la VERSION — « 1 %R, 25 %B » se lit un pour cent dans
// Rouge, vingt-cinq dans Bleu. Deux valeurs ne peuvent donc pas se resumer en
// une : on les laisse alors telles quelles, ou elles se lisent tres bien.
//
// Mesure sur les vingt-deux jeux : 20 580 rencontres portent au moins un taux,
// sur 33 576 — soit 61 %. Les autres n'en ont pas du tout : un echange, un
// achat au casino ou un Pokemon fixe n'ont pas de frequence.
// À quoi renvoient les lettres qui suivent un pourcentage.
//
// « 10 %R » se lit dix pour cent dans Rouge. La lettre est propre au jeu, et
// c'est pourquoi la table l'est aussi : B vaut Bleu dans Rouge/Bleu, Blanc dans
// Noir/Blanc et Bouclier dans Épée/Bouclier. Une table unique se serait
// trompée deux fois sur trois.
//
// Relevé sur les vingt-deux jeux : seuls ceux qui suivent portent des taux
// suffixés. Les autres n'ont qu'une version, ou aucun taux propre à l'une
// d'elles. Une lettre inconnue est laissée telle quelle plutôt que devinée.
const LIEUX_VERSIONS = {
  rby:    { R:'Rouge', B:'Bleu' },
  gsc:    { O:'Or', A:'Argent' },
  rse:    { R:'Rubis', S:'Saphir' },
  frlg:   { RF:'Rouge Feu', VF:'Vert Feuille' },
  dp:     { D:'Diamant', P:'Perle' },
  hgss:   { HG:'Or HeartGold', SS:'Argent SoulSilver' },
  bw:     { N:'Noir', B:'Blanc' },
  b2w2:   { N:'Noir 2', B:'Blanc 2' },
  xy:     { X:'X', Y:'Y' },
  oras:   { RO:'Rubis Oméga', SA:'Saphir Alpha' },
  sm:     { S:'Soleil', L:'Lune' },
  usum:   { US:'Ultra-Soleil', UL:'Ultra-Lune' },
  letsgo: { LGP:'Let’s Go Pikachu', LGE:'Let’s Go Évoli' },
  swsh:   { E:'Épée', B:'Bouclier' },
  bdsp:   { DE:'Diamant Étincelant', PS:'Perle Scintillante' },
};

// La lettre qui suit un pourcentage est la VERSION — « 10 %R » se lit dix
// pour cent dans Rouge. Elle fait partie du taux et se garde avec lui : sans
// elle, une frequence propre a une version passerait pour la regle.
const LIEUX_TAUX = /\d+(?:[.,]\d+)?\s*%\s*[A-ZÉÈÀ]{0,3}/g;

/**
 * Le lieu, sa sous-zone, ses taux et ses niveaux.
 *
 * La parenthèse porte les deux — « (5–7, 30 %) » — et il faut les séparer pour
 * les dire proprement : un taux se met en avant, un niveau se préfixe.
 *
 * LE RESTE N'EST PAS TOUJOURS UN NIVEAU. « Unique », « Peu commun », « 1200
 * jetons », « ★, ★★ » se logent au même endroit. On ne préfixe donc « Niv. »
 * que si ce qui reste n'est fait que de chiffres, de tirets et de virgules —
 * sinon on l'affiche tel quel, ce qui reste juste dans tous les cas.
 */
function decouperLieu(morceau, cleJeu){
  const brut = String(morceau).trim();
  const g = brut.match(/\(([^()]*)\)\s*$/);
  const dedans = g ? g[1].trim() : '';
  const nu = brut.replace(/\s*\([^()]*\)\s*$/, '').trim();

  const versions = LIEUX_VERSIONS[cleJeu] || {};
  const taux = [];
  let reste = dedans;
  (dedans.match(LIEUX_TAUX) || []).forEach(function(jeton){
    reste = reste.replace(jeton, '');
    const m = jeton.trim().match(/^(\d+(?:[.,]\d+)?\s*%)\s*([A-ZÉÈÀ]{0,3})$/);
    if(!m) { taux.push({ valeur: jeton.trim(), version: '' }); return; }
    taux.push({
      valeur: m[1].replace(/\s+/g, ' ').trim(),
      // Une lettre qu'on ne sait pas traduire est gardée telle quelle : mieux
      // vaut « 10 %Z » qu'un nom de jeu inventé.
      version: m[2] ? (versions[m[2]] || m[2]) : '',
    });
  });
  reste = reste.replace(/,\s*,/g, ',').replace(/^[,\s]+|[,\s]+$/g, '');

  // Les niveaux aussi peuvent dépendre de la version — « 7R, 9B ». Écrire
  // « 1 % Rouge » puis « 7R » sur la même ligne serait bancal : on développe
  // les deux de la même façon.
  //
  // Le motif exige des chiffres COLLÉS aux capitales, ce qui laisse tranquilles
  // « 1200 jetonsR » — le mot s'intercale — et « ★, ★★ », qui n'a pas de
  // chiffre du tout.
  const lisible = reste.replace(
    /(\d+(?:\s*[–—-]\s*\d+)?)([A-ZÉÈÀ]{1,3})\b/g,
    function(tout, nombre, lettres){
      return versions[lettres] ? nombre + ' ' + versions[lettres] : tout;
    });

  // Une fourchette se lit mieux en toutes lettres : « Niv. 10 à 45 » plutôt
  // que « Niv. 10–45 ».
  const enToutesLettres = function(s){
    return s.replace(/(\d+)\s*[–—-]\s*(\d+)/g, '$1 à $2');
  };

  // « Niv. » dès que ça COMMENCE par un chiffre, et pas seulement quand tout
  // en est un. La parenthèse s'écrit « niveaux, puis qualificatif » — « 30,
  // Unique », « 58–63, Peu commun », « 17, 1200 jetons » —, et exiger que la
  // fin en soit aussi chiffrée privait ces cas-là du préfixe sans raison.
  //
  // Relevé sur les 33 000 rencontres du fichier : aucune forme où le premier
  // nombre ne soit pas un niveau. « ★, ★★ » ne commence pas par un chiffre et
  // reste donc intact, ce qui est le seul cas à protéger.
  const niveaux = /^\d/.test(lisible)
    ? 'Niv. ' + enToutesLettres(lisible)
    : enToutesLettres(lisible);

  const i = nu.indexOf('•');
  return {
    lieu: i === -1 ? nu : nu.slice(0, i).trim(),
    sous: i === -1 ? '' : nu.slice(i + 1).trim(),
    taux: taux,
    niveaux: niveaux,
  };
}

/**
 * Cobblemon : ses biomes tiennent lieu de routes.
 *
 * Ce n'est pas un jeu Pokémon et il n'a pas de relevé de lieux — mais il a
 * mieux adapté à lui : soixante biomes Minecraft, avec qui s'y trouve. La
 * question « où aller » y a exactement le même sens.
 *
 * La dimension prend la place de la sous-zone : savoir qu'un Pokémon est dans
 * le Nether change tout au trajet.
 *
 * LES BIOMES DE MODS Y FIGURENT AUSSI, MAIS SOUS CONDITION.
 *
 * Cent deux espèces sur 874 n'ont aucun biome vanille : elles ne vivent que
 * dans des familles apportées par des mods. Elles étaient donc absentes de
 * cette page, et la seule chose qu'on en disait était une fiche qu'il fallait
 * penser à ouvrir. Les afficher sans rien demander aurait envoyé chercher un
 * Volcano à qui n'a pas Biomes O' Plenty — d'où la barre des mods : on ne
 * montre que ceux qu'on a cochés, et rien n'est coché au départ.
 *
 * L'index les porte TOUS, cochés ou non ; le tri se fait à l'affichage. Le
 * relevé de huit cents espèces ne se refait pas à chaque case cochée, et
 * l'index reste ce qu'il est — une lecture de la réserve, pas un état de
 * l'interface.
 *
 * DEUX MODS PEUVENT NOMMER LE MÊME BIOME. « Volcano » existe chez Biomes O'
 * Plenty et chez Wythers, avec des espèces différentes. Ils sont donc classés
 * séparément, sous une clé qui porte le mod : les fondre en une ligne
 * annoncerait des Pokémon que le mod installé ne donne pas.
 */
/** « Niv. 12 à 18 », ou « Niv. 12 » quand la fourchette n'en est pas une. */
function niveauxLisibles(bas, haut){
  if(!bas && !haut) return '';
  if(!haut || haut === bas) return 'Niv. ' + bas;
  return 'Niv. ' + bas + ' à ' + haut;
}

function indexerCobblemon(){
  // La reserve du mod se charge a la demande, et tout le monde ne passe pas par
  // la page Lieux : les succes, eux, indexent les vingt-trois jeux d'un coup.
  // Sans ce garde-fou, l'onglet manquant faisait tomber l'appelant.
  if(typeof DONNEES_COBBLEMON === 'undefined') return [];
  const d = DONNEES_COBBLEMON;
  const parBiome = new Map();

  function poser(nom, mod, id, a, vus){
    if(!nom) return;
    // UN SÉPARATEUR QU'ON VOIT. J'y avais d'abord mis un caractère invisible,
    // puis un échappement : les deux se recopient sans se lire. Deux barres
    // verticales ne figurent dans aucun nom de biome, et sautent aux yeux.
    const cle = mod ? mod + ' || ' + nom : nom;
    if(!parBiome.has(cle)) parBiome.set(cle, { nom: nom, mod: mod, especes: [] });

    // Une espèce tient souvent PLUSIEURS lignes de spawn sur le même biome —
    // un moment, une météo, un contexte. Elle n'y compte qu'une fois, mais les
    // lignes suivantes complètent la première : on garde la rareté la plus
    // favorable et la fourchette de niveaux la plus large. Prendre la première
    // venue aurait annoncé « ultra-rare » là où le voisin est commun.
    const deja = vus.get(cle);
    if(deja){
      if(a[2] < deja.rang) { deja.rang = a[2]; deja.rarete = d.raretes[a[2]] || ''; }
      deja.bas = Math.min(deja.bas, a[3]);
      deja.haut = Math.max(deja.haut, a[4]);
      deja.puce.niveaux = niveauxLisibles(deja.bas, deja.haut);
      deja.puce.taux = deja.rarete ? [{ valeur: deja.rarete, version: '' }] : [];
      return;
    }
    // La rareté prend la place du taux : Cobblemon ne donne pas de
    // pourcentage, mais « commun » ou « ultra-rare » décide de la même chose —
    // rester ici, ou passer son chemin.
    const rarete = d.raretes[a[2]] || '';
    const puce = {
      id: id,
      sous: DIMENSION_PUCE[a[15]] || '',
      taux: rarete ? [{ valeur: rarete, version: '' }] : [],
      niveaux: niveauxLisibles(a[3], a[4]),
      quand: '',
    };
    vus.set(cle, { rang: a[2], rarete: rarete, bas: a[3], haut: a[4], puce: puce });
    parBiome.get(cle).especes.push(puce);
  }

  Object.keys(d.especes).forEach(function(sid){
    const id = parseInt(sid, 10);
    const vus = new Map();
    d.especes[sid].forEach(function(a){
      (a[0] || []).forEach(function(ib){ poser(d.biomes[ib], '', id, a, vus); });
      // Les familles laissées de côté par le relevé sont exactement celles que
      // Minecraft ne remplit pas. Leurs biomes viennent de mods, et la réserve
      // les nomme mod par mod — voir famillesMod dans relever-cobblemon.py.
      (a[12] || []).forEach(function(ifam){
        ((d.famillesMod || [])[ifam] || []).forEach(function(groupe){
          (groupe[1] || []).forEach(function(nom){
            poser(nom, groupe[0], id, a, vus);
          });
        });
      });
    });
  });
  return [...parBiome.values()];
}

/* ---- Les mods de biomes ----------------------------------------------------
 *
 * Cobblemon balise les biomes d'une quinzaine de mods. La réserve n'en garde
 * que ce dont elle a besoin : les mods qui remplissent une famille dont
 * Minecraft n'a aucun biome. La liste se déduit donc de la réserve, jamais
 * écrite à la main — le jour où le relevé en ajoute un, la barre le montre
 * sans qu'on y touche.
 */
const LIEUX_MODS_CLE = 'pa.lieux.mods';
let lieuxModsChoisis = null;

function modsDeCobblemon(){
  if(typeof DONNEES_COBBLEMON === 'undefined') return [];
  const vus = new Set();
  (DONNEES_COBBLEMON.famillesMod || []).forEach(function(groupes){
    (groupes || []).forEach(function(g){ if(g[0]) vus.add(g[0]); });
  });
  return [...vus].sort(function(a, b){ return a.localeCompare(b, 'fr'); });
}

function modsChoisis(){
  if(lieuxModsChoisis) return lieuxModsChoisis;
  let brut = null;
  try{ brut = localStorage.getItem(LIEUX_MODS_CLE); }catch(e){ /* stockage refusé */ }
  let liste = [];
  try{ liste = brut ? JSON.parse(brut) : []; }catch(e){ liste = []; }
  lieuxModsChoisis = new Set(Array.isArray(liste) ? liste : []);
  return lieuxModsChoisis;
}

function basculerMod(nom){
  const choisis = modsChoisis();
  if(choisis.has(nom)) choisis.delete(nom); else choisis.add(nom);
  // Dans localStorage et non dans la sauvegarde : ce sont les mods de CETTE
  // installation de Minecraft, pas une propriété du dresseur. Se connecter
  // ailleurs ne doit pas y transporter une liste qui n'y vaut plus rien.
  try{
    localStorage.setItem(LIEUX_MODS_CLE, JSON.stringify([...choisis]));
  }catch(e){ /* ignore : le filtre marche, il ne survivra pas au rechargement */ }
}

/**
 * L'index d'un jeu : ses lieux, et qui s'y trouve.
 *
 * Construit une fois par jeu et gardé — parcourir sept cents espèces à chaque
 * changement de filtre serait du gaspillage, et la réserve ne bouge pas en
 * cours de session.
 */
function indexerLieux(cleJeu){
  if(!lieuxIndex) lieuxIndex = {};
  if(lieuxIndex[cleJeu]) return lieuxIndex[cleJeu];

  if(cleJeu === 'cobblemon'){
    const biomes = indexerCobblemon();
    // Rien en cache tant que la reserve du mod n'est pas la : l'index vide
    // qu'on garderait ici survivrait a son chargement, et l'onglet resterait
    // desespérément vide.
    if(!biomes.length) return biomes;
    lieuxIndex[cleJeu] = biomes;
    return lieuxIndex[cleJeu];
  }

  const table = DONNEES_LIEUX.jeux[cleJeu];
  const parLieu = new Map();
  if(table){
    Object.keys(table).forEach(function(sid){
      const ligne = table[sid];
      if(ligne[1] !== 0) return;                 // sauvage uniquement
      const id = parseInt(sid, 10);
      const texte = DONNEES_LIEUX.textes[ligne[0]] || '';
      // L'heure, la météo et la saison sont portées par l'espèce dans ce jeu,
      // et non par chacune de ses rencontres : le relevé ne descend pas plus
      // bas. Elles s'affichent donc sur l'espèce, ce qui reste juste.
      const quand = (ligne[3] || [])
        .map(function(i){ return DONNEES_LIEUX.textes[i]; })
        .filter(Boolean).join(' · ');
      const vus = new Set();
      texte.split('\n').forEach(function(morceau){
        const d = decouperLieu(morceau, cleJeu);
        if(!d.lieu) return;
        // Une espèce peut tenir plusieurs sous-zones du même lieu : elle ne doit
        // y compter qu'une fois, sinon « 30 espèces » en annonce le double.
        if(vus.has(d.lieu)) return;
        vus.add(d.lieu);
        if(!parLieu.has(d.lieu)) parLieu.set(d.lieu, { nom: d.lieu, especes: [] });
        parLieu.get(d.lieu).especes.push({ id: id, sous: d.sous,
                                           taux: d.taux, niveaux: d.niveaux,
                                           quand: quand });
      });
    });
  }
  lieuxIndex[cleJeu] = [...parLieu.values()];
  return lieuxIndex[cleJeu];
}

/** L'entrée d'une espèce, par son identifiant. */
function entreeParId(id){
  if(typeof allEntries === 'undefined') return null;
  if(!lieuxParId){
    lieuxParId = new Map();
    allEntries.forEach(function(e){ lieuxParId.set(e.id, e); });
  }
  return lieuxParId.get(id) || null;
}

/**
 * Ce qui est déjà pris dans ce jeu.
 *
 * allProgress ne contient une entrée que pour les Pokédex déjà ouverts : un jeu
 * auquel on n'a pas touché n'y figure pas, et c'est bien « rien de pris ».
 */
function prisesDe(cleJeu){
  if(typeof allProgress === 'undefined') return new Set();
  const b = allProgress[cleJeu];
  return (b && b.caught) ? b.caught : new Set();
}

/** Ce qu'il reste à prendre dans un lieu. */
function manquantsDe(lieu, pris){
  const manque = [], deja = [];
  lieu.especes.forEach(function(e){
    const entry = entreeParId(e.id);
    if(!entry) return;                            // forme absente de la réserve
    (pris.has(entry.name) ? deja : manque).push({ entry: entry, sous: e.sous,
                                                  taux: e.taux, niveaux: e.niveaux,
                                                  quand: e.quand });
  });
  return { manque: manque, deja: deja };
}

// ---- L'affichage -------------------------------------------------------------

function puceEspece(x, estPris){
  const l = document.createElement('button');
  l.type = 'button';
  l.className = 'lieu-espece' + (estPris ? ' pris' : '');
  l.title = 'Ouvrir la fiche de ' + nomAffiche(x.entry)
          + (x.sous ? ' — ' + x.sous : '');
  l.addEventListener('click', function(){ openPreview(x.entry); });

  const nom = document.createElement('span');
  nom.className = 'lieu-espece-nom';
  nom.textContent = nomAffiche(x.entry);
  l.appendChild(nom);

  // La sous-zone dit COMMENT on l'attrape ici : « Hautes herbes », « Pêche »,
  // « Pokémon cachés ». Sans elle, on cherche au mauvais endroit du même lieu.
  if(x.sous){
    const s = document.createElement('span');
    s.className = 'lieu-sous';
    s.textContent = x.sous;
    l.appendChild(s);
  }

  // Le taux : c'est le chiffre qui décide si l'on reste ou si l'on passe son
  // chemin. Quand il dépend de la version, elle est écrite en toutes lettres —
  // « 1 % Rouge » et non « 1 %R », qu'il fallait déchiffrer.
  // (x.taux || []) et non x.taux : cette fonction sert deux index, et celui de
  // Cobblemon n'a longtemps porté ni taux ni niveaux. La page entière tombait
  // alors sur ce forEach, sans rien afficher et sans rien dire — l'onglet
  // paraissait vide plutôt que cassé. Le garde-fou reste même maintenant que
  // l'index les pose : un troisième appelant viendra un jour.
  (x.taux || []).forEach(function(tx){
    const p = document.createElement('span');
    p.className = 'lieu-taux';
    p.textContent = tx.version ? tx.valeur + ' ' + tx.version : tx.valeur;
    l.appendChild(p);
  });

  if(x.niveaux){
    const n = document.createElement('span');
    n.className = 'lieu-niveaux';
    n.textContent = x.niveaux;
    l.appendChild(n);
  }

  // L'heure, la météo, la saison. Elles ne se répètent pas sur chaque
  // rencontre du relevé — elles valent pour l'espèce dans ce jeu.
  if(x.quand){
    const q = document.createElement('span');
    q.className = 'lieu-quand';
    q.textContent = x.quand;
    l.appendChild(q);
  }
  return l;
}

// ---- Ce qui change ce que l'on croise ---------------------------------------
//
// DEUX CHOSES PESENT SUR UNE RENCONTRE, et aucune des deux ne se lit dans la
// liste des especes : la METHODE — l'attaque ou l'objet qu'il faut pour la
// declencher — et le TALENT DE TETE, celui du premier Pokemon de l'equipe, qui
// biaise ce qui sort.
//
// LA METHODE EST DEJA LA, DANS LA SOUS-ZONE. Le releve Pokepedia ecrit « Lac
// Ouragan • Coup d'Boule » ou « • Peche a la Super Canne » : la sous-zone EST
// la methode. Mesure sur les vingt-deux jeux : 521 rencontres au Coup d'Boule,
// 112 a l'Eclate-Roc, 3 946 a la peche, 157 au Poke Radar. Il n'y avait donc
// rien a relever, seulement a dire ce que chacune demande.
//
// LE TALENT, LUI, S'ECRIT A LA MAIN. Aucune table publiee ne decrit les effets
// de terrain : PokeAPI n'en donne qu'une prose anglaise, non structuree. C'est
// du savoir de jeu, comme la table CADEAUX de fiche.js ou TALENTS_COMBAT de
// combat.js — dont celle-ci reprend la forme, identifiants PokeAPI compris.
//
// LES BORNES DE GENERATION SONT PRUDENTES, ET C'EST DELIBERE. Ces effets ont
// change plusieurs fois : Statik n'attire l'Electrik qu'a partir de la
// quatrieme, Lumiattirance ne double plus la rencontre en huitieme, et les jeux
// ou les Pokemon sont VISIBLES sur la carte — Let's Go, Legendes Arceus,
// Ecarlate/Violet — n'ont pas d'attraction par le talent du tout. Hors des
// bornes, on n'affiche RIEN : une ligne absente ne trompe personne, une ligne
// fausse fait perdre des heures de chasse.

const LIEUX_GENERATION = {
  rby:1, jaune:1, gsc:2, cristal:2, rse:3, emeraude:3, frlg:3,
  dp:4, pt:4, hgss:4, bw:5, b2w2:5, xy:6, oras:6, sm:7, usum:7,
  letsgo:7, swsh:8, bdsp:8, pla:8, sv:9, za:9
};

// Les jeux ou le talent de tete ne joue pas : on y voit le Pokemon avant de
// l'approcher, il n'y a rien a biaiser. Cobblemon est absent de la table des
// generations et se trouve ecarte par le meme chemin.
const LIEUX_SANS_TALENT = ['letsgo', 'pla', 'cobblemon'];

// Les talents qui ATTIRENT UN TYPE. `type` est l'identifiant PokeAPI, celui de
// TYPES_FR. La ligne ne parait que si ce type est vraiment present sur le lieu
// ouvert : « Statik attire l'Electrik » n'apprend rien sur une route qui n'en a
// pas un seul.
const TERRAIN_TYPE = [
  { id:9,   type:13, gens:[4, 8] },   // Statik        -> Electrik
  { id:42,  type:9,  gens:[4, 8] },   // Magnepiege    -> Acier
  { id:18,  type:10, gens:[8, 8] },   // Torche        -> Feu
  { id:114, type:11, gens:[8, 8] },   // Lavabo        -> Eau
  { id:31,  type:13, gens:[8, 8] },   // Paratonnerre  -> Electrik
  { id:139, type:12, gens:[8, 8] }    // Recolte       -> Plante
];

// LES TALENTS QUI NE DEPENDENT PAS DU LIEU, GROUPES PAR EFFET ET NON UN PAR UN.
// Ecrits a la ligne, ils faisaient douze lignes identiques sous chacun des
// soixante lieux d'un jeu — un mur qu'on cesse de lire des le deuxieme lieu. Et
// ce n'est pas ainsi qu'on se pose la question : on cherche « comment croiser
// plus de Pokemon », pas « que fait Lumiattirance ».
//
// Chaque talent garde SA borne de generation a l'interieur du groupe : Annule
// Garde n'existe qu'a partir de la quatrieme, Lumiattirance des la troisieme.
const TERRAIN_GROUPES = [
  { texte:'deux fois plus de rencontres',
    talents:[{ id:35, gens:[3, 7] }, { id:71, gens:[3, 7] }, { id:99, gens:[4, 7] }] },
  { texte:'deux fois moins de rencontres',
    talents:[{ id:1, gens:[3, 7] }, { id:73, gens:[3, 7] }, { id:95, gens:[4, 7] }] },
  { texte:'deux fois moins sous une tempête de sable, ou sous la grêle',
    talents:[{ id:8, gens:[4, 7] }, { id:81, gens:[4, 7] }] },
  { texte:'plus souvent le niveau le plus haut de la fourchette',
    talents:[{ id:46, gens:[5, 8] }, { id:72, gens:[5, 8] }, { id:55, gens:[5, 8] }] },
  { texte:'écarte les Pokémon bien plus faibles que ta tête d’équipe',
    talents:[{ id:22, gens:[5, 8] }, { id:51, gens:[5, 8] }] },
  { texte:'une fois sur deux, la nature de ta tête d’équipe',
    talents:[{ id:28, gens:[3, 8] }] },
  { texte:'deux fois sur trois, le sexe opposé',
    talents:[{ id:56, gens:[4, 8] }] },
  { texte:'plus souvent un objet tenu',
    talents:[{ id:14, gens:[4, 8] }] }
];

// Ce que demande une methode, quand ce n'est pas evident. La cle est le DEBUT
// de la sous-zone : le releve ecrit « Peche a la Super Canne », et comparer le
// debut evite d'enumerer chaque variante.
//
// Une methode absente de cette table n'est pas commentee : « Hautes herbes » se
// passe d'explication, et inventer une phrase pour chacune des 923 sous-zones
// relevees serait du remplissage.
const TERRAIN_METHODES = [
  ['Peche a la Mega Canne',   'il te faut la Méga Canne'],
  ['Peche a la Super Canne',  'il te faut la Super Canne'],
  ['Peche a la Canne',        'il te faut la Canne'],
  ['Peche',                   'une canne, au bord de l’eau'],
  ['Coup d’Boule',            'l’attaque Coup d’Boule, sur les arbres'],
  ['Eclate-Roc',              'l’attaque Éclate-Roc, sur les rochers'],
  ['Surf',                    'l’attaque Surf'],
  ['Sur l’eau',               'l’attaque Surf'],
  ['Surface de l’eau',        'l’attaque Surf'],
  ['Poke Radar',              'le Poké Radar, dans l’herbe'],
  ['Hordes',                  'Doux Parfum ou une Poudre Fumée les fait sortir à cinq'],
  ['Pokemon caches',          'les buissons qui bougent, ou l’Encens'],
  ['Herbes sombres',          'l’herbe la plus foncée : les niveaux y sont plus hauts'],
  ['Hautes herbes remuantes', 'l’herbe qui bouge, une fois la première rencontre passée'],
  ['Pokemon vadrouilleurs',   'il se déplace : la carte le suit'],
  ['Son Hoenn',               'la radio, canal Son Hoenn'],
  ['Son Sinnoh',              'la radio, canal Son Sinnoh']
];

/**
 * L'explication d'une methode, ou null.
 *
 * ON COMPARE SANS ACCENT NI APOSTROPHE. Le releve ecrit « Coup d'Boule » avec
 * une apostrophe droite ou courbe selon la page Pokepedia d'origine, et
 * « Peche » avec son accent : comparer les chaines brutes ratait une entree sur
 * deux. replierLieu() fait deja ce repli pour la recherche.
 */
function replierMethode(s){
  return replierLieu(s).replace(/[’']/g, '');
}

function methodeExpliquee(sous){
  const clef = replierMethode(sous);
  for(let i = 0; i < TERRAIN_METHODES.length; i++){
    if(clef.indexOf(replierMethode(TERRAIN_METHODES[i][0])) === 0){
      return TERRAIN_METHODES[i][1];
    }
  }
  return null;
}

function talentDansGeneration(t, gen){ return gen >= t.gens[0] && gen <= t.gens[1]; }

/**
 * Les especes du lieu qui portent un type donne.
 *
 * Rend un tableau vide tant que la table des types n'est pas chargee — la ligne
 * ne parait alors pas, plutot que de promettre un Electrik sans savoir lequel.
 */
function especesDuType(compte, typeId){
  if(typeof typesByPokemonId === 'undefined' || !typesByPokemonId) return [];
  const vus = [], noms = [];
  compte.manque.concat(compte.deja).forEach(function(x){
    const l = typesByPokemonId.get(x.entry.id);
    if(!l || l.indexOf(typeId) === -1) return;
    if(vus.indexOf(x.entry.id) !== -1) return;
    vus.push(x.entry.id);
    noms.push(nomAffiche(x.entry));
  });
  return noms;
}

// Les Pokemon DE TA COLLECTION qui portent ce talent.
//
// C'est ce qui separe un conseil d'un conseil applicable : « Statik attire
// l'Electrik » laisse chercher, « tu as un Pikachu » se suit tout de suite.
// L'index se construit une fois par jeu, a la premiere ouverture d'un lieu —
// parcourir la collection a chaque bloc serait du gaspillage.
let lieuxTalentsPossedes = null;
let lieuxTalentsJeu = null;

function possedesAvecTalent(cleJeu, talentId){
  if(lieuxTalentsJeu !== cleJeu){
    lieuxTalentsJeu = cleJeu;
    lieuxTalentsPossedes = new Map();
    if(typeof allEntries !== 'undefined' && typeof ficheEmbarquee === 'function'){
      const pris = prisesDe(cleJeu);
      allEntries.forEach(function(e){
        if(!pris.has(e.name)) return;
        const f = ficheEmbarquee(e);
        if(!f || !f.talents) return;
        f.talents.forEach(function(paire){
          const id = paire[0];
          if(!lieuxTalentsPossedes.has(id)) lieuxTalentsPossedes.set(id, []);
          const liste = lieuxTalentsPossedes.get(id);
          if(liste.length < 3) liste.push(nomAffiche(e));
        });
      });
    }
  }
  return lieuxTalentsPossedes.get(talentId) || [];
}

function nomTalent(id){
  return (typeof motDico === 'function' && motDico('talents', id)) || ('talent ' + id);
}

function ligneTerrain(titre, detail, appoint){
  const l = document.createElement('div');
  l.className = 'terrain-ligne';
  const t = document.createElement('span');
  t.className = 'terrain-quoi';
  t.textContent = titre;
  l.appendChild(t);
  const d = document.createElement('span');
  d.className = 'terrain-effet';
  d.textContent = detail;
  l.appendChild(d);
  if(appoint){
    const a = document.createElement('span');
    a.className = 'terrain-tien';
    a.textContent = appoint;
    l.appendChild(a);
  }
  return l;
}

function sousTitreTerrain(texte){
  const s = document.createElement('div');
  s.className = 'terrain-sous';
  s.textContent = texte;
  return s;
}

/**
 * L'encadre « Ce qui change ce que tu croises ici ».
 *
 * DEUX PARTIES, ET LA PREMIERE EST LA RAISON D'ETRE DE L'ENCADRE. « Ici » ne
 * vaut que pour ce lieu : les methodes qu'il demande, et les talents dont le
 * type est vraiment present. « Partout » est le rappel des effets qui ne
 * dependent pas de l'endroit — utile, mais identique d'un lieu a l'autre, donc
 * en second et annonce comme tel.
 *
 * Rend null quand il n'y a rien a dire : un encadre vide sous chaque lieu
 * ferait du bruit dans une liste qu'on parcourt.
 */
function blocTerrain(lieu, compte, cleJeu){
  const gen = LIEUX_GENERATION[cleJeu] || 0;
  const talentsComptent = gen >= 3 && LIEUX_SANS_TALENT.indexOf(cleJeu) === -1;

  const ici = [];
  const partout = [];

  // --- Ici : les methodes que ce lieu demande --------------------------------
  //
  // ON DEDOUBLONNE SUR L'EXPLICATION, pas sur la sous-zone. « Coup d'Boule » et
  // « Coup d'Boule (Arbre special) » sont deux sous-zones du releve et une
  // seule chose a faire : les ecrire toutes les deux disait deux fois la meme
  // phrase.
  const dites = [];
  compte.manque.concat(compte.deja).forEach(function(x){
    if(!x.sous) return;
    const aide = methodeExpliquee(x.sous);
    if(!aide || dites.indexOf(aide) !== -1) return;
    dites.push(aide);
    ici.push(ligneTerrain(x.sous.split(' (')[0], aide));
  });

  // --- Ici : les talents dont le type est present ----------------------------
  if(talentsComptent){
    TERRAIN_TYPE.forEach(function(t){
      if(!talentDansGeneration(t, gen)) return;
      const noms = especesDuType(compte, t.type);
      if(!noms.length) return;
      const typeFr = (typeof TYPES_FR !== 'undefined' && TYPES_FR[t.type]) || '';
      const tiens = possedesAvecTalent(cleJeu, t.id);
      ici.push(ligneTerrain(
        nomTalent(t.id),
        'en tête d’équipe : une rencontre sur deux sera ' + typeFr + ' — '
          + noms.slice(0, 4).join(', ') + (noms.length > 4 ? '…' : ''),
        tiens.length ? 'tu as ' + tiens.join(', ') : null));
    });

    // --- Partout : les effets qui ne dependent pas de l'endroit --------------
    TERRAIN_GROUPES.forEach(function(g){
      const noms = [], tiens = [];
      g.talents.forEach(function(t){
        if(!talentDansGeneration(t, gen)) return;
        noms.push(nomTalent(t.id));
        possedesAvecTalent(cleJeu, t.id).forEach(function(n){
          if(tiens.indexOf(n) === -1) tiens.push(n);
        });
      });
      if(!noms.length) return;
      partout.push(ligneTerrain(g.texte, noms.join(', '),
        tiens.length ? 'tu as ' + tiens.slice(0, 3).join(', ') : null));
    });
  }

  if(!ici.length && !partout.length) return null;

  const bloc = document.createElement('div');
  bloc.className = 'terrain';
  const titre = document.createElement('div');
  titre.className = 'terrain-titre';
  titre.textContent = 'Ce qui change ce que tu croises ici';
  bloc.appendChild(titre);

  if(ici.length){
    ici.forEach(function(l){ bloc.appendChild(l); });
  }
  if(partout.length){
    bloc.appendChild(sousTitreTerrain('En tête d’équipe, partout dans ce jeu'));
    partout.forEach(function(l){ bloc.appendChild(l); });
  }
  return bloc;
}

function blocLieu(lieu, pris){
  const compte = manquantsDe(lieu, pris);
  const bloc = document.createElement('div');
  bloc.className = 'lieu' + (compte.manque.length ? '' : ' complet');

  const tete = document.createElement('button');
  tete.type = 'button';
  tete.className = 'lieu-tete';
  tete.setAttribute('aria-expanded', String(lieuxOuvert === lieu.nom));

  // Le nom et l'étiquette du mod partagent la PREMIÈRE COLONNE de la grille.
  // Posés côte à côte dans .lieu-tete, ils auraient occupé deux colonnes sur
  // trois et poussé le compteur hors du cadre.
  const titre = document.createElement('span');
  titre.className = 'lieu-titre';

  const nom = document.createElement('span');
  nom.className = 'lieu-nom';
  nom.textContent = lieu.nom;
  titre.appendChild(nom);

  // LE NOM DU MOD SUIT LE BIOME, TOUJOURS. « Volcano » existe chez deux mods
  // avec des espèces différentes ; sans cette étiquette, deux lignes du même
  // nom se suivraient sans qu'on sache laquelle regarde son jeu. Elle dit
  // aussi, pour qui a coché large, d'où sort un biome qu'il ne connaît pas.
  if(lieu.mod){
    const marque = document.createElement('span');
    marque.className = 'lieu-mod';
    marque.textContent = lieu.mod;
    titre.appendChild(marque);
  }
  tete.appendChild(titre);

  const total = document.createElement('span');
  total.className = 'lieu-total';
  total.textContent = (compte.manque.length + compte.deja.length) + ' espèces';

  // LE NOMBRE ET LE MOT SONT DEUX ÉLÉMENTS, pour que le mot puisse partir sous
  // 360 px — voir dex.css. Mesuré à 320 : « 251 à prendre » prenait 104 des
  // 252 pixels de la rangée, et il n'en restait que 98 au nom du lieu, dont
  // 41 visibles. Vingt-huit noms sur soixante étaient illisibles.
  //
  // L'étiquette accessible porte la phrase ENTIÈRE dans tous les cas : ce qui
  // se raccourcit est ce qu'on voit, jamais ce qui se lit à voix haute.
  const compteur = document.createElement('span');
  compteur.className = 'lieu-compteur';
  const reste = compte.manque.length;
  compteur.setAttribute('aria-label', reste ? reste + ' à prendre' : 'tout est pris');

  const nb = document.createElement('b');
  nb.className = 'lieu-compteur-nb';
  const mot = document.createElement('span');
  mot.className = 'lieu-compteur-mot';
  if(reste){
    nb.textContent = String(reste);
    mot.textContent = 'à prendre';
  }else{
    // Un lieu fini n'a pas de nombre à montrer : la coche en tient lieu, et
    // elle ne paraît que là où la phrase ne tient plus.
    nb.textContent = '✓';
    nb.setAttribute('aria-hidden', 'true');
    mot.textContent = 'tout est pris';
  }
  compteur.appendChild(nb);
  compteur.appendChild(mot);

  tete.appendChild(total);
  tete.appendChild(compteur);
  bloc.appendChild(tete);

  const corps = document.createElement('div');
  corps.className = 'lieu-corps';
  corps.hidden = lieuxOuvert !== lieu.nom;
  // Ce qui manque d'abord : c'est la raison d'ouvrir. Ce qui est pris reste
  // visible en retrait — savoir qu'on a tout ratissé vaut ce qui reste.
  compte.manque.forEach(function(x){ corps.appendChild(puceEspece(x, false)); });

  // Un trait entre les deux. La pastille barrée et pâle disait déjà « pris »,
  // mais rien ne disait OÙ la bascule se faisait : sur trente espèces qui se
  // suivent, l'œil ne trouve pas la frontière. Le trait ne paraît que s'il y a
  // bien deux groupes à séparer.
  if(compte.manque.length && compte.deja.length){
    const sep = document.createElement('span');
    sep.className = 'lieu-separateur';
    sep.textContent = 'déjà pris';
    corps.appendChild(sep);
  }

  compte.deja.forEach(function(x){ corps.appendChild(puceEspece(x, true)); });

  // Apres les especes, jamais avant : on ouvre un lieu pour savoir ce qui y
  // reste, pas pour lire un mode d'emploi.
  const terrain = blocTerrain(lieu, compte, lieuxJeuCourant);
  if(terrain) corps.appendChild(terrain);

  bloc.appendChild(corps);

  tete.addEventListener('click', function(){
    lieuxOuvert = (lieuxOuvert === lieu.nom) ? null : lieu.nom;
    dessinerLieux();
  });
  return bloc;
}

/**
 * Replie une chaîne pour la comparer : sans accent, sans casse.
 *
 * « Foret » doit trouver « Forêt de Jade », et « pikachu » « Pikachu ». Sans ce
 * repli, il faudrait taper les accents pour chercher un lieu français — ce que
 * personne ne fait dans un champ de recherche.
 */
function replierLieu(s){
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Le lieu répond-il à la recherche ?
 *
 * Sur son nom, OU sur celui d'un Pokémon qu'on y croise. Les deux dans le même
 * champ : on cherche « Route 25 » ou « Chenipan » sans avoir à dire lequel des
 * deux on tape, et le résultat est le même — la liste des lieux où aller.
 *
 * Le nom d'espèce passe par nomAffiche(), donc suit la langue choisie : qui
 * joue en anglais cherche « Caterpie », pas « Chenipan ».
 */
function lieuRepond(lieu, q){
  if(!q) return true;
  if(replierLieu(lieu.nom).indexOf(q) !== -1) return true;
  return lieu.especes.some(function(e){
    const entry = entreeParId(e.id);
    return entry && replierLieu(nomAffiche(entry)).indexOf(q) !== -1;
  });
}

/* ---- L'ordre des lieux -----------------------------------------------------
 *
 * Bâti sur le modèle de « Plus de filtres » du Pokédex : un bouton, un panneau
 * de pastilles, et le choix retenu d'une visite à l'autre. Même geste et même
 * vocabulaire — un second modèle pour la même idée aurait fait deux
 * applications dans une.
 *
 * TROIS ORDRES, ET PAS DIX. Chacun répond à une question qu'on se pose
 * vraiment devant la page :
 *   · ce qu'il reste  — « où vais-je maintenant ? », l'ordre d'origine ;
 *   · les espèces     — « quel est le lieu le plus fourni ? », utile quand on
 *                       repart de zéro sur un jeu ;
 *   · le nom          — « je cherche CE lieu-là », quand on sait où l'on va.
 *
 * Chaque comparateur retombe sur les deux autres à égalité : sans cela, deux
 * lieux à même score s'échangeaient d'un dessin à l'autre, et la liste
 * bougeait sous le doigt sans que rien n'ait changé.
 */
const LIEUX_TRIS = [
  {
    cle: 'restant', libelle: 'Ce qu’il reste',
    titre: 'Les lieux où il te reste le plus à attraper, en premier',
    comparer: function(a, b){
      return (b.manque - a.manque)
          || (b.lieu.especes.length - a.lieu.especes.length)
          || a.lieu.nom.localeCompare(b.lieu.nom, 'fr');
    },
  },
  {
    cle: 'especes', libelle: 'Nombre d’espèces',
    titre: 'Les lieux les plus fournis en premier, pris ou non',
    comparer: function(a, b){
      return (b.lieu.especes.length - a.lieu.especes.length)
          || (b.manque - a.manque)
          || a.lieu.nom.localeCompare(b.lieu.nom, 'fr');
    },
  },
  {
    cle: 'nom', libelle: 'Nom (A → Z)',
    titre: 'Par ordre alphabétique, pour retrouver un lieu qu’on connaît',
    comparer: function(a, b){ return a.lieu.nom.localeCompare(b.lieu.nom, 'fr'); },
  },
];

const LIEUX_TRI_CLE = 'pa.lieux.tri';
let lieuxTriChoisi = null;

function triCourant(){
  if(lieuxTriChoisi) return lieuxTriChoisi;
  let garde = null;
  try{ garde = localStorage.getItem(LIEUX_TRI_CLE); }catch(e){ /* stockage refusé */ }
  // Un tri disparu de la liste ne doit pas laisser la page sans ordre : on
  // retombe sur celui d'origine, qui est aussi le plus utile.
  lieuxTriChoisi = LIEUX_TRIS.filter(function(t){ return t.cle === garde; })[0]
                || LIEUX_TRIS[0];
  return lieuxTriChoisi;
}

function poserTri(cle){
  const trouve = LIEUX_TRIS.filter(function(t){ return t.cle === cle; })[0];
  if(!trouve) return;
  lieuxTriChoisi = trouve;
  try{ localStorage.setItem(LIEUX_TRI_CLE, cle); }catch(e){ /* ignore */ }
}

/**
 * Le panneau des ordres. UN SEUL ACTIF À LA FOIS, contrairement aux mods :
 * ce sont des choix exclusifs, et les pastilles s'en servent comme des boutons
 * radio — aria-pressed dit lequel, et cliquer l'actif ne le désactive pas.
 * Une liste sans ordre n'existe pas.
 */
function dessinerBarreTri(){
  if(!lieuxTri) return;
  const actif = triCourant();
  lieuxTri.innerHTML = '';
  LIEUX_TRIS.forEach(function(t){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filtre-chip';
    b.textContent = t.libelle;
    b.title = t.titre;
    b.setAttribute('aria-pressed', String(t.cle === actif.cle));
    b.addEventListener('click', function(){
      if(t.cle === actif.cle) return;
      poserTri(t.cle);
      // L'ordre change, donc les voisins du lieu déplié aussi : le garder
      // ouvert laisserait un bloc béant au milieu d'une liste réordonnée.
      lieuxOuvert = null;
      dessinerLieux();
    });
    lieuxTri.appendChild(b);
  });
}

/**
 * La rangée des mods de biomes — Cobblemon seulement.
 *
 * Elle réutilise .filtre-chip, la pastille des filtres rapides du Pokédex :
 * même geste, même marque rouge quand c'est actif. Un composant de plus pour
 * dire la même chose aurait fait deux vocabulaires dans la même application.
 *
 * ELLE SE REDESSINE EN ENTIER À CHAQUE PASSAGE. Quinze boutons ne coûtent
 * rien ; tenir leur état à jour d'un côté et la liste de l'autre coûte
 * l'attention de celui qui relira.
 */
const LIEUX_MODS_OUVERT_CLE = 'pa.lieux.mods-ouvert';

function dessinerBarreMods(){
  if(!lieuxMods) return;
  const mods = lieuxJeuCourant === 'cobblemon' ? modsDeCobblemon() : [];

  // LE PANNEAU SE REPLIE, ET IL EST FERMÉ AU DÉPART.
  //
  // Mesuré sur le site en ligne à 375 px, panneau ouvert : cinq cent
  // soixante-neuf pixels avant le premier lieu, sur un écran de six cent
  // trente-neuf — quatre-vingt-neuf pour cent de la page pour des réglages,
  // et un seul lieu visible. La barre des mods en prenait cent
  // soixante-dix-neuf à elle seule.
  //
  // Or ce n'est pas un outil qu'on garde sous la main : on coche ses mods une
  // fois, et on n'y revient qu'en changeant d'installation. Un bouton dans la
  // barre coûte alors sa hauteur, et rien de plus.
  if(lieuxModsBascule){
    lieuxModsBascule.hidden = !mods.length;
    if(!mods.length){
      lieuxMods.hidden = true;
      lieuxMods.innerHTML = '';
      lieuxModsBascule.setAttribute('aria-expanded', 'false');
      return;
    }
    // Le nombre de mods cochés se lit sans ouvrir : sans lui, on ne sait plus
    // si la liste est filtrée, et une page amputée passe pour une page vide.
    const nb = modsChoisis().size;
    lieuxModsBascule.textContent = nb ? '🧩 Mods (' + nb + ')' : '🧩 Mods';
    if(lieuxMods.hidden) return;
  }else if(!mods.length){
    lieuxMods.hidden = true;
    lieuxMods.innerHTML = '';
    return;
  }

  lieuxMods.innerHTML = '';
  const choisis = modsChoisis();
  const titre = document.createElement('span');
  titre.className = 'lieux-mods-titre';
  titre.textContent = 'Mes mods de biomes';
  lieuxMods.appendChild(titre);

  mods.forEach(function(nom){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filtre-chip';
    b.textContent = nom;
    b.setAttribute('aria-pressed', String(choisis.has(nom)));
    b.title = 'Montrer aussi les biomes de ' + nom;
    b.addEventListener('click', function(){
      basculerMod(nom);
      // Le lieu déplié appartenait peut-être au mod qu'on vient de décocher :
      // le garder ouvert rouvrirait un bloc absent de la liste.
      lieuxOuvert = null;
      dessinerLieux();
    });
    lieuxMods.appendChild(b);
  });
}

function dessinerLieux(){
  if(!lieuxListe || !lieuxJeuCourant) return;
  dessinerBarreMods();
  if(lieuxTri && !lieuxTri.hidden) dessinerBarreTri();
  const tous = indexerLieux(lieuxJeuCourant);
  // Le tri par mod se fait ICI et non à l'indexation : cocher une case ne doit
  // pas relire huit cents espèces, et l'index reste une lecture de la réserve
  // plutôt qu'un reflet de l'interface.
  const choisis = modsChoisis();
  const lieux = tous.filter(function(l){ return !l.mod || choisis.has(l.mod); });
  const caches = tous.length - lieux.length;
  const pris = prisesDe(lieuxJeuCourant);

  const avec = lieux.map(function(l){
    return { lieu: l, manque: manquantsDe(l, pris).manque.length };
  });
  // L'ordre choisi dans le panneau « Trier » — par défaut, ce qu'il reste à y
  // prendre, qui est l'ordre de la question posée. Voir LIEUX_TRIS.
  avec.sort(triCourant().comparer);

  const utiles = avec.filter(function(x){ return x.manque > 0; });
  const q = replierLieu(lieuxQ ? lieuxQ.value.trim() : '');
  const garder = ((lieuxRestants && lieuxRestants.checked) ? utiles : avec)
    .filter(function(x){ return lieuRepond(x.lieu, q); });
  const montres = garder.slice(0, LIEUX_MONTRES);

  lieuxListe.innerHTML = '';
  if(!lieux.length){
    lieuxListe.innerHTML = '<div class="state-msg">Les lieux de ce jeu ne sont pas relevés.</div>';
  } else if(!garder.length){
    lieuxListe.innerHTML = q
      ? '<div class="state-msg">Aucun lieu ni Pokémon ne correspond à cette '
        + 'recherche dans ce jeu.</div>'
      : '<div class="state-msg">Plus rien à attraper à l’état sauvage ici. '
        + 'Décoche le filtre pour revoir tous les lieux.</div>';
  } else {
    montres.forEach(function(x){ lieuxListe.appendChild(blocLieu(x.lieu, pris)); });
    if(garder.length > montres.length){
      const reste = document.createElement('div');
      reste.className = 'state-msg';
      reste.textContent = 'et ' + (garder.length - montres.length) + ' autres lieux.';
      lieuxListe.appendChild(reste);
    }
  }

  if(lieuxResume){
    const total = utiles.reduce(function(s, x){ return s + x.manque; }, 0);
    let phrase = utiles.length
      ? total + ' Pokémon à prendre, répartis sur ' + utiles.length + ' lieu'
        + (utiles.length > 1 ? 'x' : '') + ' — sur ' + lieux.length + ' au total.'
      : lieux.length + ' lieux relevés, et plus rien à y attraper à l’état sauvage.';
    // DIRE CE QU'ON NE MONTRE PAS. Sans cette phrase, un dex de Cobblemon
    // paraissait amputé sans qu'on sache pourquoi : cent deux espèces n'ont
    // aucun biome vanille, et rien à l'écran ne disait qu'elles attendaient
    // derrière une case à cocher.
    if(caches) phrase += ' ' + caches + ' biome' + (caches > 1 ? 's' : '')
      + ' de mods non coché' + (caches > 1 ? 's' : '') + ' en plus.';
    lieuxResume.textContent = phrase;
  }
}

/** Le menu des jeux : ceux dont les lieux sont relevés, et eux seuls. */
function remplirJeuxLieux(){
  if(!lieuxJeu) return;
  const releves = DONNEES_LIEUX.pokedexReleve || [];
  // « key » et non « tab » : le premier est l'identifiant du jeu — celui que le
  // relevé emploie —, le second son libellé avec son émoji.
  // Cobblemon n'est pas dans le relevé — il a sa propre réserve de biomes.
  const liste = (typeof GAMES !== 'undefined' ? GAMES : [])
    .filter(function(j){ return releves.indexOf(j.key) !== -1 || j.key === 'cobblemon'; });

  lieuxJeu.innerHTML = '';
  liste.forEach(function(j){
    const o = document.createElement('option');
    o.value = j.key;
    o.textContent = j.title || j.tab || j.key;
    lieuxJeu.appendChild(o);
  });
  // Le jeu ouvert dans le Pokédex si c'en est un, sinon le premier de la liste.
  // Arriver ici depuis Rouge et Bleu et tomber sur Écarlate serait déroutant.
  const voulu = (liste.some(function(j){ return j.key === currentTab; }))
    ? currentTab : (liste[0] && liste[0].key);
  if(voulu){ lieuxJeu.value = voulu; lieuxJeuCourant = voulu; }
}

// ---- Branchements -----------------------------------------------------------

document.addEventListener('DOMContentLoaded', function(){
  if(lieuxJeu) lieuxJeu.addEventListener('change', function(){
    lieuxJeuCourant = lieuxJeu.value;
    lieuxOuvert = null;
    dessinerLieux();
  });
  if(lieuxRestants) lieuxRestants.addEventListener('change', function(){
    lieuxOuvert = null;
    dessinerLieux();
  });
  // Le panneau « Trier », ouvert et refermé comme « Plus de filtres » du
  // Pokédex, et rouvert là où on l'avait laissé : qui s'en sert s'en sert à
  // chaque visite, qui l'a fermé ne veut pas le revoir à chaque fois.
  const TRI_OUVERT_CLE = 'pa.lieux.tri-ouvert';
  if(lieuxTriBascule && lieuxTri){
    lieuxTriBascule.addEventListener('click', function(){
      const ouvre = lieuxTri.hidden;
      lieuxTri.hidden = !ouvre;
      lieuxTriBascule.setAttribute('aria-expanded', String(ouvre));
      if(ouvre) dessinerBarreTri();
      try{ localStorage.setItem(TRI_OUVERT_CLE, ouvre ? '1' : '0'); }
      catch(e){ /* stockage refusé */ }
    });
    let ouvertAvant = false;
    try{ ouvertAvant = localStorage.getItem(TRI_OUVERT_CLE) === '1'; }
    catch(e){ /* stockage refusé */ }
    if(ouvertAvant){
      lieuxTri.hidden = false;
      lieuxTriBascule.setAttribute('aria-expanded', 'true');
      dessinerBarreTri();
    }
  }

  // Le panneau des mods, replié comme celui du tri. Fermé au départ, et non
  // rouvert tout seul : contrairement au tri, on n'y revient qu'en changeant
  // l'installation de Minecraft.
  if(lieuxModsBascule && lieuxMods){
    lieuxModsBascule.addEventListener('click', function(){
      const ouvre = lieuxMods.hidden;
      lieuxMods.hidden = !ouvre;
      lieuxModsBascule.setAttribute('aria-expanded', String(ouvre));
      if(ouvre) dessinerBarreMods();
      try{ localStorage.setItem(LIEUX_MODS_OUVERT_CLE, ouvre ? '1' : '0'); }
      catch(e){ /* stockage refusé */ }
    });
    let ouvertAvant = false;
    try{ ouvertAvant = localStorage.getItem(LIEUX_MODS_OUVERT_CLE) === '1'; }
    catch(e){ /* stockage refusé */ }
    if(ouvertAvant){
      lieuxMods.hidden = false;
      lieuxModsBascule.setAttribute('aria-expanded', 'true');
    }
  }

  // « input » et non « change » : la liste se resserre pendant qu'on tape.
  if(lieuxQ) lieuxQ.addEventListener('input', function(){
    // Chercher un Pokémon n'a de sens que si l'on voit où il est : le
    // premier lieu trouvé s'ouvre donc de lui-même.
    lieuxOuvert = null;
    dessinerLieux();
    const premier = lieuxListe.querySelector('.lieu-nom');
    if(lieuxQ.value.trim() && premier){
      lieuxOuvert = premier.textContent;
      dessinerLieux();
    }
  });
});

/** Appelé par showPage('lieux'). */
async function chargerPageLieux(){
  if(!lieuxListe) return;
  lieuxListe.innerHTML = '<div class="state-msg">Chargement du relevé…</div>';
  try{
    // Les deux réserves : celle des lieux pour les jeux, celle des spawns
    // pour Cobblemon. Toutes deux se chargent à la demande, et une seule
    // fois — c'est le menu qui a besoin des deux dès l'ouverture.
    await Promise.all([chargerLieux(), chargerCobblemon()]);
  }catch(e){
    lieuxListe.innerHTML = '<div class="state-msg">Le relevé des lieux n’a pas pu être lu.</div>';
    return;
  }
  if(!lieuxJeuCourant) remplirJeuxLieux();
  dessinerLieux();

  // LES TYPES ARRIVENT APRES, ET LA PAGE NE LES ATTEND PAS. Ils ne servent qu'a
  // l'encadre du terrain — « Statik attire l'Electrik : Pikachu, Voltorbe » —
  // et les faire attendre retarderait la liste entiere pour une ligne. Sans
  // eux, especesDuType() rend vide et l'encadre garde ses autres lignes ; avec
  // eux, un second dessin les ajoute.
  if(typeof loadTypes === 'function' && typeof typesByPokemonId !== 'undefined'
     && !typesByPokemonId){
    try{
      await loadTypes();
      dessinerLieux();
    }catch(e){ /* le CSV n'est pas la : l'encadre s'en passe */ }
  }
}
