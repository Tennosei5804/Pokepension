// Le compteur de chasse aux chromatiques.
// Script classique (pas de module ES), chargé après noyau.js.
//
// Un chasseur de shiny compte ses rencontres. C'est tout l'objet de cette page :
// tenir ce compte, et dire ce qu'il vaut — 342 rencontres ne signifient rien
// si l'on ne sait pas contre quelle probabilité on se bat.
//
// Les chasses vivent dans la sauvegarde du profil, comme le dex : elles
// appartiennent à l'aventure, et changer d'ordinateur doit les retrouver.

let chasses = [];

// Les chasses ABOUTIES. Elles vivaient l'espace d'une fenêtre de félicitations
// puis disparaissaient : le compteur, la durée, la méthode, tout partait avec.
// C'est pourtant la seule chose qu'un chasseur ait envie de relire — « ma plus
// longue », « ma plus courte », « est-ce que je suis chanceux cette année ».
//
// Elles voyagent avec le dex, comme les chasses en cours : voir
// buildSavePayload() dans serveur.js et progressFromJSON() dans noyau.js.
let chassesFinies = [];

// Les Pokémon chromatiques n'existent qu'à partir de la deuxième génération :
// Rouge, Bleu et Jaune n'ont aucune méthode, et le disent.
const SANS_CHROMATIQUES = ['rby', 'jaune'];

// Jusqu'à la cinquième génération, un chromatique sur 8192 ; 1/4096 ensuite.
const TAUX_ANCIEN = ['gsc', 'cristal', 'rse', 'emeraude', 'frlg', 'dp', 'pt',
                     'hgss', 'bw', 'b2w2'];

// La reproduction, donc la méthode Masuda, suppose une Pension. Let's Go et
// Légendes Arceus n'en ont pas.
const AVEC_REPRODUCTION = ['dp', 'pt', 'hgss', 'bw', 'b2w2', 'xy', 'oras', 'sm',
                           'usum', 'swsh', 'bdsp', 'sv'];

// Le Charme Chroma apparaît dans Noir 2 / Blanc 2.
const AVEC_CHARME = ['b2w2', 'xy', 'oras', 'sm', 'usum', 'letsgo', 'swsh',
                     'bdsp', 'pla', 'sv', 'za'];

// ---- Les tirages -----------------------------------------------------------
// Un chromatique ne se joue pas à un seul lancer de dé. Le jeu en lance
// plusieurs — un par « tirage » — et il suffit d'un succès. C'est ainsi qu'il
// cumule les bonus : le Charme Chroma n'améliore pas le dé, il en ajoute.
//
// D'où deux conséquences qu'un simple « taux » cachait :
//   · les bonus s'additionnent au lieu de se multiplier — Charme + recherche
//     complète, dans Légendes Arceus, font 1 + 3 + 3 = 7 tirages, soit 1/585 ;
//   · une méthode et ses bonus se combinent librement, au lieu d'exiger une
//     ligne par combinaison possible.
//
// Les valeurs viennent des taux publiés pour chaque jeu, et les reproduisent :
// Mégapparition seule 1/158 (26 tirages), avec Charme et recherche 1/128
// (32 tirages).

// Ce que la situation de chasse ajoute. Une méthode à « taux » propre remplace
// tout le calcul : la pêche à la chaîne ou le Combo Capture ne comptent pas en
// tirages, ils ont leur propre règle.
const METHODES = {
  'rencontre':     { nom:'Rencontres sauvages', tirages:0, jeux:'*' },
  'apparition':    { nom:'Apparition massive', tirages:25, tiragesParJeu:{ sv:2 },
                     jeux:['pla', 'sv'] },
  'megapparition': { nom:'Mégapparition', tirages:25, jeux:['pla'] },
  'distorsion':    { nom:'Distorsion spatio-temporelle', taux:128, jeux:['pla'] },
  'masuda':        { nom:'Méthode Masuda', tirages:5, jeux:AVEC_REPRODUCTION },
  'reproduction':  { nom:'Reproduction ordinaire', tirages:0, jeux:AVEC_REPRODUCTION },
  'chaine':        { nom:'Combo Capture', taux:315, jeux:['letsgo'] },
  'peche':         { nom:'Pêche à la chaîne', taux:100, jeux:['xy'] },
  // Cobblemon a ses propres machines, et leurs taux sont écrits dans la
  // configuration du mod — fossilMachineShinyChance = 100,
  // honeySlatherShinyChance = 4000. Ce sont des règles propres, pas des
  // tirages : la machine tire son propre dé, le dé du monde ne s'y applique pas.
  'fossile':       { nom:'Machine à fossiles', taux:100, jeux:['cobblemon'],
                     aide:'Un Pokémon ressuscité d\'un fossile. De loin la meilleure chance du mod.' },
  'miel':          { nom:'Rondin badigeonné de miel', taux:4000, jeux:['cobblemon'],
                     aide:'Le miel appliqué sur un rondin attire, et améliore la chance.' },
  'autre':         { nom:'Autre méthode', tirages:0, jeux:'*' }
};

// Ce qui s'ajoute par-dessus, et se cumule. Chacun déclare les jeux qui le
// connaissent : cocher un Sandwich Éclat dans Rouge Feu n'aurait aucun sens.
const BONUS = {
  'charme':    { nom:'Charme Chroma', tirages:2, tiragesParJeu:{ pla:3 },
                 jeux:AVEC_CHARME,
                 aide:'Obtenu en complétant le Pokédex national.' },
  'recherche': { nom:'Page de Pokédex complète', tirages:3, jeux:['pla'],
                 aide:'Niveau de recherche 10 sur l\'espèce chassée.' },
  'sandwich':  { nom:'Sandwich Éclat (niveau 3)', tirages:3, jeux:['sv'],
                 aide:'Puissance Éclat du type visé, au niveau maximum.' }
};

