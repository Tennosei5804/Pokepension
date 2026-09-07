// La page Stratégie : trois outils qui répondent aux questions d'avant-combat.
// Script classique (pas de module ES), chargé APRÈS combat.js — d'où viennent
// les natures, les objets, les talents, le calcul des statistiques, celui des
// dégâts et la modale de configuration — et après fiche.js, pour puceType.
//
//   · Efficacité — « une attaque Plante sur un Pokémon Feu et Eau, ça donne
//     quoi ? », plus la table complète des dix-huit types ;
//   · Équipe — six emplacements, chacun avec son jeu complet, et ce que
//     l'équipe craint collectivement ;
//   · Dégâts — la formule officielle, avec la fourchette des seize jets.
//
// Ce fichier ne fait que dessiner. Tout ce qui se calcule est dans combat.js.

// ---- Les sous-onglets --------------------------------------------------------

const stratOnglets = document.getElementById('stratOnglets');
const stratSections = {
  types:  document.getElementById('strat-types'),
  equipe: document.getElementById('strat-equipe'),
  degats: document.getElementById('strat-degats'),
  ev:     document.getElementById('strat-ev')
};
let stratOutil = 'types';

function montrerOutil(nom){
  if(!stratSections[nom]) return;
  stratOutil = nom;
  Object.keys(stratSections).forEach(function(cle){
    stratSections[cle].classList.toggle('active', cle === nom);
  });
  stratOnglets.querySelectorAll('.strat-onglet').forEach(function(b){
    const on = b.dataset.outil === nom;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  // La table des types est lourde à construire : on ne la dessine qu'une fois,
  // et seulement si on ouvre l'onglet qui la contient.
  if(nom === 'types') dessinerTableTypes();
  if(nom === 'ev') dessinerEntrainement();
}

if(stratOnglets){
  stratOnglets.addEventListener('click', function(e){
    const b = e.target.closest('.strat-onglet');
    if(b) montrerOutil(b.dataset.outil);
  });
}

// Appelée par showPage à chaque ouverture de la page.
function dessinerStrategie(){
  remplirSelectsTypes();
  remplirConditions();
  calculerEfficacite();
  if(stratOutil === 'types') dessinerTableTypes();
  dessinerEquipe();
}

// ---- Outil 1 : l'efficacité d'un type ---------------------------------------
// C'est la question la plus courante, et celle qui n'a pas de réponse évidente
// quand le défenseur a deux types : les deux coefficients se multiplient, et
// « Plante contre Feu/Eau » fait ×1, pas ×0.5 comme on le croit souvent.

const effAttaqueEl = document.getElementById('effAttaque');
const effDef1El = document.getElementById('effDef1');
const effDef2El = document.getElementById('effDef2');
const effResultatEl = document.getElementById('effResultat');

// Les verdicts du jeu, mot pour mot : c'est ce que le joueur lit en combat.
const VERDICTS = {
  4:    { texte: 'C\'est super efficace !',      classe: 'tres-efficace', note: 'Le maximum possible.' },
  2:    { texte: 'C\'est super efficace !',      classe: 'efficace',      note: '' },
  1:    { texte: 'Dégâts normaux.',              classe: 'neutre',        note: 'Ni bonus ni malus.' },
  0.5:  { texte: 'Ce n\'est pas très efficace…', classe: 'faible',        note: '' },
  0.25: { texte: 'Ce n\'est pas très efficace…', classe: 'tres-faible',   note: 'Les deux types résistent.' },
  0:    { texte: 'Ça n\'affecte pas le Pokémon…', classe: 'nul',          note: 'Aucun dégât, quoi qu\'il arrive.' }
};

let selectsTypesRemplis = false;

function remplirSelectsTypes(){
  if(selectsTypesRemplis || !effAttaqueEl) return;
  const ids = Object.keys(TYPES_FR).map(Number);
  ids.forEach(function(id){
    [effAttaqueEl, effDef1El, effDef2El].forEach(function(sel){
      const o = document.createElement('option');
      o.value = String(id);
      o.textContent = TYPES_FR[id];
      sel.appendChild(o);
    });
  });
  effAttaqueEl.value = '12';   // Plante, l'exemple de la demande
  effDef1El.value = '10';      // Feu
  effDef2El.value = '11';      // Eau
  selectsTypesRemplis = true;
  if(typeof syncSelects === 'function') syncSelects();
}

function calculerEfficacite(){
  if(!effResultatEl) return;
  const attaque = parseInt(effAttaqueEl.value, 10);
  const def = [parseInt(effDef1El.value, 10)];
  if(effDef2El.value !== 'aucun' && parseInt(effDef2El.value, 10) !== def[0]){
    def.push(parseInt(effDef2El.value, 10));
  }

  const r = efficaciteOffensive(attaque, def);
  const v = VERDICTS[r.mult] || VERDICTS[1];

  effResultatEl.innerHTML = '';
  effResultatEl.className = 'eff-resultat ' + v.classe;

  const haut = document.createElement('div');
  haut.className = 'eff-haut';
  const mult = document.createElement('span');
  mult.className = 'eff-mult';
  mult.textContent = MULT_LIBELLE[r.mult];
  const verdict = document.createElement('span');
  verdict.className = 'eff-verdict';
  verdict.textContent = v.texte;
  haut.appendChild(mult); haut.appendChild(verdict);
  effResultatEl.appendChild(haut);

  const phrase = document.createElement('div');
  phrase.className = 'eff-phrase';
  phrase.textContent = 'Une attaque ' + TYPES_FR[attaque] + ' sur un Pokémon '
    + def.map(function(d){ return TYPES_FR[d]; }).join(' et ') + '.';
  effResultatEl.appendChild(phrase);

  // Le détail : indispensable dès qu'il y a deux types, parce qu'un ×1 peut
  // cacher un ×2 annulé par un ×0.5.
  if(def.length > 1){
    const detail = document.createElement('div');
    detail.className = 'eff-detail';
    r.detail.forEach(function(d){
      const ligne = document.createElement('span');
      ligne.className = 'eff-detail-ligne';
      ligne.appendChild(puceType(d.type));
      const f = document.createElement('b');
      f.textContent = MULT_LIBELLE[d.facteur];
      ligne.appendChild(f);
      detail.appendChild(ligne);
    });
    const egal = document.createElement('span');
    egal.className = 'eff-detail-total';
    egal.textContent = '= ' + MULT_LIBELLE[r.mult];
    detail.appendChild(egal);
    effResultatEl.appendChild(detail);
  }

  if(v.note){
    const note = document.createElement('div');
    note.className = 'eff-note';
    note.textContent = v.note;
    effResultatEl.appendChild(note);
  }
}

[effAttaqueEl, effDef1El, effDef2El].filter(Boolean).forEach(function(el){
  el.addEventListener('change', calculerEfficacite);
});

// ---- Outil 2 : la table des dix-huit types ----------------------------------
// Les lignes attaquent, les colonnes défendent. Le sens se perd vite : on le
// rappelle en tête de tableau plutôt que de laisser deviner.

const tableTypesEl = document.getElementById('tableTypes');
let tableTypesFaite = false;

if(tableEre){
  tableEre.addEventListener('click', function(e){
    const b = e.target.closest('button');
    if(b) poserEreTable(Number(b.dataset.ere));
  });
}

// L'époque de la table complète.
//
// Trois valeurs, et pas vingt-quatre : la table n'a changé que deux fois en
// neuf générations. Proposer un jeu par jeu laisserait croire à vingt-quatre
// tables différentes, alors que Rubis, Diamant et Noir donnent exactement la
// même — autant le dire.
//
// Les règles elles-mêmes vivent dans fiche.js, avec relationsDeLEre() et
// typeExiste() : c'est là qu'elles ont été relevées sur les
// « past_damage_relations » de PokeAPI, et les dupliquer ici ferait diverger
// les deux copies.
let tableTypesEre = 6;

const TABLE_ERE_NOTE = {
  // Elle avait droit au silence, les deux autres à une phrase — comme si
  // « aujourd'hui » se passait d'être situé. Les jeux se nomment donc ici
  // aussi. Légendes Arceus y figure malgré son numéro de génération : il suit
  // la table moderne, ce que son rang seul ne dit pas.
  6: 'X / Y à Écarlate / Violet, Légendes Arceus compris. Les dix-huit types, '
   + 'depuis l’arrivée de la Fée.',
  2: 'Or / Argent à Noir 2 / Blanc 2. Le type Fée n’existe pas encore : '
   + 'Combat, Poison et Dragon s’en trouvent tout autres.',
  1: 'Rouge / Bleu / Jaune. Ni Acier, ni Ténèbres, ni Fée — quinze types '
   + 'seulement. Spectre ne fait AUCUN dégât au Psy, Insecte et Poison sont '
   + 'super-efficaces l’un contre l’autre, et Glace ne craint pas le Feu.',
};

function poserEreTable(ere){
  tableTypesEre = ere;
  if(tableEre){
    tableEre.querySelectorAll('button').forEach(function(b){
      b.classList.toggle('actif', Number(b.dataset.ere) === ere);
    });
  }
  if(tableEreNote){
    tableEreNote.textContent = TABLE_ERE_NOTE[ere] || '';
    // « block » et non la chaine vide : la feuille cache la note par defaut, et
    // rendre la propriete a la feuille la recacherait aussitot.
    tableEreNote.style.display = TABLE_ERE_NOTE[ere] ? 'block' : 'none';
  }
  // La table est mémoïsée : dessiner dix-huit lignes de dix-huit cases à chaque
  // ouverture de l'onglet serait du gaspillage. Changer d'époque est justement
  // le cas où il faut la redessiner.
  tableTypesFaite = false;
  dessinerTableTypes();
}

function dessinerTableTypes(){
  if(!tableTypesEl || tableTypesFaite) return;
  // Un type qui n'existe pas encore ne doit figurer ni en ligne ni en colonne :
  // une colonne Fee sur une table de Rouge et Bleu serait un mensonge poli.
  const rel = relationsDeLEre(tableTypesEre);
  const ids = Object.keys(TYPES_FR).map(Number)
    .filter(function(id){ return typeExiste(id, tableTypesEre); });

  const table = document.createElement('table');
  table.className = 'table-types';

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  const coin = document.createElement('th');
  coin.className = 'tt-coin';
  coin.innerHTML = '<span>ATT.</span><span>DÉF.</span>';
  trh.appendChild(coin);
  ids.forEach(function(d){
    const th = document.createElement('th');
    th.className = 'tt-def';
    // Le logo est couché : dix-huit badges à l'horizontale feraient une table
    // de deux mille pixels. La boîte réserve la place, l'image tourne dedans.
    const boite = document.createElement('span');
    boite.className = 'tt-boite';
    boite.appendChild(puceType(d));
    th.appendChild(boite);
    th.title = 'Défenseur ' + TYPES_FR[d];
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  ids.forEach(function(a){
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.className = 'tt-att';
    th.appendChild(puceType(a));
    th.title = 'Attaquant ' + TYPES_FR[a];
    tr.appendChild(th);

    ids.forEach(function(d){
      const td = document.createElement('td');
      const f = efficaciteOffensive(a, [d], rel).mult;
      // Le neutre reste vide : dessiner 324 « ×1 » noierait les cases utiles.
      // Le « × » est sous-entendu dans une matrice — le répéter 324 fois
      // ajouterait du bruit sans rien apprendre.
      if(f !== 1){
        td.textContent = f === 2 ? '2' : (f === 0.5 ? '0.5' : '0');
        td.className = f === 2 ? 'tt-fort' : (f === 0.5 ? 'tt-faible' : 'tt-nul');
      }
      td.title = TYPES_FR[a] + ' → ' + TYPES_FR[d] + ' : ' + MULT_LIBELLE[f];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  tableTypesEl.innerHTML = '';
  tableTypesEl.appendChild(table);
  tableTypesEl.appendChild(legendeTypes());
  tableTypesFaite = true;
}

// La légende, à droite du tableau. Les six valeurs y figurent, y compris le ×1
// que les cases laissent vides : c'est justement celle qu'on ne reconnaît pas.
const LEGENDE = [
  { v:4,    classe:'tt-fort',   texte:'Double faiblesse' },
  { v:2,    classe:'tt-fort',   texte:'Faiblesse' },
  { v:1,    classe:'tt-neutre', texte:'Dégâts normaux' },
  { v:0.5,  classe:'tt-faible', texte:'Résistance' },
  { v:0.25, classe:'tt-faible', texte:'Double résistance' },
  { v:0,    classe:'tt-nul',    texte:'Inefficace' }
];

function legendeTypes(){
  const bloc = document.createElement('div');
  bloc.className = 'tt-legende';

  const titre = document.createElement('div');
  titre.className = 'tt-legende-titre';
  titre.textContent = 'Légende';
  bloc.appendChild(titre);

  LEGENDE.forEach(function(l){
    const ligne = document.createElement('div');
    ligne.className = 'tt-legende-ligne';
    const pastille = document.createElement('span');
    pastille.className = 'tt-legende-case ' + l.classe;
    pastille.textContent = l.v === 1 ? '' : (l.v === 0.5 ? '0.5' : (l.v === 0.25 ? '0.25' : String(l.v)));
    const mot = document.createElement('span');
    mot.className = 'tt-legende-mot';
    mot.innerHTML = '<b>' + MULT_LIBELLE[l.v] + '</b> ' + l.texte;
    ligne.appendChild(pastille); ligne.appendChild(mot);
    bloc.appendChild(ligne);
  });

  const note = document.createElement('p');
  note.className = 'tt-legende-note';
  note.textContent = 'Une case vide vaut ×1. Un double type multiplie les deux '
    + 'coefficients : c\'est de là que viennent les ×4 et les ×0.25.';
  bloc.appendChild(note);
  return bloc;
}

// ---- Outil 4 : où entraîner -------------------------------------------------
// La question se pose dans ce sens-là : « il me faut de la Vitesse, je bats
// quoi ? ». La fiche répond à l'inverse — on y lit ce qu'un Pokémon rapporte —
// et les deux sens sont utiles à des moments différents.

const evStatEl = document.getElementById('evStat');
const evCombienEl = document.getElementById('evCombien');
const evNomEl = document.getElementById('evNom');
const evListeEl = document.getElementById('evListe');
const evPlusEl = document.getElementById('evPlus');
const evCompteEl = document.getElementById('evCompte');

const EV_LOT = 60;
let evTrouves = [];
let evDessines = 0;
let evStatsRemplies = false;

function dessinerEntrainement(){
  if(!evListeEl) return;
  if(!evStatsRemplies){
    evStatEl.appendChild(new Option('Toutes', 'all'));
    STATS_NOMS.forEach(function(nom, i){
      evStatEl.appendChild(new Option(nom, String(i)));
    });
    evStatsRemplies = true;
    if(typeof syncSelects === 'function') syncSelects();
  }
  filtrerEntrainement();
}

function effortDe(entry){
  const f = ficheEmbarquee(entry);
  return (f && f.effort) ? f.effort : null;
}

function filtrerEntrainement(){
  const stat = evStatEl.value;
  const combien = evCombienEl.value;
  const q = (evNomEl.value || '').trim().toLowerCase();

  // Une entrée par espèce : les formes régionales donnent les mêmes points, et
  // les lister toutes ferait défiler trois fois la même réponse.
  evTrouves = allEntries.filter(function(e){
    if(e.id !== e.speciesId) return false;
    const ev = effortDe(e);
    if(!ev) return false;
    if(q && nomAffiche(e).toLowerCase().indexOf(q) === -1) return false;
    if(stat === 'all'){
      if(combien === 'all') return ev.some(function(n){ return n > 0; });
      return ev.some(function(n){ return n === parseInt(combien, 10); });
    }
    const n = ev[parseInt(stat, 10)];
    if(!n) return false;
    return combien === 'all' || n === parseInt(combien, 10);
  });

  // Les plus généreux d'abord : c'est le seul tri qui répond à la question.
  const cle = stat === 'all' ? null : parseInt(stat, 10);
  evTrouves.sort(function(a, b){
    const ea = effortDe(a), eb = effortDe(b);
    const va = cle === null ? Math.max.apply(null, ea) : ea[cle];
    const vb = cle === null ? Math.max.apply(null, eb) : eb[cle];
    return vb - va || a.speciesId - b.speciesId;
  });

  evDessines = 0;
  evListeEl.innerHTML = '';
  if(!evTrouves.length){
    evListeEl.innerHTML = '<div class="state-msg">Aucun Pokémon ne donne ces points.</div>';
    evPlusEl.style.display = 'none';
    evCompteEl.textContent = '';
    return;
  }
  peindreLotEV();
}

function peindreLotEV(){
  const home = (typeof bucketFor === 'function') ? bucketFor('national') : null;
  const suite = evTrouves.slice(evDessines, evDessines + EV_LOT);
  const frag = document.createDocumentFragment();

  suite.forEach(function(e){
    const ev = effortDe(e);
    const carte = document.createElement('button');
    carte.type = 'button';
    carte.className = 'repro-carte' + (home && home.caught.has(e.name) ? ' possede' : '');
    carte.title = 'Ouvrir la fiche de ' + nomAffiche(e);

    const img = document.createElement('img');
    img.src = pokeosHomeUrl(e.id, false);
    img.alt = '';
    img.loading = 'lazy';
    carte.appendChild(img);

    const infos = document.createElement('span');
    const nom = document.createElement('span');
    nom.className = 'repro-carte-nom';
    nom.textContent = nomAffiche(e);
    infos.appendChild(nom);

    const puces = document.createElement('span');
    puces.className = 'ev-puces';
    ev.forEach(function(n, i){
      if(!n) return;
      const p = document.createElement('span');
      // « fiche-effort-puce » était le nom de l'ancienne fiche. Le modèle du
      // 24 août 2026 l'a renommé .effort-puce, et personne n'avait suivi ici :
      // ces pastilles n'avaient plus ni fond, ni couleur, ni arrondi — juste
      // la taille que .ev-puces leur donnait.
      p.className = 'effort-puce';
      p.textContent = '+' + n + ' ' + STATS_NOMS[i];
      puces.appendChild(p);
    });
    infos.appendChild(puces);
    carte.appendChild(infos);

    carte.addEventListener('click', function(){ openPreview(e, null); });
    frag.appendChild(carte);
  });

  evListeEl.appendChild(frag);
  evDessines += suite.length;
  evPlusEl.style.display = evDessines < evTrouves.length ? 'block' : 'none';
  evPlusEl.textContent = 'Afficher plus (' + (evTrouves.length - evDessines) + ' restants)';
  evCompteEl.textContent = evTrouves.length + ' Pokémon';
}

[evStatEl, evCombienEl].filter(Boolean).forEach(function(el){
  el.addEventListener('change', filtrerEntrainement);
});
if(evNomEl) evNomEl.addEventListener('input', filtrerEntrainement);
if(evPlusEl) evPlusEl.addEventListener('click', function(){ peindreLotEV(); });

// ---- Un sélecteur de Pokémon, réutilisable ----------------------------------
// L'équipe en veut six, le calculateur de dégâts deux. Même comportement
// partout : on tape, on choisit, la modale de réglages s'ouvre.

function creerSelecteur(champ, boite, quandChoisi){
  if(!champ) return;

  function fermer(){ boite.style.display = 'none'; boite.innerHTML = ''; }

  champ.addEventListener('input', function(){
    const q = champ.value.trim().toLowerCase();
    if(q.length < 2 || typeof allEntries === 'undefined'){ fermer(); return; }
    const trouves = allEntries.filter(function(e){
      return nomAffiche(e).toLowerCase().indexOf(q) !== -1;
    }).slice(0, 8);
    if(!trouves.length){ fermer(); return; }
    boite.innerHTML = '';
    trouves.forEach(function(e){
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'strat-suggestion';
      const img = document.createElement('img');
      img.src = pokeosHomeUrl(e.id, false);
      img.alt = '';
      const nom = document.createElement('span');
      nom.textContent = nomAffiche(e);
      b.appendChild(img); b.appendChild(nom);
      b.addEventListener('click', function(){
        champ.value = nomAffiche(e);
        fermer();
        quandChoisi(e);
      });
      boite.appendChild(b);
    });
    boite.style.display = '';
  });

  champ.addEventListener('keydown', function(e){ if(e.key === 'Escape') fermer(); });
  // En capture, comme les autres fermetures « clic ailleurs » (voir notifs.js).
  document.addEventListener('click', function(e){
    if(e.target !== champ && !boite.contains(e.target)) fermer();
  }, true);
}

// Le résumé d'un jeu en une ligne : ce qu'on veut relire sans rouvrir la modale.
function resumeJeu(jeu){
  const bouts = [];
  const cap = resumeCapacite(jeu);
  if(cap) bouts.push(cap);
  bouts.push('Nv. ' + jeu.niveau, natureParCle(jeu.nature).nom);
  // Les paliers actifs passent devant le reste : ce sont eux qui changent le
  // plus un calcul, et les oublier fait douter du résultat.
  (jeu.boosts || []).forEach(function(n, i){
    if(n) bouts.push(STATS_NOMS[i] + ' ' + (n > 0 ? '+' : '') + n);
  });
  const talent = jeu.talent != null ? motDico('talents', jeu.talent) : null;
  if(talent) bouts.push(talent);
  if(jeu.objet && OBJETS[jeu.objet]) bouts.push(OBJETS[jeu.objet].nom);
  const ev = totalEV(jeu);
  if(ev) bouts.push(ev + ' EV');
  return bouts.join('  ·  ');
}

// ---- Outil 3 : l'équipe ------------------------------------------------------
// Six emplacements, et la seule question qui vaille : qu'est-ce qui met toute
// l'équipe en danger d'un coup. Un type auquel trois membres sont faibles et
// que personne ne résiste, c'est une partie perdue avant de commencer.

const equipeSlotsEl = document.getElementById('equipeSlots');
const equipeAnalyseEl = document.getElementById('equipeAnalyse');
const EQUIPE_TAILLE = 6;
const equipe = new Array(EQUIPE_TAILLE).fill(null);   // des « jeux », pas des entrées
let equipeMontee = false;

function dessinerEquipe(){
  if(!equipeSlotsEl) return;
  if(!equipeMontee){ monterSlotsEquipe(); equipeMontee = true; }
  analyserEquipe();
}

function monterSlotsEquipe(){
  equipeSlotsEl.innerHTML = '';
  for(let i = 0; i < EQUIPE_TAILLE; i++) equipeSlotsEl.appendChild(monterSlot(i));
}

function monterSlot(index){
  const slot = document.createElement('div');
  slot.className = 'equipe-slot';

  const vignette = document.createElement('div');
  vignette.className = 'equipe-vignette';
  vignette.textContent = String(index + 1);
  slot.appendChild(vignette);

  const corps = document.createElement('div');
  corps.className = 'equipe-corps';

  const champ = document.createElement('input');
  champ.type = 'search';
  champ.className = 'equipe-champ';
  champ.placeholder = 'Un Pokémon…';
  champ.setAttribute('aria-label', 'Pokémon ' + (index + 1) + ' de l\'équipe');
  champ.autocomplete = 'off';
  corps.appendChild(champ);

  const boite = document.createElement('div');
  boite.className = 'strat-suggestions';
  boite.style.display = 'none';
  corps.appendChild(boite);

  const types = document.createElement('div');
  types.className = 'equipe-types';
  corps.appendChild(types);

  const detail = document.createElement('button');
  detail.type = 'button';
  detail.className = 'equipe-detail';
  detail.style.display = 'none';
  detail.title = 'Modifier niveau, nature, talent, objet, IV et EV';
  corps.appendChild(detail);

  slot.appendChild(corps);

  const vider = document.createElement('button');
  vider.type = 'button';
  vider.className = 'equipe-vider';
  vider.textContent = '✕';
  vider.title = 'Retirer ce Pokémon';
  vider.style.display = 'none';
  slot.appendChild(vider);

  function peindre(){
    const jeu = equipe[index];
    types.innerHTML = '';
    if(!jeu){
      champ.value = '';
      vignette.textContent = String(index + 1);
      vignette.style.backgroundImage = '';
      detail.style.display = 'none';
      vider.style.display = 'none';
      slot.classList.remove('rempli');
      return;
    }
    champ.value = nomAffiche(jeu.entry);
    typesDe(jeu.entry).forEach(function(t){ types.appendChild(puceType(t)); });
    vignette.textContent = '';
    vignette.style.backgroundImage = 'url("' + pokeosHomeUrl(jeu.entry.id, false) + '")';
    detail.textContent = resumeJeu(jeu);
    detail.style.display = '';
    vider.style.display = '';
    slot.classList.add('rempli');
  }

  function configurer(){
    if(!equipe[index]) return;
    ouvrirJeuModal(equipe[index],
      { role: 'Membre ' + (index + 1), avecCapacite: true },
      function(valide){
        equipe[index] = valide;
        peindre();
        analyserEquipe();
      });
  }

  detail.addEventListener('click', configurer);
  vider.addEventListener('click', function(){
    equipe[index] = null;
    peindre();
    analyserEquipe();
  });

  // Choisir un Pokémon ouvre directement ses réglages : c'est là qu'on va de
  // toute façon, et l'ouvrir tout de suite épargne un clic.
  creerSelecteur(champ, boite, async function(e){
    await loadTypes();
    equipe[index] = nouveauJeu(e);
    peindre();
    analyserEquipe();
    configurer();
  });

  peindre();
  return slot;
}

async function analyserEquipe(){
  if(!equipeAnalyseEl) return;
  const membres = equipe.filter(Boolean);
  if(!membres.length){
    equipeAnalyseEl.innerHTML = '<div class="state-msg">Ajoute au moins un Pokémon '
      + 'pour voir ce que ton équipe craint.</div>';
    return;
  }
  await loadTypes();

  const ids = Object.keys(TYPES_FR).map(Number);
  const bilan = ids.map(function(t){
    let faibles = 0, resistants = 0, immunises = 0;
    membres.forEach(function(m){
      // Le talent compte : un Lévitation change la réponse à « qui craint le Sol ».
      const f = efficaciteSubie(t, typesDe(m.entry), effetTalent(m)).mult;
      if(f > 1) faibles++;
      else if(f === 0) immunises++;
      else if(f < 1) resistants++;
    });
    return { type: t, faibles: faibles, resistants: resistants, immunises: immunises };
  });

  equipeAnalyseEl.innerHTML = '';

  const menaces = bilan.filter(function(b){ return b.faibles > 0; })
    .sort(function(a, b){ return b.faibles - a.faibles || a.type - b.type; });
  equipeAnalyseEl.appendChild(blocEquipe(
    'Ce qui fait mal',
    menaces.length ? menaces : null,
    function(b){
      const couverte = b.resistants + b.immunises;
      return {
        valeur: b.faibles + ' / ' + membres.length,
        alerte: b.faibles >= Math.max(2, Math.ceil(membres.length / 2)) && couverte === 0,
        aide: b.faibles + ' membre(s) faible(s), ' + couverte + ' qui encaisse(nt)'
      };
    },
    'Aucun type ne met cette équipe en difficulté.'
  ));

  const trous = bilan.filter(function(b){ return b.resistants + b.immunises === 0; })
    .sort(function(a, b){ return b.faibles - a.faibles || a.type - b.type; });
  equipeAnalyseEl.appendChild(blocEquipe(
    'Ce que personne n\'encaisse',
    trous.length ? trous : null,
    function(b){
      return {
        valeur: b.faibles ? b.faibles + ' faible(s)' : 'plein fouet',
        alerte: b.faibles > 0,
        aide: 'Aucun membre ne résiste à ce type'
      };
    },
    'Chaque type est encaissé par au moins un membre.'
  ));

  const solides = bilan.filter(function(b){ return b.resistants + b.immunises >= 2 && !b.faibles; })
    .sort(function(a, b){
      return (b.resistants + b.immunises) - (a.resistants + a.immunises) || a.type - b.type;
    });
  equipeAnalyseEl.appendChild(blocEquipe(
    'Ce que l\'équipe encaisse',
    solides.length ? solides : null,
    function(b){
      return {
        valeur: (b.resistants + b.immunises) + ' / ' + membres.length,
        alerte: false,
        aide: b.immunises ? b.immunises + ' immunisé(s)' : 'résistances'
      };
    },
    'Aucun type n\'est encaissé par deux membres ou plus.'
  ));

  const stab = {};
  membres.forEach(function(m){ typesDe(m.entry).forEach(function(t){ stab[t] = true; }); });
  const couverts = ids.filter(function(d){
    return Object.keys(stab).some(function(a){
      return efficaciteOffensive(parseInt(a, 10), [d]).mult > 1;
    });
  });
  const nonCouverts = ids.filter(function(d){ return couverts.indexOf(d) === -1; });
  equipeAnalyseEl.appendChild(blocEquipe(
    'Non touché par tes STAB',
    nonCouverts.length ? nonCouverts.map(function(t){ return { type: t }; }) : null,
    function(){ return { valeur: '', alerte: false, aide: 'Aucun type de ton équipe ne le touche double' }; },
    'Tes types couvrent les dix-huit défenseurs.'
  ));
}

function blocEquipe(titre, lignes, decrire, vide){
  const bloc = document.createElement('section');
  bloc.className = 'equipe-bloc';

  const h = document.createElement('div');
  h.className = 'equipe-bloc-titre';
  h.textContent = titre;
  bloc.appendChild(h);

  if(!lignes){
    const p = document.createElement('div');
    p.className = 'equipe-vide';
    p.textContent = vide;
    bloc.appendChild(p);
    return bloc;
  }

  const liste = document.createElement('div');
  liste.className = 'equipe-lignes';
  lignes.forEach(function(b){
    const d = decrire(b);
    const l = document.createElement('span');
    l.className = 'equipe-ligne' + (d.alerte ? ' alerte' : '');
    l.title = d.aide;
    l.appendChild(puceType(b.type));
    if(d.valeur){
      const v = document.createElement('b');
      v.textContent = d.valeur;
      l.appendChild(v);
    }
    liste.appendChild(l);
  });
  bloc.appendChild(liste);
  return bloc;
}

// ---- Outil 4 : les dégâts ----------------------------------------------------
// Deux jeux complets, la même modale que l'équipe, et la fourchette des seize
// jets. On affiche « 82 – 97 » et non « 90 » : la valeur unique serait un
// mensonge commode, et c'est justement l'écart qui décide d'un K.O.

const dgt = {
  atkNom: document.getElementById('dgtAtkNom'),
  atkSug: document.getElementById('dgtAtkSug'),
  atkResume: document.getElementById('dgtAtkResume'),
  atkConfig: document.getElementById('dgtAtkConfig'),
  defNom: document.getElementById('dgtDefNom'),
  defSug: document.getElementById('dgtDefSug'),
  defResume: document.getElementById('dgtDefResume'),
  defConfig: document.getElementById('dgtDefConfig'),
  crit: document.getElementById('dgtCrit'),
  brulure: document.getElementById('dgtBrulure'),
  coups: document.getElementById('dgtCoups'),
  resultat: document.getElementById('dgtResultat')
};

const dgtMeteoEl = document.getElementById('dgtMeteo');
const dgtTerrainEl = document.getElementById('dgtTerrain');
let dgtCoups = 1;

// Météo et terrain se remplissent depuis les tables de combat.js : une seule
// source, donc pas de menu qui promet un effet que le calcul ignore.
function remplirConditions(){
  if(!dgtMeteoEl || dgtMeteoEl.options.length) return;
  Object.keys(METEOS).forEach(function(cle){
    const m = METEOS[cle];
    dgtMeteoEl.appendChild(new Option(m.nom + (m.aide ? '  —  ' + m.aide : ''), cle));
  });
  Object.keys(TERRAINS).forEach(function(cle){
    const x = TERRAINS[cle];
    dgtTerrainEl.appendChild(new Option(x.nom + (x.aide ? '  —  ' + x.aide : ''), cle));
  });
  dgt.coups.innerHTML = '';
  dgt.coups.appendChild(champNombre({
    valeur: 1, min: 1, max: 10, pas: 1, classe: 'court', aria: 'Nombre de coups',
    onChange: function(v){ dgtCoups = v; calculerDegats(); }
  }));
  if(typeof syncSelects === 'function') syncSelects();
}

[dgtMeteoEl, dgtTerrainEl].filter(Boolean).forEach(function(el){
  el.addEventListener('change', calculerDegats);
});

let jeuAttaquant = null;
let jeuDefenseur = null;

function peindreCote(cote){
  const jeu = cote === 'att' ? jeuAttaquant : jeuDefenseur;
  const resume = cote === 'att' ? dgt.atkResume : dgt.defResume;
  const config = cote === 'att' ? dgt.atkConfig : dgt.defConfig;
  if(!resume) return;
  if(!jeu){
    resume.textContent = '';
    resume.classList.remove('rempli');
    if(config) config.disabled = true;
    return;
  }
  resume.textContent = resumeJeu(jeu);
  resume.classList.add('rempli');
  if(config) config.disabled = false;
}

function configurerCote(cote){
  const jeu = cote === 'att' ? jeuAttaquant : jeuDefenseur;
  if(!jeu) return;
  ouvrirJeuModal(jeu,
    { role: cote === 'att' ? 'Attaquant' : 'Défenseur', avecCapacite: cote === 'att' },
    function(valide){
      if(cote === 'att') jeuAttaquant = valide; else jeuDefenseur = valide;
      peindreCote(cote);
      calculerDegats();
    });
}

async function choisirCombattant(cote, entry){
  await loadTypes();
  const jeu = nouveauJeu(entry);
  if(cote === 'att') jeuAttaquant = jeu; else jeuDefenseur = jeu;
  peindreCote(cote);
  calculerDegats();
  configurerCote(cote);
}

creerSelecteur(dgt.atkNom, dgt.atkSug, function(e){ choisirCombattant('att', e); });
creerSelecteur(dgt.defNom, dgt.defSug, function(e){ choisirCombattant('def', e); });
if(dgt.atkConfig) dgt.atkConfig.addEventListener('click', function(){ configurerCote('att'); });
if(dgt.defConfig) dgt.defConfig.addEventListener('click', function(){ configurerCote('def'); });

// Les deux bascules. Un vrai bouton plutôt qu'une case à cocher : on le vise
// sans effort, il dit son état par sa couleur, et il se lit de loin.
function monterBascule(btn, quand){
  if(!btn) return;
  btn.addEventListener('click', function(){
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('on', on);
    quand();
  });
}
monterBascule(dgt.crit, calculerDegats);
monterBascule(dgt.brulure, calculerDegats);

function bascule(btn){ return !!btn && btn.getAttribute('aria-pressed') === 'true'; }

function calculerDegats(){
  if(!dgt.resultat) return;

  if(!jeuAttaquant || !jeuDefenseur){
    dgt.resultat.innerHTML = '<div class="state-msg">Choisis un attaquant et un défenseur.</div>';
    return;
  }
  const ids = capacitesRetenues(jeuAttaquant);
  if(!ids.length || !reserveCapacites){
    dgt.resultat.innerHTML = '<div class="state-msg">Ouvre la configuration de '
      + 'l\'attaquant et donne-lui au moins une attaque.</div>';
    return;
  }

  const options = {
    critique: bascule(dgt.crit),
    brulure: bascule(dgt.brulure),
    meteo: dgtMeteoEl ? dgtMeteoEl.value : '',
    terrain: dgtTerrainEl ? dgtTerrainEl.value : '',
    coups: dgtCoups
  };

  dgt.resultat.innerHTML = '';
  let dessinees = 0;
  // Une carte par attaque définie : c'est la comparaison qu'on cherche
  // vraiment — laquelle des quatre passe le mieux sur cette cible.
  ids.forEach(function(id){
    const r = analyseDegats(jeuAttaquant, jeuDefenseur, id, reserveCapacites, options);
    if(!r) return;
    dgt.resultat.appendChild(carteDegats(r));
    dessinees++;
  });
  if(!dessinees){
    dgt.resultat.innerHTML = '<div class="state-msg">Statistiques indisponibles '
      + 'pour cette forme.</div>';
  }
}

function carteDegats(r){
  const pctMin = (r.min / r.PV) * 100;
  const pctMax = (r.max / r.PV) * 100;

  const carte = document.createElement('div');
  carte.className = 'dgt-carte';

  const titre = document.createElement('div');
  titre.className = 'dgt-titre';
  titre.textContent = nomAffiche(jeuAttaquant.entry) + ' → ' + nomAffiche(jeuDefenseur.entry);
  carte.appendChild(titre);

  const attaque = document.createElement('div');
  attaque.className = 'dgt-attaque';
  attaque.appendChild(puceType(r.capacite[2]));
  const nomCap = document.createElement('b');
  nomCap.textContent = r.capacite[0];
  attaque.appendChild(nomCap);
  const meta = document.createElement('span');
  meta.textContent = (r.physique ? 'Physique' : 'Spéciale')
    + (r.fixe ? ' · dégâts fixes'
              : ' · puissance ' + r.puissance
                + (r.puissance !== r.capacite[4] ? ' (base ' + r.capacite[4] + ')' : ''))
    + (r.coups > 1 ? ' · ' + r.coups + ' coups' : '');
  attaque.appendChild(meta);
  carte.appendChild(attaque);

  if(r.eff === 0){
    const nul = document.createElement('div');
    nul.className = 'dgt-chiffre nul';
    nul.textContent = 'Aucun effet';
    carte.appendChild(nul);
    const pourquoi = document.createElement('div');
    pourquoi.className = 'dgt-sous';
    pourquoi.textContent = r.notes.length ? r.notes.join('  ·  ')
      : TYPES_FR[r.capacite[2]] + ' n\'affecte pas un Pokémon '
        + r.typesD.map(function(t){ return TYPES_FR[t]; }).join(' et ') + '.';
    carte.appendChild(pourquoi);
    return carte;
  }

  const chiffre = document.createElement('div');
  chiffre.className = 'dgt-chiffre';
  chiffre.textContent = r.min + ' – ' + r.max;
  const sur = document.createElement('span');
  sur.className = 'dgt-sur';
  sur.textContent = ' PV sur ' + r.PV;
  chiffre.appendChild(sur);
  carte.appendChild(chiffre);

  const barre = document.createElement('div');
  barre.className = 'dgt-barre';
  const rempliMax = document.createElement('i');
  rempliMax.className = 'max';
  rempliMax.style.width = Math.min(100, pctMax) + '%';
  const rempliMin = document.createElement('i');
  rempliMin.className = 'min';
  rempliMin.style.width = Math.min(100, pctMin) + '%';
  barre.appendChild(rempliMax); barre.appendChild(rempliMin);
  carte.appendChild(barre);

  const pct = document.createElement('div');
  pct.className = 'dgt-pct';
  pct.textContent = pctMin.toFixed(1) + ' % – ' + pctMax.toFixed(1) + ' % des PV';
  carte.appendChild(pct);

  const coupsMin = Math.ceil(r.PV / r.max);
  const coupsMax = Math.ceil(r.PV / r.min);
  const ko = document.createElement('div');
  ko.className = 'dgt-ko' + (coupsMax === 1 ? ' sur' : '');
  ko.textContent = coupsMax === 1 ? 'K.O. en un coup, à tous les coups'
    : (coupsMin === coupsMax
      ? 'K.O. en ' + coupsMin + ' coups'
      : 'K.O. en ' + coupsMin + ' à ' + coupsMax + ' coups');
  carte.appendChild(ko);

  // Tout ce qui a joué, en clair. Sans cette ligne, un résultat qui double sans
  // raison visible ressemble à un bug — alors que c'est un Bandeau Choix ou une
  // Adaptabilité qu'on avait oubliés.
  const facteurs = document.createElement('div');
  facteurs.className = 'dgt-facteurs';
  const bouts = ['efficacité ' + MULT_LIBELLE[r.eff]].concat(r.notes);
  if(r.crit) bouts.push('critique ×1,5');
  if(r.brulure) bouts.push('brûlure ×0,5');
  if(!r.fixe) bouts.push('attaque ' + r.A + ' contre défense ' + r.D);
  facteurs.textContent = bouts.join('  ·  ');
  carte.appendChild(facteurs);

  return carte;
}
