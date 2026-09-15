// Fiche detaillee d'un Pokemon : types, premiere apparition, disponibilite.
// Script classique (pas de module ES) : l'app reste ouvrable en file://
//
// La disponibilite par jeu n'existe nulle part telle quelle chez PokeAPI. On la
// reconstruit : chaque Pokedex regional declare les « version groups » qui
// l'utilisent, donc une espece presente dans un Pokedex est presente dans les
// jeux correspondants. C'est derivable, verifiable, et ca couvre toute la
// serie principale, extensions comprises.

// Les couleurs ne servent plus qu'au repli : un type dont le logo manque
// retombe sur la pastille colorée d'avant, plutôt que de laisser un trou.
const TYPE_COULEURS = {
  1:'#9099a1', 2:'#ce4069', 3:'#8fa8dd', 4:'#a866c9', 5:'#d97946', 6:'#c7b78b',
  7:'#90c12c', 8:'#5269ac', 9:'#5a8ea1', 10:'#ff9d55', 11:'#4d90d5', 12:'#63bb5b',
  13:'#f4d23c', 14:'#f97176', 15:'#74cec0', 16:'#0b6dc3', 17:'#5a5366', 18:'#ec8fe6'
};

// Les logos livrés dans src/types/. Toutes les images font 200 × 44, et sont
// affichées à la moitié : une seule taille dans toute l'application, quel que
// soit l'endroit où un type apparaît.
const TYPE_FICHIERS = {
  1:'normal.png',  2:'combat.png',  3:'vol.png',      4:'poison.png',
  5:'sol.png',     6:'roche.png',   7:'insecte.png',  8:'spectre.png',
  9:'acier.png',  10:'feu.png',    11:'eau.png',     12:'plante.png',
  13:'electrik.png', 14:'psy.png', 15:'glace.png',   16:'dragon.png',
  17:'tenebres.png', 18:'fee.png'
};

// Le dossier des logos se déduit de celui de la réserve, comme pour les
// attaques : la page de génération vit dans outils/ et pointe vers ../src/,
// l'application dans src/. Écrire « types/ » en dur casserait l'une des deux.
function cheminTypes(){
  const ref = document.querySelector('script[src*="donnees-embarquees.js"]');
  const src = ref && ref.getAttribute('src');
  return src ? src.replace(/js\/donnees-embarquees\.js.*$/, 'types/') : 'types/';
}

// Le repli : la pastille de texte, telle qu'elle existait avant les logos.
function puceTypeTexte(id){
  const c = document.createElement('span');
  c.className = 'type-chip';
  c.style.background = TYPE_COULEURS[id] || '#666';
  c.textContent = TYPES_FR[id] || ('Type ' + id);
  return c;
}

/**
 * La puce d'un type, partout dans l'application : fiche, faiblesses, tableau
 * des attaques, page Stratégie. Une seule fonction, donc une seule taille.
 *
 * Une image absente ne casse rien : l'événement « error » la remplace par la
 * pastille colorée. C'est ce qui arrive à Dragon tant que dragon.png n'est pas
 * déposé dans src/types/ — et le jour où il l'est, rien d'autre à changer.
 */
function puceType(id){
  const fichier = TYPE_FICHIERS[id];
  const nom = TYPES_FR[id] || ('Type ' + id);
  if(!fichier) return puceTypeTexte(id);

  const img = document.createElement('img');
  img.className = 'type-img';
  img.src = cheminTypes() + fichier;
  img.alt = nom;
  img.title = nom;
  // Pas de « lazy » ici : les dix-huit logos pesent 43 Ko en tout et se
  // partagent le cache, donc rien a gagner — et surtout, un chargement differe
  // repousse l'evenement « error », donc le repli, jusqu'au moment ou l'image
  // entre dans l'ecran. La ligne sautait alors sous les yeux.
  img.addEventListener('error', function(){
    if(img.parentNode) img.replaceWith(puceTypeTexte(id));
  });
  return img;
}

// La table des types, dans le sens de l'attaque : pour chaque type offensif,
// ce qu'il touche double, ce qu'il touche de moitié, et ce qu'il ne touche pas.
// Tout ce qui n'y figure pas est neutre.
//
// C'est la table ACTUELLE, celle de la sixième génération et des suivantes.
// Elle n'est pas la seule : voir TYPE_RELATIONS_PASSEES juste en dessous.
//
// Figée dans le fichier, comme TYPES_FR à côté : PokeAPI la publie, mais aller
// la chercher coûterait dix-huit requêtes au premier affichage d'une fiche.
const TYPE_RELATIONS = {
  1:  { double: [],                moitie: [6, 9],                   nul: [8] },
  2:  { double: [1, 6, 9, 15, 17], moitie: [3, 4, 7, 14, 18],        nul: [8] },
  3:  { double: [2, 7, 12],        moitie: [6, 9, 13],               nul: [] },
  4:  { double: [12, 18],          moitie: [4, 5, 6, 8],             nul: [9] },
  5:  { double: [4, 6, 9, 10, 13], moitie: [7, 12],                  nul: [3] },
  6:  { double: [3, 7, 10, 15],    moitie: [2, 5, 9],                nul: [] },
  7:  { double: [12, 14, 17],      moitie: [2, 3, 4, 8, 9, 10, 18],  nul: [] },
  8:  { double: [8, 14],           moitie: [17],                     nul: [1] },
  9:  { double: [6, 15, 18],       moitie: [9, 10, 11, 13],          nul: [] },
  10: { double: [7, 9, 12, 15],    moitie: [6, 10, 11, 16],          nul: [] },
  11: { double: [5, 6, 10],        moitie: [11, 12, 16],             nul: [] },
  12: { double: [5, 6, 11],        moitie: [3, 4, 7, 9, 10, 12, 16], nul: [] },
  13: { double: [3, 11],           moitie: [12, 13, 16],             nul: [5] },
  14: { double: [2, 4],            moitie: [9, 14],                  nul: [17] },
  15: { double: [3, 5, 12, 16],    moitie: [9, 10, 11, 15],          nul: [] },
  16: { double: [16],              moitie: [9],                      nul: [18] },
  17: { double: [8, 14],           moitie: [2, 17, 18],              nul: [] },
  18: { double: [2, 16, 17],       moitie: [4, 9, 10],               nul: [] }
};

// ---- La table d'avant ------------------------------------------------------
//
// La fiche s'adapte déjà au jeu ouvert pour la notice, les lieux, la lignée et
// le seuil de bonheur. Les faiblesses, non : elles affichaient la table
// moderne sur les vingt-quatre onglets. Sur un Pokédex de Rouge et Bleu, cela
// annonçait des faiblesses Fée, Ténèbres et Acier — trois types qui
// n'existaient pas — et cachait les règles d'époque.
//
// Trois ères, et deux ruptures :
//
//   génération 1        quinze types. Ni Acier, ni Ténèbres, ni Fée.
//   générations 2 à 5   Acier et Ténèbres arrivent avec Or et Argent.
//   génération 6 et +   la Fée arrive avec X et Y, et deux règles changent.
//
// Les valeurs viennent des « past_damage_relations » de PokeAPI, relevées et
// non récitées — deux souvenirs se sont révélés faux au passage : Spectre et
// Ténèbres n'étaient PAS super-efficaces contre l'Acier avant la sixième, ils
// étaient à moitié.
//
// Seules les lignes qui CHANGENT figurent ici ; le reste vient de la table
// moderne. Une ligne présente remplace entièrement la moderne.
const TYPE_RELATIONS_PASSEES = {
  1: {
    4:  { double: [12, 7],           moitie: [4, 5, 6, 8],          nul: [] },
    7:  { double: [12, 14, 4],       moitie: [2, 3, 8, 10],         nul: [] },
    8:  { double: [8],               moitie: [],                    nul: [1, 14] },
    10: { double: [7, 12, 15],       moitie: [6, 10, 11, 16],       nul: [] },
    14: { double: [2, 4],            moitie: [14],                  nul: [] },
    15: { double: [3, 5, 12, 16],    moitie: [11, 15],              nul: [] },
  },
  2: {
    8:  { double: [8, 14],           moitie: [17, 9],               nul: [1] },
    9:  { double: [6, 15],           moitie: [9, 10, 11, 13],       nul: [] },
    17: { double: [8, 14],           moitie: [2, 17, 9],            nul: [] },
  },
};

// Quand chaque type est apparu. Un type qui n'existe pas encore ne doit figurer
// nulle part : ni dans les faiblesses affichées, ni parmi les types du Pokémon.
const TYPE_APPARITION = { 9: 2, 17: 2, 18: 6 };

// L'ère de chaque jeu. Trois valeurs seulement — 1, 2 ou 6 —, puisque la table
// n'a changé que deux fois. Les jeux absents de cette liste, Pokémon HOME et
// Cobblemon compris, prennent la table moderne : le premier n'est pas un jeu,
// le second suit les règles d'aujourd'hui.
const ERE_DES_TYPES = {
  rby: 1, jaune: 1,
  gsc: 2, cristal: 2, rse: 2, emeraude: 2, frlg: 2,
  dp: 2, pt: 2, hgss: 2, bw: 2, b2w2: 2,
};

/** L'ère du jeu ouvert. 6 par défaut : les règles d'aujourd'hui. */
function ereDesTypes(cleJeu){
  return ERE_DES_TYPES[cleJeu] || 6;
}

/** Le type existait-il à cette époque ? */
function typeExiste(id, ere){
  return !TYPE_APPARITION[id] || TYPE_APPARITION[id] <= ere;
}

/**
 * Les types d'un Pokémon, ramenés à l'époque.
 *
 * La plupart des retypages SONT l'arrivée d'un type neuf — Magnéti gagne
 * l'Acier en deuxième, Grodoudou la Fée en sixième —, si bien que retirer ce
 * qui n'existait pas retrouve le type d'époque dans presque tous les cas.
 *
 * PRESQUE. Mélofée est Fée aujourd'hui et n'a que ça : la retirer ne laisse
 * rien, et le calcul rendrait « neutre partout », ce qui est faux et muet.
 * Elle était Normal, mais rien ici ne le sait — il faudrait relever les types
 * d'époque espèce par espèce. On rend donc une liste vide, et l'appelant le
 * dit au lieu d'inventer.
 *
 * Deux espèces sont dans ce cas en première génération, six en deuxième.
 */
function typesDeLEre(ids, ere){
  return (ids || []).filter(function(id){ return typeExiste(id, ere); });
}

/**
 * La table des types telle qu'elle était.
 *
 * On part de la moderne, on écrase les lignes qui ont changé, et on retire les
 * types qui n'existaient pas encore — des deux côtés : comme attaquants, et
 * dans les listes de ceux qu'ils touchent.
 */
function relationsDeLEre(ere){
  if(ere >= 6) return TYPE_RELATIONS;
  const passees = TYPE_RELATIONS_PASSEES[ere] || {};
  const sortie = {};
  Object.keys(TYPE_RELATIONS).forEach(function(cle){
    const id = parseInt(cle, 10);
    if(!typeExiste(id, ere)) return;
    const rel = passees[id] || TYPE_RELATIONS[id];
    sortie[id] = {
      double: rel.double.filter(function(d){ return typeExiste(d, ere); }),
      moitie: rel.moitie.filter(function(d){ return typeExiste(d, ere); }),
      nul:    rel.nul.filter(function(d){ return typeExiste(d, ere); }),
    };
  });
  return sortie;
}

// Les lignes affichées, dans l'ordre où on les lit : ce qui fait mal d'abord.
// Le neutre (×1) n'a pas de ligne — c'est la moitié des types, et l'afficher
// noierait les quatre qui décident vraiment d'un combat.
//
// En décimal, et non en fractions : à onze pixels, « ½ » et « ¼ » se
// distinguent mal l'un de l'autre, et pas du tout d'un « 1/2 » mal rendu.
// « ×0.5 » se lit du premier coup, et la colonne reste alignée.
const AFFINITE_LIGNES = [
  { mult: 4,    label: '×4',    classe: 'tres-faible',   aide: 'Dégâts quadruplés' },
  { mult: 2,    label: '×2',    classe: 'faible',        aide: 'Dégâts doublés' },
  { mult: 0.5,  label: '×0.5',  classe: 'resiste',       aide: 'Dégâts de moitié' },
  { mult: 0.25, label: '×0.25', classe: 'tres-resiste',  aide: 'Dégâts au quart' },
  { mult: 0,    label: '×0',    classe: 'immunise',      aide: 'Aucun dégât : immunisé' },
  // Le neutre en dernier, et il compte : sans lui, on lit six types et l'on se
  // demande où sont passés les douze autres. Sur Dracolosse, l'Électrik n'est
  // neutre que par accident — ×2 sur le Vol, ×0,5 sur le Dragon — et c'est
  // exactement le genre de chose qu'une ligne vide ne dit pas.
  { mult: 1,    label: '×1',    classe: 'neutre',
    aide: 'Dégâts normaux : ni faiblesse ni résistance' }
];

/**
 * Ce que subit un Pokémon de types « ids » face à chaque type d'attaque.
 *
 * Un double type multiplie les deux coefficients, et c'est de là que viennent
 * les ×4 et les ×¼ : la Roche touche double un Vol comme un Insecte, donc
 * quadruple un Papilusion.
 */
function affinitesDe(ids, ere){
  const epoque = ere || 6;
  const table = relationsDeLEre(epoque);

  // Les types du Pokémon lui-même, ramenés à l'époque. Rondoudou est
  // Normal/Fée aujourd'hui et n'était que Normal en première génération : lui
  // laisser sa Fée sur un Pokédex de Rouge et Bleu donnerait une résistance au
  // Dragon qu'il n'avait pas.
  //
  // C'est une approximation, et elle vaut la peine d'être dite : la plupart des
  // changements de type SONT l'arrivée d'un type neuf — Magnéti gagne l'Acier,
  // Rondoudou la Fée. Les rares retypages sans rapport ne sont pas rattrapés,
  // faute d'avoir relevé les types d'époque espèce par espèce.
  const miens = typesDeLEre(ids, epoque);

  // Le neutre est un groupe comme un autre depuis que la fiche l'affiche : sans
  // lui, on comptait six types sur dix-huit et l'on cherchait les autres.
  const groupes = { 4: [], 2: [], 1: [], 0.5: [], 0.25: [], 0: [] };
  Object.keys(TYPES_FR).forEach(function(cle){
    const attaque = parseInt(cle, 10);
    const rel = table[attaque];
    if(!rel) return;
    let mult = 1;
    miens.forEach(function(defenseur){
      if(rel.nul.indexOf(defenseur) !== -1) mult *= 0;
      else if(rel.double.indexOf(defenseur) !== -1) mult *= 2;
      else if(rel.moitie.indexOf(defenseur) !== -1) mult *= 0.5;
    });
    if(groupes[mult]) groupes[mult].push(attaque);
  });
  return groupes;
}

function dessinerAffinites(ids){
  if(!ficheAffinites) return;
  if(!ids || !ids.length){
    ficheAffinites.innerHTML = '<p class="fiche-vide">Types inconnus : '
      + 'les faiblesses ne peuvent pas être calculées.</p>';
    return;
  }

  // Les faiblesses suivent le jeu ouvert, comme la notice et les lieux. Hors
  // d'un onglet de jeu — le Pokédex d'ensemble — ce sont les règles actuelles.
  const ere = ereDesTypes(currentTab);
  ficheAffinites.innerHTML = '';

  // Tous ses types sont postérieurs à ce jeu : il en avait un autre, et on ne
  // sait pas lequel. Le dire vaut mieux qu'afficher « neutre partout », qui
  // serait faux sans en avoir l'air.
  const miens = typesDeLEre(ids, ere);
  if(!miens.length){
    ficheAffinites.innerHTML = '<p class="fiche-vide">Son type d\'aujourd\'hui '
      + 'n\'existait pas dans ce jeu — il en avait un autre, que le relevé ne '
      + 'connaît pas. Ses faiblesses d\'époque ne peuvent pas être calculées.</p>';
    return;
  }

  const groupes = affinitesDe(ids, ere);

  // Le dire, plutôt que de laisser croire à une erreur. Quelqu'un qui connaît
  // le jeu remarquera l'absence de la Fée ; quelqu'un qui ne le connaît pas
  // doit pouvoir comprendre pourquoi Spectre ne touche pas Psy.
  if(ere < 6){
    const note = document.createElement('p');
    note.className = 'affinites-epoque';
    note.textContent = ere === 1
      ? 'Table de la première génération : ni Acier, ni Ténèbres, ni Fée.'
      : 'Table des générations 2 à 5 : la Fée n\'existe pas encore.';
    ficheAffinites.appendChild(note);
  }

  AFFINITE_LIGNES.forEach(function(l){
    const types = groupes[l.mult];
    if(!types || !types.length) return;

    const ligne = document.createElement('div');
    ligne.className = 'affinite ' + l.classe;

    const mult = document.createElement('span');
    mult.className = 'affinite-mult';
    mult.textContent = l.label;
    mult.title = l.aide;
    ligne.appendChild(mult);

    const chips = document.createElement('span');
    chips.className = 'affinite-types';
    types.forEach(function(t){ chips.appendChild(puceType(t)); });
    ligne.appendChild(chips);

    ficheAffinites.appendChild(ligne);
  });
}

// Les jeux de chaque generation, pour la premiere apparition.
const GEN_PREMIERS_JEUX = {
  1:'Rouge / Bleu / Jaune', 2:'Or / Argent / Cristal', 3:'Rubis / Saphir / Émeraude',
  4:'Diamant / Perle / Platine', 5:'Noir / Blanc', 6:'X / Y', 7:'Soleil / Lune',
  8:'Épée / Bouclier', 9:'Écarlate / Violet'
};

// Nom francais de chaque « version group » de PokeAPI.
const VG_FR = {
  'red-blue':'Rouge / Bleu', 'yellow':'Jaune',
  'gold-silver':'Or / Argent', 'crystal':'Cristal',
  'ruby-sapphire':'Rubis / Saphir', 'emerald':'Émeraude',
  'firered-leafgreen':'Rouge Feu / Vert Feuille',
  'diamond-pearl':'Diamant / Perle', 'platinum':'Platine',
  'heartgold-soulsilver':'Or HeartGold / Argent SoulSilver',
  'black-white':'Noir / Blanc', 'black-2-white-2':'Noir 2 / Blanc 2',
  'x-y':'X / Y', 'omega-ruby-alpha-sapphire':'Rubis Oméga / Saphir Alpha',
  'sun-moon':'Soleil / Lune', 'ultra-sun-ultra-moon':'Ultra-Soleil / Ultra-Lune',
  'lets-go-pikachu-lets-go-eevee':'Let\'s Go Pikachu / Évoli',
  'sword-shield':'Épée / Bouclier',
  'the-isle-of-armor':'Épée/Bouclier — Isolarmure',
  'the-crown-tundra':'Épée/Bouclier — Couronneige',
  'brilliant-diamond-and-shining-pearl':'Diamant Étincelant / Perle Scintillante',
  'legends-arceus':'Légendes Arceus',
  'scarlet-violet':'Écarlate / Violet',
  'the-teal-mask':'Écarlate/Violet — Masque Turquoise',
  'the-indigo-disk':'Écarlate/Violet — Disque Indigo',
  'legends-za':'Légendes Z-A', 'mega-dimension':'Légendes Z-A — Méga-Dimension'
};