// Le taux de base du jeu : c'est le dé, celui que les tirages relancent.
//
// Cobblemon vaut 8192, comme les cinq premières générations. Ce n'est pas une
// approximation : le mod déclare « shinyRate = 8192F » dans sa configuration.
// C'est en revanche un réglage SERVEUR — une partie peut l'avoir changé, et
// l'écran de chasse le dit.
function tauxDeBase(cle){
  // PAS DE JEU N'EST PAS UN JEU MODERNE. Le 4096 de la fin est un DÉFAUT voulu
  // — un jeu qu'on n'a pas listé est récent, donc à 4096 — mais appliqué à une
  // clé vide il rendait un taux d'apparence normale pour rien du tout.
  // Mesuré depuis le calculateur, où un menu peut ne rien valoir le temps d'un
  // changement de jeu : « Un chromatique sur 4 096 » s'affichait sans jeu.
  if(!cle) return null;
  if(SANS_CHROMATIQUES.indexOf(cle) !== -1) return null;
  if(cle === 'cobblemon') return 8192;
  return TAUX_ANCIEN.indexOf(cle) !== -1 ? 8192 : 4096;
}

function estPourCeJeu(info, cleJeu){
  return info && (info.jeux === '*' || info.jeux.indexOf(cleJeu) !== -1);
}

// Combien de tirages ce bonus vaut dans ce jeu. Le Charme Chroma en donne deux
// dans la série principale, trois dans Légendes Arceus : le détail compte, il
// fait passer le taux maximal de 1/141 à 1/128.
function tiragesDe(info, cleJeu){
  if(!info) return 0;
  const parJeu = info.tiragesParJeu && info.tiragesParJeu[cleJeu];
  return parJeu === undefined ? (info.tirages || 0) : parJeu;
}

// Le nombre total de tirages d'une chasse : celui de base, plus la méthode,
// plus chaque bonus coché que le jeu connaît.
function tiragesDeChasse(cleMethode, bonus, cleJeu){
  const m = METHODES[cleMethode] || METHODES['autre'];
  let n = 1 + tiragesDe(m, cleJeu);
  (bonus || []).forEach(function(cle){
    const info = BONUS[cle];
    if(estPourCeJeu(info, cleJeu)) n += tiragesDe(info, cleJeu);
  });
  return n;
}

function tauxDeChasse(cleMethode, cleJeu, bonus){
  const m = METHODES[cleMethode] || METHODES['autre'];
  if(m.taux) return m.taux;                 // règle propre : les tirages ne s'y appliquent pas
  const base = tauxDeBase(cleJeu);
  return base ? base / tiragesDeChasse(cleMethode, bonus, cleJeu) : null;
}

function methodesPour(cleJeu){
  if(SANS_CHROMATIQUES.indexOf(cleJeu) !== -1) return [];
  return Object.keys(METHODES).filter(function(cle){
    return estPourCeJeu(METHODES[cle], cleJeu);
  });
}

function bonusPour(cleJeu){
  if(SANS_CHROMATIQUES.indexOf(cleJeu) !== -1) return [];
  return Object.keys(BONUS).filter(function(cle){
    return estPourCeJeu(BONUS[cle], cleJeu);
  });
}

// Les anciennes chasses ne connaissaient qu'une méthode, qui mélangeait la
// situation et les bonus. On les traduit à la lecture, une fois pour toutes :
// sans quoi « Masuda + Charme Chroma » deviendrait « Autre méthode ».
const METHODES_ANCIENNES = {
  'pleine':        { methode:'rencontre', bonus:[] },
  'charme':        { methode:'rencontre', bonus:['charme'] },
  'masuda-charme': { methode:'masuda',    bonus:['charme'] },
  'sandwich':      { methode:'rencontre', bonus:['sandwich'] }
};

function migrerChasse(c){
  const ancien = METHODES_ANCIENNES[c.methode];
  if(ancien){
    c.methode = ancien.methode;
    c.bonus = ancien.bonus.slice();
  }
  if(!Array.isArray(c.bonus)) c.bonus = [];
  return c;
}

const chasseListe = document.getElementById('chasseListe');
const chasseResume = document.getElementById('chasseResume');
const chasseOverlay = document.getElementById('chasseOverlay');
const chasseRecherche = document.getElementById('chasseRecherche');
const chasseSuggestions = document.getElementById('chasseSuggestions');
const chasseChoisi = document.getElementById('chasseChoisi');
const chasseJeu = document.getElementById('chasseJeu');
const chasseMethode = document.getElementById('chasseMethode');
const chasseErreur = document.getElementById('chasseErreur');
const chasseValider = document.getElementById('chasseValider');
const chasseBonus = document.getElementById('chasseBonus');
const chasseBlocBonus = document.getElementById('chasseBlocBonus');
const chasseTaux = document.getElementById('chasseTaux');

/**
 * La probabilité d'avoir déjà croisé au moins un chromatique en `n` essais.
 *
 * C'est le complément de « n échecs d'affilée » : 1 − (1 − p)^n. On l'affiche
 * parce qu'un compteur nu ne dit rien — et parce qu'elle rappelle une vérité
 * utile : atteindre 100 % est impossible, chaque rencontre reste indépendante
 * des précédentes. Le compteur ne « rapproche » de rien.
 */
function probabiliteCumulee(n, taux){
  if(!n || !taux) return 0;
  return 1 - Math.pow(1 - 1 / taux, n);
}

function nomDeChasse(c){
  const e = allEntries.find(function(x){ return x.name === c.pokemon; });
  return e ? nomAffiche(e) : c.pokemon;
}

function entreeDeChasse(c){
  return allEntries.find(function(x){ return x.name === c.pokemon; });
}

function enregistrerChasses(){
  dessinerChasses();
  queueSave();
}

