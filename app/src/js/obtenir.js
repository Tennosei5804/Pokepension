// Comment l'avoir : on tape un nom, on lit la marche à suivre.
// Script classique (pas de module ES) : l'application reste ouvrable en file://
// Chargé APRÈS fiche.js (conditionEvolution, motDico), lieux.js (replierLieu,
// puceEspece) et parties.js.
//
// LA QUESTION, TELLE QU'ELLE SE POSE VRAIMENT.
//
// « Comment on a Togépi ? » — et la réponse tient en une ligne : par un œuf.
// L'application savait déjà le dire, mais seulement en ouvrant la fiche du
// Pokémon, et seulement pour le jeu ouvert. Il fallait donc connaître le nom,
// le trouver dans la grille, ouvrir sa carte, et recommencer pour le suivant.
//
// Ici on tape le nom et on lit la réponse, toutes générations confondues.
//
// D'OÙ VIENT CHAQUE RÉPONSE :
//   · DONNEES_LIEUX.jeux    — la catégorie par jeu : sauvage, œuf, offert,
//                             échange interne, évolution, indisponible
//   · fiches.especes[].evo  — de qui, et à quelle condition
//   · conditionEvolution()  — la même phrase que la fiche, pas une seconde
//   · DISTRIBUTIONS         — les 552 distributions, avec leur région
//   · OBTENIR_CAS_A_PART    — la petite table ci-dessous, écrite à la main
//
// CE QU'ELLE NE FAIT PAS. Elle ne dit pas OÙ dans le jeu : c'est la page Lieux,
// et elle y renvoie. Répéter ici les mille sept cents lieux du relevé ferait
// deux écrans à tenir d'accord, et le dépôt a déjà payé cette dérive.

// ---- Ce que la réserve ne sait pas dire -------------------------------------
//
// NEUF POKÉMON N'ONT AUCUNE LIGNE UTILE, et ce ne sont pas des oublis : leur
// obtention n'est écrite nulle part dans les données que nous relevons.
//
// Huit bébés ne naissent que si le parent TIENT un encens. Le relevé les donne
// « par un œuf », ce qui est vrai et inutilisable : sans l'encens, l'œuf sort
// le parent. PokeAPI porte cette règle sur la CHAÎNE d'évolution — un champ
// baby_trigger_item — que generer.js ne descend pas, faute d'en avoir eu besoin
// jusqu'ici. Neuf lignes écrites à la main coûtent moins qu'un relevé de plus.
//
// Phione est encore à part : il éclôt d'un œuf de Manaphy, et ne remonte
// jamais à Manaphy. Ce n'est ni une évolution ni un bébé ordinaire.
//
// Vérifié sur Poképédia le 8 septembre 2026. Les numéros sont ceux du Pokédex
// national, la seule clé stable entre les jeux.
const OBTENIR_CAS_A_PART = {
  298: { titre: 'Par un œuf, avec un encens',
         detail: 'Fais pondre Azumarill ou Mathiéu en lui faisant tenir l’Encens Marin.' },
  360: { titre: 'Par un œuf, avec un encens',
         detail: 'Fais pondre Qulbutoké en lui faisant tenir l’Encens Plein.' },
  406: { titre: 'Par un œuf, avec un encens',
         detail: 'Fais pondre Rosélia ou Roserade en lui faisant tenir l’Encens Floral.' },
  433: { titre: 'Par un œuf, avec un encens',
         detail: 'Fais pondre Éoko en lui faisant tenir l’Encens Pur.' },
  438: { titre: 'Par un œuf, avec un encens',
         detail: 'Fais pondre Simularbre en lui faisant tenir l’Encens Rocheux.' },
  439: { titre: 'Par un œuf, avec un encens',
         detail: 'Fais pondre M. Mime en lui faisant tenir l’Encens Bizarre.' },
  440: { titre: 'Par un œuf, avec un encens',
         detail: 'Fais pondre Leveinard ou Leuphorie en lui faisant tenir l’Encens Chance.' },
  458: { titre: 'Par un œuf, avec un encens',
         detail: 'Fais pondre Démanta en lui faisant tenir l’Encens Ondée.' },
  // Manaphy n'est PAS un descendant de Phione — Phione n'évolue en rien. Le
  // bouton ne pourrait donc pas le deviner : on le nomme.
  489: { parent: 490, titre: 'Par un œuf de Manaphy',
         detail: 'Fais pondre Manaphy avec Métamorph. Phione ne devient jamais '
               + 'Manaphy : c’est une impasse, et il faut Manaphy pour en avoir un.' },
};