// Les Pokedex regionaux de la serie principale. Chacun sera interroge une fois,
// puis conserve dans le cache local.
const DEX_DISPONIBILITE = [
  'kanto', 'original-johto', 'hoenn', 'original-sinnoh', 'extended-sinnoh',
  'updated-johto', 'original-unova', 'updated-unova',
  'kalos-central', 'kalos-coastal', 'kalos-mountain', 'updated-hoenn',
  'original-alola', 'updated-alola', 'letsgo-kanto',
  'galar', 'isle-of-armor', 'crown-tundra', 'hisui',
  'paldea', 'kitakami', 'blueberry', 'lumiose-city', 'hyperspace'
];

let dispoParEspece = null;      // speciesId -> [cles de version group]
let dispoEnCours = null;

async function chargerDisponibilite(){
  if(dispoParEspece) return dispoParEspece;
  if(dispoEnCours) return dispoEnCours;

  dispoEnCours = (async function(){
    const enCache = cacheLire('dispo');
    if(enCache){
      dispoParEspece = new Map(enCache);
      return dispoParEspece;
    }

    const table = new Map();
    // En serie plutot qu'en parallele : vingt-quatre requetes simultanees vers
    // PokeAPI se font jeter, et ce chargement n'a lieu qu'une seule fois.
    for(const nom of DEX_DISPONIBILITE){
      try{
        const res = await fetch('https://pokeapi.co/api/v2/pokedex/' + nom);
        if(!res.ok) continue;
        const data = await res.json();
        const vgs = (data.version_groups || []).map(function(v){ return v.name; });
        data.pokemon_entries.forEach(function(pe){
          const id = extractId(pe.pokemon_species.url);
          if(!table.has(id)) table.set(id, []);
          const liste = table.get(id);
          vgs.forEach(function(v){ if(liste.indexOf(v) === -1) liste.push(v); });
        });
      }catch(e){ /* un Pokédex manquant ne doit pas tout bloquer */ }
    }
    dispoParEspece = table;
    cacheEcrire('dispo', Array.from(table.entries()));
    return table;
  })();

  return dispoEnCours;
}

// ---- Fiche détaillée --------------------------------------------------------
// Stats, talents, évolution et lieux d'obtention viennent de la réserve
// embarquée. Elle est indexée : les noms de lieux, de jeux, de méthodes et de
// talents vivent dans des dictionnaires partagés, les fiches n'en gardent que
// le numéro — sans quoi les mêmes chaînes seraient recopiées des dizaines de
// milliers de fois.

// L'ordre des clés PokeAPI, aligné sur STATS_NOMS (donnees.js) : c'est le même
// ordre, et le nom se lit par l'indice plutôt que par une seconde table.
const STATS_ORDRE = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
// Au-delà, seuls quelques légendaires dépassent : la barre sature sans fausser
// la comparaison entre statistiques ordinaires.
const STAT_MAX = 180;

function fichesEmbarquees(){
  if(typeof DONNEES_EMBARQUEES === 'undefined') return null;
  const f = DONNEES_EMBARQUEES.fiches;
  return (f && f.especes && f.dico) ? f : null;
}

// La fiche d'une entrée. Chaque forme a la sienne : Archéduc de Hisui n'a ni
// les statistiques ni les lieux d'Archéduc.
function ficheEmbarquee(entry){
  const f = fichesEmbarquees();
  if(!f) return null;
  return f.especes[entry.id] || f.especes[entry.speciesId] || null;
}

// Un nom du dictionnaire, toujours en français : le bouton « Anglais » ne
// traduit que les noms de Pokémon. Une ville, une capacité ou un talent gardent
// leur nom français — c'est celui qu'on lit dans le jeu auquel on joue.
// L'anglais ne sert que de filet quand la traduction manque.
function motDico(famille, id){
  const f = fichesEmbarquees();
  const e = f && f.dico[famille] && f.dico[famille][id];
  if(!e) return null;
  return e.fr || e.en;
}

function messageVide(cible, texte){
  cible.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'fiche-vide';
  p.textContent = texte;
  cible.appendChild(p);
}

// Les éditions japonaises d'origine (Rouge, Vert, Bleu), que PokeAPI distingue
// des nôtres. Personne ne les collectionne ici, et elles portent les mêmes noms
// français que les versions occidentales : on les écarte partout.
function estVersionJaponaise(slug){
  return /-japan$/.test(slug || '');
}

// ---- Qui offre quoi ---------------------------------------------------------
// PokeAPI ne dit que « Reçu en cadeau » : ni qui l'offre, ni à quel moment.
// C'est du savoir de jeu, qu'aucune table ne publie — il est donc écrit ici, à
// la main, et indexé par le lieu, qui suffit à identifier la scène. Un lieu
// absent de cette table garde le libellé d'origine : mieux vaut « Reçu en
// cadeau » qu'une affirmation inventée.
const CADEAUX = {
  'Bourg Palette':      { qui:'le Prof. Chen',        quand:'au début de l\'aventure' },
  'Bourg Geon':         { qui:'le Prof. Orme',        quand:'au début de l\'aventure' },
  'Route 101':          { qui:'le Prof. Seko',        quand:'tiré de son sac, alors qu\'il est attaqué' },
  'Bourg-en-Vol':       { qui:'le Prof. Seko',        quand:'une fois la Ligue terminée' },
  'Lac Vérité':         { qui:'le Prof. Sorbier',     quand:'dans la mallette abandonnée' },
  'Route 201':          { qui:'le Prof. Sorbier',     quand:'dans la mallette abandonnée' },
  'Renouet':            { qui:'le Prof. Keteleeria',  quand:'dans un colis déposé chez toi' },
  'Pavonnay':           { qui:'Bel',                  quand:'au début de l\'aventure' },
  'Volucité':           { qui:'Bel',                  quand:'' },
  'Quarellis':          { qui:'le Prof. Platane',     quand:'au début de l\'aventure' },
  'Illumis':            { qui:'le Prof. Platane',     quand:'dans son laboratoire' },
  'Lili’i':             { qui:'le Prof. Euphorbe',    quand:'au début de l\'aventure' },
  'Route 1':            { qui:'le Prof. Euphorbe',    quand:'au début de l\'aventure' },
  'Paddoxton':          { qui:'Tarak',                quand:'au début de l\'aventure' },
  'Doublonville':       { qui:'Bill',                 quand:'chez lui' },
  'Unionpolis':         { qui:'Bébé',                 quand:'chez elle' },
  'Safrania':           { qui:'Pierre Rochard',       quand:'à la Sylphe SARL' },
  'Dojo de la Maîtrise':{ qui:'le maître du Dojo',    quand:'' },
  'Plaine Salutation':  { qui:'le maître du Dojo',    quand:'une fois ses épreuves passées' },
  'Meetup Spot':        { qui:'un dresseur du Point de Rencontre',
                          quand:'avec une sauvegarde Let\'s Go sur la console' }
};

// Les listes de fabuleux et leurs modes d'obtention vivent dans cadeaux.js,
// chargé juste avant : la page « Cadeau Mystère » et ce bloc lisent les mêmes.

// Une barre de raccourcis au-dessus d'une longue liste : une puce par section,
// avec son compte, qui fait défiler le panneau jusqu'à elle. Sans elle, les
// deux cents CT d'un légendaire ne se parcourent qu'au jugé.
// Elle vit hors du conteneur qui défile, donc elle reste toujours visible.
function dessinerRaccourcis(barre, sections, defilant){
  if(!barre) return;
  barre.innerHTML = '';
  // Une seule section n'est pas une navigation : on ne montre rien.
  if(sections.length < 2) return;
  sections.forEach(function(s){
    const p = document.createElement('button');
    p.type = 'button';
    p.className = 'raccourci';
    p.title = 'Aller à « ' + s.libelle + ' »';
    p.appendChild(document.createTextNode(s.libelle));
    const n = document.createElement('span');
    n.className = 'raccourci-compte';
    n.textContent = String(s.compte);
    p.appendChild(n);
    p.addEventListener('click', function(){
      // offsetTop se lit par rapport au conteneur, qui est positionné : rien
      // d'autre à mesurer. La cible doit être un élément ordinaire — l'offsetTop
      // d'un élément collant renvoie sa position à l'écran, pas sa place dans
      // la liste, et le saut échouerait dès qu'on a déjà fait défiler.
      defilant.scrollTop = Math.max(0, s.cible.offsetTop - 2);
    });
    barre.appendChild(p);
  });
}

/**
 * Le rang d'une base parmi les 1 025 espèces.
 *
 * « 134 en Attaque » ne dit rien tout seul : beaucoup, peu ? Le rang tranche —
 * 33e. Il se calcule une fois par statistique, à la première fiche ouverte, et
 * ne bouge plus : la réserve ne change pas en cours de session.
 *
 * Une seule entrée par espèce, la forme de base : compter les Méga et les
 * formes régionales gonflerait le classement de doublons et ferait reculer
 * tout le monde.
 */
let rangsStats = null;

function calculerRangsStats(){
  if(rangsStats) return rangsStats;
  const f = fichesEmbarquees();
  const parStat = [[], [], [], [], [], [], []];   // les six, plus le total
  const vues = new Set();
  allEntries.forEach(function(e){
    if(!estFormeDeBase(e) || vues.has(e.speciesId)) return;
    const fiche = f.especes[e.id];
    if(!fiche || !fiche.stats) return;
    vues.add(e.speciesId);
    let total = 0;
    fiche.stats.forEach(function(v, i){ parStat[i].push(v); total += v; });
    parStat[6].push(total);
  });
  parStat.forEach(function(liste){ liste.sort(function(a, b){ return b - a; }); });
  rangsStats = parStat;
  return rangsStats;
}

// Le rang d'une valeur : combien d'espèces font strictement mieux, plus une.
function rangDe(indice, valeur){
  const liste = calculerRangsStats()[indice];
  if(!liste || !liste.length) return null;
  let mieux = 0;
  for(let i = 0; i < liste.length; i++){
    if(liste[i] > valeur) mieux++;
    else break;
  }
  return { rang: mieux + 1, sur: liste.length };
}

function dessinerStats(fiche){
  if(!fiche || !fiche.stats){ messageVide(ficheStats, 'Non renseignées pour ce Pokémon.'); return; }
  ficheStats.innerHTML = '';
  let total = 0;

  STATS_ORDRE.forEach(function(cle, i){
    const valeur = fiche.stats[i] || 0;
    total += valeur;
    ficheStats.appendChild(ligneStat(STATS_NOMS_LONGS[i], valeur, valeur / STAT_MAX,
      rangDe(i, valeur), valeur >= 100 ? 'forte' : (valeur < 50 ? 'faible' : '')));
  });

  ficheStats.appendChild(ligneStat('Total', total, 0, rangDe(6, total), 'total'));

  // Le taux de capture, distinct du taux de rencontre. Il se lit sur 255 :
  // plus il est haut, plus le Pokémon est facile à attraper. Le convertir en
  // pourcentage serait faux — la probabilité réelle dépend des PV restants, du
  // statut et de la Ball employée.
  if(fiche.capture){
    const ligne = ligneStat('Capture', fiche.capture, fiche.capture / 255, null, 'capture');
    const marge = document.createElement('span');
    marge.className = 'stat-rang';
    marge.textContent = '/ 255';
    ligne.appendChild(marge);
    ligne.title = 'Taux de capture de base, sur 255. La probabilité réelle dépend '
      + 'aussi des PV restants, du statut et de la Ball utilisée.';
    ficheStats.appendChild(ligne);
  }

  dessinerPaliers(fiche);
}

// Une ligne : le nom, la jauge, le chiffre, et le rang en marge.
function ligneStat(nom, valeur, part, rang, classe){
  const ligne = document.createElement('div');
  ligne.className = 'stat' + (classe ? ' ' + classe : '');
  const titre = document.createElement('span');
  titre.textContent = nom;
  const barre = document.createElement('i');
  if(part){
    const remplie = document.createElement('em');
    remplie.style.width = Math.min(100, part * 100) + '%';
    barre.appendChild(remplie);
  }
  const chiffre = document.createElement('b');
  chiffre.textContent = String(valeur);
  ligne.appendChild(titre); ligne.appendChild(barre); ligne.appendChild(chiffre);
  if(rang){
    const marge = document.createElement('span');
    // Le premier centile se distingue : c'est là que « remarquable » commence.
    marge.className = 'stat-rang' + (rang.rang <= Math.max(10, rang.sur / 20) ? ' haut' : '');
    marge.innerHTML = rang.rang + '<sup>e</sup>';
    marge.title = rang.rang + 'e sur ' + rang.sur + ' espèces';
    ligne.appendChild(marge);
  }
  return ligne;
}

/**
 * Ce que la base donne vraiment en jeu.
 *
 * Une base ne se lit pas : ce qu'on voit dans le jeu, c'est la statistique
 * finale. On donne donc la fourchette complète — IV et EV au minimum et nature
 * défavorable, puis IV 31, EV 252 et nature favorable — aux deux niveaux qui
 * comptent, celui des combats en ligne et celui du bout du jeu.
 *
 * La formule est celle de calculerStat(), dans combat.js : la même que la page
 * Stratégie applique, pour que les deux écrans ne se contredisent jamais.
 */
function dessinerPaliers(fiche){
  if(!fichePaliers) return;
  fichePaliers.innerHTML = '';
  if(typeof calculerStat !== 'function' || !fiche.stats) return;

  const bloc = document.createElement('div');
  bloc.className = 'paliers';
  const titre = document.createElement('p');
  titre.className = 'paliers-titre';
  titre.innerHTML = 'Ce que ça donne en jeu <span>— du pire au meilleur jet</span>';
  bloc.appendChild(titre);

  const defile = document.createElement('div');
  defile.className = 'tableau-defile';
  const table = document.createElement('table');
  table.className = 'paliers-table';
  table.innerHTML = '<thead><tr><th>&nbsp;</th><th>Niveau 50</th><th>Niveau 100</th></tr></thead>';
  const corps = document.createElement('tbody');

  STATS_ORDRE.forEach(function(cle, i){
    const base = fiche.stats[i] || 0;
    const tr = document.createElement('tr');
    const nom = document.createElement('td');
    nom.textContent = STATS_NOMS_LONGS[i];
    tr.appendChild(nom);
    [50, 100].forEach(function(niveau){
      const td = document.createElement('td');
      const bas = calculerStat(base, 0, 0, niveau, i === 0 ? 1 : 0.9, i === 0);
      const haut = calculerStat(base, 31, 252, niveau, i === 0 ? 1 : 1.1, i === 0);
      const min = document.createElement('span');
      min.className = 'min';
      min.textContent = String(bas);
      td.appendChild(min);
      td.appendChild(document.createTextNode(' – ' + haut));
      tr.appendChild(td);
    });
    corps.appendChild(tr);
  });

  table.appendChild(corps);
  defile.appendChild(table);
  bloc.appendChild(defile);
  fichePaliers.appendChild(bloc);
}

/**
 * Les talents, une carte chacun.
 *
 * L'ancienne version posait une pastille avec le nom, et rangeait « Talent
 * caché » dans un title="" qu'aucun clavier n'atteint. La réserve porte depuis
 * le 23 août 2026 le texte du jeu ET l'effet chiffré pour les 312 talents : le
 * jeu écrit « subit moins de dégâts », la réserve « divise par deux ». Les deux
 * phrases méritent d'être lues.
 *
 * La dernière ligne dit si le calculateur en tient compte. combat.js porte
 * TALENTS_COMBAT, la table courte des talents qui changent un calcul de
 * dégâts : Multiécaille y est, Attention non. Le dire ici évite de le
 * découvrir en constatant qu'un talent choisi ne change rien.
 */
function dessinerTalents(fiche){
  ficheTalents.innerHTML = '';
  if(!fiche || !fiche.talents || !fiche.talents.length){
    messageVide(ficheTalents, 'Non renseignés pour ce Pokémon.');
    return;
  }
  const f = fichesEmbarquees();
  fiche.talents.forEach(function(t, rang){
    const id = t[0], cache = !!t[1];
    const info = f.dico.talents[id] || {};
    const carte = document.createElement('article');
    carte.className = 'talent' + (cache ? ' cache' : '');

    const titreRang = document.createElement('span');
    titreRang.className = 'talent-rang';
    titreRang.textContent = cache ? 'Talent caché' : 'Talent ' + (rang + 1) + '  ·  ordinaire';
    carte.appendChild(titreRang);

    const nom = document.createElement('h5');
    nom.className = 'talent-nom';
    nom.textContent = info.fr || ('Talent ' + id);
    if(info.en && info.en !== info.fr){
      const en = document.createElement('span');
      en.textContent = info.en;
      nom.appendChild(en);
    }
    carte.appendChild(nom);

    if(info.jeu){
      const jeu = document.createElement('p');
      jeu.className = 'talent-jeu';
      const b = document.createElement('b');
      b.textContent = 'Texte du jeu';
      const cite = document.createElement('cite');
      cite.textContent = '« ' + info.jeu + ' »';
      jeu.appendChild(b); jeu.appendChild(cite);
      carte.appendChild(jeu);
    }

    if(info.effet){
      const effet = document.createElement('p');
      effet.className = 'talent-effet';
      const b = document.createElement('b');
      b.textContent = 'Effet';
      const code = document.createElement('code');
      code.textContent = info.effet;
      effet.appendChild(b); effet.appendChild(code);
      carte.appendChild(effet);
    }

    const notes = document.createElement('div');
    notes.className = 'talent-notes';
    // TALENTS_COMBAT est indexée par l'identifiant du talent, pas par son nom.
    const compte = typeof TALENTS_COMBAT !== 'undefined'
      && Object.prototype.hasOwnProperty.call(TALENTS_COMBAT, id);
    const puce = document.createElement('span');
    puce.className = 'note-pastille' + (compte ? ' compte' : '');
    puce.innerHTML = '<i>' + (compte ? '●' : '○') + '</i> ';
    puce.appendChild(document.createTextNode(compte
      ? 'Pris en compte par le calculateur de dégâts'
      : 'Sélectionnable dans le calculateur, sans effet sur les dégâts'));
    notes.appendChild(puce);
    if(cache){
      const or = document.createElement('span');
      or.className = 'note-pastille or';
      or.innerHTML = '<i>✦</i> ';
      or.appendChild(document.createTextNode('Ne s\'obtient pas par une capture ordinaire'));
      notes.appendChild(or);
    }
    carte.appendChild(notes);

    ficheTalents.appendChild(carte);
  });

  // Deux cartes par ligne. À nombre impair, la dernière prend la ligne entière
  // plutôt que de laisser une case vide à côté d'elle — c'est le seul endroit
  // de la fiche où le compte des talents décide de la mise en page.
  ficheTalents.classList.toggle('impair', fiche.talents.length % 2 === 1);
}

/**
 * La teinte de la fiche, tirée du type principal.
 *
 * Toute la mise en page s'y accorde — le voile derrière le portrait, le liseré
 * des blocs, les puces. Une fiche de Dragon n'a pas la couleur d'une fiche de
 * Plante, et c'est le seul endroit où la couleur d'un type porte du sens : les
 * puces de type, elles, sont des images depuis longtemps.
 */