// ---- Rendu ------------------------------------------------------------------
function dessinerChasses(){
  if(!chasseListe) return;

  // Le résumé : ce qui a été trouvé, et ce qui est en cours.
  if(chasseResume){
    const total = chasses.reduce(function(n, c){ return n + (c.compteur || 0); }, 0);
    chasseResume.textContent = chasses.length
      ? chasses.length + (chasses.length > 1 ? ' chasses en cours' : ' chasse en cours')
        + '  ·  ' + total + ' rencontre' + (total > 1 ? 's' : '') + ' au total'
      : '';
  }

  chasseListe.innerHTML = '';
  if(!chasses.length){
    chasseListe.innerHTML = '<div class="state-msg">Aucune chasse en cours. '
      + 'Clique sur « Créer une chasse » pour en commencer une — le compteur te suivra '
      + 'd\'un ordinateur à l\'autre.</div>';
    // Le tableau, lui, survit aux chasses : c'est même tout son objet.
    if(typeof majLigneClavier === 'function') majLigneClavier();
    if(typeof dessinerTableauChasse === 'function') dessinerTableauChasse();
    return;
  }

  chasses.forEach(function(c){
    const methode = METHODES[c.methode] || METHODES['autre'];
    const taux = tauxDeChasse(c.methode, c.dex, c.bonus);
    const p = probabiliteCumulee(c.compteur, taux);

    const carte = document.createElement('div');
    // La chasse que le clavier vise. Un seul liseré à l'écran, et il ne
    // s'affiche que s'il y a un choix à faire : sur une chasse unique, désigner
    // la seule qui existe n'apprend rien.
    const visee = chasses.length > 1
      && typeof chasseActiveOuPremiere === 'function'
      && chasseActiveOuPremiere() === c;
    carte.className = 'chasse-carte' + (visee ? ' visee' : '');
    // Cliquer ailleurs que sur un bouton désigne la chasse au clavier.
    carte.addEventListener('click', function(e){
      if(e.target.closest('button')) return;
      if(typeof choisirChasseActive === 'function') choisirChasseActive(c);
    });

    // Le sprite, en version chromatique : c'est ce qu'on cherche.
    const cadre = document.createElement('div');
    cadre.className = 'chasse-sprite';
    const e = entreeDeChasse(c);
    if(e){
      const img = document.createElement('img');
      img.src = pokeosHomeUrl(e.id, true);
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', function(){
        img.src = officialArtworkUrl(e.id, true);
      });
      cadre.appendChild(img);
    }
    carte.appendChild(cadre);

    const infos = document.createElement('div');
    infos.className = 'chasse-infos';

    const nom = document.createElement('div');
    nom.className = 'chasse-nom';
    nom.textContent = nomDeChasse(c);
    infos.appendChild(nom);

    const meta = document.createElement('div');
    meta.className = 'chasse-meta';
    // Le jeu figure dans la ligne : la même espèce peut être chassée ailleurs,
    // avec une autre méthode et un autre taux.
    const nomJeu = gameByKey[c.dex] ? gameByKey[c.dex].tab : '🏡 Pokémon HOME';
    // Les bonus cochés figurent dans la ligne : ce sont eux qui expliquent
    // l'écart entre 1/4096 et 1/128, et on veut pouvoir le relire plus tard.
    const cochés = (c.bonus || []).filter(function(b){ return estPourCeJeu(BONUS[b], c.dex); })
      .map(function(b){ return BONUS[b].nom; });
    meta.textContent = nomJeu + '  ·  ' + methode.nom
      + (cochés.length ? '  +  ' + cochés.join(' + ') : '')
      + (taux ? '  ·  1/' + Math.round(taux) : '')
      + (c.debut ? '  ·  commencée ' + depuisQuand(c.debut) : '');
    infos.appendChild(meta);

    // La barre montre la probabilité cumulée, pas une progression : on ne
    // progresse pas vers un shiny. Le libellé le dit.
    const barre = document.createElement('div');
    barre.className = 'chasse-barre';
    const rempli = document.createElement('i');
    rempli.style.width = Math.min(100, p * 100) + '%';
    barre.appendChild(rempli);
    infos.appendChild(barre);

    const chance = document.createElement('div');
    chance.className = 'chasse-chance';
    chance.textContent = Math.round(p * 100) + ' % des dresseurs l\'auraient déjà trouvé';
    chance.title = 'Probabilité d\'avoir eu au moins un chromatique en ' + c.compteur
      + ' rencontres. Chaque rencontre reste indépendante : le compteur ne te '
      + 'rapproche de rien.';
    infos.appendChild(chance);
    carte.appendChild(infos);

    // Le compteur et ses boutons.
    const bloc = document.createElement('div');
    bloc.className = 'chasse-compteur';

    const valeur = document.createElement('div');
    valeur.className = 'chasse-valeur';
    valeur.textContent = c.compteur || 0;
    bloc.appendChild(valeur);

    const boutons = document.createElement('div');
    boutons.className = 'chasse-boutons';
    [['+1', 1], ['+10', 10], ['−1', -1]].forEach(function(paire){
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chasse-bouton' + (paire[1] === 1 ? ' principal' : '');
      b.textContent = paire[0];
      b.addEventListener('click', function(){
        c.compteur = Math.max(0, (c.compteur || 0) + paire[1]);
        enregistrerChasses();
      });
      boutons.appendChild(b);
    });
    bloc.appendChild(boutons);
    carte.appendChild(bloc);

    const actions = document.createElement('div');
    actions.className = 'chasse-actions';

    const trouve = document.createElement('button');
    trouve.type = 'button';
    trouve.className = 'toggle-btn primary';
    trouve.textContent = '✨ Trouvé !';
    trouve.title = 'Coche le chromatique dans le Pokédex du jeu et clôt la chasse';
    trouve.addEventListener('click', function(){ conclureChasse(c); });
    actions.appendChild(trouve);

    const abandon = document.createElement('button');
    abandon.type = 'button';
    abandon.className = 'toggle-btn';
    abandon.textContent = 'Abandonner';
    abandon.addEventListener('click', async function(){
      const compteur = c.compteur || 0;
      const ok = await demanderConfirmation({
        eyebrow: 'Chasse en cours',
        titre: 'Abandonner la chasse de ' + nomDeChasse(c) + ' ?',
        danger: true,
        resume: [
          { cle: 'rencontres', valeur: compteur },
          { cle: gameByKey[c.dex] ? gameByKey[c.dex].title : 'Pokémon HOME', valeur: '🎮' }
        ],
        pertes: ['Le compteur de rencontres', 'La méthode et les bonus enregistrés'],
        note: compteur
          ? 'Le compteur repart de zéro. Rien ne permet de le retrouver.'
          : 'Cette chasse n\'a pas encore commencé : il n\'y a rien à perdre.',
        // Au-delà de cinq cents rencontres, on a passé des heures dessus : la
        // cérémonie est proportionnée à ce qu'elle coûte.
        motAEcrire: compteur >= 500 ? nomDeChasse(c) : null,
        libelleAction: 'Abandonner la chasse'
      });
      if(!ok) return;
      chasses = chasses.filter(function(x){ return x !== c; });
      enregistrerChasses();
    });
    actions.appendChild(abandon);
    carte.appendChild(actions);

    chasseListe.appendChild(carte);
  });

  if(typeof majLigneClavier === 'function') majLigneClavier();
  if(typeof dessinerTableauChasse === 'function') dessinerTableauChasse();
  // L'overlay suit la chasse visée : sans ce rappel, il resterait sur le
  // compteur d'il y a trois clics, ce qui se verrait en direct.
  if(typeof pousserOverlay === 'function') pousserOverlay();
}