// ---- Les jeux où le Cordon de Liaison remplace le partenaire ----------------
//
// Le déclencheur d'évolution nº 2 se lit « Échange ou Cordon de Liaison » :
// depuis Épée/Bouclier, un objet remplace l'autre joueur. Le dire évite
// d'envoyer chercher un ami à qui joue à Écarlate.
//
// Diamant Étincelant / Perle Scintillante en sont VOLONTAIREMENT absents : ces
// remakes suivent Diamant et Perle jusque-là, et l'échange y reste obligatoire.
const OBTENIR_CORDON = ['swsh', 'pla', 'sv', 'za'];
const OBTENIR_CORDON_NOMS = 'Épée/Bouclier, Légendes Arceus, Écarlate/Violet et Légendes Z-A';

// ---- Les routes d'une forme, jeu par jeu ------------------------------------
//
// ON PREND UNE ENTRÉE, PAS UN NUMÉRO D'ESPÈCE. Le relevé est indexé par espèce :
// sa ligne « Raichu » vaut pour Rouge et Bleu, et interrogé au numéro il
// répondait que le Raichu d'ALOLA s'y capture. formAllowedInGame() est le juge
// que la grille du Pokédex emploie déjà — s'en remettre à lui, c'est répondre
// comme elle plutôt que de tenir un second avis.
//
// varianteDeCapture() écarte en amont les Méga, les Gigamax et les costumes :
// un Pikachu à casquette n'hérite pas de la capturabilité de Pikachu.
function obtenirRoutes(entree){
  if(typeof DONNEES_LIEUX === 'undefined' || !DONNEES_LIEUX) return [];
  if(typeof varianteDeCapture === 'function' && !varianteDeCapture(entree)) return [];

  const cats = DONNEES_LIEUX.categories || [];
  const routes = [];
  Object.keys(DONNEES_LIEUX.jeux || {}).forEach(function(cle){
    const jeu = (typeof gameByKey !== 'undefined' && gameByKey) ? gameByKey[cle] : null;
    if(jeu && typeof formAllowedInGame === 'function' && !formAllowedInGame(entree, jeu)) return;
    const ligne = DONNEES_LIEUX.jeux[cle][entree.speciesId];
    if(!ligne) return;
    const cat = cats[ligne[1]];
    if(!cat || cat === 'indisponible') return;
    routes.push({ jeu: cle, categorie: cat });
  });
  return routes;
}

function obtenirNomJeu(cle){
  if(typeof gameByKey !== 'undefined' && gameByKey && gameByKey[cle]){
    const j = gameByKey[cle];
    return j.title || j.tab || cle;
  }
  return cle;
}

/**
 * Ce qui évolue DEPUIS cette espèce, par leur nom.
 *
 * L'index se construit une fois : mille trois cent cinquante espèces relues à
 * chaque frappe dans le champ de recherche, ce serait le seul endroit lent de
 * la page.
 */
let obtenirEnfants = null;
function obtenirDescendants(speciesId){
  return obtenirDescendantsIds(speciesId).map(function(id){
    return (typeof nomParEspece === 'function') ? nomParEspece(id) : ('nº ' + id);
  });
}

/** L'entrée de BASE d'une espèce, celle que les outils attendent. */
function obtenirEntreeEspece(speciesId){
  if(typeof allEntries === 'undefined' || !allEntries) return null;
  return allEntries.find(function(e){ return e.speciesId === speciesId && e.id === speciesId; })
      || allEntries.find(function(e){ return e.speciesId === speciesId; })
      || null;
}

