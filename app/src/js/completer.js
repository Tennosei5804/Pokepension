// Compléter : pourquoi celui-là te manque encore.
// Script classique (pas de module ES) : l'application reste ouvrable en file://
// Chargé APRÈS parties.js, dont il lit la liste des jeux, et après lieux.js,
// dont il réutilise puceEspece().
//
// LA QUESTION QUE PERSONNE NE POSAIT.
//
// Le Pokédex dit ce qui manque. Les Lieux disent où aller, jeu par jeu. Aucune
// des deux ne répond à « pourquoi celui-là ne rentre pas », et c'est pourtant
// la question d'un living dex : sur les cent derniers, une part est à portée
// de main, une autre demande une cartouche qu'on n'a pas, une troisième
// demande quelqu'un d'autre, et une dernière ne s'obtiendra plus jamais.
//
// Les quatre ne se traitent pas pareil. Confondues, elles font chercher pendant
// des heures un Pokémon qui n'est distribué qu'au Japon depuis 2007.
//
// TOUT VIENT DE RÉSERVES DÉJÀ EMBARQUÉES, aucune n'a été ajoutée :
//   · parties.js               — les jeux auxquels tu as joué
//   · DONNEES_LIEUX.jeux       — la catégorie d'obtention, par jeu et par espèce
//   · DONNEES_EMBARQUEES.evo   — le déclencheur d'évolution, dont l'échange
//   · DISTRIBUTIONS            — 552 distributions, avec leur région
//
// CE QU'ELLE NE FAIT PAS. Elle ne remplace ni le Pokédex ni les Lieux : elle
// trie et elle explique. Le « où » reste aux Lieux, le « comment » à la fiche.

// ---- Ce qui compte comme « un jeu que tu as » -------------------------------
//
// La page Données jeux du Profil est la source : c'est là qu'on déclare ses
// parties. Quand elle est vide — et elle l'est tant qu'on n'y est pas passé —
// on retombe sur les Pokédex ouverts, ce que parties.js appelle déjà des
// parties déduites. Mieux vaut une liste devinée qu'un écran qui répond
// « tout est hors de portée » à quelqu'un qui possède six jeux.
function completerMesJeux(){
  const cles = new Set();
  if(typeof parties === 'object' && parties){
    Object.keys(parties).forEach(function(c){ cles.add(c); });
  }
  if(!cles.size && typeof allProgress !== 'undefined' && allProgress){
    Object.keys(allProgress).forEach(function(c){
      const b = allProgress[c];
      if(b && b.caught && b.caught.size) cles.add(c);
    });
  }
  return cles;
}

/** Vrai si la liste des jeux a été devinée faute de parties déclarées. */
function completerJeuxDevines(){
  return !(typeof parties === 'object' && parties && Object.keys(parties).length);
}

// ---- Les jeux où le Cordon de Liaison existe --------------------------------
//
// LA NUANCE QUE LA RÉSERVE PORTE ELLE-MÊME. Le déclencheur d'évolution nº 2 se
// lit « Échange ou Cordon de Liaison » : depuis Épée/Bouclier, un objet remplace
// le partenaire. Annoncer « il te faut quelqu'un » à qui joue à Écarlate serait
// donc faux, et l'enverrait chercher un ami pour rien.
//
// Diamant Étincelant / Perle Scintillante en sont VOLONTAIREMENT absents : ces
// remakes suivent Diamant et Perle jusque-là, et l'échange y reste obligatoire.
const COMPLETER_CORDON = ['swsh', 'pla', 'sv', 'za'];