/**
 * La chasse aboutit : on coche le chromatique là où il a été trouvé, et la
 * chasse disparaît. C'est le seul endroit où cette page touche au dex — et
 * c'est ce qui évite d'avoir à cocher la case à la main après coup.
 */
function conclureChasse(c){
  const e = entreeDeChasse(c);
  if(!e){
    prevenirErreur('Ce Pokémon est introuvable',
      'Il n\'apparaît pas dans la liste des espèces. La chasse reste ouverte.');
    return;
  }

  const cible = bucketFor(c.dex || 'national');
  cible.shiny.add(e.name);
  // Un chromatique attrapé est aussi un Pokémon possédé : cocher l'un sans
  // l'autre laisserait une incohérence que personne ne penserait à corriger.
  cible.caught.add(e.name);

  // On garde l'histoire AVANT de retirer la chasse : une fois ôtée de la
  // liste, il n'y a plus ni compteur ni méthode à recopier. Le taux est figé
  // ici plutôt que recalculé plus tard — les règles d'un jeu peuvent être
  // corrigées, et une chasse d'il y a six mois s'est jouée contre le taux
  // qu'on affichait ce jour-là.
  chassesFinies.push({
    pokemon: c.pokemon,
    dex: c.dex,
    methode: c.methode,
    bonus: (c.bonus || []).slice(),
    compteur: c.compteur || 0,
    taux: tauxDeChasse(c.methode, c.dex, c.bonus) || 0,
    debut: c.debut || null,
    fin: new Date().toISOString()
  });

  chasses = chasses.filter(function(x){ return x !== c; });
  dessinerChasses();
  updateProgress();
  renderList(true);
  queueSave();

  prevenir({
    eyebrow: 'Chasse terminée',
    genre: 'succes',
    titre: '✨ ' + nomDeChasse(c) + ' est à toi',
    resume: [
      { cle: 'rencontres', valeur: c.compteur || 0 },
      { cle: gameByKey[c.dex] ? gameByKey[c.dex].title : 'Pokémon HOME', valeur: '🎮' }
    ],
    note: 'Il est coché en chromatique et en forme normale — un chromatique '
      + 'attrapé est aussi un Pokémon possédé.',
    libelleAction: 'Parfait'
  });
}


// ---- La modale « Créer une chasse » -----------------------------------------
// Trois choix explicites plutôt qu'un champ qui devine : le Pokémon, le jeu, et
// la méthode. Deviner le jeu depuis l'onglet ouvert marchait, mais rien ne le
// disait — et on chasse rarement dans le jeu qu'on est en train de consulter.

let chasseSelection = null;   // l'entrée retenue, en attente de validation

// Le choix du jeu : les Pokédex de la série, plus la collection d'ensemble.
// Rouge, Bleu et Jaune n'ont pas de chromatiques, et Pokémon HOME est une
// boîte de rangement, pas un lieu de rencontre. Ni les uns ni l'autre n'ont
// leur place dans une chasse.
//
// Cobblemon en était écarté au motif que « les taux dépendent du serveur : on
// ne peut rien en affirmer ». Le motif était bon et il ne l'est plus qu'à
// moitié : le taux est bien un réglage serveur, mais sa VALEUR PAR DÉFAUT est
// écrite dans le mod — 8192 —, tout comme celles de la machine à fossiles
// (100) et du miel (4000). On peut donc en affirmer quelque chose d'utile, à
// condition de dire que c'est la valeur d'origine. L'écran s'en charge.
const JEUX_SANS_CHASSE = SANS_CHROMATIQUES.slice();

function jeuxChassables(){
  return GAMES.filter(function(g){ return JEUX_SANS_CHASSE.indexOf(g.key) === -1; });
}

if(chasseJeu){
  jeuxChassables().forEach(function(g){
    const opt = document.createElement('option');
    opt.value = g.key;
    opt.textContent = g.tab;
    chasseJeu.appendChild(opt);
  });
}

function direErreurChasse(texte){
  if(!chasseErreur) return;
  chasseErreur.textContent = texte || '';
  chasseErreur.classList.toggle('visible', !!texte);
}

function choisirPourChasse(entree){
  chasseSelection = entree;
  chasseRecherche.value = '';
  chasseSuggestions.style.display = 'none';
  chasseSuggestions.innerHTML = '';

  chasseChoisi.style.display = '';
  chasseChoisi.innerHTML = '';
  const img = document.createElement('img');
  img.src = pokeosHomeUrl(entree.id, true);
  img.alt = '';
  img.addEventListener('error', function(){ img.src = officialArtworkUrl(entree.id, true); });
  const nom = document.createElement('span');
  nom.textContent = nomAffiche(entree);
  const changer = document.createElement('button');
  changer.type = 'button';
  changer.className = 'chasse-changer';
  changer.textContent = 'changer';
  changer.addEventListener('click', function(){
    chasseSelection = null;
    chasseChoisi.style.display = 'none';
    chasseRecherche.focus();
  });
  chasseChoisi.appendChild(img);
  chasseChoisi.appendChild(nom);
  chasseChoisi.appendChild(changer);
  direErreurChasse('');
}

function suggererChasse(){
  const q = chasseRecherche.value.trim().toLowerCase();
  chasseSuggestions.innerHTML = '';
  if(q.length < 2){ chasseSuggestions.style.display = 'none'; return; }

  const trouves = allEntries.filter(function(e){
    return nomAffiche(e).toLowerCase().indexOf(q) !== -1;
  }).slice(0, 8);

  if(!trouves.length){ chasseSuggestions.style.display = 'none'; return; }
  chasseSuggestions.style.display = '';
  trouves.forEach(function(e){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chasse-suggestion';
    b.textContent = nomAffiche(e);
    b.addEventListener('click', function(){ choisirPourChasse(e); });
    chasseSuggestions.appendChild(b);
  });
}