/**
 * Les numéros de ce qui évolue depuis cette espèce, toute la lignée en aval.
 *
 * LES FORMES SONT ÉCARTÉES, et c'est le fond de la réponse. Le relevé fait
 * évoluer Carabaffe vers Tortank, mais aussi vers Méga-Tortank et vers son
 * Gigamax : trois numéros pour un seul Pokémon. Aucune de ces formes n'a
 * d'entrée au Pokédex, alors la lignée sortait « Carabaffe ou Tortank ou
 * n°10036 ou n°10197 » : deux numéros bruts qui ne se cherchent nulle part et
 * qui ne se font pas pondre.
 *
 * Un descendant sans entrée au Pokédex est une FORME, jamais un Pokémon de
 * plus — les 1351 entrées tiennent toutes sous le numéro 10000, les 173
 * descendants qui dépassent sont tous des Méga, des Gigamax ou des formes
 * régionales. Et AUCUNE n'a elle-même d'évolution : les écarter en chemin ne
 * coupe donc aucune lignée, et aucune lignée ne se vide.
 */
function obtenirDescendantsIds(speciesId){
  if(!obtenirEnfants){
    obtenirEnfants = new Map();
    const esp = (typeof DONNEES_EMBARQUEES !== 'undefined' && DONNEES_EMBARQUEES.fiches)
      ? (DONNEES_EMBARQUEES.fiches.especes || {}) : {};
    Object.keys(esp).forEach(function(cle){
      const evo = esp[cle] && esp[cle].evo;
      if(!evo || !evo.de) return;
      if(!obtenirEnfants.has(evo.de)) obtenirEnfants.set(evo.de, []);
      obtenirEnfants.get(evo.de).push(parseInt(cle, 10));
    });
  }
  // TOUTE LA LIGNÉE EN AVAL, ET PAS SEULEMENT LES ENFANTS DIRECTS. Togékiss
  // pond des Togépi tout autant que Togetic : ne nommer que le premier étage
  // ferait chercher un Pokémon intermédiaire qu'on n'a peut-être pas gardé.
  const vus = new Set();
  const file = (obtenirEnfants.get(speciesId) || []).slice();
  while(file.length){
    const id = file.shift();
    if(vus.has(id)) continue;
    vus.add(id);
    (obtenirEnfants.get(id) || []).forEach(function(x){ file.push(x); });
  }
  return [...vus].filter(function(id){ return !!obtenirEntreeEspece(id); });
}

/** Les distributions qui ont donné cette espèce, région comprise. */
let obtenirParEspece = null;
function obtenirDistributions(speciesId){
  if(!obtenirParEspece){
    obtenirParEspece = new Map();
    const brut = (typeof DISTRIBUTIONS !== 'undefined' && typeof cadeauLu === 'function')
      ? DISTRIBUTIONS.map(cadeauLu) : [];
    brut.forEach(function(c){
      if(!c || !c.espece) return;
      if(!obtenirParEspece.has(c.espece)) obtenirParEspece.set(c.espece, []);
      obtenirParEspece.get(c.espece).push(c);
    });
  }
  return obtenirParEspece.get(speciesId) || [];
}

// ---- Les boutons qui mènent aux outils --------------------------------------
//
// OUVRIR L'ONGLET NE SUFFIT PAS. Un bouton qui dépose sur une page vide, où il
// faut retaper le nom qu'on vient de lire, ne fait que déplacer le travail.
// Chaque outil a déjà de quoi arriver garni : la reproduction expose
// ouvrirCoParent(), écrite pour ça et employée par la fiche ; les cadeaux ont
// leur champ de recherche.
//
// Le bouton porte donc une ACTION et non un nom de page. Si l'outil visé ne
// sait pas se poser sur un Pokémon, on n'invente rien : on ouvre la page, ce
// qui reste mieux que rien.
function obtenirVersReproduction(parentId){
  const parent = parentId ? obtenirEntreeEspece(parentId) : null;
  return {
    libelle: parent ? 'Voir avec qui faire la reproduction' : 'Voir reproduction',
    aller: function(){
      if(typeof showPage === 'function') showPage('reproduction');
      if(parent && typeof ouvrirCoParent === 'function') ouvrirCoParent(parent);
    },
  };
}