function appliquerTeinte(ids){
  const carte = previewOverlay.querySelector('.preview-card');
  if(!carte) return;
  const couleur = (ids && ids.length && TYPE_COULEURS[ids[0]]) || '#5269ac';
  carte.style.setProperty('--teinte', couleur);
  carte.style.setProperty('--teinte-appui', couleur);
  carte.style.setProperty('--teinte-voile', voile(couleur));
}

// Le même ton, en très transparent : le voile du portrait et des en-têtes.
function voile(hex){
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',.12)';
}

/**
 * Le gabarit : six chiffres qu'aucun bloc n'affichait.
 *
 * Taille, poids, taux de capture, cycles d'éclosion, courbe d'expérience,
 * bonheur de base. PokeAPI les donne en décimètres et en hectogrammes — la
 * division se fait ici, pour ne pas perdre le dixième des espèces qui pèsent
 * moins d'un kilo.
 */
function dessinerGabarit(entry, fiche){
  if(!ficheGabarit) return;
  ficheGabarit.innerHTML = '';
  if(!fiche) return;
  const f = fichesEmbarquees();
  const courbe = fiche.courbe && f.dico.courbes ? f.dico.courbes[fiche.courbe] : null;
  const cases = [
    ['Taille', fiche.taille != null ? (fiche.taille / 10).toFixed(1).replace('.', ',') : null, 'm'],
    ['Poids', fiche.poids != null ? (fiche.poids / 10).toFixed(1).replace('.', ',') : null, 'kg'],
    ['Capture', fiche.capture || null, ' / 255'],
    ['Éclosion', fiche.eclosion != null ? fiche.eclosion : null, 'cycles'],
    ['Courbe d\'exp.', courbe ? (courbe.fr || courbe.en) : null, ''],
    ['Bonheur', fiche.bonheur != null ? fiche.bonheur : null, '']
  ];
  cases.forEach(function(c){
    if(c[1] === null || c[1] === undefined) return;
    const bloc = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = c[0];
    const dd = document.createElement('dd');
    dd.textContent = String(c[1]);
    if(c[2]){
      const petit = document.createElement('small');
      petit.textContent = c[2] === ' / 255' ? c[2] : ' ' + c[2];
      dd.appendChild(petit);
    }
    bloc.appendChild(dt); bloc.appendChild(dd);
    ficheGabarit.appendChild(bloc);
  });
}

// ---- La notice du Pokédex ---------------------------------------------------
// La fiche disait tout ce qu'une espèce FAIT — ses statistiques, ses talents,
// ses faiblesses — et rien de ce qu'elle EST. C'est pourtant la seule chose
// qu'un Pokédex ait jamais eu à dire.
//
// Elle ferme la colonne de gauche, celle qui décrit le Pokémon — la droite dit
// où le trouver. C'est aussi elle qui en rattrape la hauteur : mesurée sur
// Dracolosse, la colonne gauche s'arrêtait cent cinquante pixels avant sa
// voisine, et le vide se voyait.
// Treize notices sur 1 025 citent déjà quelque chose : « On l'appelle
// « l'avatar de la mer ». » Mises entre guillemets à leur tour, elles ouvrent
// et ferment deux fois de suite le même signe, et l'on ne sait plus où la
// citation s'arrête. L'usage français double les guillemets vers l'intérieur —
// les courbes à l'intérieur des chevrons. On ne touche pas à la réserve, qui
// doit rester le texte du jeu : c'est l'affichage qui s'accorde.
function guillemetsImbriques(texte){
  return String(texte).replace(/«\s*/g, '“').replace(/\s*»/g, '”');
}

// Le rang de l'ouverture en cours. La réserve des notices arrive après un
// aller-retour ; sans ce jeton, ouvrir une fiche puis une autre aussitôt
// poserait la notice de la première sur la seconde.
let noticeJeton = 0;

async function dessinerNotice(entry){
  if(!ficheNotice || !ficheBlocNotice) return;
  // Le bloc part masqué : une réserve qui n'arrive pas, ou une espèce sans
  // notice, ne doit pas laisser un cadre vide en bas de colonne.
  ficheBlocNotice.style.display = 'none';
  ficheNotice.innerHTML = '';
  const jeton = ++noticeJeton;
  try{
    await chargerDescriptions();
  }catch(e){
    return;              // hors ligne, ou réserve absente : pas de bloc
  }
  if(jeton !== noticeJeton) return;      // une autre fiche a été ouverte depuis
  if(typeof descriptionEspece !== 'function') return;
  // La notice suit l'onglet : un Pokédex de Rouge et Bleu cite Rouge et Bleu.
  // Hors d'un onglet de jeu — le Pokédex Pokémon HOME — on prend la plus
  // récente qu'on ait.
  const notice = descriptionEspece(entry.speciesId, currentTab)
    || descriptionEspece(entry.id, currentTab);
  if(!notice || !notice.entrees || !notice.entrees.length) return;

  // Une entrée par VERSION, et non une par jeu. Or et Argent n'ont pas la même
  // notice, ni X et Y, ni Épée et Bouclier — et quand les deux versions
  // partagent un texte, on les nomme quand même toutes les deux : c'est la
  // question qu'on se pose en ouvrant un Pokédex de Rouge, pas de « Rouge et
  // Bleu ».
  const carte = ficheNotice;

  notice.entrees.forEach(function(e){
    const version = document.createElement('span');
    version.className = 'notice-version';
    version.textContent = 'Pokémon ' + e.version;
    carte.appendChild(version);

    const texte = document.createElement('p');
    texte.className = 'notice-texte';
    const cite = document.createElement('cite');
    cite.textContent = '« ' + guillemetsImbriques(e.texte) + ' »';
    texte.appendChild(cite);
    carte.appendChild(texte);
  });

  const pied = document.createElement('div');
  pied.className = 'notice-pied';
  // notice.jeu est une CLÉ d'onglet. On tolère qu'il porte un simple libellé :
  // le relevé Poképédia met plus d'une heure, et pendant ce temps la réserve
  // sur le disque est encore celle de PokeAPI, qui nommait le jeu en clair.
  const jeu = gameByKey[notice.jeu];
  const nomJeu = jeu ? jeu.title : (typeof notice.jeu === 'string' ? notice.jeu : '');
  if(nomJeu){
    const puce = document.createElement('span');
    puce.className = 'note-pastille' + (notice.propre ? ' compte' : '');
    puce.appendChild(document.createTextNode('D\'après ' + nomJeu));
    pied.appendChild(puce);
  }
  // Sur l'onglet d'un jeu où l'espèce ne figure pas, on rend la notice d'un
  // autre jeu plutôt que rien — mais on ne laisse pas croire que c'est celle
  // du jeu ouvert. Le test porte sur « faux » et non sur « pas vrai » : une
  // réserve qui ignore ce champ ne doit pas faire apparaître l'avertissement.
  if(notice.propre === false && gameByKey[currentTab]){
    const ailleurs = document.createElement('span');
    ailleurs.className = 'note-pastille ailleurs';
    ailleurs.appendChild(document.createTextNode('Pas de notice dans ce jeu'));
    pied.appendChild(ailleurs);
  }
  if(pied.childNodes.length) carte.appendChild(pied);

  ficheBlocNotice.style.display = '';
}

// ---- Les numéros régionaux --------------------------------------------------
// Le portrait porte le numéro national. Il ne dit rien de la place que
// l'espèce occupe dans le jeu qu'on a sous la main : Dracolosse est le n° 149
// au national et le n° 66 à Kanto, et c'est le second qu'on lit à l'écran en
// jouant. La donnée était déjà embarquée — vingt-quatre Pokédex dans
// DONNEES_EMBARQUEES.dex — et aucun écran ne l'affichait.
const DEX_REGIONS_FR = {
  'kanto': 'Kanto', 'original-johto': 'Johto', 'updated-johto': 'Johto (HG/SS)',
  'hoenn': 'Hoenn', 'updated-hoenn': 'Hoenn (RO/SA)',
  'original-sinnoh': 'Sinnoh', 'extended-sinnoh': 'Sinnoh (Platine)',
  'original-unova': 'Unys', 'updated-unova': 'Unys (N2/B2)',
  'kalos-central': 'Kalos — centre', 'kalos-coastal': 'Kalos — côte',
  'kalos-mountain': 'Kalos — montagne',
  'original-alola': 'Alola', 'updated-alola': 'Alola (US/UL)',
  'letsgo-kanto': 'Kanto (Let\'s Go)',
  'galar': 'Galar', 'isle-of-armor': 'Isolarmure', 'crown-tundra': 'Couronneige',
  'hisui': 'Hisui', 'paldea': 'Paldea',
  // Les extensions se nomment par leur région et non par le titre du contenu
  // téléchargeable : « Isolarmure » et « Couronneige » sont les deux îles
  // d'Épée/Bouclier, « Masque Turquoise » et « Disque Indigo » les deux volets
  // d'Écarlate/Violet — dont la région, Kitakami, ne dit rien à personne.
  //
  // « Toundra » traînait ici à la place de Couronneige. Ce n'était pas une
  // traduction mais un mot anglais qui se trouve exister en français : la
  // Crown Tundra s'appelle Couronneige, comme l'Isle of Armor s'appelle
  // Isolarmure — les noms qu'emploient Poképédia, Pokékalos, et le relevé des
  // Pokédex de ce projet, qui en tire ses adresses (outils/relever-pokedex.py).
  'kitakami': 'Masque Turquoise',
  'blueberry': 'Disque Indigo', 'lumiose-city': 'Illumis', 'hyperspace': 'Hyperespace'
};

function dessinerDexRegionaux(entry){
  if(!ficheDexRegionaux) return;
  ficheDexRegionaux.innerHTML = '';
  const dex = (typeof DONNEES_EMBARQUEES !== 'undefined') && DONNEES_EMBARQUEES.dex;
  if(!dex) return;

  const trouves = [];
  Object.keys(dex).forEach(function(cle){
    const liste = dex[cle] || [];
    for(let i = 0; i < liste.length; i++){
      if(liste[i][0] === entry.speciesId){ trouves.push([cle, liste[i][1]]); return; }
    }
  });
  if(!trouves.length) return;

  // Sur l'onglet d'un jeu, ses Pokédex passent devant : c'est ce numéro-là
  // qu'on a sous les yeux. Ailleurs, du plus récent au plus ancien.
  const jeu = gameByKey[currentTab];
  const siens = [];
  if(jeu){
    [].concat(jeu.regional && jeu.regional.dexes || [],
              jeu.second && jeu.second.dexes || [])
      .forEach(function(d){ siens.push(d); });
  }
  // Par génération, de la première à la dernière : DEX_DISPONIBILITE est déjà
  // dans cet ordre. C'est le seul classement qu'on puisse deviner sans le lire.
  //
  // Le Pokédex du jeu ouvert ne passe PLUS devant : mis en tête, il rompait la
  // suite et l'ensemble paraissait rangé au hasard. Il se repère à son liseré
  // — et s'il tombait au-delà des six montrées, la bande s'ouvre déjà dépliée
  // plutôt que de le cacher.
  trouves.sort(function(a, b){
    return DEX_DISPONIBILITE.indexOf(a[0]) - DEX_DISPONIBILITE.indexOf(b[0]);
  });

  // Pikachu figure dans vingt-deux Pokédex : la bande passerait sur quatre
  // lignes et repousserait les états de capture hors de l'écran. Six, puis un
  // compte — la même convention que « + 23 autres routes » de l'obtention.
  // Toutes les puces sont posées ; au-delà de six, les suivantes attendent
  // repliées. Six, parce que Pikachu figure dans dix-sept Pokédex régionaux et
  // que la bande pousserait sinon les états de capture hors de l'écran.
  //
  // Un dépliage sur place, et non une bulle flottante : la fiche est en
  // overflow:hidden et son contenu défile, une bulle s'y ferait rogner. Le
  // title="" natif qu'il remplace rendait une ligne illisible d'un seul tenant.
  const MONTRES = 6;
  trouves.forEach(function(d, i){
    const puce = document.createElement('span');
    puce.className = 'dex-reg' + (siens.indexOf(d[0]) === -1 ? '' : ' ici')
      + (i >= MONTRES ? ' en-plus' : '');
    const no = document.createElement('b');
    no.textContent = 'n° ' + d[1];
    puce.appendChild(no);
    puce.appendChild(document.createTextNode(DEX_REGIONS_FR[d[0]] || d[0]));
    ficheDexRegionaux.appendChild(puce);
  });

  if(trouves.length > MONTRES){
    const reste = trouves.length - MONTRES;
    // Le Pokédex du jeu ouvert est le seul qu'on vienne chercher : s'il tombe
    // hors des six premières, la bande s'ouvre dépliée plutôt que de le cacher
    // derrière un bouton.
    const sienCache = trouves.some(function(d, i){
      return i >= MONTRES && siens.indexOf(d[0]) !== -1;
    });
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'dex-reg-plus';
    const poser = function(ouvert){
      ficheDexRegionaux.classList.toggle('deplie', ouvert);
      bouton.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
      bouton.textContent = ouvert ? '− Replier' : ('+ ' + reste + ' autres');
    };
    poser(sienCache);
    bouton.addEventListener('click', function(){
      poser(!ficheDexRegionaux.classList.contains('deplie'));
    });
    ficheDexRegionaux.appendChild(bouton);
  }
}

// Le nom anglais et la catégorie, sous le nom : deux renseignements qui
// n'avaient pas de place et que l'on cherche pourtant en premier sur une fiche.
function dessinerNomAutre(entry){
  if(!ficheNomAutre) return;
  const autre = langueNoms === 'fr' ? entry.displayEn : entry.display;
  ficheNomAutre.textContent = autre && autre !== nomAffiche(entry) ? autre : '';
}

// La condition d'une évolution, en clair. Sert à la lignée comme au bloc
// « Où l'obtenir » : un Pokémon absent de l'herbe s'obtient le plus souvent
// ainsi, et le dire vaut mieux qu'un message d'ignorance.
/**
 * Le seuil de bonheur d'une évolution — il tient au JEU, pas à l'espèce.
 *
 * 220 de la deuxième à la septième génération, 160 depuis la huitième. La
 * réserve n'en porte qu'une valeur par évolution, et se contredit d'une ligne
 * à l'autre : PokeAPI donne 220 pour Pichu → Pikachu et 160 pour
 * Riolu → Lucario, alors que c'est la même mécanique. On la recalcule donc
 * ici, et la fiche cesse d'annoncer 160 sur Diamant/Perle.
 *
 * Diamant Étincelant / Perle Scintillante garde 220 : c'est un remake fidèle
 * de la quatrième génération, dont il reprend les seuils, malgré sa sortie
 * en huitième. Légendes Z-A suit son époque, à 160.
 *
 * Let's Go n'a aucune évolution par bonheur — et de toute façon son Pokédex
 * s'arrête à Kanto, donc aucune n'y apparaît. La valeur nulle retire la
 * mention plutôt que d'afficher un seuil qui n'existe pas.
 */
const BONHEUR_PAR_JEU = {
  gsc: 220, cristal: 220,
  rse: 220, emeraude: 220, frlg: 220,
  dp: 220, pt: 220, hgss: 220, bdsp: 220,
  bw: 220, b2w2: 220,
  xy: 220, oras: 220,
  sm: 220, usum: 220,
  letsgo: null,
  swsh: 160, pla: 160,
  sv: 160, za: 160
};

// Hors onglet de jeu — le Pokédex Pokémon HOME — aucun jeu ne tranche : on
// donne le seuil actuel, en disant ce qu'il valait avant.
const BONHEUR_ACTUEL = 160;
const BONHEUR_ANCIEN = 220;

function seuilBonheur(){
  if(!gameByKey[currentTab]) return { valeur: BONHEUR_ACTUEL, ancien: true };
  const v = BONHEUR_PAR_JEU[currentTab];
  return { valeur: v === undefined ? BONHEUR_ACTUEL : v, ancien: false };
}

function conditionEvolution(det){
  const bouts = [];
  const declencheur = motDico('declencheurs', det.declencheur);
  if(declencheur) bouts.push(declencheur);
  if(det.niveau) bouts.push('niveau ' + det.niveau);

  const objet = det.objet ? motDico('objets', det.objet) : null;
  if(objet) bouts.push(objet);
  const tenu = det.objetTenu ? motDico('objets', det.objetTenu) : null;
  if(tenu) bouts.push('en tenant ' + tenu);

  // Phyllali et Givrali : le rocher moussu et le rocher glacé se trouvent dans
  // un lieu précis. Sans lui, la condition se réduisait à « montée de niveau »
  // et n'apprenait rien.
  const lieu = det.lieu ? motDico('lieux', det.lieu) : null;
  if(lieu) bouts.push((det.rocher ? 'près du rocher, à ' : 'à ') + lieu);
  else if(det.rocher) bouts.push('près d\'un rocher particulier');

  const capacite = det.capacite ? motDico('attaques', det.capacite) : null;
  if(capacite) bouts.push('en connaissant ' + capacite);
  // Nymphali : une capacité de type Fée, et de l'affection.
  if(det.typeCapacite && typeof TYPES_FR !== 'undefined' && TYPES_FR[det.typeCapacite]){
    bouts.push('en connaissant une capacité ' + TYPES_FR[det.typeCapacite]);
  }
  if(det.affection) bouts.push('affection ' + det.affection);
  // Le seuil vient du jeu ouvert, et non de la réserve : voir seuilBonheur().
  if(det.bonheur){
    const s = seuilBonheur();
    if(s.valeur){
      bouts.push('bonheur ' + s.valeur
        + (s.ancien ? ' (' + BONHEUR_ANCIEN + ' avant la 8ᵉ génération)' : ''));
    }
  }
  if(det.genre) bouts.push(det.genre === 1 ? 'femelle uniquement' : 'mâle uniquement');
  if(det.moment) bouts.push(det.moment === 'day' ? 'le jour' : 'la nuit');
  return bouts;
}

// Le nom d'une espèce dans la langue choisie, retrouvé parmi les entrées.
// ---- Les espèces citées dans « Où l'obtenir » deviennent cliquables --------
// « Faire évoluer Kadabra » ouvre la fiche de Kadabra — sur l'onglet où l'on
// est déjà, donc le Kadabra de CE jeu. Sans ça il fallait fermer la fiche,
// retrouver Kadabra dans la grille, et la rouvrir.
let indexNoms = null;

function especeParNom(nom){
  if(!indexNoms){
    indexNoms = new Map();
    // Le français d'abord : c'est la langue du relevé. L'anglais suit, pour
    // que le bouton « Anglais » n'enlève pas le lien.
    allEntries.forEach(function(e){
      if(e.displayEn) indexNoms.set(e.displayEn.toLowerCase(), e);
    });
    allEntries.forEach(function(e){
      if(e.display) indexNoms.set(e.display.toLowerCase(), e);
    });
  }
  return indexNoms.get(String(nom).trim().toLowerCase()) || null;
}

function boutonEspece(entry){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'obt-espece';
  b.textContent = nomAffiche(entry);
  b.title = 'Ouvrir la fiche de ' + nomAffiche(entry);
  b.addEventListener('click', function(ev){
    // La ligne d'obtention n'est pas cliquable elle-même aujourd'hui, mais
    // elle pourrait le devenir : le clic s'arrête ici.
    ev.stopPropagation();
    openPreview(entry, null);
  });
  return b;
}