// Le menu des méthodes se reconstruit à chaque changement de jeu : proposer un
// Sandwich Éclat dans Rouge Feu tromperait sur ce que le jeu permet.
function majMethodesDisponibles(){
  if(!chasseMethode || !chasseJeu) return;
  const jeu = chasseJeu.value;
  const dispo = methodesPour(jeu);
  const avant = chasseMethode.value;

  chasseMethode.innerHTML = '';
  if(!dispo.length){
    // Première génération : les chromatiques n'existaient pas encore.
    const o = document.createElement('option');
    o.textContent = 'Aucune — pas de chromatiques dans ce jeu';
    chasseMethode.appendChild(o);
    // Aucun jeu de la liste n'est dans ce cas : ce garde-fou ne sert que si
    // l'on ajoutait un jour un jeu sans chromatiques sans penser à la chasse.
    chasseMethode.disabled = true;
    if(chasseValider) chasseValider.disabled = true;
    return;
  }

  chasseMethode.disabled = false;
  if(chasseValider) chasseValider.disabled = false;
  direErreurChasse('');
  dispo.forEach(function(cle){
    const o = document.createElement('option');
    o.value = cle;
    // Plus de taux dans le libellé : il dépend maintenant des bonus cochés, et
    // s'affiche en direct sous la liste.
    o.textContent = METHODES[cle].nom;
    chasseMethode.appendChild(o);
  });
  // On garde la méthode choisie si le nouveau jeu la connaît aussi.
  chasseMethode.value = dispo.indexOf(avant) !== -1 ? avant : dispo[0];
  majBonusDisponibles();
  // Le menu stylisé lit sa valeur dans le <select> : une valeur posée par le
  // code ne déclenche aucun évènement, il faut le lui dire.
  if(typeof syncSelects === 'function') syncSelects();
}

// Les bonus que le jeu connaît. Une case cochée qui n'existe plus dans le
// nouveau jeu est décochée : sinon le taux mentirait sans qu'on voie pourquoi.
function majBonusDisponibles(){
  if(!chasseBonus || !chasseJeu) return;
  const jeu = chasseJeu.value;
  const avant = bonusCoches();
  const dispo = bonusPour(jeu);

  chasseBonus.innerHTML = '';
  if(chasseBlocBonus) chasseBlocBonus.style.display = dispo.length ? '' : 'none';

  dispo.forEach(function(cle){
    const info = BONUS[cle];
    const etiquette = document.createElement('label');
    etiquette.className = 'chasse-bonus-case';

    const case_ = document.createElement('input');
    case_.type = 'checkbox';
    case_.value = cle;
    case_.checked = avant.indexOf(cle) !== -1;
    case_.addEventListener('change', majTauxAffiche);

    const nom = document.createElement('span');
    nom.className = 'chasse-bonus-nom';
    nom.textContent = info.nom;

    const gain = document.createElement('span');
    gain.className = 'chasse-bonus-gain';
    gain.textContent = '+' + tiragesDe(info, jeu) + ' tirage' + (tiragesDe(info, jeu) > 1 ? 's' : '');

    etiquette.appendChild(case_);
    etiquette.appendChild(nom);
    etiquette.appendChild(gain);
    if(info.aide) etiquette.title = info.aide;
    chasseBonus.appendChild(etiquette);
  });
  majTauxAffiche();
}

function bonusCoches(){
  if(!chasseBonus) return [];
  return Array.prototype.slice.call(chasseBonus.querySelectorAll('input:checked'))
    .map(function(c){ return c.value; });
}

// Le taux, recalculé à chaque case cochée. C'est lui qui rend les bonus
// concrets : voir « 1/4096 » devenir « 1/128 » dit tout de leur intérêt.
function majTauxAffiche(){
  if(!chasseTaux || !chasseJeu || !chasseMethode) return;
  const jeu = chasseJeu.value;
  const methode = chasseMethode.value;
  const taux = tauxDeChasse(methode, jeu, bonusCoches());
  if(!taux){ chasseTaux.textContent = ''; return; }

  const m = METHODES[methode] || METHODES['autre'];
  const base = tauxDeBase(jeu);
  if(m.taux){
    chasseTaux.textContent = 'Taux estimé : 1/' + Math.round(taux)
      + '  —  cette méthode a sa propre règle, les bonus ne s\'y ajoutent pas.';
  } else {
    const n = tiragesDeChasse(methode, bonusCoches(), jeu);
    chasseTaux.textContent = 'Taux estimé : 1/' + Math.round(taux)
      + '  —  ' + n + ' tirage' + (n > 1 ? 's' : '') + ' sur 1/' + base;
  }
  // Sur un mod, un taux n'est jamais qu'une valeur par défaut : le serveur peut
  // l'avoir changée, et rien dans l'application ne peut le savoir. Le dire ici
  // vaut mieux que d'annoncer un chiffre comme s'il était acquis.
  if(jeu === 'cobblemon'){
    chasseTaux.textContent += '  —  valeurs d\'origine du mod ; un serveur peut les régler autrement.';
  }
}

function ouvrirChasseModal(){
  chasseSelection = null;
  chasseRecherche.value = '';
  chasseChoisi.style.display = 'none';
  chasseSuggestions.style.display = 'none';
  direErreurChasse('');
  // Le Pokédex ouvert est un point de départ probable, pas une décision : il
  // présélectionne, et reste modifiable.
  // Le Pokédex ouvert sert de point de départ s'il s'agit d'un jeu ; sinon on
  // prend le premier de la liste, HOME n'y figurant plus.
  if(chasseJeu){
    const ouvert = gameByKey[currentTab] && JEUX_SANS_CHASSE.indexOf(currentTab) === -1;
    chasseJeu.value = ouvert ? currentTab : (chasseJeu.options[0] || {}).value;
  }
  majMethodesDisponibles();
  chasseOverlay.style.display = 'flex';
  setTimeout(function(){ chasseRecherche.focus(); }, 10);
}

function fermerChasseModal(){ chasseOverlay.style.display = 'none'; }

function validerChasse(){
  if(!chasseSelection){
    direErreurChasse('Choisis d\'abord un Pokémon.');
    chasseRecherche.focus();
    return;
  }
  const dex = chasseJeu ? chasseJeu.value : 'national';
  if(!methodesPour(dex).length){
    direErreurChasse('Ce jeu ne contient pas de Pokémon chromatiques.');
    return;
  }
  if(chasses.some(function(c){
    return c.pokemon === chasseSelection.name && c.dex === dex;
  })){
    direErreurChasse('Une chasse est déjà en cours pour ce Pokémon dans ce jeu.');
    return;
  }

  chasses.unshift({
    pokemon: chasseSelection.name,
    dex: dex,
    methode: chasseMethode ? chasseMethode.value : 'rencontre',
    bonus: bonusCoches(),
    compteur: 0,
    debut: new Date().toISOString()
  });
  fermerChasseModal();
  enregistrerChasses();
}