// ---- Les routes d'une forme, tous jeux confondus ----------------------------
//
// Rend une entrée par jeu qui la donne, avec la CATÉGORIE d'obtention telle que
// le relevé la nomme : sauvage, evolution, offert, echange, oeuf. La catégorie
// « indisponible » n'est pas une route — c'est le relevé qui dit « pas ici ».
//
// ON PREND UNE ENTRÉE, PAS UN NUMÉRO D'ESPÈCE, ET C'EST TOUTE LA DIFFÉRENCE.
// Le relevé des lieux est indexé par ESPÈCE : sa ligne « Raichu » vaut pour
// Rouge et Bleu. Interrogé avec le seul numéro, il répondait donc que le Raichu
// d'ALOLA se capture dans Rouge — et l'écran annonçait 191 espèces à portée
// dans un jeu qui n'en contient que 151. La forme doit exister dans le jeu
// avant que sa ligne d'espèce ne veuille dire quoi que ce soit.
//
// formAllowedInGame() est le juge que l'application emploie déjà pour bâtir la
// grille d'un jeu : s'en remettre à lui, c'est répondre exactement comme le
// Pokédex, plutôt que de tenir un second avis qui finirait par diverger.
function completerRoutes(entree){
  if(typeof DONNEES_LIEUX === 'undefined' || !DONNEES_LIEUX) return [];

  // UNE FORME QUI NE SE CAPTURE PAS N'HÉRITE DE RIEN. Les huit Pikachu à
  // casquette portent le numéro 25 : la ligne « Pikachu » du relevé les faisait
  // passer pour capturables dans Rouge, et le compte montait à 159 dans un jeu
  // de 151. Ce ne sont pas des variantes de capture — ce sont des costumes
  // distribués. Faute de route, elles tombent en « hors de portée », ce qui est
  // exactement leur cas.
  //
  // varianteDeCapture() est déjà le juge de formes.js : elle écarte les Méga,
  // les Gigamax et les formes purement cosmétiques.
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

/** Le déclencheur d'évolution d'une espèce, ou null. */
function completerEvolution(speciesId){
  if(typeof DONNEES_EMBARQUEES === 'undefined') return null;
  const f = DONNEES_EMBARQUEES.fiches;
  const esp = f && f.especes && f.especes[String(speciesId)];
  return (esp && esp.evo) ? esp.evo : null;
}

/** Les distributions qui ont donné cette espèce, région comprise. */
let completerParEspece = null;
function completerDistributions(speciesId){
  if(!completerParEspece){
    completerParEspece = new Map();
    const brut = (typeof DISTRIBUTIONS !== 'undefined' && typeof cadeauLu === 'function')
      ? DISTRIBUTIONS.map(cadeauLu) : [];
    brut.forEach(function(c){
      if(!c || !c.espece) return;
      if(!completerParEspece.has(c.espece)) completerParEspece.set(c.espece, []);
      completerParEspece.get(c.espece).push(c);
    });
  }
  return completerParEspece.get(speciesId) || [];
}

// ---- Le classement ----------------------------------------------------------
//
// QUATRE CAS, ET L'ORDRE COMPTE. Une espèce atteignable par une seule route,
// et cette route étant une évolution par échange, n'est pas « atteignable » :
// elle demande quelqu'un. Tester l'échange APRÈS avoir vu qu'un de tes jeux la
// donne serait juste ; le tester avant classerait Alakazam en « hors de
// portée », ce qui est faux — il est là, il faut seulement un partenaire.
const COMPLETER_GROUPES = [
  { cle: 'atteignable', titre: 'À portée de main',
    note: 'Un de tes jeux les donne. Les Lieux disent où.',
    // « Tant mieux » serait faux ici : une case vide veut dire qu'aucun de tes
    // jeux ne donne quoi que ce soit, ce qui est une mauvaise nouvelle — ou le
    // signe que tu n'as pas encore déclaré tes parties.
    vide: 'Rien à portée avec les jeux que tu as.' },
  { cle: 'partenaire', titre: 'Il te faut quelqu’un',
    note: 'Évolution par échange, et aucun de tes jeux n’a le Cordon de Liaison.',
    vide: 'Aucun échange à organiser — tant mieux.' },
  { cle: 'autreJeu', titre: 'Il te faut un autre jeu',
    note: 'Personne ne les donne dans ce que tu as — mais un autre jeu, oui.',
    vide: 'Aucune cartouche à ajouter — tant mieux.' },
  { cle: 'horsDePortee', titre: 'Hors de portée',
    note: 'Aucun jeu ne les donne. Distribution, ou rien.',
    vide: 'Rien d’inaccessible — tant mieux.' },
];

function completerClasser(){
  const manquants = (typeof scopeEntries !== 'undefined' ? scopeEntries : [])
    .filter(function(e){
      return typeof caughtSet === 'undefined' || !caughtSet.has(e.name);
    });

  const mesJeux = completerMesJeux();
  const cordon = COMPLETER_CORDON.some(function(c){ return mesJeux.has(c); });
  const groupes = {};
  COMPLETER_GROUPES.forEach(function(g){ groupes[g.cle] = []; });

  manquants.forEach(function(e){
    const routes = completerRoutes(e);
    const miennes = routes.filter(function(r){ return mesJeux.has(r.jeu); });

    if(miennes.length){
      // Le partenaire ne bloque que si TOUTES mes routes passent par une
      // évolution, et que cette évolution se fait par échange. Une espèce
      // qu'un de mes jeux donne aussi à l'état sauvage n'est pas bloquée.
      const evo = completerEvolution(e.speciesId);
      const parEchange = evo && evo.declencheur === 2;
      const queEvolution = miennes.every(function(r){ return r.categorie === 'evolution'; });
      if(parEchange && queEvolution && !cordon){
        groupes.partenaire.push({ entree: e, routes: miennes, evo: evo });
      }else{
        groupes.atteignable.push({ entree: e, routes: miennes });
      }
      return;
    }

    if(routes.length){
      groupes.autreJeu.push({ entree: e, routes: routes });
      return;
    }

    groupes.horsDePortee.push({ entree: e, routes: [],
                                dons: completerDistributions(e.speciesId) });
  });

  return { groupes: groupes, total: manquants.length,
           mesJeux: mesJeux, devines: completerJeuxDevines() };
}

// ---- L'écran ----------------------------------------------------------------

/** Le libellé d'un jeu, tel que GAMES le nomme. */
function completerNomJeu(cle){
  if(typeof gameByKey !== 'undefined' && gameByKey && gameByKey[cle]){
    const j = gameByKey[cle];
    return j.title || j.tab || cle;
  }
  return cle;
}

/**
 * Les jeux qui débloquent le plus, en tête.
 *
 * « Il te faut un autre jeu » est inutile en vrac : trente espèces réparties
 * sur douze cartouches ne disent pas laquelle acheter. Groupées et triées par
 * ce qu'elles rapportent, elles le disent d'un coup d'œil.
 */
function completerParJeu(lignes){
  const par = new Map();
  lignes.forEach(function(l){
    l.routes.forEach(function(r){
      if(!par.has(r.jeu)) par.set(r.jeu, []);
      par.get(r.jeu).push(l.entree);
    });
  });
  return [...par.entries()]
    .map(function(p){ return { jeu: p[0], entrees: p[1] }; })
    .sort(function(a, b){
      return (b.entrees.length - a.entrees.length)
          || completerNomJeu(a.jeu).localeCompare(completerNomJeu(b.jeu), 'fr');
    });
}

function completerPuce(entree){
  // La pastille des Lieux, telle quelle : même dessin, même clic qui ouvre la
  // fiche. En refaire une seconde aurait fait deux vocabulaires pour un seul
  // geste — le dépôt a déjà payé cette dérive.
  if(typeof puceEspece === 'function'){
    return puceEspece({ entry: entree, sous: '', taux: [], niveaux: '', quand: '' }, false);
  }
  const s = document.createElement('span');
  s.textContent = (typeof nomAffiche === 'function') ? nomAffiche(entree) : entree.display;
  return s;
}

function completerBloc(groupe, lignes){
  const bloc = document.createElement('div');
  bloc.className = 'completer-bloc completer-' + groupe.cle;

  const tete = document.createElement('div');
  tete.className = 'completer-tete';
  const titre = document.createElement('span');
  titre.className = 'completer-titre';
  titre.textContent = groupe.titre;
  const compte = document.createElement('span');
  compte.className = 'completer-compte';
  compte.textContent = lignes.length;
  tete.appendChild(titre);
  tete.appendChild(compte);
  bloc.appendChild(tete);

  const note = document.createElement('p');
  note.className = 'completer-note';
  note.textContent = groupe.note;
  bloc.appendChild(note);

  if(!lignes.length){
    const rien = document.createElement('div');
    rien.className = 'state-msg';
    rien.textContent = groupe.vide || 'Rien dans ce cas.';
    bloc.appendChild(rien);
    return bloc;
  }

  if(groupe.cle === 'autreJeu'){
    // PAR CARTOUCHE, ET REPLIÉE. Premier jet : chaque espèce était listée sous
    // CHAQUE jeu qui la donne. Mesuré — sept mille sept cent vingt-huit
    // pastilles, quinze mille nœuds, dix-neuf mètres de défilement pour neuf
    // cent trente-et-une espèces. La page répondait moins bien en disant dix
    // fois la même chose.
    //
    // La question ici est « laquelle j'achète », et elle se répond par un
    // classement, pas par un catalogue. Les noms restent à un clic.
    completerParJeu(lignes).forEach(function(p){
      const sous = document.createElement('button');
      sous.type = 'button';
      sous.className = 'completer-sous';
      sous.setAttribute('aria-expanded', 'false');

      const nom = document.createElement('span');
      nom.className = 'completer-sous-nom';
      nom.textContent = completerNomJeu(p.jeu);
      const n = document.createElement('span');
      n.className = 'completer-sous-compte';
      n.textContent = p.entrees.length + (p.entrees.length > 1 ? ' espèces' : ' espèce');
      sous.appendChild(nom);
      sous.appendChild(n);
      bloc.appendChild(sous);

      const liste = document.createElement('div');
      liste.className = 'completer-liste';
      liste.hidden = true;
      bloc.appendChild(liste);

      // Les pastilles ne se bâtissent qu'à l'ouverture : vingt jeux fermés
      // coûtent vingt boutons, pas sept mille pastilles.
      sous.addEventListener('click', function(){
        const ouvre = liste.hidden;
        sous.setAttribute('aria-expanded', String(ouvre));
        liste.hidden = !ouvre;
        if(ouvre && !liste.childNodes.length) completerRemplir(liste, p.entrees);
      });
    });
    return bloc;
  }

  const liste = document.createElement('div');
  liste.className = 'completer-liste';
  completerRemplir(liste, lignes.map(function(l){ return l.entree; }), lignes);
  bloc.appendChild(liste);
  return bloc;
}

// Au-delà, la liste ne se parcourt plus — même seuil et même raison que les
// Lieux, qui plafonnent déjà à soixante.
const COMPLETER_MONTRES = 60;

/** Remplit une liste de pastilles, plafonnée, avec le reste annoncé. */
function completerRemplir(liste, entrees, lignes){
  entrees.slice(0, COMPLETER_MONTRES).forEach(function(e, i){
    const puce = completerPuce(e);
    // Hors de portée : la région de la distribution est LA nuance utile.
    // « Jamais sorti du Japon » et « distribué en Europe en 2016 » ne se vivent
    // pas pareil — l'un ferme la porte, l'autre dit qu'on l'a manquée.
    const l = lignes && lignes[i];
    if(l && l.dons && l.dons.length){
      const regions = [];
      l.dons.forEach(function(d){
        if(d.region && regions.indexOf(d.region) === -1) regions.push(d.region);
      });
      if(regions.length) puce.title = 'Distribué : ' + regions.join(' · ');
    }
    liste.appendChild(puce);
  });
  if(entrees.length > COMPLETER_MONTRES){
    const reste = document.createElement('div');
    reste.className = 'state-msg';
    reste.textContent = 'et ' + (entrees.length - COMPLETER_MONTRES) + ' autres.';
    liste.appendChild(reste);
  }
}

function dessinerCompleter(){
  const hote = document.getElementById('completerListe');
  if(!hote) return;

  if(typeof scopeEntries === 'undefined' || !scopeEntries.length){
    hote.innerHTML = '<div class="state-msg">Ouvre un Pokédex : c’est celui-là '
                   + 'que cette page examine.</div>';
    const r = document.getElementById('completerResume');
    if(r) r.textContent = '';
    return;
  }

  const bilan = completerClasser();
  hote.innerHTML = '';

  const resume = document.getElementById('completerResume');
  if(resume){
    if(!bilan.total){
      resume.textContent = 'Ce Pokédex est complet. Il n’y a plus rien à débloquer.';
    }else{
      const g = bilan.groupes;
      resume.textContent = bilan.total + ' à trouver — '
        + g.atteignable.length + ' à portée, '
        + g.partenaire.length + ' à échanger, '
        + g.autreJeu.length + ' sur un autre jeu, '
        + g.horsDePortee.length + ' hors de portée.';
    }
  }

  // DIRE D'OÙ SORT LA LISTE DES JEUX. Un classement qui repose sur « ce que tu
  // as » doit dire ce qu'il croit que tu as, sinon ses quatre cases paraissent
  // arbitraires — et personne ne pense à aller corriger ses parties.
  const source = document.getElementById('completerJeux');
  if(source){
    const noms = [...bilan.mesJeux].map(completerNomJeu).sort(function(a, b){
      return a.localeCompare(b, 'fr');
    });
    if(!noms.length){
      source.textContent = 'Aucun jeu déclaré : tout paraîtra hors de portée. '
                         + 'Ajoute tes parties dans Profil › Données jeux.';
    }else{
      source.textContent = (bilan.devines ? 'D’après tes Pokédex ouverts : ' : 'Tes jeux : ')
                         + noms.join(', ')
                         + (bilan.devines ? ' — déclare-les dans Profil › Données jeux pour affiner.' : '');
    }
  }

  COMPLETER_GROUPES.forEach(function(groupe){
    hote.appendChild(completerBloc(groupe, bilan.groupes[groupe.cle]));
  });
}

/** Appelé par showPage('completer'). */
function chargerPageCompleter(){
  const hote = document.getElementById('completerListe');
  if(!hote) return;
  hote.innerHTML = '<div class="state-msg">Lecture du relevé…</div>';
  // Le relevé des lieux porte les catégories d'obtention : sans lui, les quatre
  // cases seraient toutes fausses. Il se charge à la demande, comme ailleurs.
  const attente = (typeof chargerLieux === 'function')
    ? chargerLieux() : Promise.resolve();
  attente.then(dessinerCompleter).catch(function(){
    hote.innerHTML = '<div class="state-msg">Le relevé des lieux n’a pas pu être lu.</div>';
  });
}