function obtenirVersCadeaux(entree){
  return {
    libelle: 'Voir ses distributions',
    aller: function(){
      if(typeof showPage === 'function') showPage('cadeaux');
      const champ = document.getElementById('cadeauxQ');
      if(!champ) return;
      // Le nom affiché plutôt que le slug : c'est ce que le filtre compare, et
      // c'est aussi ce qu'on lit dans le champ après coup.
      champ.value = (typeof nomAffiche === 'function') ? nomAffiche(entree) : entree.display;
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    },
  };
}

// ---- La réponse -------------------------------------------------------------
//
// UNE VOIE PAR MANIÈRE DE L'AVOIR, dans l'ordre où on l'essaierait. Se capturer
// vient d'abord parce que c'est le plus simple ; la distribution vient en
// dernier parce qu'elle est le plus souvent hors d'atteinte.
// L'ÉCHANGE INTERNE N'EST PAS DANS CETTE LISTE, ET C'EST VOULU. Le relevé le
// connaît — une catégorie « echange », le PNJ qui troque son Abra contre ton
// Machoc. Mais ce n'est une réponse à « comment l'avoir » que dans un seul jeu,
// une seule fois, et il fallait déjà posséder l'autre Pokémon. Il encombrait
// chaque carte d'une ligne qu'on saute. La fiche du Pokémon le dit toujours,
// pour qui la cherche.
const OBTENIR_ORDRE = [
  { cat: 'sauvage',   icone: '🌿', titre: 'Se capture' },
  { cat: 'oeuf',      icone: '🥚', titre: 'Par un œuf' },
  { cat: 'offert',    icone: '🎁', titre: 'Offert dans l’aventure' },
];

// ---- Le titre dit le MÉCANISME, pas la catégorie ----------------------------
//
// « Par évolution — De Spectrum — Échange » enterrait le seul mot qui compte.
// Ce qu'on veut lire d'un coup d'œil, c'est « par échange » ou « par objet » :
// le reste est un détail qui se lit après, s'il se lit.
//
// Les déclencheurs rares gardent le libellé général et leur condition écrite au
// long : les nommer un par un ferait une table à tenir à jour pour trois cas.
const OBTENIR_DECLENCHEURS = {
  1: { icone: '🔁', titre: 'Par évolution' },
  2: { icone: '🤝', titre: 'Par échange' },
  3: { icone: '💎', titre: 'Par un objet' },
};