if(chasseRecherche){
  chasseRecherche.addEventListener('input', suggererChasse);
  chasseRecherche.addEventListener('keydown', function(e){
    if(e.key === 'Escape') fermerChasseModal();
  });
}
document.getElementById('chasseNouvelle').addEventListener('click', ouvrirChasseModal);
chasseValider.addEventListener('click', validerChasse);
document.getElementById('chasseAnnuler').addEventListener('click', fermerChasseModal);
chasseOverlay.addEventListener('click', function(e){
  if(e.target === chasseOverlay) fermerChasseModal();
});
if(chasseJeu) chasseJeu.addEventListener('change', majMethodesDisponibles);
// Changer de méthode ne change pas les bonus proposés, mais bien le taux.
if(chasseMethode) chasseMethode.addEventListener('change', majTauxAffiche);

// ---- Le tableau de chasse ---------------------------------------------------
//
// Une chasse aboutie disparaissait entièrement : le compteur, la durée, la
// méthode partaient avec la fenêtre de félicitations. C'est pourtant la seule
// chose qu'un chasseur relit — et probabiliteCumulee() calculait déjà tout ce
// qu'il faut pour en tirer un chiffre honnête.
//
// LE RAPPORT À LA MOYENNE. Une chasse suit une loi géométrique : son espérance
// est exactement le taux. On compare donc la somme des rencontres à la somme
// des taux — 0,7 × veut dire qu'on a mis 30 % de rencontres en moins que ce que
// la moyenne demandait. Ce rapport n'a de sens qu'à partir de quelques chasses :
// sur une seule, il ne dit rien de plus que le compteur lui-même.
const TABLEAU_MIN_POUR_CHANCE = 3;
const TABLEAU_LIGNES = 8;

const chasseTableau = document.getElementById('chasseTableau');
const tableauTitre = document.getElementById('tableauTitre');

function chiffreTableau(valeur, libelle, note){
  const bloc = document.createElement('div');
  bloc.className = 'tableau-chiffre';
  const v = document.createElement('b');
  v.textContent = valeur;
  const l = document.createElement('span');
  l.textContent = libelle;
  bloc.appendChild(v);
  bloc.appendChild(l);
  if(note) bloc.title = note;
  return bloc;
}

function dessinerTableauChasse(){
  if(!chasseTableau) return;
  const vide = !chassesFinies.length;
  chasseTableau.hidden = vide;
  if(tableauTitre) tableauTitre.hidden = vide;
  if(vide){ chasseTableau.innerHTML = ''; return; }

  const total = chassesFinies.reduce(function(n, c){ return n + (c.compteur || 0); }, 0);
  // Les chasses sans taux connu — une méthode retirée depuis, un import venu
  // d'ailleurs — sortent du rapport plutôt que d'y compter pour zéro.
  const chiffrables = chassesFinies.filter(function(c){ return c.taux > 0; });
  const attendu = chiffrables.reduce(function(n, c){ return n + c.taux; }, 0);
  const vecu = chiffrables.reduce(function(n, c){ return n + (c.compteur || 0); }, 0);
  const plusLongue = chassesFinies.reduce(function(a, b){
    return (b.compteur || 0) > (a.compteur || 0) ? b : a; });
  const plusCourte = chassesFinies.reduce(function(a, b){
    return (b.compteur || 0) < (a.compteur || 0) ? b : a; });

  chasseTableau.innerHTML = '';

  const chiffres = document.createElement('div');
  chiffres.className = 'tableau-chiffres';
  chiffres.appendChild(chiffreTableau(
    String(chassesFinies.length),
    chassesFinies.length > 1 ? 'chromatiques trouvés' : 'chromatique trouvé'));
  chiffres.appendChild(chiffreTableau(
    total.toLocaleString('fr-FR'), 'rencontres en tout'));
  chiffres.appendChild(chiffreTableau(
    (plusLongue.compteur || 0).toLocaleString('fr-FR'), 'la plus longue',
    nomDeChasse(plusLongue)));
  if(chassesFinies.length > 1){
    chiffres.appendChild(chiffreTableau(
      (plusCourte.compteur || 0).toLocaleString('fr-FR'), 'la plus courte',
      nomDeChasse(plusCourte)));
  }
  if(chiffrables.length >= TABLEAU_MIN_POUR_CHANCE && attendu > 0){
    const rapport = vecu / attendu;
    const bloc = chiffreTableau(
      '×' + rapport.toFixed(2).replace('.', ','),
      rapport < 1 ? 'de la moyenne — chanceux' : 'de la moyenne',
      'La somme de tes rencontres, divisée par la somme des taux. Une chasse '
      + 'demande en moyenne autant de rencontres que son taux : sous 1, tu as '
      + 'mis moins que la moyenne. Calculé sur ' + chiffrables.length + ' chasses.');
    bloc.classList.add(rapport < 1 ? 'chanceux' : 'malchanceux');
    chiffres.appendChild(bloc);
  }
  chasseTableau.appendChild(chiffres);

  // Les dernières, de la plus récente à la plus ancienne.
  const liste = document.createElement('div');
  liste.className = 'tableau-liste';
  chassesFinies.slice().reverse().slice(0, TABLEAU_LIGNES).forEach(function(c){
    const ligne = document.createElement('div');
    ligne.className = 'tableau-ligne';

    const e = entreeDeChasse(c);
    const cadre = document.createElement('span');
    cadre.className = 'tableau-sprite';
    if(e){
      const img = document.createElement('img');
      img.src = pokeosHomeUrl(e.id, true);
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', function(){ img.src = officialArtworkUrl(e.id, true); });
      cadre.appendChild(img);
    }
    ligne.appendChild(cadre);

    const nom = document.createElement('span');
    nom.className = 'tableau-nom';
    nom.textContent = nomDeChasse(c);
    ligne.appendChild(nom);

    const meta = document.createElement('span');
    meta.className = 'tableau-meta';
    const m = METHODES[c.methode];
    meta.textContent = (gameByKey[c.dex] ? gameByKey[c.dex].tab : '🏡 Pokémon HOME')
      + '  ·  ' + (m ? m.nom : c.methode)
      + (c.taux ? '  ·  1/' + Math.round(c.taux) : '');
    ligne.appendChild(meta);

    const n = document.createElement('span');
    n.className = 'tableau-compteur';
    n.textContent = (c.compteur || 0).toLocaleString('fr-FR');
    n.title = c.fin ? 'Trouvé ' + depuisQuand(c.fin) : '';
    ligne.appendChild(n);

    // La photo de la rencontre, s'il y en a une — et la case pour en poser une
    // sinon. Elle vient de photos.js, chargé après celui-ci : le tableau se
    // dessine sans elle dans les pages de génération, qui n'ont pas de pont.
    if(typeof vignettePhoto === 'function') ligne.appendChild(vignettePhoto(c));

    liste.appendChild(ligne);
  });
  chasseTableau.appendChild(liste);

  if(chassesFinies.length > TABLEAU_LIGNES){
    const reste = document.createElement('p');
    reste.className = 'tableau-reste';
    reste.textContent = 'et ' + (chassesFinies.length - TABLEAU_LIGNES)
      + ' de plus, plus anciennes.';
    chasseTableau.appendChild(reste);
  }
}