/**
 * L'expression qui reconnaît un nom d'espèce dans une phrase.
 *
 * Les noms FRANÇAIS seulement : le relevé est en français, et y ajouter les
 * noms anglais doublerait les risques de collision sans rien apporter. C'est
 * l'entrée trouvée qui décide ensuite de la langue affichée, via nomAffiche().
 *
 * Du plus long au plus court, pour que « Nidoran♂ » gagne sur « Nidoran » et
 * « Miaouss de Galar » sur « Miaouss ». Les deux gardes empêchent de couper un
 * mot : sans eux « Abondance » contiendrait « Abo », et « Volucité » « Volu ».
 * Ils tolèrent les accents, sans quoi « Rosélia » se couperait sur son « é ».
 */
let regexNoms = null;

function regexDesEspeces(){
  if(regexNoms) return regexNoms;
  const vus = new Set(), noms = [];
  allEntries.forEach(function(e){
    if(e.display && !vus.has(e.display)){ vus.add(e.display); noms.push(e.display); }
  });
  noms.sort(function(a, b){ return b.length - a.length; });
  const echapper = function(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  regexNoms = new RegExp(
    '(?<![A-Za-zÀ-ÿ0-9])(' + noms.map(echapper).join('|') + ')(?![A-Za-zÀ-ÿ0-9])', 'g');
  return regexNoms;
}

/**
 * Pose un texte d'obtention en rendant cliquable chaque espèce qu'il nomme.
 *
 * Toutes les mentions, et pas seulement « Faire évoluer X » : le relevé dit
 * aussi « Échange contre un Piclairon », « appelé en renfort par Chrysacier »,
 * « Faille Arbok, Rosélia et Herbizarre », « Papilusion (Antre 5, 20 %) ». Sur
 * les 5 937 textes de la réserve, 10 246 occurrences ont été relevées et
 * l'échantillon n'en donne aucune qui ne soit une vraie référence — ces textes
 * décrivent des rencontres, un nom d'espèce y désigne toujours une espèce.
 *
 * L'espèce de la fiche ouverte est laissée en texte : un lien vers soi-même
 * n'irait nulle part.
 */
/**
 * Les noms de lieux qui contiennent un nom d'espèce.
 *
 * Douze sur mille quatre-vingt-seize : Route Mammochon, Tunnel Taupiqueur,
 * Île Noadkoko, Lac Coupenotte, Lac Milobellus, Glacier Séracrawl, Antre
 * Nosferapti, Mont des Capumain… Sans eux, « Lac Milobellus Nord » posait un
 * lien vers Milobellus, qui n'a rien à voir avec l'endroit.
 *
 * On les masque AVANT de chercher les espèces. Deux libellés dégénérés du
 * relevé — « Inconnu; que des Ptitard » — y perdent un lien qui aurait eu du
 * sens ; c'est le prix, et il est bas.
 */
let regexLieuxPiegeux = null;

function regexDesLieuxPiegeux(){
  if(regexLieuxPiegeux !== null) return regexLieuxPiegeux;
  const f = fichesEmbarquees();
  const lieux = (f && f.dico.lieux) || {};
  const rx = regexDesEspeces();
  const noms = [];
  Object.keys(lieux).forEach(function(id){
    const nom = (lieux[id] && (lieux[id].fr || lieux[id].en)) || '';
    if(!nom) return;
    rx.lastIndex = 0;
    const m = rx.exec(nom);
    // Un lieu qui EST un nom d'espèce n'est pas un piège : c'est le nom.
    if(m && m[1] !== nom) noms.push(nom);
  });
  if(!noms.length){ regexLieuxPiegeux = false; return false; }
  noms.sort(function(a, b){ return b.length - a.length; });
  const echapper = function(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  regexLieuxPiegeux = new RegExp(noms.map(echapper).join('|'), 'g');
  return regexLieuxPiegeux;
}

function poserTexteObtention(el, texte, exclure){
  el.textContent = '';
  const src = String(texte);

  // Les portions de texte où un nom d'espèce ne désigne pas une espèce.
  const masques = [];
  const rl = regexDesLieuxPiegeux();
  if(rl){
    rl.lastIndex = 0;
    let l;
    while((l = rl.exec(src))) masques.push([l.index, l.index + l[0].length]);
  }
  const masque = function(debut, fin){
    return masques.some(function(p){ return debut < p[1] && fin > p[0]; });
  };

  const rx = regexDesEspeces();
  rx.lastIndex = 0;
  let dernier = 0, m;
  while((m = rx.exec(src))){
    const fin = m.index + m[1].length;
    const e = especeParNom(m[1]);
    if(!e || (exclure && e.speciesId === exclure) || masque(m.index, fin)) continue;
    if(m.index > dernier) el.appendChild(document.createTextNode(src.slice(dernier, m.index)));
    el.appendChild(boutonEspece(e));
    dernier = fin;
  }
  if(dernier < src.length) el.appendChild(document.createTextNode(src.slice(dernier)));
}

function nomParEspece(speciesId){
  const e = allEntries.find(function(x){ return x.speciesId === speciesId && x.id === speciesId; })
    || allEntries.find(function(x){ return x.speciesId === speciesId; });
  return e ? nomAffiche(e) : ('n°' + speciesId);
}

/**
 * Les points d'effort donnés quand on bat ce Pokémon.
 *
 * C'est la question « où entraîner pour de la Vitesse ? », prise par l'autre
 * bout : on regarde une fiche et on apprend ce qu'elle rapporte. La réserve ne
 * porte la ligne que si l'espèce donne quelque chose — les Pokémon à zéro
 * partout n'ont rien à afficher.
 */
function dessinerEffort(fiche){
  if(!ficheEffort) return;
  ficheEffort.innerHTML = '';
  const ev = fiche && fiche.effort;
  if(!ev){
    ficheEffort.textContent = 'Ne donne aucun point d\'effort.';
    ficheEffort.className = 'effort vide';
    return;
  }
  ficheEffort.className = 'effort';

  const titre = document.createElement('span');
  titre.className = 'effort-titre';
  titre.textContent = 'Points d\'effort donnés';
  ficheEffort.appendChild(titre);

  ev.forEach(function(n, i){
    if(!n) return;
    const p = document.createElement('span');
    p.className = 'effort-puce';
    p.textContent = '+' + n + ' ' + STATS_NOMS_LONGS[i];
    p.title = 'Battre ce Pokémon donne ' + n + ' point(s) d\'effort en ' + STATS_NOMS[i];
    ficheEffort.appendChild(p);
  });
}

/**
 * Les groupes d'œufs, et le raccourci vers la page Reproduction.
 *
 * Les groupes appartiennent à l'espèce : Raichu d'Alola pond comme Raichu. On
 * ne le répète pas sur chaque fiche, mais c'est ce qui explique qu'une forme
 * régionale affiche les groupes de sa forme d'origine.
 */
// Le groupe « Inconnu », celui de ceux qui ne pondent pas.
const OEUF_INCONNU = 15;

/**
 * L'espèce que celle-ci donne en évoluant, ou null.
 */
function evolutionDe(speciesId){
  const f = fichesEmbarquees();
  if(!f) return null;
  const cles = Object.keys(f.especes);
  for(let i = 0; i < cles.length; i++){
    const id = parseInt(cles[i], 10);
    const fi = f.especes[cles[i]];
    if(id <= 10000 && fi && fi.evo && fi.evo.de === speciesId) return id;
  }
  return null;
}

/**
 * Un bébé : il ne pond pas, mais son évolution le pond.
 *
 * « Groupe Inconnu et il évolue » ne suffirait pas — Cosmog évolue en
 * Cosmovum, Type:0 en Silvallié, et aucun des deux ne s'obtient d'un œuf :
 * leurs évolutions sont du groupe Inconnu elles aussi. Ce qui distingue un
 * bébé, c'est que son évolution, ELLE, peut se reproduire.
 */
function especeBebe(speciesId, groupes){
  if(!groupes || groupes.indexOf(OEUF_INCONNU) === -1) return null;
  const suite = evolutionDe(speciesId);
  if(!suite) return null;
  const f = fichesEmbarquees();
  const fs = f && f.especes[suite];
  const go = (fs && fs.oeufs) || [];
  if(!go.length || go.indexOf(OEUF_INCONNU) !== -1) return null;
  return suite;
}

function dessinerOeufs(entry, fiche){
  if(!ficheOeufs) return;
  ficheOeufs.innerHTML = '';
  const groupes = (fiche && fiche.oeufs) ? fiche.oeufs : [];
  if(!groupes.length){
    messageVide(ficheOeufs, 'Groupes d\'œufs non répertoriés.');
    return;
  }

  const puces = document.createElement('div');
  puces.className = 'repro-puces';
  groupes.forEach(function(g){
    const p = document.createElement('span');
    p.className = 'repro-puce g' + g;
    p.textContent = motDico('oeufs', g) || ('groupe ' + g);
    puces.appendChild(p);
  });
  ficheOeufs.appendChild(puces);

  // Le taux de genre décide de la moitié des reproductions : un Leveinard est
  // toujours femelle, un Débugant toujours mâle, et deux de la même espèce ne
  // pondront jamais ensemble.
  const genre = lireGenre(fiche.genre);
  const ligne = document.createElement('div');
  ligne.className = 'genre' + (genre.asexue ? ' asexue' : '');
  if(genre.asexue){
    const p = document.createElement('span');
    p.className = 'genre-texte';
    p.textContent = 'Asexué — ne se reproduit qu\'avec Métamorph';
    ligne.appendChild(p);
  } else {
    const barre = document.createElement('span');
    barre.className = 'genre-barre';
    const m = document.createElement('i');
    m.className = 'male'; m.style.width = genre.male + '%';
    const f = document.createElement('i');
    f.className = 'femelle'; f.style.width = genre.femelle + '%';
    barre.appendChild(m); barre.appendChild(f);
    ligne.appendChild(barre);
    const p = document.createElement('span');
    p.className = 'genre-texte';
    p.textContent = genre.texte;
    ligne.appendChild(p);
  }
  ligne.title = 'Taux de genre : ' + genre.texte;
  ficheOeufs.appendChild(ligne);

  const note = document.createElement('p');
  note.className = 'repro-note';
  const bebe = especeBebe(entry.speciesId, groupes);
  if(bebe){
    // Sans cette nuance, la fiche disait « ne se reproduit avec personne »
    // juste sous une ligne d'obtention qui dit « Faire reproduire Pikachu ».
    // Les deux sont vraies, et se contredisent en apparence.
    note.textContent = 'Groupe Inconnu : il ne pond pas lui-même. On l\'obtient en '
      + 'faisant pondre ' + nomParEspece(bebe) + ', son évolution.';
  } else if(groupes.indexOf(OEUF_INCONNU) !== -1){
    note.textContent = 'Groupe Inconnu : ce Pokémon ne se reproduit avec personne.';
  } else if(groupes.indexOf(13) !== -1){
    note.textContent = 'Métamorph s\'accouple avec tout ce qui n\'est pas du groupe Inconnu.';
  } else {
    note.textContent = 'Se reproduit avec tout Pokémon partageant l\'un de ces groupes, '
      + 'ainsi qu\'avec Métamorph.';
  }
  ficheOeufs.appendChild(note);

  // Le bouton mène à la liste complète : la fiche dit le groupe, la page dit
  // avec qui. Les deux questions ne se posent pas au même moment.
  const aller = document.createElement('button');
  aller.type = 'button';
  aller.className = 'toggle-btn fiche-oeufs-aller';
  aller.textContent = 'Voir les partenaires compatibles';
  aller.addEventListener('click', function(){
    if(typeof closePreview === 'function') closePreview();
    showPage('reproduction');
    if(typeof ouvrirCoParent === 'function') ouvrirCoParent(entry);
  });
  ficheOeufs.appendChild(aller);
}

/**
 * Les espèces que le jeu ouvert connaît, d'après le relevé des lieux.
 *
 * Ni la génération du jeu, ni son Pokédex régional : les deux se trompent, en
 * sens contraires. La génération est trop large — Diamant Étincelant est de la
 * huitième et n'a pourtant pas Nymphali. Le Pokédex régional est trop étroit —
 * celui de Hoenn ne liste pas Mentali, qui s'obtient pourtant dans Rubis Oméga
 * par le Pokédex National.
 *
 * Le relevé, lui, a été fait jeu par jeu et tranche juste sur les deux cas :
 * il connaît Nymphali dans Rubis Oméga et l'ignore dans Diamant Étincelant.
 * Les espèces marquées « indisponible » comptent : le jeu les connaît, même
 * s'il ne les donne pas.
 *
 * Rend null hors d'un onglet de jeu : sur le Pokédex Pokémon HOME, la lignée
 * complète est la bonne réponse.
 */
function especesDuJeu(reserve, cleJeu){
  if(!reserve || !gameByKey[cleJeu]) return null;
  const table = reserve.jeux && reserve.jeux[cleJeu];
  if(!table) return null;
  const dedans = new Set();
  Object.keys(table).forEach(function(id){ dedans.add(parseInt(id, 10)); });
  return dedans.size ? dedans : null;
}

// Le rang de l'ouverture en cours : le relevé arrive après un aller-retour, et
// la lignée d'une fiche ne doit pas se poser sur la suivante.
let evoJeton = 0;

async function dessinerEvolution(entry, fiche){
  const f = fichesEmbarquees();
  if(!f){ messageVide(ficheEvolution, 'Non renseignée.'); return; }

  // On remonte la chaîne : chaque fiche ne connaît que l'étape qui MÈNE à elle.
  // En repartant de la souche puis en redescendant, on reconstitue la lignée
  // sans avoir stocké d'arbre.
  const etapes = [];
  let courant = entry.speciesId;
  const vus = {};
  while(true){
    const fi = f.especes[courant];
    if(!fi || !fi.evo || !fi.evo.de || vus[courant]) break;
    vus[courant] = true;
    etapes.unshift({ de: fi.evo.de, vers: courant, det: fi.evo });
    courant = fi.evo.de;
  }
  // Puis la descendance : les espèces dont l'évolution part d'ici.
  const suite = [entry.speciesId];
  while(suite.length){
    const parent = suite.shift();
    Object.keys(f.especes).forEach(function(cle){
      const fi = f.especes[cle];
      const id = parseInt(cle, 10);
      if(!fi.evo || fi.evo.de !== parent || id > 10000 || vus[id]) return;
      vus[id] = true;
      etapes.push({ de: parent, vers: id, det: fi.evo });
      suite.push(id);
    });
  }

  if(!etapes.length){
    messageVide(ficheEvolution, 'Ce Pokémon n\'évolue pas.');
    return;
  }

  // La lignée se coupe à ce que le jeu ouvert connaît. Sur Rouge et Bleu,
  // « Pichu → Pikachu » est un anachronisme : Pichu est de la deuxième
  // génération, il n'existe pas encore. Hors onglet de jeu, tout est montré.
  const jeton = ++evoJeton;
  let connues = null;
  if(gameByKey[currentTab]){
    try{
      connues = especesDuJeu(await chargerLieux(), currentTab);
    }catch(e){
      connues = null;          // hors ligne : mieux vaut tout montrer que rien
    }
    // Une autre fiche a été ouverte pendant le chargement.
    if(jeton !== evoJeton) return;
  }
  const gardees = connues
    ? etapes.filter(function(e){ return connues.has(e.de) && connues.has(e.vers); })
    : etapes;

  if(!gardees.length){
    messageVide(ficheEvolution, connues
      ? 'Aucune de ses évolutions n\'existe dans ce jeu.'
      : 'Ce Pokémon n\'évolue pas.');
    return;
  }

  ficheEvolution.innerHTML = '';
  // Ce que le jeu ignore mérite d'être dit, sinon la lignée paraît incomplète
  // sans qu'on sache pourquoi.
  if(connues && gardees.length < etapes.length){
    const absentes = etapes.filter(function(e){ return gardees.indexOf(e) === -1; });
    const noms = [];
    absentes.forEach(function(e){
      [e.de, e.vers].forEach(function(id){
        if(!connues.has(id) && noms.indexOf(id) === -1) noms.push(id);
      });
    });
    const note = document.createElement('p');
    note.className = 'evo-hors-jeu';
    note.textContent = (noms.length > 1 ? 'Absents de ce jeu : ' : 'Absent de ce jeu : ')
      + noms.map(nomParEspece).join(', ');
    ficheEvolution.appendChild(note);
  }

  gardees.forEach(function(e){
    const ligne = document.createElement('div');
    ligne.className = 'evo-etape';
    const de = document.createElement('span');
    de.textContent = nomParEspece(e.de);
    const fleche = document.createElement('span');
    fleche.className = 'fleche';
    fleche.textContent = '→';
    const vers = document.createElement('span');
    vers.textContent = nomParEspece(e.vers);
    if(e.vers === entry.speciesId) vers.style.fontWeight = '700';

    const cond = document.createElement('span');
    cond.className = 'cond';
    const bouts = conditionEvolution(e.det);
    cond.textContent = bouts.length ? '· ' + bouts.join(', ') : '';

    ligne.appendChild(de); ligne.appendChild(fleche); ligne.appendChild(vers);
    ligne.appendChild(cond);
    ficheEvolution.appendChild(ligne);
  });
}



function dessinerObtention(entry, fiche){

  if(!fiche){ messageVide(ficheObtention, 'Non renseigné pour ce Pokémon.'); return; }

  // Ouverte depuis un jeu, la fiche ne parle que de ce jeu : cent lignes
  // couvrant toute la série n'aident pas à trouver un Pokémon dans celui qu'on
  // a sous la main. Depuis Pokémon HOME, qui n'est pas un jeu, on montre tout.
  const jeu = gameByKey[currentTab];
  const versionsVoulues = jeu ? (jeu.versions || []) : null;
  const f = fichesEmbarquees();

  const liste = (fiche.obt || []).filter(function(o){
    const v = f.dico.versions[o[0]];
    // Rouge, Vert et Bleu japonais ne sont jamais sortis d'Asie : ils n'ont
    // rien à faire dans une collection, et portaient les mêmes noms que nos
    // versions, ce qui donnait deux « Rouge » dans la même liste.
    if(v && estVersionJaponaise(v.slug)) return false;
    if(!versionsVoulues) return true;
    return v && versionsVoulues.indexOf(v.slug) !== -1;
  });

  if(!liste.length){
    // Absent de l'herbe ne veut pas dire introuvable : la plupart de ces
    // Pokémon s'obtiennent par évolution, et la fiche sait de qui et comment.
    // Le dire est autrement plus utile que d'avouer une ignorance.
    if(fiche.evo && fiche.evo.de){
      ficheObtention.innerHTML = '';
      const bloc = document.createElement('div');
      bloc.className = 'obt-ligne par-evolution';

      const titre = document.createElement('div');
      titre.className = 'obt-jeu';
      const parent = nomParEspece(fiche.evo.de);
      // « de Évoli » ne se dit pas : devant une voyelle, « de » s'élide.
      // Le libellé reste français quelle que soit la langue choisie ; seul le
      // nom du Pokémon, lui, suit le bouton « Anglais ».
      titre.appendChild(document.createTextNode('Par évolution '
        + (/^[aeiouyàâäéèêëîïôöûüh]/i.test(parent) ? 'd\'' : 'de ')));
      // Ici l'identifiant du parent est connu : pas de nom à reconnaître, le
      // lien est exact.
      const entreeParent = allEntries.find(function(x){
        return x.speciesId === fiche.evo.de && x.id === fiche.evo.de;
      }) || allEntries.find(function(x){ return x.speciesId === fiche.evo.de; });
      if(entreeParent) titre.appendChild(boutonEspece(entreeParent));
      else titre.appendChild(document.createTextNode(parent));
      bloc.appendChild(titre);

      const bouts = conditionEvolution(fiche.evo);
      if(bouts.length){
        const cond = document.createElement('div');
        cond.className = 'obt-lieu';
        cond.textContent = bouts.join(', ');
        bloc.appendChild(cond);
      }

      const note = document.createElement('span');
      note.className = 'obt-cat';
      note.textContent = jeu ? 'Ne se capture pas dans ce jeu' : 'Ne se capture pas à l\'état sauvage';
      bloc.appendChild(note);

      ficheObtention.appendChild(bloc);
      return;
    }


    messageVide(ficheObtention, jeu
      ? 'Aucun lieu connu dans ' + jeu.title + '. Ce Pokémon s\'y obtient par '
        + 'échange, ou ses lieux ne sont pas documentés.'
      : 'Aucun lieu connu : ce Pokémon s\'obtient par échange, ou dans un jeu '
        + 'dont les lieux ne sont pas documentés.');
    // PokeAPI ne documente aucune rencontre au-delà de la septième génération :
    // pour Épée, Écarlate ou Z-A, ce message serait le seul affiché. Le relevé
    // Pokékalos, lui, les couvre — on laisse donc la porte ouverte.
    ficheObtention.dataset.enAttenteDuReleve = '1';
    return;
  }

  // Regroupé par jeu, dans l'ordre de sortie. Auparavant la liste était triée
  // par fréquence toutes versions confondues : sur Pokémon HOME, Rouge, Épée et
  // Platine s'entrelaçaient, et le nom du jeu se répétait sur chaque ligne.
  const parVersion = new Map();
  liste.forEach(function(o){
    if(!parVersion.has(o[0])) parVersion.set(o[0], []);
    parVersion.get(o[0]).push(o);
  });
  const versions = Array.from(parVersion.keys()).sort(function(a, b){ return a - b; });

  ficheObtention.innerHTML = '';
  const sections = [];

  versions.forEach(function(idVersion){
    const version = f.dico.versions[idVersion];
    const nomJeu = version ? (version.fr || version.en) : ('version ' + idVersion);
    const lignes = parVersion.get(idVersion);
    // Les plus probables d'abord : c'est ce qu'on cherche en priorité.
    lignes.sort(function(a, b){ return (b[5] || 0) - (a[5] || 0); });

    // Chaque jeu vit dans son propre conteneur. C'est lui, et non l'intertitre,
    // qui sert de cible aux raccourcis : l'intertitre est collant, et l'offsetTop
    // d'un élément collant renvoie sa position à l'écran, pas sa place dans la
    // liste — le saut aurait échoué dès qu'on avait déjà fait défiler.
    const groupe = document.createElement('div');
    groupe.className = 'obt-groupe';
    ficheObtention.appendChild(groupe);

    // Un seul jeu affiché — le cas de l'onglet d'un jeu — n'a pas besoin qu'on
    // lui rappelle lequel : le titre du Pokédex est juste au-dessus.
    if(versions.length > 1){
      const titre = document.createElement('div');
      titre.className = 'obt-jeu-titre';
      const nom = document.createElement('span');
      nom.textContent = nomJeu;
      const compte = document.createElement('span');
      compte.className = 'obt-compte';
      compte.textContent = String(lignes.length);
      titre.appendChild(nom); titre.appendChild(compte);
      groupe.appendChild(titre);
      sections.push({ libelle: nomJeu, compte: lignes.length, cible: groupe });
    }

    lignes.forEach(function(o){
      const bloc = document.createElement('div');
      bloc.className = 'obt-ligne';

      const lieuEl = document.createElement('div');
      lieuEl.className = 'obt-lieu';
      lieuEl.textContent = motDico('lieux', o[1]) || ('lieu ' + o[1]);
      bloc.appendChild(lieuEl);

      // « Reçu en cadeau » ne dit pas grand-chose : quand on sait qui l'offre,
      // on le nomme, et la condition rejoint les détails de la ligne.
      const nomLieu = motDico('lieux', o[1]);
      const don = (o[2] === 18 || o[2] === 19) ? CADEAUX[nomLieu] : null;
      const methode = don
        ? (o[2] === 19 ? 'Œuf offert par ' : 'Offert par ') + don.qui
        : nomMethode(o[2]);
      if(methode){
        const m = document.createElement('span');
        m.className = 'obt-cat' + (don ? ' offert' : '');
        m.textContent = methode;
        bloc.appendChild(m);
      }

      const details = [];
      if(don && don.quand) details.push(don.quand);
      if(o[3]) details.push('niv. ' + (o[3] === o[4] ? o[3] : o[3] + '–' + o[4]));
      // La rareté de PokeAPI se répartit *à l'intérieur d'une méthode* : dès
      // qu'une méthode n'a qu'un seul créneau, elle vaut 100 sans rien dire de la
      // probabilité réelle. C'est ce qui affichait « 100 % » sur une apparition
      // décrite comme rare. On ne la montre donc que lorsqu'elle départage
      // vraiment plusieurs créneaux, et sous le nom de fréquence — le taux de
      // capture, lui, est une autre grandeur, affichée avec les statistiques.
      if(o[5] > 0 && o[5] < 100) details.push('fréquence ' + o[5] + ' %');
      if(details.length){
        const d = document.createElement('span');
        d.className = 'obt-detail';
        d.textContent = '  ' + details.join(' · ');
        bloc.appendChild(d);
      }
      groupe.appendChild(bloc);
    });
  });

  dessinerRaccourcis(ficheObtentionNav, sections, ficheObtention);

}

// ---- Attaques apprises ------------------------------------------------------
// Réserve à part, chargée à la demande : les capacités pèsent à elles seules
// plus que tout le reste des données embarquées. Les charger au démarrage
// ralentirait chaque lancement pour un panneau qu'on n'ouvre pas toujours.

let attaquesEnCours = null;
let lieuxEnCours = null;
let descriptionsEnCours = null;
let cobblemonEnCours = null;

// La réserve des lieux : où l'on croise chaque Pokémon, jeu par jeu, relevée
// chez Pokékalos. Elle pèse 340 Ko et ne sert qu'à ce bloc — elle se charge
// donc à la demande, comme les attaques, et une seule fois par session.
function chargerLieux(){
  if(typeof DONNEES_LIEUX !== 'undefined') return Promise.resolve(DONNEES_LIEUX);
  if(lieuxEnCours) return lieuxEnCours;
  lieuxEnCours = new Promise(function(tenir, rejeter){
    const el = document.createElement('script');
    el.src = cheminReserve('donnees-lieux.js');
    el.onload = function(){
      if(typeof DONNEES_LIEUX === 'undefined') rejeter(new Error('réserve illisible'));
      else { tenir(DONNEES_LIEUX); }
    };
    el.onerror = function(){ rejeter(new Error('réserve introuvable')); };
    document.head.appendChild(el);
  });
  lieuxEnCours.catch(function(){ lieuxEnCours = null; });
  return lieuxEnCours;
}

// Cobblemon a sa réserve à part, et pour une raison de fond : ce n'est pas un
// jeu Pokémon, c'est un mod Minecraft. On n'y cherche pas une route ni une
// grotte mais un biome, et la ligne ne se lit pas de la même façon — rareté,
// niveau, moment, météo, manière. Relevée dans le tableur communautaire, elle
// pèse 85 Ko et ne concerne qu'un onglet sur vingt-quatre : elle se charge
// donc à la demande, comme les attaques et les descriptions.
function chargerCobblemon(){
  if(typeof DONNEES_COBBLEMON !== 'undefined') return Promise.resolve(DONNEES_COBBLEMON);
  if(cobblemonEnCours) return cobblemonEnCours;
  cobblemonEnCours = new Promise(function(tenir, rejeter){
    const el = document.createElement('script');
    el.src = cheminReserve('donnees-cobblemon.js');
    el.onload = function(){
      if(typeof DONNEES_COBBLEMON === 'undefined') rejeter(new Error('réserve illisible'));
      else { tenir(DONNEES_COBBLEMON); }
    };
    el.onerror = function(){ rejeter(new Error('réserve introuvable')); };
    document.head.appendChild(el);
  });
  cobblemonEnCours.catch(function(){ cobblemonEnCours = null; });
  return cobblemonEnCours;
}

// ---- Chauffer les réserves pendant que rien ne se passe ---------------------
//
// LE DÉFAUT, MESURÉ. Ouvrir la première fiche d'une session tire 3,7 Mo d'un
// seul coup : les descriptions (1,5 Mo), les attaques (1,9 Mo) et Cobblemon
// (178 Ko), demandées au même instant par trois blocs différents de la même
// fiche. Chaque réserve est un script, donc chaque arrivée est UNE tâche
// synchrone qui ne rend la main qu'une fois l'objet construit — et les trois se
// suivent sans respirer.
//
// Sur la machine où cela a été mesuré, l'ouverture prend 4,7 s dont l'essentiel
// en lecture de fichiers locaux. Sur un ordinateur modeste, c'est là que
// Windows affiche « l'application ne répond plus » : le gel tombe sur un clic,
// au moment précis où l'on attend quelque chose.
//
// CE QU'ON CHANGE, ET CE QU'ON NE CHANGE PAS. Les réserves restent chargées à
// la demande — rien n'est ajouté au démarrage, et une session qui n'ouvre
// aucune fiche ne les lit toujours pas. On les demande simplement PLUS TÔT,
// quand le navigateur n'a rien à faire, et UNE À LA FOIS. Le premier clic
// trouve alors tout en mémoire, et `chargerX()` rend sa promesse déjà résolue.
//
// UNE À LA FOIS, ET C'EST LE POINT. Les lancer ensemble reproduirait exactement
// le gel qu'on essaie d'éviter, simplement plus tôt. Chacune attend que la
// précédente soit là, et cède la main entre deux.

/**
 * Le moment où le navigateur n'a rien de mieux à faire.
 *
 * `requestIdleCallback` n'existe pas partout — Safari ne l'a eu que tard, et
 * la vue web de Tauri suit celle du système. Le repli sur un `setTimeout`
 * généreux n'est pas équivalent, mais il vaut mieux que rien : il place le
 * travail après le premier dessin, qui est ce qui compte.
 */
function quandLibre(quoi, delai){
  // Par `window.` et non en appel nu : c'est un global du navigateur, et le
  // relecteur statique de outils/verifier.py ne connait que les fonctions
  // ecrites dans l'application. Un appel nu s'y lit comme un nom introuvable.
  if(typeof window.requestIdleCallback === 'function'){
    window.requestIdleCallback(quoi, { timeout: delai || 4000 });
  } else {
    setTimeout(quoi, delai || 1500);
  }
}

/**
 * Vrai si l'on peut se permettre de télécharger 3,4 Mo sans qu'on l'ait demandé.
 *
 * DANS L'APPLICATION, LES RÉSERVES SONT SUR LE DISQUE : les lire ne coûte rien
 * à personne. SUR LE SITE, elles viennent du réseau — et précharger trois
 * mégaoctets chez quelqu'un en 3G, ou qui a demandé à son navigateur
 * d'économiser les données, serait prendre une décision à sa place. On s'en
 * abstient : il les aura à la première fiche, comme avant.
 */
function peutPrechauffer(){
  const c = navigator.connection;
  if(!c) return true;                       // rien de connu : on suppose que oui
  if(c.saveData) return false;              // il a demandé le contraire
  return !/(^|-)2g$/.test(c.effectiveType || '');
}

let prechauffeFaite = false;

/**
 * Appelée une fois, après le premier dessin. Voir app.js.
 *
 * ELLE NE REND RIEN ET N'ÉCHOUE PAS. Une réserve qui manque sera redemandée par
 * la fiche, qui sait déjà le dire — signaler ici une erreur que personne n'a
 * provoquée ne ferait qu'inquiéter sans rien apprendre.
 */
function prechaufferReserves(){
  if(prechauffeFaite) return;
  prechauffeFaite = true;
  if(!peutPrechauffer()) return;

  // L'ORDRE SUIT L'USAGE. Les descriptions et les attaques sont lues par toute
  // fiche ; les lieux par le bloc « où le trouver » et par le programme du
  // soir. Cobblemon ne concerne qu'un onglet sur vingt-quatre : il reste à la
  // demande, sans quoi on ferait payer à tout le monde une réserve que presque
  // personne n'ouvre.
  const suite = [chargerDescriptions, chargerAttaques, chargerLieux];
  let i = 0;
  const suivante = function(){
    if(i >= suite.length) return;
    const charger = suite[i++];
    let p;
    try{ p = charger(); }catch(e){ return; }
    // ENTRE DEUX, ON REND LA MAIN. Enchaîner dans la même tâche rassemblerait
    // les trois arrivées en un seul gel — ce que ce préchauffage existe pour
    // éviter.
    p.then(function(){ quandLibre(suivante); }, function(){ /* la fiche redemandera */ });
  };
  quandLibre(suivante);
}

// Ce que le relevé dit d'une espèce, jeu par jeu. Rend une liste de
// { jeu, titre, texte, categorie }, dans l'ordre de sortie des jeux.
// La forme d'abord, l'espèce à défaut.
//
// En Alola, Rattata d'Alola court les routes tandis que le Rattata de Kanto n'y
// existe pas : deux disponibilités pour une seule espèce. Le relevé leur donne
// deux clefs — 19 pour l'espèce, 10091 pour la forme — et c'est la forme qui
// prime quand elle a sa ligne. Sans ligne propre, on retombe sur l'espèce :
// c'est le cas de la plupart des jeux, où la source ne distingue pas.
function ligneDuJeu(table, entry){
  if(!table) return null;
  return table[String(entry.id)] || table[String(entry.speciesId)] || null;
}

function lieuxDeLEspece(reserve, entry){
  const sortie = [];
  (typeof GAMES !== 'undefined' ? GAMES : []).forEach(function(jeu){
    const table = reserve.jeux[jeu.key];
    const ligne = ligneDuJeu(table, entry);
    if(!ligne) return;
    sortie.push({ jeu: jeu.key, titre: jeu.title,
                  texte: reserve.textes[ligne[0]],
                  categorie: reserve.categories[ligne[1]],
                  mentions: (ligne[2] || []).map(function(i){ return reserve.mentions[i]; }),
                  precisions: (ligne[3] || []).map(function(i){ return reserve.textes[i]; }) });
  });
  return sortie;
}

// Le chemin se déduit de celui de la réserve principale : la page de
// génération vit dans outils/ et pointe vers ../src/js/, l'application dans
// src/. Écrire « js/donnees-attaques.js » en dur casserait l'une des deux.
function cheminReserve(fichier){
  const ref = document.querySelector('script[src*="donnees-embarquees.js"]');
  const src = ref && ref.getAttribute('src');
  return src ? src.replace('donnees-embarquees.js', fichier) : 'js/' + fichier;
}

function cheminAttaques(){
  return cheminReserve('donnees-attaques.js');
}

function chargerAttaques(){
  if(typeof DONNEES_ATTAQUES !== 'undefined') return Promise.resolve(DONNEES_ATTAQUES);
  if(attaquesEnCours) return attaquesEnCours;
  attaquesEnCours = new Promise(function(tenir, rejeter){
    const el = document.createElement('script');
    el.src = cheminAttaques();
    el.onload = function(){
      if(typeof DONNEES_ATTAQUES === 'undefined') rejeter(new Error('réserve illisible'));
      else { tenir(DONNEES_ATTAQUES); }
    };
    el.onerror = function(){ rejeter(new Error('réserve introuvable')); };
    document.head.appendChild(el);
  });
  // Un échec ne doit pas être mémorisé : la fiche suivante doit pouvoir
  // retenter, au lieu de rejouer indéfiniment la même erreur.
  attaquesEnCours.catch(function(){ attaquesEnCours = null; });
  return attaquesEnCours;
}

function cheminDescriptions(){
  return cheminReserve('donnees-descriptions.js');
}

// Les notices pèsent maintenant une notice PAR JEU et non plus une par espèce :
// vingt-deux fois plus de texte, et le fichier a suivi. Il rejoint donc les
// attaques et les lieux dans ce qui se charge à la première fiche ouverte, au
// lieu d'allonger chaque démarrage pour une carte qu'on ne lit pas toujours.
function chargerDescriptions(){
  if(typeof DONNEES_DESCRIPTIONS !== 'undefined') return Promise.resolve(DONNEES_DESCRIPTIONS);
  if(descriptionsEnCours) return descriptionsEnCours;
  descriptionsEnCours = new Promise(function(tenir, rejeter){
    const el = document.createElement('script');
    el.src = cheminDescriptions();
    el.onload = function(){
      if(typeof DONNEES_DESCRIPTIONS === 'undefined') rejeter(new Error('réserve illisible'));
      else { tenir(DONNEES_DESCRIPTIONS); }
    };
    el.onerror = function(){ rejeter(new Error('réserve introuvable')); };
    document.head.appendChild(el);
  });
  descriptionsEnCours.catch(function(){ descriptionsEnCours = null; });
  return descriptionsEnCours;
}

// Les méthodes d'apprentissage de PokeAPI, rangées dans les sections
// affichées. « machine » n'en est pas une à elle seule : c'est la table des
// CT/CS/DT du jeu qui dit laquelle des trois.
const METHODE_MACHINE = 4;
const METHODE_VERS_SECTION = {
  1: 'niveau', 2: 'oeuf', 3: 'tuteur', 6: 'oeuf'
};
// Les méthodes exotiques atterrissent dans « Autres » : on nomme au moins de
// quoi il s'agit plutôt que de laisser une section fourre-tout muette.
const AUTRES_METHODES_FR = {
  5: 'Pikachu surfeur (Stadium)', 7: 'purification (Colosseum)',
  8: 'capacité Obscure (XD)', 9: 'purification (XD)',
  10: 'changement de forme', 11: 'Cube Zygarde', 12: 'entraînement'
};

// L'ordre des sections est celui de la question qu'on se pose en jouant : ce
// qu'il apprend seul, ce qu'on peut lui enseigner, puis l'élevage.
const SECTIONS_ATTAQUES = [
  { cle:'niveau',  court:'Niveau', titre:'Par niveau',               colonne:'Nv.', aide:'en montant de niveau' },
  { cle:'CT',      court:'CT',     titre:'Capsules Techniques (CT)', colonne:'N°',  aide:'réutilisables' },
  { cle:'CS',      court:'CS',     titre:'Capacités Secrètes (CS)',  colonne:'N°',  aide:'utilisables hors combat' },
  { cle:'oeuf',    court:'Repro.', titre:'Reproduction',             colonne:'',    aide:'transmises par un parent' },
  { cle:'DT',      court:'DT',     titre:'Disques Techniques (DT)',  colonne:'N°',  aide:'à usage unique' },
  { cle:'tuteur',  court:'Tuteur', titre:'Maître des Capacités',     colonne:'',    aide:'enseignées par un PNJ' },
  { cle:'autre',   court:'Autres', titre:'Autres méthodes',          colonne:'',    aide:'' }
];

const CLASSES_DEGATS = { 1:['statut','Statut'], 2:['physique','Physique'], 3:['speciale','Spéciale'] };

// Un bloc encodé redevient une liste { capacite, methode, niveau }.
// Les CT y sont des drapeaux : un bit par capacité de la palette du jeu, dans
// l'ordre où la palette les range. Voir outils/generer-attaques.js.
function decoderBloc(bloc, groupe, reserve){
  const coupe = bloc.indexOf('|');
  const drapeaux = bloc.slice(0, coupe);
  const reste = bloc.slice(coupe + 1);
  const out = [];

  if(drapeaux){
    const palette = reserve.palettes[groupe] || [];
    // atob refuse une longueur qui n'est pas un multiple de quatre : le
    // générateur retire le remplissage, on le remet.
    const complet = drapeaux + '==='.slice(0, (4 - drapeaux.length % 4) % 4);
    let octets = '';
    try{ octets = atob(complet); }catch(e){ octets = ''; }
    for(let i = 0; i < palette.length; i++){
      const octet = octets.charCodeAt(i >> 3);
      if(octet && (octet & (1 << (i & 7)))){
        out.push({ capacite: palette[i], methode: METHODE_MACHINE, niveau: 0 });
      }
    }
  }

  if(reste){
    reste.split(',').forEach(function(bout){
      const p = bout.split('.');
      out.push({
        capacite: parseInt(p[0], 36),
        methode: parseInt(p[1], 10),
        niveau: p[2] ? parseInt(p[2], 36) : 0
      });
    });
  }
  return out;
}

function nomCapacite(reserve, id){
  const c = reserve.capacites[id];
  if(!c) return 'n°' + id;
  return c[0] || c[1];      // français : voir motDico
}

// Range les capacités d'un jeu dans les sections affichées, en gardant la plus
// accessible quand la même revient plusieurs fois.
function trierAttaques(liste, machinesDuJeu, reserve){
  const sections = {};
  SECTIONS_ATTAQUES.forEach(function(s){ sections[s.cle] = new Map(); });

  liste.forEach(function(m){
    let cle, etiquette = '';
    if(m.methode === METHODE_MACHINE){
      const machine = machinesDuJeu ? machinesDuJeu[m.capacite] : null;
      cle = machine ? machine.slice(0, 2) : 'CT';
      etiquette = machine || '—';
    } else {
      cle = METHODE_VERS_SECTION[m.methode] || 'autre';
      // Niveau 0 sur un apprentissage par montée de niveau : la capacité
      // s'obtient au moment de l'évolution.
      if(cle === 'niveau') etiquette = m.niveau > 0 ? 'Nv. ' + m.niveau : 'Évo.';
    }
    if(!sections[cle]) cle = 'autre';

    const deja = sections[cle].get(m.capacite);
    if(deja && !(cle === 'niveau' && m.niveau > 0 && m.niveau < deja.niveau)) return;
    sections[cle].set(m.capacite, {
      etiquette: etiquette, capacite: m.capacite, niveau: m.niveau, methode: m.methode
    });
  });

  const out = {};
  Object.keys(sections).forEach(function(cle){
    const arr = Array.from(sections[cle].values());
    if(cle === 'niveau'){
      arr.sort(function(a, b){
        return a.niveau !== b.niveau ? a.niveau - b.niveau
          : nomCapacite(reserve, a.capacite).localeCompare(nomCapacite(reserve, b.capacite));
      });
    } else if(cle === 'CT' || cle === 'CS' || cle === 'DT'){
      arr.sort(function(a, b){
        return (parseInt(a.etiquette.slice(2), 10) || 999) - (parseInt(b.etiquette.slice(2), 10) || 999);
      });
    } else {
      arr.sort(function(a, b){
        return nomCapacite(reserve, a.capacite).localeCompare(nomCapacite(reserve, b.capacite));
      });
    }
    out[cle] = arr;
  });
  return out;
}

function ligneAttaque(item, reserve){
  const c = reserve.capacites[item.capacite] || [];
  const ligne = document.createElement('div');
  ligne.className = 'attaque-ligne';

  const cle = document.createElement('span');
  cle.className = 'attaque-cle';
  cle.textContent = item.etiquette;
  ligne.appendChild(cle);

  const nom = document.createElement('span');
  nom.className = 'attaque-nom';
  nom.textContent = nomCapacite(reserve, item.capacite);
  nom.title = nom.textContent;
  ligne.appendChild(nom);

  ligne.appendChild(puceType(c[2]));

  const classe = CLASSES_DEGATS[c[3]] || ['statut', '—'];
  const cat = document.createElement('span');
  cat.className = 'attaque-cat col-cat ' + classe[0];
  cat.textContent = classe[1];
  ligne.appendChild(cat);

  [[c[4], 'col-puis'], [c[5], 'col-pp'], [c[6], 'col-prec']].forEach(function(paire, i){
    const el = document.createElement('span');
    el.className = 'attaque-chiffre ' + paire[1];
    el.textContent = (paire[0] === null || paire[0] === undefined) ? '—'
      : (i === 2 ? paire[0] + ' %' : String(paire[0]));
    ligne.appendChild(el);
  });
  return ligne;
}

function dessinerSectionAttaques(section, entrees, reserve){
  const bloc = document.createElement('div');
  bloc.className = 'attaques-section';

  const titre = document.createElement('div');
  titre.className = 'attaques-titre';
  const nom = document.createElement('span');
  nom.textContent = section.titre;
  const compte = document.createElement('span');
  compte.className = 'attaques-compte';
  compte.textContent = String(entrees.length);
  titre.appendChild(nom); titre.appendChild(compte);

  let aide = section.aide;
  if(section.cle === 'autre'){
    const vues = [];
    entrees.forEach(function(e){
      const n = AUTRES_METHODES_FR[e.methode] || ('méthode ' + e.methode);
      if(vues.indexOf(n) === -1) vues.push(n);
    });
    aide = vues.join(', ');
  }
  if(aide){
    const a = document.createElement('span');
    a.className = 'attaques-aide';
    a.textContent = aide;
    titre.appendChild(a);
  }
  bloc.appendChild(titre);

  const entete = document.createElement('div');
  entete.className = 'attaque-ligne entete';
  [section.colonne, 'Attaque', 'Type', 'Cat.', 'Puis.', 'PP', 'Préc.'].forEach(function(t, i){
    const el = document.createElement('span');
    el.className = ['attaque-cle', '', '', 'col-cat', 'col-puis', 'col-pp', 'col-prec'][i];
    el.textContent = t;
    entete.appendChild(el);
  });
  bloc.appendChild(entete);

  entrees.forEach(function(e){ bloc.appendChild(ligneAttaque(e, reserve)); });
  return bloc;
}

// Les jeux à proposer. Ouverte depuis un jeu, la fiche ne parle que de lui —
// même règle que « Où l'obtenir ». Depuis Pokémon HOME, qui n'est pas un jeu,
// on montre tout, du plus ancien au plus récent.
function groupesProposes(parGroupe, reserve){
  const dispo = Object.keys(parGroupe).filter(function(g){
    const info = reserve.groupes[g];
    return !info || !estVersionJaponaise(info[0]);
  });
  const jeu = gameByKey[currentTab];
  let retenus = dispo;
  if(jeu && jeu.versions && jeu.versions.length){
    const voulus = {};
    jeu.versions.forEach(function(slug){
      const g = reserve.versions[slug];
      if(g !== undefined) voulus[g] = true;
    });
    const filtres = dispo.filter(function(g){ return voulus[g]; });
    // Un jeu sans aucune donnée retombe sur la liste complète : mieux vaut
    // montrer les attaques d'un autre jeu que de laisser un panneau vide.
    if(filtres.length) retenus = filtres;
  }
  return retenus.sort(function(a, b){
    const ga = reserve.groupes[a], gb = reserve.groupes[b];
    return ((ga && ga[3]) || 0) - ((gb && gb[3]) || 0);
  });
}

function nomGroupeJeu(reserve, groupe){
  const g = reserve.groupes[groupe];
  if(!g) return 'jeu ' + groupe;
  return g[1] || g[2];      // français : voir motDico
}

/**
 * Les lieux relevés chez Pokékalos, sous ceux de PokeAPI.
 *
 * Les deux sources ne se recouvrent pas : PokeAPI s'arrête à la septième
 * génération, le relevé couvre les dix-huit jeux qu'une page documente — et
 * lui seul porte la zone des Terres Sauvages, la météo et l'heure, écrites
 * telles quelles.
 *
 * La catégorie répond à la question qui change un dex : capturable ici, ou
 * seulement vu ? Un « Indisponible » se lit d'un coup d'œil au lieu de se
 * déduire d'une phrase.
 */
async function dessinerLieuxReleves(entry){
  if(!entry || !ficheObtention) return;
  let reserve;
  try{ reserve = await chargerLieux(); }
  catch(e){ return; }                 // hors ligne : le bloc reste ce qu'il était
  // La fiche a pu changer pendant le chargement : même garde que les attaques.
  if(previewEntry !== entry) return;

  const jeu = gameByKey[currentTab];
  let lignes = lieuxDeLEspece(reserve, entry);
  // Ouvert depuis un jeu, on ne parle que de ce jeu — même règle que le bloc
  // du dessus, et pour la même raison : trouver un Pokémon dans le jeu qu'on
  // a sous la main, pas dans les dix-sept autres.
  if(jeu) lignes = lignes.filter(function(l){ return l.jeu === jeu.key; });

  // Rien de relevé pour ce jeu-ci, alors que son Pokédex l'est : c'est une
  // réponse, et elle vaut mieux qu'un blanc — le dresseur saura qu'il ne perd
  // pas son temps à le chercher ici.
  const pokedexReleves = reserve.pokedexReleve || [];
  if(!lignes.length && jeu && pokedexReleves.indexOf(jeu.key) !== -1){
    lignes = [{ jeu: jeu.key, titre: jeu.title, categorie: 'indisponible',
                mentions: [], precisions: [],
                texte: 'Aucune source ne le donne dans ce jeu' }];
  }
  if(!lignes.length) return;

  if(ficheObtention.dataset.enAttenteDuReleve){
    ficheObtention.innerHTML = '';
    delete ficheObtention.dataset.enAttenteDuReleve;
  }

  const groupe = document.createElement('div');
  groupe.className = 'obt-groupe obt-releve';
  const titre = document.createElement('div');
  titre.className = 'obt-jeu-titre';
  const nom = document.createElement('span');
  nom.textContent = jeu ? 'Où le croiser' : 'Où le croiser, jeu par jeu';
  const compte = document.createElement('span');
  compte.className = 'obt-compte';
  compte.textContent = String(lignes.length);
  titre.appendChild(nom); titre.appendChild(compte);
  groupe.appendChild(titre);

  lignes.forEach(function(l){
    const bloc = document.createElement('div');
    bloc.className = 'obt-ligne';

    if(!jeu){
      const quelJeu = document.createElement('div');
      quelJeu.className = 'obt-jeu';
      quelJeu.textContent = l.titre;
      bloc.appendChild(quelJeu);
    }

    const lieuEl = document.createElement('div');
    lieuEl.className = 'obt-lieu';
    poserTexteObtention(lieuEl, l.texte, entry && entry.speciesId);
    bloc.appendChild(lieuEl);

    const chip = document.createElement('span');
    chip.className = 'obt-cat categorie-' + l.categorie;
    chip.textContent = LIBELLES_CATEGORIE[l.categorie] || l.categorie;
    chip.title = NUANCES_CATEGORIE[l.categorie] || l.categorie;
    bloc.appendChild(chip);

    // « Exclusif à Pokémon Rubis » : une exclusivité de version se lit, elle ne
    // se devine pas. C'est une ligne, pas une pastille — on la cherche des yeux
    // avant d'acheter la mauvaise cartouche.
    l.precisions.forEach(function(phrase){
      const ligne = document.createElement('div');
      ligne.className = 'obt-precision';
      ligne.textContent = phrase;
      bloc.appendChild(ligne);
    });

    // Les mentions viennent des pages complémentaires : elles ne disent pas où,
    // elles disent quoi. « Shiny-lock » n'a rien à voir avec un lieu, et pèse
    // pourtant lourd pour qui chasse le chromatique.
    l.mentions.forEach(function(m){
      const puce = document.createElement('span');
      puce.className = 'obt-mention mention-' + m;
      puce.textContent = LIBELLES_MENTION[m] || m;
      bloc.appendChild(puce);
    });

    groupe.appendChild(bloc);
  });

  ficheObtention.appendChild(groupe);
}

/**
 * La fiche est-elle celle de PixelmonWorld ?
 *
 * ON LE DÉDUIT DE LA PAGE OUVERTE, et non d'un drapeau posé au clic. Un
 * drapeau aurait fallu le remettre à zéro à CHAQUE façon de fermer la fiche —
 * la croix, Échap, un clic sur le fond, un changement de page — et la première
 * oubliée aurait laissé une fiche de Rouge Feu se présenter comme une fiche de
 * serveur. `currentPage` est déjà tenu à jour par showPage() ; il n'y a rien à
 * synchroniser.
 *
 * Les deux écrans du serveur comptent : on ouvre une fiche depuis le Pokédex
 * comme depuis ses lieux.
 */
function ficheSurPixelmonWorld(){
  return typeof currentPage !== 'undefined'
    && (currentPage === 'pixelmonworld' || currentPage === 'pwlieux');
}

// ---- Les apparitions de Cobblemon ------------------------------------------
//
// Un mod ne se lit pas comme un jeu. Ailleurs, la réponse est un lieu — « Route
// 8 », « Grotte Azurée » — et elle suffit. Ici il n'y a pas de carte : le monde
// est engendré à chaque partie, et ce qui se répète d'un monde à l'autre, c'est
// le biome. La ligne dit donc où (biomes), à quel point c'est rare, à quel
// niveau, de quelle manière, à quelle heure et par quel temps.
//
// Les biomes sont des FAMILLES, pas des lieux : « Partout en surface » couvre
// le monde entier, « Régions tempérées » une vingtaine de biomes. C'est le
// vocabulaire du mod, traduit dans outils/relever-cobblemon.py.

const RARETE_CLASSE = ['commun', 'peu-commun', 'rare', 'tres-rare'];

// L'ordre dans lequel on atteint les mondes, et donc celui des lignes : la
// surface où l'on démarre, le Nether qui demande un portail, l'End qui demande
// le dragon, et pour finir ce qui n'existe pas sans installer un mod de biomes.
const RANG_DIMENSION = { 0: 0, 1: 1, 2: 2, '-1': 3 };

/**
 * Une famille que Minecraft ne peut pas remplir, dite par ses biomes.
 *
 * « Îles tropicales » n'est pas un cul-de-sac : le tag de Cobblemon y range
 * quatre biomes, chez Biomes O' Plenty et chez Wythers. Les nommer dit quoi
 * installer ; s'arrêter au nom de la famille ne disait rien du tout.
 *
 * Douze des vingt-quatre familles hors-jeu se résolvent ainsi. Les douze
 * autres ne sont pas des familles mais des noms de biomes que le tableur écrit
 * en clair — Skyroot Forest, Crystal Canyon —, venus de mods que Cobblemon ne
 * balise pas : leur libellé EST le nom du biome, et il n'y a rien à ajouter.
 */
/**
 * Les mods à installer pour qu'une ligne existe.
 *
 * Deux chemins, et ils ne se ressemblent pas :
 *
 *  · l'étiquette est une famille que Cobblemon balise, et ses biomes viennent
 *    d'autres mods — « Zones thermales » en compte douze, chez quatre mods. Les
 *    noms sortent alors des groupes de biomes ;
 *  · l'étiquette EST un biome, nommé en clair dans les fichiers de spawn du
 *    mod : Skyroot Forest chez The Aether, Howling Constructs chez The
 *    Bumblezone. Le nom du mod est alors relevé à côté, dans le relevé.
 *
 * Trois étiquettes ne donnent ni l'un ni l'autre — « Nether Frozen » est un tag
 * que rien ne remplit — et gardent la pastille sans nom.
 */
function modsDeLaLigne(reserve, indices){
  const sortie = [];
  indices.forEach(function(i){
    const requis = (reserve.famillesRequis || [])[i];
    if(requis && sortie.indexOf(requis) === -1) sortie.push(requis);
    ((reserve.famillesMod || [])[i] || []).forEach(function(g){
      if(sortie.indexOf(g[0]) === -1) sortie.push(g[0]);
    });
  });
  return sortie;
}

function familleHorsJeu(reserve, i){
  const nom = reserve.familles[i];
  const groupes = (reserve.famillesMod || [])[i] || [];
  if(!groupes.length) return nom;
  // Le mod entre parenthèses et non après un deux-points : la phrase qui porte
  // la liste finit déjà par « avec un mod de biomes : », et deux deux-points de
  // suite se lisent mal.
  return groupes.map(function(g){
    return g[1].join(', ') + ' (' + g[0] + ')';
  }).join(' · ');
}

function spawnsDeLEspece(reserve, entry){
  // La forme, et elle seule : le Taupiqueur d'Alola ne sort pas des mêmes
  // biomes que celui de Kanto, et retomber sur l'espèce lui prêterait les
  // biomes de l'autre. Une forme sans ligne propre n'apparaît nulle part, ce
  // qui est la vérité — le mod ne la fait pas apparaître.
  const brut = reserve.especes[String(entry.id)];
  if(!brut || !brut.length) return [];

  return brut.map(function(l){
    return {
      biomes:  (l[0] || []).map(function(i){ return reserve.biomes[i]; }),
      exclus:  (l[1] || []).map(function(i){ return reserve.biomes[i]; }),
      rarete:  l[2] >= 0 ? reserve.raretes[l[2]] : null,
      iRarete: l[2],
      nivMin:  l[3],
      nivMax:  l[4],
      contexte: l[5] >= 0 ? reserve.contextes[l[5]] : null,
      temps:    l[6] >= 0 ? reserve.temps[l[6]] : null,
      meteo:    l[7] >= 0 ? reserve.meteos[l[7]] : null,
      poids:    l[8],
      note:     l[9] >= 0 ? reserve.notes[l[9]] : null,
      structures: (l[10] || []).map(function(i){ return reserve.structures[i]; }),
      souterrain: !!l[11],
      // Les familles que Minecraft ne peut pas remplir : île tropicale, Aether,
      // Bumblezone. Elles ne sont pas décoratives — sans elles, une ligne dont
      // TOUTES les familles sont dans ce cas serait vide, et le dresseur
      // chercherait un biome qui n'existe pas dans sa partie.
      horsJeu:    (l[12] || []).map(function(i){ return familleHorsJeu(reserve, i); }),
      horsJeuExclus: (l[13] || []).map(function(i){ return familleHorsJeu(reserve, i); }),
      // Le mod à installer pour que la ligne existe, quand on a pu le nommer.
      modsRequis: modsDeLaLigne(reserve, l[12] || []),
      portee:     l[14] || 0,
      dimension:  typeof l[15] === 'number' ? l[15] : 0,
      rang:       RANG_DIMENSION[typeof l[15] === 'number' ? l[15] : 0]
    };
  }).map(function(l, _, toutes){
    // La part que cette ligne prend dans son palier de rareté.
    //
    // Le poids brut du mod ne dit rien à personne : « 9,9 » n'est comparable à
    // rien. Rapporté au total du palier, il répond en revanche à la seule
    // question qui se pose devant deux lignes « Peu commun » — laquelle vaut le
    // déplacement.
    //
    // JAMAIS quand le palier n'a qu'une ligne. Elle vaudrait 100 % sans rien
    // dire de la probabilité réelle, et c'est exactement le piège que le bloc
    // d'obtention a déjà rencontré avec la fréquence de PokeAPI : une méthode
    // à créneau unique affichait « 100 % » et faisait croire à une certitude.
    const memePalier = toutes.filter(function(a){ return a.iRarete === l.iRarete; });
    const total = memePalier.reduce(function(s, a){ return s + (a.poids || 0); }, 0);
    l.part = (memePalier.length > 1 && total > 0)
      ? Math.round(100 * (l.poids || 0) / total)
      : null;
    return l;
  }).sort(function(a, b){
    // Ce qu'on peut atteindre d'abord, et dans l'ordre où on y accède : la
    // surface où l'on démarre, le Nether qui demande un portail, l'End qui
    // demande le dragon, et pour finir ce qui n'existe pas sans installer un
    // mod. Métalosse sort dans l'End, dans l'Aether et dans les Howling
    // Constructs : trié par la seule rareté, deux lignes qu'on ne peut pas
    // jouer passaient devant celles qu'on peut.
    if(a.rang !== b.rang) return a.rang - b.rang;
    // Puis du plus facile au plus difficile : on cherche par où l'attraper sans
    // y passer la nuit. À rareté égale, le poids départage — c'est la chance
    // relative que le mod donne à la ligne dans son palier.
    if(a.iRarete !== b.iRarete) return a.iRarete - b.iRarete;
    return b.poids - a.poids;
  });
}

async function dessinerSpawnsCobblemon(entry){
  if(!entry || !ficheObtention) return;
  // Ouvert depuis un autre jeu, on ne parle pas du mod : la même règle que
  // partout ailleurs dans ce bloc. Depuis le Pokédex d'ensemble, en revanche,
  // Cobblemon a sa place au milieu des autres — c'est là qu'on compare.
  const jeu = gameByKey[currentTab];
  if(jeu && jeu.key !== 'cobblemon') return;

  let reserve;
  try{ reserve = await chargerCobblemon(); }
  catch(e){ return; }                 // réserve absente : le bloc reste tel quel
  if(previewEntry !== entry) return;  // la fiche a changé pendant le chargement

  const lignes = spawnsDeLEspece(reserve, entry);

  // Rien de relevé alors que le mod contient les 1025 espèces : ce n'est pas un
  // trou dans les données, c'est une réponse. Sur les 1 351 formes de
  // l'application, 874 ont une table d'apparition ; les autres s'obtiennent
  // autrement, et le tableur ne dit pas comment. On s'en tient donc à ce qu'il
  // dit — inventer « par évolution » aurait été faux pour Mewtwo, qui n'évolue
  // de rien.
  if(!lignes.length){
    if(jeu){
      poserGroupeCobblemon(jeu, [{ vide: true }]);
    }
    return;
  }
  poserGroupeCobblemon(jeu, lignes);
}

function poserGroupeCobblemon(jeu, lignes){
  if(ficheObtention.dataset.enAttenteDuReleve){
    ficheObtention.innerHTML = '';
    delete ficheObtention.dataset.enAttenteDuReleve;
  }

  const groupe = document.createElement('div');
  groupe.className = 'obt-groupe obt-releve obt-cobblemon';
  const titre = document.createElement('div');
  titre.className = 'obt-jeu-titre';
  const nom = document.createElement('span');
  nom.textContent = jeu ? 'Dans quels biomes' : '⛏️ Cobblemon — dans quels biomes';
  titre.appendChild(nom);
  if(!lignes[0].vide){
    const compte = document.createElement('span');
    compte.className = 'obt-compte';
    compte.textContent = String(lignes.length);
    titre.appendChild(compte);
  }
  groupe.appendChild(titre);

  lignes.forEach(function(l){
    const bloc = document.createElement('div');
    // Le monde d'abord, le biome ensuite. « Deltas de basalte » ne dit pas de
    // lui-même qu'il faut bâtir un portail, ni « Terres stériles de l'End »
    // qu'il faut d'abord battre le dragon. Le liseré porte la réponse sans
    // prendre un mot : vert la surface, rouge le Nether, violet l'End.
    bloc.className = 'obt-ligne ' + (DIMENSION_CLASSE[l.dimension] || 'dim-surface');

    const lieuEl = document.createElement('div');
    lieuEl.className = 'obt-lieu';
    if(l.vide){
      lieuEl.textContent = 'Aucune apparition sauvage dans les tables du mod. '
        + 'Il s\'obtient par un autre chemin — le tableur ne dit pas lequel.';
      bloc.appendChild(lieuEl);
      groupe.appendChild(bloc);
      return;
    }
    poserBiomes(lieuEl, l);
    bloc.appendChild(lieuEl);

    // Le monde en tête de ligne, avant la rareté : savoir qu'il est « commun »
    // ne sert à rien tant qu'on ne sait pas où poser les pieds. Le Nether
    // demande un portail, l'End le dragon, et l'Overworld est là où l'on
    // démarre — les trois se nomment, aucun ne se devine.
    if(DIMENSION_PUCE[l.dimension]){
      const monde = document.createElement('span');
      monde.className = 'obt-cat monde-' + MONDE_CLASSE[l.dimension];
      monde.textContent = DIMENSION_PUCE[l.dimension];
      bloc.appendChild(monde);
    }

    // La rareté prend la place de la catégorie. Ailleurs celle-ci répond à
    // « peut-on l'attraper ? » ; ici la réponse est oui sur chaque ligne, et la
    // répéter cinq fois ne dirait rien. La vraie question est « à quel prix ».
    if(l.rarete){
      const chip = document.createElement('span');
      chip.className = 'obt-cat rarete-' + (RARETE_CLASSE[l.iRarete] || 'commun');
      chip.textContent = l.rarete;
      bloc.appendChild(chip);

      // La part du palier, juste après lui : les deux se lisent ensemble ou
      // pas du tout. « Peu commun · 70 % » veut dire que sur dix rencontres
      // peu communes de cette espèce, sept se font ici.
      if(l.part !== null){
        const part = document.createElement('span');
        part.className = 'obt-mention mention-part';
        part.textContent = l.part + ' %';
        part.title = 'Sur les rencontres « ' + l.rarete.toLowerCase()
          + ' » de cette espèce, ' + l.part + ' % se font ici';
        bloc.appendChild(part);
      }
    }

    // La manière, l'heure, le temps qu'il fait, la structure où il se tient, et
    // « sous terre » quand le mod exige que le ciel ne se voie pas — ce dernier
    // ne se déduit d'aucun biome : on creuse partout.
    const puces = [l.contexte, l.temps, l.meteo].concat(l.structures);
    if(l.souterrain) puces.push('Sous terre');
    puces.forEach(function(mot){
      if(!mot) return;
      const puce = document.createElement('span');
      puce.className = 'obt-mention';
      puce.textContent = mot;
      bloc.appendChild(puce);
    });

    // Ce que le mod sait et qu'aucune colonne ne dit : la forme de Valence, ou
    // la région dans laquelle la bestiole évoluera. Rien ne le laisse voir en
    // jeu, et c'est pourtant ce qui décide de la forme obtenue. En pastille et
    // non en ligne : Mucuscule la porte sur huit de ses quatorze apparitions,
    // et huit lignes entières pour la même phrase noieraient les biomes.
    if(l.note){
      const puce = document.createElement('span');
      puce.className = 'obt-mention mention-forme-cachee';
      puce.textContent = l.note;
      bloc.appendChild(puce);
    }

    const details = [];
    if(l.nivMin || l.nivMax){
      details.push(l.nivMin === l.nivMax
        ? 'Niveau ' + l.nivMin
        : 'Niveau ' + l.nivMin + ' à ' + l.nivMax);
    }
    // Les exclusions se lisent surtout sur les lignes larges : « partout en
    // surface, sauf les régions glaciales » est une vraie consigne de chasse.
    const sauf = l.exclus.concat(l.horsJeuExclus);
    if(sauf.length) details.push('sauf ' + abrege(sauf, 5));
    // Les familles hors-jeu à côté de biomes réels : le Pikachu des plages sort
    // aussi sur les îles tropicales, qui n'existent qu'avec un mod. En ligne et
    // non en pastille — trois noms de biomes dans une pastille s'enroulaient
    // sur trois rangs et pesaient plus lourd que la ligne des biomes réels.
    if(l.horsJeu.length && (l.biomes.length || l.portee)){
      details.push('aussi, avec un mod de biomes : ' + abrege(l.horsJeu, 4));
    }
    if(details.length){
      const d = document.createElement('div');
      d.className = 'obt-precision';
      d.textContent = details.join(' · ');
      bloc.appendChild(d);
    }

    groupe.appendChild(bloc);
  });

  ficheObtention.appendChild(groupe);
}

// Une liste trop longue se coupe et s'annonce, plutôt que de courir sur quatre
// lignes : la plus fournie du relevé compte trente-neuf biomes.
function abrege(liste, combien){
  if(liste.length <= combien) return liste.join(', ');
  return liste.slice(0, combien).join(', ')
    + ' et ' + (liste.length - combien) + ' autre'
    + (liste.length - combien > 1 ? 's' : '');
}

const PORTEE_LIBELLE = ['', 'Partout en surface', 'Partout dans le Nether',
                        "Partout dans l'End"];
const BIOMES_MONTRES = 6;

// Les trois mondes. Rangés par valeur de dimension, -1 compris — d'où l'objet
// plutôt qu'un tableau.
//
// Les trois se nomment, l'Overworld compris. Il ne l'était pas d'abord, au
// motif qu'il porte 2 258 lignes sur 2 640 et que son liseré vert le disait
// déjà : c'était compter sur un code couleur que rien n'explique. Une ligne
// lue seule ne disait plus dans quel monde elle se trouvait.
const DIMENSION_CLASSE = { '-1': 'dim-ailleurs', 0: 'dim-surface',
                           1: 'dim-nether', 2: 'dim-end' };
const DIMENSION_PUCE = { 0: '🌍 Overworld', 1: '🔥 Nether', 2: "🌌 End" };
const MONDE_CLASSE = { 0: 'overworld', 1: 'nether', 2: 'end' };

/**
 * Le « où » d'une ligne de Cobblemon.
 *
 * Trois cas, et le troisième est celui qu'on aurait manqué en traduisant les
 * étiquettes du tableur au lieu de les résoudre :
 *
 *  · la ligne couvre une dimension entière — « Partout en surface ». Énumérer
 *    les cinquante-six biomes de la surface serait exact et illisible ;
 *  · la ligne nomme des biomes : on les écrit, de leur nom français du jeu, six
 *    au plus, le reste au bout d'un dépliage ;
 *  · la ligne ne nomme QUE des familles que Minecraft ne peut pas remplir —
 *    île tropicale, Aether, Bumblezone. Il n'y a alors aucun biome à donner, et
 *    la seule réponse honnête est de dire qu'il faut un mod de biomes.
 *
 * Sur les 2 640 apparitions du relevé : 649 couvrent une dimension entière,
 * 274 ne tiennent qu'avec un mod, les 1 717 autres nomment des biomes.
 */
function poserBiomes(el, l){
  if(l.portee){
    el.appendChild(document.createTextNode(PORTEE_LIBELLE[l.portee]));
    return;
  }

  if(!l.biomes.length){
    const dit = document.createElement('span');
    dit.className = 'biome-hors-jeu';
    dit.textContent = l.horsJeu.join(' · ');
    el.appendChild(dit);
    const puce = document.createElement('span');
    puce.className = 'obt-mention mention-autre-mod';
    // Le mod se nomme quand on le connaît : « The Aether requis » dit quoi
    // installer, « mod de biomes requis » laissait chercher.
    puce.textContent = l.modsRequis.length
      ? abrege(l.modsRequis, 2) + ' requis'
      : 'mod de biomes requis';
    el.appendChild(puce);
    return;
  }

  el.appendChild(document.createTextNode(l.biomes.slice(0, BIOMES_MONTRES).join(' · ')));

  if(l.biomes.length > BIOMES_MONTRES){
    const reste = l.biomes.slice(BIOMES_MONTRES);
    const suite = document.createElement('span');
    suite.className = 'biome-suite';
    suite.textContent = ' · ' + reste.join(' · ');
    el.appendChild(suite);

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'biome-plus';
    plus.textContent = '+ ' + reste.length + ' autres';
    plus.addEventListener('click', function(){
      const ouvert = el.classList.toggle('deplie');
      plus.textContent = ouvert ? 'réduire' : '+ ' + reste.length + ' autres';
    });
    el.appendChild(plus);
  }
}

// Le vocabulaire des catégories du relevé. « Indisponible » se dit en toutes
// lettres : c'est la seule qui change ce qu'on peut cocher.
// Ce que les pages complémentaires ajoutent. « Shiny-lock » garde son nom :
// c'est ainsi qu'on le cherche, et le traduire le rendrait méconnaissable.
// Toutes les mentions du relevé y figurent : celle qui manque s'affiche par sa
// clé, et « poke-radar » ou « forme-regionale » en pleine fiche font désordre.
/**
 * Les méthodes de rencontre que PokeAPI ne traduit pas.
 *
 * Ce ne sont pas des traductions manquantes — motDico() saurait retomber sur
 * l'anglais — mais des traductions FACTICES : encounter_method_prose.csv range
 * le texte anglais dans la ligne française, si bien que la fiche croyait tenir
 * du français et affichait « Catch a wild Dynamax or Gigantamax Pokémon in a
 * Max Raid battle. » au milieu d'une page en français.
 *
 * Vingt-cinq méthodes sur soixante-deux sont dans ce cas, et elles portent
 * 10 414 lignes d'obtention — le seul raid Dynamax en compte 6 601.
 *
 * La table vit ici et non dans la réserve : celle-ci est regénérée depuis
 * PokeAPI, qui réécrirait l'anglais au passage suivant. À relire si PokeAPI
 * finit par traduire — la correspondance se fait par identifiant, une entrée
 * en trop ne casse rien.
 */
const METHODES_RENCONTRE_FR = {
  // Ces cinq-là n'ont chez PokeAPI AUCUNE ligne de texte, ni anglaise ni
  // française : la fiche n'affichait donc pas de méthode du tout, et mille
  // douze lignes montraient un lieu sans dire ce qu'on y fait. Leurs noms
  // viennent de leur identifiant dans encounter_methods.csv — island-scan,
  // sos, npc-trade, sos-from-bubbling-spot, overworld-flying.
  32: 'Scanner Insulaire',
  33: 'Appelé en renfort',
  36: 'Échange avec un personnage',
  37: 'Appelé en renfort dans un remous',
  // Traduite, mais sans son accent chez PokeAPI.
  40: 'Pokémon volant dans le ciel',

  34: 'Pêche dans les remous',
  35: 'En secouant un arbre à baies',
  44: 'Après cinq rencontres au même endroit',
  45: 'Jirachi du disque bonus américain de Colosseum',
  46: 'Celebi ou Pikachu du disque bonus japonais de Colosseum',
  47: 'Jirachi de la version PAL de Pokémon Channel',
  48: 'Manaphy transféré depuis Pokémon Ranger',
  49: 'Pikachu, Élekable ou Magmar depuis Pokémon Battle Revolution',
  50: 'Œuf du Pokémon Center de New York, avec la capacité Vœu',
  51: 'Capturé sur un Dresseur dans Pokémon Colosseum ou XD',
  52: 'Capturé sur un Dresseur dans Colosseum ou XD, après un premier échec',
  53: 'Dans l\'un des trois Poké Spots de Pokémon XD',
  54: 'Dans une Trouée Cachée',
  55: 'En enduisant un arbre de miel, puis en attendant',
  56: 'Surgissant du sol ou d\'un marécage',
  57: 'Apparition fixe, à un endroit précis',
  58: 'Apparition fixe dans l\'eau',
  59: 'Pourchassé en entrant dans l\'eau',
  60: 'Lors d\'une Expédition Dynamax',
  61: 'Raid Dynamax',
  62: 'Surgi d\'une poubelle',
  63: 'Surgi d\'un buisson agité',
  64: 'Tombé du plafond d\'une grotte',
  65: 'Surgi du sol',
  66: 'Fondant du ciel'
};

// Le nom d'une méthode de rencontre, la table ci-dessus faisant foi.
function nomMethode(id){
  return METHODES_RENCONTRE_FR[id] || motDico('methodes', id);
}

const LIBELLES_MENTION = {
  introuvable: 'Introuvable ici',
  echange: 'Échange interne',
  evolution: 'Par évolution',
  offert: 'Pokémon offert',
  oeuf: "Par un œuf",
  fixe: 'Rencontre fixe',
  troupeau: 'En horde',
  rare: 'Apparition rare',
  raid: 'En raid',
  apparition: 'Apparition massive',
  'poke-radar': 'Poké Radar',
  distorsion: 'Distorsion',
  peche: 'À la canne',
  surf: "Sur l'eau",
  meteo: 'Selon la météo',
  jour: 'Le jour',
  nuit: 'La nuit',
  saison: 'Selon la saison'
};

// Une seule question, deux réponses possibles : on l'attrape ici, ou non. Le
// détail — évolution, échange, transfert — est déjà dans le texte du lieu et
// dans les mentions ; le répéter en tête de ligne noierait la réponse.
const LIBELLES_CATEGORIE = {
  sauvage: 'Capturable',
  evolution: 'Ne se capture pas',
  offert: 'Ne se capture pas',
  echange: 'Ne se capture pas',
  oeuf: 'Ne se capture pas',
  indisponible: 'Ne se capture pas'
};

// Le pourquoi, gardé pour le survol : la ligne reste courte, la nuance reste
// disponible.
const NUANCES_CATEGORIE = {
  sauvage: 'Capturable dans ce jeu',
  evolution: 'S\'obtient par évolution',
  offert: 'Offert au cours de l\'aventure',
  echange: 'S\'obtient par un échange interne',
  oeuf: 'S\'obtient par œuf',
  indisponible: 'Absent de ce jeu — à transférer'
};

async function dessinerAttaques(entry){
  ficheAttaquesJeux.innerHTML = '';
  messageVide(ficheAttaques, 'Chargement des capacités…');

  let reserve;
  try{
    reserve = await chargerAttaques();
  }catch(e){
    messageVide(ficheAttaques, 'Réserve des attaques indisponible. Elle se génère '
      + 'avec outils/generer-attaques.html.');
    return;
  }
  // La fiche a pu changer pendant le chargement : on ne dessine que si elle
  // est toujours celle qu'on nous a demandée.
  if(previewEntry !== entry) return;

  const parGroupe = reserve.especes[entry.id];
  if(!parGroupe || !Object.keys(parGroupe).length){
    messageVide(ficheAttaques, 'Aucune capacité répertoriée pour cette forme.');
    return;
  }

  const groupes = groupesProposes(parGroupe, reserve);
  if(!groupes.length){
    messageVide(ficheAttaques, 'Aucune capacité répertoriée dans ce jeu.');
    return;
  }

  function afficher(groupe){
    const liste = decoderBloc(reserve.blocs[parGroupe[groupe]], groupe, reserve);
    const sections = trierAttaques(liste, reserve.machines[groupe], reserve);
    ficheAttaques.innerHTML = '';
    let total = 0;
    const raccourcis = [];
    SECTIONS_ATTAQUES.forEach(function(s){
      const entrees = sections[s.cle] || [];
      total += entrees.length;
      if(!entrees.length) return;
      const bloc = dessinerSectionAttaques(s, entrees, reserve);
      ficheAttaques.appendChild(bloc);
      // Le libellé court : « Capsules Techniques (CT) » ne tient pas dans une
      // puce, et « CT » se reconnaît aussi bien.
      raccourcis.push({ libelle: s.court, compte: entrees.length, cible: bloc });
    });
    if(!total) messageVide(ficheAttaques, 'Aucune capacité répertoriée dans ce jeu.');

    dessinerRaccourcis(ficheAttaquesNav, raccourcis, ficheAttaques);
    if(ficheAttaquesFiltre){
      ficheAttaquesFiltre.value = '';
      ficheAttaquesFiltre.style.display = total ? '' : 'none';
    }

    Array.prototype.forEach.call(ficheAttaquesJeux.children, function(btn){
      const actif = btn.dataset.groupe === String(groupe);
      btn.classList.toggle('active', actif);
      btn.setAttribute('aria-selected', String(actif));
    });
  }

  // Une seule option n'est pas un choix : on économise la bande de boutons.
  if(groupes.length > 1){
    groupes.forEach(function(groupe){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'jeu-onglet';
      btn.setAttribute('role', 'tab');
      btn.dataset.groupe = String(groupe);
      btn.textContent = nomGroupeJeu(reserve, groupe);
      btn.addEventListener('click', function(){ afficher(groupe); });
      ficheAttaquesJeux.appendChild(btn);
    });
  }

  // Le plus récent qui apprenne encore des attaques par niveau : Pokémon
  // Champions n'expose que des capacités « entraînées », et ouvrir dessus
  // donnerait une fiche sans montée de niveau ni CT.
  const complets = groupes.filter(function(g){
    return decoderBloc(reserve.blocs[parGroupe[g]], g, reserve)
      .some(function(m){ return m.methode === 1; });
  });
  afficher(complets.length ? complets[complets.length - 1] : groupes[groupes.length - 1]);
}

// Filtrer par nom plutôt que faire défiler : sur les quarante CT d'un jeu
// moderne, chercher « Séisme » à l'œil prend plus de temps que de le taper.
// Les sections dont il ne reste rien s'effacent, et leur compte suit.
function filtrerAttaques(){
  if(!ficheAttaques) return;
  const q = (ficheAttaquesFiltre.value || '').trim().toLowerCase();
  let sectionsVisibles = 0;

  Array.prototype.forEach.call(ficheAttaques.children, function(section){
    if(!section.classList || !section.classList.contains('attaques-section')) return;
    let visibles = 0;
    Array.prototype.forEach.call(section.querySelectorAll('.attaque-ligne'), function(ligne){
      if(ligne.classList.contains('entete')) return;
      const nom = ligne.querySelector('.attaque-nom');
      const garde = !q || (nom && nom.textContent.toLowerCase().indexOf(q) !== -1);
      ligne.style.display = garde ? '' : 'none';
      if(garde) visibles++;
    });
    section.style.display = visibles ? '' : 'none';
    if(visibles) sectionsVisibles++;
    // Le compte suit le filtre : afficher « 47 » au-dessus d'une seule ligne
    // se lirait comme un bug.
    const compte = section.querySelector('.attaques-compte');
    if(compte) compte.textContent = String(visibles);
  });

  // Une recherche sans résultat doit le dire : sinon le panneau vide se lit
  // comme une panne.
  const aucune = ficheAttaques.querySelector('.attaques-aucune');
  if(q && !sectionsVisibles && !aucune){
    const msg = document.createElement('p');
    msg.className = 'fiche-vide attaques-aucune';
    msg.textContent = 'Aucune capacité ne porte ce nom dans ce jeu.';
    ficheAttaques.appendChild(msg);
  } else if((!q || sectionsVisibles) && aucune){
    aucune.remove();
  }
}

if(ficheAttaquesFiltre) ficheAttaquesFiltre.addEventListener('input', filtrerAttaques);

// Remplit les blocs de la fiche. Appelé après l'ouverture pour que la
// pop-up s'affiche tout de suite, sans attendre le réseau.
async function remplirFiche(entry){
  const detail = ficheEmbarquee(entry);
  dessinerStats(detail);
  dessinerEffort(detail);
  dessinerTalents(detail);
  // Après les talents, et pas avant : la notice se glisse dans la case que
  // leur nombre laisse libre, et il faut donc les avoir comptés.
  dessinerNotice(entry);
  // Le gabarit, les numéros régionaux et le nom anglais tiennent dans la bande
  // d'identité : ils sont dessinés avec elle, avant que le reste ne se remplisse.
  dessinerGabarit(entry, detail);
  dessinerDexRegionaux(entry);
  dessinerNomAutre(entry);
  dessinerEvolution(entry, detail);
  dessinerOeufs(entry, detail);

  // OUVERTE DEPUIS PIXELMONWORLD, LA FICHE NE PARLE QUE DU SERVEUR.
  //
  // C'est la règle que la fiche applique déjà pour les jeux — ouverte depuis
  // Épée, elle ne liste pas les rencontres de Rubis —, poussée d'un cran : un
  // serveur Minecraft n'a ni Pokédex régional, ni première apparition, ni
  // reproduction. Ces blocs ne seraient pas seulement inutiles : ils
  // répondraient à côté, en donnant à lire des jeux qu'on n'est pas en train
  // de jouer.
  //
  // Ce qui reste — statistiques, talents, lignée, faiblesses, attaques — vaut
  // pour l'espèce et vaut donc partout.
  const surPW = ficheSurPixelmonWorld();
  if(!surPW){
    dessinerObtention(entry, detail);
    dessinerLieuxReleves(entry);
    dessinerSpawnsCobblemon(entry);
  } else {
    // Le bloc part vide : dessinerSpawnsPW() le remplit seul, et sans ce
    // ménage il garderait les lignes de la fiche précédente.
    if(ficheObtention) ficheObtention.innerHTML = '';
    if(ficheObtentionNav) ficheObtentionNav.innerHTML = '';
  }
  // Le serveur PixelmonWorld, quand on y a droit. Après Cobblemon, pour que
  // les deux sources d'apparitions se suivent quand les deux s'affichent.
  if(typeof dessinerSpawnsPW === 'function') dessinerSpawnsPW(entry);
  dessinerAttaques(entry);


  // La rareté arrive par le réseau : la fiche s'affiche sans l'attendre, et la
  // ligne se remplit quand la table est là.
  if(typeof assurerRarete === 'function') assurerRarete(entry);
  if(typeof dessinerBoutonRecherche === 'function') dessinerBoutonRecherche();
  if(typeof dessinerRangement === 'function') dessinerRangement(entry);

  // « Disponible dans » n'a de sens que sur le Pokédex Pokémon HOME : sur
  // l'onglet d'un jeu, la réponse est le jeu lui-même. On masque le bloc ici,
  // mais sans quitter la fonction — les types et la première apparition, eux,
  // restent utiles partout.
  //
  // SUR PIXELMONWORLD, TROIS BLOCS DE PLUS S'EN VONT : la première apparition
  // (le serveur n'a pas d'histoire de sortie), la reproduction (on n'y fait
  // pas d'œufs) et les numéros de Pokédex régionaux (il n'a qu'un Pokédex, et
  // c'est le national).
  const surUnJeu = !!gameByKey[currentTab];
  if(ficheBlocJeux) ficheBlocJeux.style.display = (surUnJeu || surPW) ? 'none' : '';
  if(ficheBlocPremier) ficheBlocPremier.style.display = surPW ? 'none' : '';
  if(ficheBlocRepro) ficheBlocRepro.style.display = surPW ? 'none' : '';
  if(ficheDexRegionaux) ficheDexRegionaux.style.display = surPW ? 'none' : '';
  // La grille perd alors une case sur sa dernière rangée : la première
  // apparition la comble en prenant les deux colonnes. Sur PixelmonWorld les
  // deux s'en vont, et il n'y a plus de trou à combler.
  const grille = previewOverlay.querySelector('.colonnes');
  if(grille) grille.classList.toggle('sans-jeux', surUnJeu && !surPW);
  // Le cri ne depend d'aucune requete : il se prepare avant le reste, et
  // survit donc a une panne de reseau sur les types.
  preparerCri(entry);

  // --- Types ---
  ficheTypes.innerHTML = '<span class="jeu-puce">Chargement…</span>';
  try{
    await loadTypes();
    const ids = typesByPokemonId ? (typesByPokemonId.get(entry.id) || []) : [];
    if(ids.length){
      ficheTypes.innerHTML = '';
      ids.forEach(function(t){ ficheTypes.appendChild(puceType(t)); });
      // La fiche prend la couleur de son type principal.
      appliquerTeinte(ids);
    } else {
      ficheTypes.innerHTML = '<span class="jeu-puce">Type inconnu</span>';
    }
    // Les faiblesses se déduisent des mêmes identifiants : aucune requête de
    // plus, et le bloc se remplit en même temps que les puces de type.
    dessinerAffinites(ids);
  }catch(e){
    ficheTypes.innerHTML = '<span class="jeu-puce">Types indisponibles hors ligne</span>';
    dessinerAffinites(null);
  }

  // --- Première apparition ---
  const gen = entry.gen;
  fichePremier.textContent = gen && GEN_PREMIERS_JEUX[gen]
    ? GEN_PREMIERS_JEUX[gen] + '  (génération ' + gen + ')'
    : 'Forme spéciale — pas de première apparition propre.';

  // --- Disponibilité ---
  // Bloc masqué sur un onglet de jeu et sur PixelmonWorld : inutile d'en
  // calculer le contenu, et la table de disponibilité passe par le réseau.
  if(surUnJeu || surPW) return;
  ficheJeux.innerHTML = '<span class="jeu-puce">Chargement des Pokédex…</span>';
  try{
    const table = await chargerDisponibilite();
    const vgs = table.get(entry.speciesId) || [];
    if(!vgs.length){
      ficheJeux.innerHTML = '<span class="jeu-puce">Aucun Pokédex régional connu — '
        + 'disponible via Pokémon HOME uniquement.</span>';
      return;
    }
    ficheJeux.innerHTML = '';
    // On garde l'ordre chronologique de VG_FR plutôt que celui des Pokédex.
    Object.keys(VG_FR).forEach(function(vg){
      if(vgs.indexOf(vg) === -1) return;
      const p = document.createElement('span');
      p.className = 'jeu-puce';
      p.textContent = VG_FR[vg];
      ficheJeux.appendChild(p);
    });
    // Cobblemon a toutes les espèces : on le signale au passage.
    if(entry.speciesId <= 1025){
      const p = document.createElement('span');
      p.className = 'jeu-puce';
      p.textContent = '⛏️ Cobblemon';
      ficheJeux.appendChild(p);
    }
  }catch(e){
    ficheJeux.innerHTML = '<span class="jeu-puce">Disponibilité indisponible hors ligne</span>';
  }
}

// ---- Le cri -----------------------------------------------------------------
//
// PokeAPI en publie deux par espèce : « latest », celui des jeux récents, et
// « legacy », celui de l'époque Game Boy — plus court, plus rêche, et
// franchement plus juste sur un Pokédex de Rouge et Bleu.
//
// Le choix suit le jeu ouvert, comme la notice, les lieux et la table des
// types : ereDesTypes() rend 1 ou 2 pour les jeux d'avant la sixième, ce qui
// est exactement la limite où « legacy » s'arrête d'exister.
//
// Le fichier vient de raw.githubusercontent.com, autorisé dans la CSP pour
// « media-src ». Sans cette directive la balise audio est bloquée en silence :
// media-src n'a pas de valeur par défaut propre et retombe sur default-src,
// qui vaut 'self'.

const CRI_BASE = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon';

// Le volume vit dans localStorage, comme le thème et la langue : c'est une
// préférence d'appareil, pas une donnée de progression. Sept dixièmes par
// défaut — les cris de PokeAPI sont normalisés fort, et à plein volume dans un
// casque le premier clic fait sursauter.
const CRI_VOLUME_KEY = 'pokearchive-cri-volume';
const CRI_VOLUME_DEFAUT = 70;

let criAudio = null;      // une seule balise, réutilisée
let criEntree = null;     // l'entrée dont le cri est prêt
let criJeton = 0;         // même garde que noticeJeton : deux clics rapides
let criVolume = CRI_VOLUME_DEFAUT;

/**
 * Les adresses à tenter, dans l'ordre.
 *
 * Relevé sur l'arbre du dépôt, comparé aux 1 634 entrées embarquées :
 *
 *   latest/{id}          existe pour les 1 634, formes régionales comprises.
 *   legacy/{id}          existe pour 808 d'entre elles — jusqu'à la cinquième.
 *   legacy/{speciesId}   rattrape 185 formes de plus : Deoxys Attaque n'a pas
 *                        d'ancien cri à son propre identifiant, l'espèce si,
 *                        et c'est le même son dans le jeu.
 *
 * D'où trois adresses sur un vieux jeu, une seule sur un récent. Le dernier
 * repli est toujours le cri moderne : mieux vaut le mauvais siècle que rien.
 */
function adressesDuCri(entry, ere){
  const moderne = CRI_BASE + '/latest/' + entry.id + '.ogg';
  if(ere >= 6) return [moderne];
  const liste = [CRI_BASE + '/legacy/' + entry.id + '.ogg'];
  if(entry.speciesId && entry.speciesId !== entry.id){
    liste.push(CRI_BASE + '/legacy/' + entry.speciesId + '.ogg');
  }
  liste.push(moderne);
  return liste;
}

// ---- L'icône ----------------------------------------------------------------
//
// L'émoji 🔊 rendait la police du système : un haut-parleur bleu et brillant au
// milieu d'une interface qui n'a aucune autre couleur d'origine, et qui ne
// changeait pas avec le thème. Un tracé, lui, prend currentColor et suit la
// teinte du type comme le reste de la fiche.
//
// Il dit aussi le niveau, ce qu'un émoji fixe ne faisait pas : pas d'onde quand
// le son est coupé, une onde jusqu'à la moitié, deux au-delà. On sait où on en
// est sans ouvrir le curseur.
const CRI_TRACES = {
  cone:  'M1.7 6.1h2.5l3.4-3v9.8l-3.4-3H1.7z',
  onde1: 'M9.7 6.3a2.4 2.4 0 0 1 0 3.4',
  onde2: 'M11.5 4.6a4.9 4.9 0 0 1 0 6.8',
  croix: 'M10.3 6.4l3.3 3.2M13.6 6.4l-3.3 3.2',
};

function iconeSon(niveau){
  const traits = 'fill="none" stroke="currentColor" stroke-width="1.3" '
               + 'stroke-linecap="round"';
  const parts = ['<path d="' + CRI_TRACES.cone + '" fill="currentColor"/>'];
  if(niveau <= 0){
    parts.push('<path d="' + CRI_TRACES.croix + '" ' + traits + '/>');
  } else {
    parts.push('<path d="' + CRI_TRACES.onde1 + '" ' + traits + '/>');
    if(niveau >= 55) parts.push('<path d="' + CRI_TRACES.onde2 + '" ' + traits + '/>');
  }
  return '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" '
       + 'focusable="false">' + parts.join('') + '</svg>';
}

// ---- Le volume --------------------------------------------------------------

function appliquerVolume(niveau, enregistrer){
  criVolume = Math.max(0, Math.min(100, Math.round(niveau)));
  if(criAudio) criAudio.volume = criVolume / 100;
  if(portraitVolume) portraitVolume.value = String(criVolume);
  if(portraitCri){
    portraitCri.innerHTML = iconeSon(criVolume);
    // L'infobulle porte le niveau : c'est ce qui fait découvrir le curseur à
    // quelqu'un qui n'a pas encore survolé le coin du portrait.
    portraitCri.title = criVolume === 0
      ? 'Écouter son cri — son coupé'
      : 'Écouter son cri — volume ' + criVolume + ' %';
  }
  if(enregistrer){
    try{ localStorage.setItem(CRI_VOLUME_KEY, String(criVolume)); }catch(e){ /* stockage refusé */ }
  }
}

function initVolumeCri(){
  let garde = null;
  try{ garde = localStorage.getItem(CRI_VOLUME_KEY); }catch(e){ /* stockage refusé */ }
  const n = parseInt(garde, 10);
  appliquerVolume(isNaN(n) ? CRI_VOLUME_DEFAUT : n, false);
}

// ---- La lecture -------------------------------------------------------------

function preparerCri(entry){
  if(!portraitSon) return;
  criJeton++;                       // la fiche a changé : ce qui jouait est caduc
  arreterCri();
  criEntree = entry || null;
  portraitSon.hidden = !entry;
  if(portraitCri) portraitCri.disabled = false;
  // Le bouton ne promet rien : on ne va pas chercher le fichier avant qu'on le
  // demande. Vérifier à l'ouverture de chaque fiche ferait une requête réseau
  // pour un bouton que personne ne clique la plupart du temps.
}

async function jouerCri(){
  if(!criEntree || !portraitCri) return;
  const entry = criEntree;
  const jeton = ++criJeton;
  const adresses = adressesDuCri(entry, ereDesTypes(currentTab));

  if(!criAudio){
    criAudio = new Audio();
    criAudio.preload = 'none';
  }
  criAudio.volume = criVolume / 100;
  criAudio.pause();
  portraitCri.disabled = true;

  for(const url of adresses){
    try{
      criAudio.src = url;
      await criAudio.play();
      if(jeton === criJeton) portraitCri.disabled = false;
      return;                       // joué : on ne tente pas le repli
    }catch(e){
      // 404 sur l'ancien, ou lecture interrompue. Si la fiche a changé entre
      // temps, on abandonne sans toucher à un bouton qui parle d'un autre.
      if(jeton !== criJeton) return;
    }
  }

  // Aucune des adresses. Le relevé dit que cela n'arrive pas — mais hors ligne,
  // si : le groupe se retire plutôt que de rester inerte, un bouton qui ne fait
  // rien deux fois de suite passe pour cassé.
  portraitCri.disabled = false;
  portraitSon.hidden = true;
}

/** Couper le cri. Appelée par closePreview() : fermer la fiche coupe le son. */
function arreterCri(){
  if(criAudio) criAudio.pause();
}

if(portraitCri) portraitCri.addEventListener('click', jouerCri);
if(portraitVolume){
  // « input » et non « change » : le niveau suit le doigt, et l'icône avec.
  portraitVolume.addEventListener('input', function(){
    appliquerVolume(parseInt(portraitVolume.value, 10), true);
  });
  // Bouger le curseur sans écouter ne dit rien du résultat. Au relâchement, on
  // rejoue au nouveau volume — mais seulement si une fiche est ouverte.
  portraitVolume.addEventListener('change', function(){
    if(criEntree && criVolume > 0) jouerCri();
  });
}
initVolumeCri();