function obtenirVoies(entree){
  const voies = [];
  const routes = obtenirRoutes(entree);
  const parCat = {};
  routes.forEach(function(r){
    if(!parCat[r.categorie]) parCat[r.categorie] = [];
    parCat[r.categorie].push(r.jeu);
  });

  // Le cas à part passe DEVANT le reste : quand il existe, la ligne « par un
  // œuf » du relevé est vraie mais trompeuse, et c'est lui qui la précise.
  const apart = OBTENIR_CAS_A_PART[entree.speciesId];
  if(apart){
    voies.push({ icone: '🥚', titre: apart.titre, detail: apart.detail,
                 jeux: parCat.oeuf || [],
                 bouton: obtenirVersReproduction(
                   apart.parent || obtenirDescendantsIds(entree.speciesId)[0]) });
  }

  OBTENIR_ORDRE.forEach(function(o){
    if(apart && o.cat === 'oeuf') return;      // déjà dit, et mieux dit
    if(!parCat[o.cat]) return;
    voies.push({ icone: o.icone, titre: o.titre, jeux: parCat[o.cat],
                 lieux: o.cat === 'sauvage' });
  });

  // L'évolution ne dépend pas du jeu : elle se dit une fois, avec sa condition.
  const esp = (typeof DONNEES_EMBARQUEES !== 'undefined' && DONNEES_EMBARQUEES.fiches
               && DONNEES_EMBARQUEES.fiches.especes)
    ? DONNEES_EMBARQUEES.fiches.especes[String(entree.speciesId)] : null;
  const det = esp && esp.evo;
  if(det && det.de){
    const parent = (typeof nomParEspece === 'function') ? nomParEspece(det.de) : ('nº ' + det.de);
    const forme = OBTENIR_DECLENCHEURS[det.declencheur] || { icone: '🔁', titre: 'Par évolution' };

    // Le détail dit quoi FAIRE, à l'impératif, plutôt que de répéter le titre.
    //
    // DEUX RÉGIMES, ET IL NE FAUT PAS LES MÉLANGER. Les trois mécanismes
    // courants se réécrivent à l'impératif, et je leur rajoute alors les
    // conditions qui restent. Tout le reste garde la phrase complète de la
    // fiche, qui les porte DÉJÀ — les rajouter par-dessus donnait « la nuit
    // la nuit » sur Noctali.
    let detail;
    let aRecrire = true;
    if(det.declencheur === 2){
      detail = 'Fais évoluer ' + parent;
    }else if(det.declencheur === 3){
      const objet = det.objet && typeof motDico === 'function' ? motDico('objets', det.objet) : null;
      detail = objet ? 'Utilise ' + objet + ' sur ' + parent
                     : 'Utilise l’objet voulu sur ' + parent;
    }else if(det.declencheur === 1 && det.niveau){
      detail = 'Fais monter ' + parent + ' au niveau ' + det.niveau;
    }else{
      // Les cas tordus — le rocher moussu, l'affection, une capacité connue,
      // le bonheur — gardent la phrase de la fiche : la resserrer les rendrait
      // faux, et elle est déjà juste.
      const bouts = (typeof conditionEvolution === 'function') ? conditionEvolution(det) : [];
      // « De Évoli » ne se dit pas : devant une voyelle, « de » s'élide.
      // La fiche fait la même chose dans dessinerObtention().
      const elide = /^[aeiouyàâäéèêëîïôöûüh]/i.test(parent);
      detail = (elide ? 'D’' : 'De ') + parent
             + (bouts.length ? ' — ' + bouts.join(', ') : '');
      aRecrire = false;
    }

    // Ce que le mécanisme seul ne dit pas : « en tenant Peau Métal » sur un
    // échange, « la nuit » sur une montée de niveau. Sans elles, deux
    // évolutions par échange se liraient pareil alors qu'elles ne le sont pas.
    if(aRecrire){
      const extra = [];
      if(det.objetTenu && typeof motDico === 'function'){
        extra.push('en tenant ' + motDico('objets', det.objetTenu));
      }
      if(det.moment) extra.push(det.moment === 'day' ? 'le jour' : 'la nuit');
      if(det.genre) extra.push(det.genre === 1 ? 'femelle uniquement' : 'mâle uniquement');
      if(extra.length) detail += ', ' + extra.join(', ');
      detail += '.';
    }

    const voie = { icone: forme.icone, titre: forme.titre, detail: detail,
                   jeux: parCat.evolution || [] };
    // ÉCHANGE : le mot « Échange » seul laisse croire à un échange PNJ. C'est
    // le seul cas où il faut une autre personne, et il mérite sa phrase.
    if(det.declencheur === 2){
      voie.avertissement = 'Il te faut un autre joueur — sauf dans '
        + OBTENIR_CORDON_NOMS + ', où le Cordon de Liaison le remplace.';
    }
    voies.push(voie);
  }

  // PAR REPRODUCTION DE SA PROPRE LIGNÉE, et c'est la réponse qu'on attend
  // pour un bébé. Le relevé classait Togépi « offert » et « échange contre un
  // PNJ » — exact, et à côté de la question : on l'obtient surtout en faisant
  // pondre Togetic. La règle se déduit sans table : un Pokémon dont RIEN ne le
  // fait évoluer (evo absent) mais QUI a des évolutions est la base de sa
  // lignée, donc ce que pond cette lignée.
  //
  // Elle vaut aussi pour Bulbizarre, et c'est voulu : « faire pondre Florizarre »
  // est une vraie façon d'en avoir un second.
  if(!det && !apart){
    const enfants = obtenirDescendants(entree.speciesId);
    if(enfants.length){
      // FEMELLE, ET CE N'EST PAS UN DÉTAIL : l'espèce du petit vient de la
      // MÈRE. Faire pondre un Togetic mâle donne l'espèce de sa partenaire,
      // pas un Togépi. C'est l'erreur qu'on ne fait qu'une fois, et seulement
      // si personne ne l'a dite avant.
      voies.push({ icone: '🥚', titre: 'Par reproduction',
                   detail: 'Fais un œuf de ' + enfants.join(' ou ') + ' femelle.',
                   bouton: obtenirVersReproduction(obtenirDescendantsIds(entree.speciesId)[0]) });
    }
  }

  const dons = obtenirDistributions(entree.speciesId);
  if(dons.length){
    const regions = [];
    dons.forEach(function(d){
      if(d.region && regions.indexOf(d.region) === -1) regions.push(d.region);
    });
    voies.push({ icone: '📮', titre: 'Par une distribution',
                 detail: dons.length + (dons.length > 1 ? ' distributions relevées' : ' distribution relevée')
                       + (regions.length ? ' — ' + regions.slice(0, 4).join(', ') : '') + '.',
                 bouton: obtenirVersCadeaux(entree) });
  }

  return voies;
}