// ---- Le clavier -------------------------------------------------------------
//
// Un compteur se frappe cent fois par heure, la manette dans l'autre main.
// Aller chercher un bouton de trente-quatre pixels à la souris entre deux
// rencontres est exactement ce qu'on ne veut pas faire.
//
// UNE CHASSE ACTIVE. Avec plusieurs chasses ouvertes, « +1 » doit savoir
// laquelle. La première l'est par défaut ; un clic sur une carte la désigne, et
// la carte le montre. Sans cela la touche agirait sur une chasse au hasard —
// et un compteur faussé ne se répare pas, on ne sait plus où il en était.
let chasseActive = null;

function chasseActiveOuPremiere(){
  if(chasseActive && chasses.indexOf(chasseActive) !== -1) return chasseActive;
  return chasses[0] || null;
}

function choisirChasseActive(c){
  chasseActive = c;
  dessinerChasses();
}

const chasseClavier = document.getElementById('chasseClavier');

function majLigneClavier(){
  if(!chasseClavier) return;
  const c = chasseActiveOuPremiere();
  chasseClavier.hidden = !c;
  if(!c) return;
  chasseClavier.innerHTML = '<b>Espace</b> +1  ·  <b>Retour arrière</b> −1  ·  '
    + '<b>Entrée</b> trouvé  —  sur <b>' + escapeHtml(nomDeChasse(c)) + '</b>'
    + (raccourcisGlobaux
        ? '<br><b>Ctrl+Alt+↑</b> et <b>Ctrl+Alt+↓</b> comptent même fenêtre '
          + 'en arrière-plan, pendant que tu joues.'
        : '')
    + (chasses.length > 1 ? '  <i>(clique une autre carte pour la viser)</i>' : '');
}

function compterAuClavier(pas){
  const c = chasseActiveOuPremiere();
  if(!c) return;
  c.compteur = Math.max(0, (c.compteur || 0) + pas);
  chasseActive = c;
  enregistrerChasses();
}

document.addEventListener('keydown', function(e){
  if(currentPage !== 'chasse') return;
  if(e.ctrlKey || e.altKey || e.metaKey) return;
  // Pas pendant qu'on écrit, ni derrière une modale : celle de création a son
  // propre champ de recherche, et l'espace y est un espace.
  const ou = document.activeElement;
  const nom = ou && ou.tagName;
  if(nom === 'INPUT' || nom === 'TEXTAREA' || nom === 'SELECT'
     || (ou && ou.isContentEditable)) return;
  if(document.querySelector('.modal-overlay[style*="flex"]')) return;
  if(!chasseActiveOuPremiere()) return;

  if(e.key === ' ' || e.code === 'Space'){ e.preventDefault(); compterAuClavier(1); return; }
  if(e.key === 'Backspace'){ e.preventDefault(); compterAuClavier(-1); return; }
  if(e.key === 'Enter'){
    e.preventDefault();
    conclureChasse(chasseActiveOuPremiere());
  }
});

// ---- L'overlay OBS -----------------------------------------------------------
//
// Une page servie en local, à coller en source navigateur dans OBS : le sprite,
// le compteur, le taux et la probabilité cumulée, sur fond transparent.
//
// C'EST UNE PETITE FONCTION TRÈS VISIBLE. Chaque diffusion devient une
// démonstration de l'application, et PokéPC cite le cas nommément — « if you
// are also a streamer ». L'infrastructure était déjà là : l'écoute locale qui
// reçoit le retour de connexion Discord se sert de la même bibliothèque.
//
// RÉSERVÉ À L'APPLICATION DE BUREAU. Un navigateur ne peut pas ouvrir de port,
// et il ne le doit pas. Le bouton reste caché sur le site plutôt que d'y
// proposer quelque chose qui échouerait.

const overlayBtn = document.getElementById('overlayBtn');
const overlayEtat = document.getElementById('overlayEtat');
let overlayAdresse = '';

function overlayPossible(){
  // UN NAVIGATEUR NE PEUT PAS OUVRIR D'ÉCOUTE LOCALE, et c'est la seule raison
  // de ce test — pas une histoire de compte. Le pont du site le dit lui-même
  // avec `overlayImpossible` plutôt que de laisser deviner : il sait ce qu'il
  // ne sait pas faire, et le nomme.
  const pont = window.PONT_HTTP || window.PONT_WEB;
  return !!(window.__TAURI__ && !(pont && pont.overlayImpossible !== false));
}

function majBoutonOverlay(){
  if(!overlayBtn) return;
  overlayBtn.hidden = !overlayPossible();
  if(overlayBtn.hidden) return;
  overlayBtn.textContent = overlayAdresse ? '📺 Arrêter l\'overlay' : '📺 Overlay OBS';
  overlayBtn.setAttribute('aria-pressed', String(!!overlayAdresse));
  if(overlayEtat){
    overlayEtat.textContent = overlayAdresse
      ? 'Source navigateur dans OBS : ' + overlayAdresse
      : '';
  }
}

/**
 * Ce que l'overlay doit afficher : la chasse visée, ou rien.
 *
 * Poussé à chaque dessin de la page. Ce n'est pas un gaspillage : l'appel est
 * local, il ne fait que déposer une chaîne dans un Mutex, et c'est ce qui
 * garantit que l'overlay ne montre jamais un compteur d'il y a trois clics.
 */
function pousserOverlay(){
  if(!overlayAdresse || !overlayPossible()) return;
  const c = (typeof chasseActiveOuPremiere === 'function') ? chasseActiveOuPremiere() : null;
  if(!c){
    invoke('overlay_etat', { etat: { actif: false } }).catch(function(){});
    return;
  }
  const taux = tauxDeChasse(c.methode, c.dex, c.bonus);
  const e = entreeDeChasse(c);
  const methode = METHODES[c.methode] || METHODES['autre'];
  const coches = (c.bonus || []).filter(function(b){ return estPourCeJeu(BONUS[b], c.dex); })
    .map(function(b){ return BONUS[b].nom; });

  invoke('overlay_etat', {
    etat: {
      actif: true,
      nom: nomDeChasse(c),
      // Le sprite chromatique : c'est ce qu'on cherche, et c'est ce que le
      // spectateur veut voir tomber.
      sprite: e ? pokeosHomeUrl(e.id, true) : '',
      compteur: c.compteur || 0,
      meta: (gameByKey[c.dex] ? gameByKey[c.dex].tab : '🏡 Pokémon HOME')
        + '  ·  ' + methode.nom
        + (coches.length ? '  +  ' + coches.join(' + ') : '')
        + (taux ? '  ·  1/' + Math.round(taux) : ''),
      chance: probabiliteCumulee(c.compteur, taux)
    }
  }).catch(function(){});
}

async function basculerOverlay(){
  if(!overlayBtn) return;
  overlayBtn.disabled = true;
  try{
    if(overlayAdresse){
      await invoke('overlay_arreter');
      overlayAdresse = '';
      majBoutonOverlay();
      return;
    }
    overlayAdresse = await invoke('overlay_demarrer');
    majBoutonOverlay();
    pousserOverlay();

    // L'adresse se recopie à la main dans OBS : on la met dans le
    // presse-papiers ET on l'affiche, parce qu'un presse-papiers silencieux
    // laisse croire qu'il ne s'est rien passé.
    let copiee = false;
    try{
      await navigator.clipboard.writeText(overlayAdresse);
      copiee = true;
    }catch(e){ /* refusé : l'adresse reste lisible à l'écran */ }

    await prevenir({
      eyebrow: 'Overlay OBS',
      genre: 'succes',
      titre: 'L\'overlay est en ligne',
      resume: [{ cle: 'adresse', valeur: overlayAdresse }],
      note: (copiee ? 'Elle est déjà dans ton presse-papiers. ' : '')
        + 'Dans OBS : Sources → + → Navigateur, colle cette adresse, et coche '
        + '« Rafraîchir le navigateur quand la scène devient active ». Le fond '
        + 'est transparent, il n\'y a rien à découper. Elle n\'écoute que sur '
        + 'cette machine, et s\'éteint quand tu fermes PokéArchive.',
      libelleAction: 'Compris'
    });
  }catch(e){
    overlayAdresse = '';
    majBoutonOverlay();
    prevenirErreur('L\'overlay n\'a pas pu démarrer', String(e));
  }finally{
    overlayBtn.disabled = false;
  }
}

// ---- Le raccourci global -----------------------------------------------------
//
// Rust émet « chasse-pas » avec 1 ou −1 ; l'interface décide ce que ça veut
// dire — quelle chasse, et quoi enregistrer. Voir poser_raccourcis() dans
// lib.rs.
//
// LE POINT DE TOUT CECI est que la fenêtre n'a pas besoin d'être au premier
// plan : c'est le jeu qui l'est pendant qu'on chasse. Un raccourci de fenêtre
// ne servirait que pendant les pauses.
let raccourcisGlobaux = false;

(function(){
  const T = window.__TAURI__;
  // Le site n'a pas d'événements Tauri : le pont web le dit, et .event
  // manque de toute façon. On se tait plutôt que d'échouer bruyamment.
  if(!T || !T.event || window.PONT_HTTP || window.PONT_WEB) return;
  try{
    T.event.listen('chasse-pas', function(e){
      const pas = Number(e && e.payload) || 0;
      if(pas && typeof compterAuClavier === 'function') compterAuClavier(pas);
    });
    raccourcisGlobaux = true;
  }catch(e){
    console.warn('Raccourcis globaux indisponibles :', e);
  }
})();

if(overlayBtn) overlayBtn.addEventListener('click', basculerOverlay);

// À l'ouverture : le serveur tourne peut-être déjà — on a pu changer d'onglet
// entre-temps. Sans cette relecture, le bouton proposait de démarrer une
// écoute déjà ouverte.
//
// C'EST AUSSI ELLE QUI MONTRE LE BOUTON, caché dans le HTML : majBoutonOverlay()
// est le seul endroit qui le découvre, et le clic sur ce même bouton son seul
// autre appelant. Une relecture qui n'aboutit pas, c'est un overlay que
// l'application de bureau n'affiche jamais.
//
// Le garde vaut pour les pages de génération, qui retirent compte.js : sans
// `invoke`, il n'y a rien à relire — le bouton se règle quand même.
function relireOverlay(){
  if(!overlayPossible() || typeof invoke !== 'function'){
    majBoutonOverlay();
    return;
  }
  invoke('overlay_adresse').then(function(a){
    overlayAdresse = a || '';
    majBoutonOverlay();
  }).catch(function(){ majBoutonOverlay(); });
}

// APRÈS LE CHARGEMENT, ET PAS TOUT DE SUITE. `invoke` est déclaré dans
// compte.js, qui est chargé APRÈS ce fichier. L'appeler ici levait « invoke is
// not defined » dans l'application de bureau — une erreur SYNCHRONE, levée
// avant que la promesse n'existe, que son .catch() ne pouvait donc pas voir :
// majBoutonOverlay() n'était jamais appelé, et le bouton de l'overlay restait
// caché. Le banc vérifie maintenant que la page se charge sans erreur. C'est
// l'idiome de pixelmonworld.js, qui attend de même pour son premier appel.
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', relireOverlay);
} else {
  relireOverlay();
}