// ---- L'écran ----------------------------------------------------------------

function obtenirCandidats(q){
  if(typeof allEntries === 'undefined' || !allEntries) return [];
  const plie = (typeof replierLieu === 'function') ? replierLieu : function(s){
    return String(s).toLowerCase();
  };
  const cible = plie(q);
  if(!cible) return [];
  const numero = /^\d+$/.test(cible) ? parseInt(cible, 10) : null;

  const trouves = allEntries.filter(function(e){
    if(numero) return e.speciesId === numero;
    return plie(e.display).indexOf(cible) !== -1
        || plie(e.displayEn || '').indexOf(cible) !== -1;
  });
  // Ceux dont le nom COMMENCE par ce qu'on a tapé d'abord : « mime » doit
  // donner M. Mime avant Mime Jr., et « pika » Pikachu avant ses casquettes.
  return trouves.sort(function(a, b){
    const da = plie(a.display).indexOf(cible), db = plie(b.display).indexOf(cible);
    return (da - db) || a.speciesId - b.speciesId || a.id - b.id;
  }).slice(0, 12);
}

function obtenirCarte(entree){
  const carte = document.createElement('div');
  carte.className = 'obtenir-carte';

  const tete = document.createElement('div');
  tete.className = 'obtenir-tete';
  const nom = document.createElement('span');
  nom.className = 'obtenir-nom';
  nom.textContent = (typeof nomAffiche === 'function') ? nomAffiche(entree) : entree.display;
  const no = document.createElement('span');
  no.className = 'obtenir-no';
  no.textContent = '#' + String(entree.speciesId).padStart(4, '0');
  tete.appendChild(nom);
  tete.appendChild(no);
  // La fiche complète reste à un clic : c'est elle qui porte les stats, les
  // talents et le détail des lieux.
  const ouvrir = document.createElement('button');
  ouvrir.type = 'button';
  ouvrir.className = 'toggle-btn obtenir-fiche';
  ouvrir.textContent = 'Sa fiche';
  ouvrir.addEventListener('click', function(){
    if(typeof openPreview === 'function') openPreview(entree);
  });
  tete.appendChild(ouvrir);
  carte.appendChild(tete);

  const voies = obtenirVoies(entree);
  if(!voies.length){
    const rien = document.createElement('div');
    rien.className = 'state-msg';
    rien.textContent = 'Aucune voie connue : ni capture, ni œuf, ni évolution, '
                     + 'ni distribution relevée. Il vient sans doute d’un jeu '
                     + 'dont les lieux ne sont pas documentés.';
    carte.appendChild(rien);
    return carte;
  }

  voies.forEach(function(v){
    const ligne = document.createElement('div');
    ligne.className = 'obtenir-voie';

    const titre = document.createElement('div');
    titre.className = 'obtenir-voie-titre';
    titre.textContent = v.icone + ' ' + v.titre;
    ligne.appendChild(titre);

    if(v.detail){
      const d = document.createElement('div');
      d.className = 'obtenir-voie-detail';
      d.textContent = v.detail;
      ligne.appendChild(d);
    }
    if(v.avertissement){
      const a = document.createElement('div');
      a.className = 'obtenir-voie-note';
      a.textContent = v.avertissement;
      ligne.appendChild(a);
    }
    if(v.jeux && v.jeux.length){
      const j = document.createElement('div');
      j.className = 'obtenir-voie-jeux';
      // QUATRE JEUX, PAS DOUZE. Phione en listait douze sur quatre lignes
      // serrées, et personne ne les lit : ce qu'on veut savoir, c'est « oui,
      // plusieurs », pas lesquels exactement. Le compte exact reste dit, et la
      // page Lieux les nomme tous.
      const noms = v.jeux.map(obtenirNomJeu);
      j.textContent = 'Dans : ' + noms.slice(0, 4).join(' · ')
        + (noms.length > 4 ? ' et ' + (noms.length - 4) + ' autres' : '');
      if(noms.length > 4) j.title = noms.join(' · ');
      ligne.appendChild(j);
    }
    if(v.lieux){
      const l = document.createElement('div');
      l.className = 'obtenir-voie-note';
      l.textContent = 'La page Lieux dit où, jeu par jeu.';
      ligne.appendChild(l);
    }
    // UN BOUTON PLUTÔT QU'UNE PHRASE. « Voir Cadeau Mystère » écrit en toutes
    // lettres laissait chercher l'onglet ; il y mène maintenant.
    if(v.bouton){
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toggle-btn obtenir-vers';
      b.textContent = v.bouton.libelle;
      b.addEventListener('click', v.bouton.aller);
      ligne.appendChild(b);
    }
    carte.appendChild(ligne);
  });
  return carte;
}

function dessinerObtenir(){
  const hote = document.getElementById('obtenirReponse');
  const champ = document.getElementById('obtenirQ');
  if(!hote || !champ) return;

  const q = champ.value.trim();
  hote.innerHTML = '';
  if(!q){
    hote.innerHTML = '<div class="state-msg">Tape un nom — « togépi », « spectrum », '
                   + '« phione » — ou un numéro.</div>';
    return;
  }

  const trouves = obtenirCandidats(q);
  if(!trouves.length){
    hote.innerHTML = '<div class="state-msg">Aucun Pokémon de ce nom.</div>';
    return;
  }
  trouves.forEach(function(e){ hote.appendChild(obtenirCarte(e)); });
}

/** Appelé par showPage('obtenir'). */
function chargerPageObtenir(){
  const hote = document.getElementById('obtenirReponse');
  if(!hote) return;
  hote.innerHTML = '<div class="state-msg">Lecture du relevé…</div>';
  // Le relevé des lieux porte les catégories d'obtention : sans lui, la moitié
  // des réponses manquerait. Il se charge à la demande, comme ailleurs.
  const attente = (typeof chargerLieux === 'function') ? chargerLieux() : Promise.resolve();
  attente.then(function(){
    dessinerObtenir();
    const champ = document.getElementById('obtenirQ');
    if(champ) champ.focus();
  }).catch(function(){
    hote.innerHTML = '<div class="state-msg">Le relevé des lieux n’a pas pu être lu.</div>';
  });
}

document.addEventListener('DOMContentLoaded', function(){
  const champ = document.getElementById('obtenirQ');
  // « input » et non « change » : la réponse se resserre pendant qu'on tape,
  // comme la recherche des Lieux.
  if(champ) champ.addEventListener('input', dessinerObtenir);
});
