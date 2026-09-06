// Ce qui appartient au dresseur : ses données, ses connexions, et — pour un
// seul compte — le renommage de quelqu'un d'autre.
//
// Script classique, chargé APRÈS compte.js : il se sert d'invoke, de
// perdreSession et des dialogues, qui viennent de là.
//
// Trois blocs de la page Profil, et une bascule sur le journal. Ils vivent ici
// plutôt que dans compte.js, qui approche des mille cinq cents lignes et parle
// déjà de sept choses.

const exportBtn = document.getElementById('exportBtn');
const exportEtat = document.getElementById('exportEtat');
const sessionsListe = document.getElementById('sessionsListe');
const sessionsAutres = document.getElementById('sessionsAutres');
const adminTitre = document.getElementById('adminTitre');
const adminBloc = document.getElementById('adminBloc');
const adminPseudo = document.getElementById('adminPseudo');
const adminNouveau = document.getElementById('adminNouveau');
const adminRenommer = document.getElementById('adminRenommer');
const adminEtat = document.getElementById('adminEtat');

// ---- Emporter ses données ---------------------------------------------------

/**
 * Écrit le fichier là où la personne le demande.
 *
 * Un lien `download` ne suffit pas dans une application de bureau : le
 * navigateur embarqué le déposerait dans le dossier de téléchargements sans
 * rien demander, et parfois nulle part. On passe par la boîte du système —
 * c'est aussi ce qui rend le geste explicite.
 */
async function telecharger(nomPropose, contenu) {
  // L'API des fichiers de Tauri n'est pas déclarée dans les permissions : on
  // reste donc sur le lien, qui marche partout. Le dossier de téléchargements
  // du système est un endroit raisonnable, et le nom porte la date.
  const blob = new Blob([contenu], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomPropose;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Rendre la mémoire, mais pas tout de suite : révoquer avant que le
  // téléchargement ait démarré l'annulerait.
  setTimeout(function(){ URL.revokeObjectURL(url); }, 30_000);
}

async function exporterMesDonnees() {
  if (!exportBtn) return;
  exportBtn.disabled = true;
  exportEtat.textContent = 'Préparation…';
  try {
    const contenu = await invoke('exporter');
    const jour = String(contenu.exporteLe || '').slice(0, 10) || 'export';
    await telecharger('pokepension-' + jour + '.json', JSON.stringify(contenu, null, 2));
    const n = (contenu.aventures || []).length;
    exportEtat.textContent = n + ' aventure' + (n > 1 ? 's' : '') + ' enregistrée'
      + (n > 1 ? 's' : '') + ' dans le fichier.';
  } catch (e) {
    if (String(e) === 'SESSION_INVALIDE') { await perdreSession(); return; }
    exportEtat.textContent = '';
    prevenirErreur('L\'export a échoué', String(e));
  } finally {
    exportBtn.disabled = false;
  }
}


// ---- Relire une sauvegarde ---------------------------------------------------
//
// L'application exportait depuis toujours sans jamais savoir relire. C'était le
// seul manque entre le site et l'application : le format « pokearchive-1 » est
// versionné, complet, et produit des deux côtés — il n'était lu par personne.
//
// LA FUSION SE FAIT DE L'AUTRE CÔTÉ, dans l'API ou dans le pont. C'est voulu :
// c'est là que vivent le dex et le journal, et une union calculée ici puis
// renvoyée écraserait tout ce qui aurait bougé entre la lecture et l'écriture.
// Cet écran ne fait donc que trois choses — lire le fichier, dire ce qu'il
// contient, et demander confirmation.
//
// ON DEMANDE AVANT, TOUJOURS. L'union ne perd rien, mais elle ajoute : cocher
// six cents cases dans l'aventure de quelqu'un sans le prévenir serait le
// genre de surprise qu'on ne pardonne pas à un outil de collection.

const importBtn = document.getElementById('importBtn');
const importFichier = document.getElementById('importFichier');
const importEtat = document.getElementById('importEtat');

// Ce qu'un fichier annonce, avant de toucher à quoi que ce soit. On compte
// nous-mêmes plutôt que de croire les compteurs du fichier : ils datent de
// l'export, et rien ne garantit qu'ils correspondent encore à son contenu.
function resumeDuFichier(contenu) {
  const aventures = Array.isArray(contenu.aventures) ? contenu.aventures : [];
  let captures = 0, chromatiques = 0, journal = 0;
  aventures.forEach(function (a) {
    const vus = new Set(), brillants = new Set();
    const ajouter = function (cible, liste) {
      (Array.isArray(liste) ? liste : []).forEach(function (n) { cible.add(n); });
    };
    const d = (a && a.dex) || {};
    ajouter(vus, d.captures);
    ajouter(vus, d.caught);
    ajouter(brillants, d.shiny);
    Object.keys(d.dex || {}).forEach(function (jeu) {
      ajouter(vus, d.dex[jeu] && d.dex[jeu].caught);
      ajouter(brillants, d.dex[jeu] && d.dex[jeu].shiny);
    });
    captures += vus.size;
    chromatiques += brillants.size;
    journal += (Array.isArray(a && a.historique) ? a.historique.length : 0);
  });
  return { aventures: aventures.length, captures: captures,
           chromatiques: chromatiques, journal: journal,
           noms: aventures.map(function (a) { return (a && a.nom) || '(sans nom)'; }) };
}

function lireFichierTexte(fichier) {
  return new Promise(function (tenir, rejeter) {
    const lecteur = new FileReader();
    lecteur.onload = function () { tenir(String(lecteur.result || '')); };
    lecteur.onerror = function () { rejeter(new Error('Le fichier n\'a pas pu être lu.')); };
    lecteur.readAsText(fichier);
  });
}

async function importerUnFichier(fichier) {
  if (!fichier) return;
  importEtat.textContent = 'Lecture…';

  let contenu;
  try {
    contenu = JSON.parse(await lireFichierTexte(fichier));
  } catch (e) {
    importEtat.textContent = '';
    prevenirErreur('Fichier illisible',
      'Ce n\'est pas du JSON valide. Choisis le fichier tel qu\'il a été '
      + 'téléchargé, sans l\'ouvrir ni le modifier.');
    return;
  }

  if (!contenu || contenu.format !== 'pokearchive-1') {
    importEtat.textContent = '';
    prevenirErreur('Ce n\'est pas une sauvegarde PokéPension',
      'Le fichier doit porter le format « pokearchive-1 ». C\'est celui que '
      + 'produit le bouton « Télécharger mes données », ici comme sur le site.');
    return;
  }

  const r = resumeDuFichier(contenu);
  const quand = String(contenu.exporteLe || '').slice(0, 10);

  const ok = await demanderConfirmation({
    eyebrow: 'Importer',
    titre: 'Verser ce fichier dans ton compte ?',
    resume: [
      { cle: r.aventures > 1 ? 'aventures' : 'aventure', valeur: r.aventures },
      { cle: 'captures', valeur: r.captures },
      { cle: 'chromatiques', valeur: r.chromatiques },
      { cle: 'lignes de journal', valeur: r.journal }
    ],
    note: 'Les collections SE RÉUNISSENT : rien n\'est écrasé et rien n\'est '
      + 'décoché. Une aventure du fichier qui porte le nom d\'une des tiennes '
      + 'la complète ; les autres sont créées à côté, jamais en aventure par '
      + 'défaut.'
      + (quand ? ' Ce fichier a été exporté le ' + quand + '.' : '')
      + ' Aventures : ' + r.noms.slice(0, 6).join(', ')
      + (r.noms.length > 6 ? ', …' : '') + '.',
    libelleAction: 'Importer'
  });
  if (!ok) { importEtat.textContent = ''; return; }

  importBtn.disabled = true;
  importEtat.textContent = 'Import en cours…';
  try {
    const bilan = await invoke('importer', { contenu: contenu });
    importEtat.textContent = bilan.gagnees + ' capture'
      + (bilan.gagnees > 1 ? 's' : '') + ' ajoutée' + (bilan.gagnees > 1 ? 's' : '')
      + ', ' + bilan.journalisees + ' ligne' + (bilan.journalisees > 1 ? 's' : '')
      + ' de journal.';

    await prevenir({
      eyebrow: 'Import terminé',
      genre: 'succes',
      titre: 'C\'est versé',
      resume: [
        { cle: 'aventures touchées', valeur: bilan.aventures },
        { cle: 'aventures créées', valeur: bilan.creees },
        { cle: 'captures gagnées', valeur: bilan.gagnees },
        { cle: 'journal', valeur: bilan.journalisees }
      ],
      note: bilan.gagnees === 0
        ? 'Rien de neuf : tout ce que porte ce fichier était déjà là. Un import '
          + 'se rejoue sans risque, c\'est fait pour.'
        : 'Ton aventure ouverte se recharge pour afficher ce qui vient d\'arriver.',
      libelleAction: 'Parfait'
    });

    // On recharge depuis le serveur plutôt que de recoller les morceaux ici :
    // la fusion a eu lieu là-bas, et deviner son résultat de ce côté serait le
    // meilleur moyen d'afficher un total qui n'existe nulle part.
    await demarrerProfils();
    if (typeof chargerProfil === 'function') await chargerProfil();
  } catch (e) {
    if (String(e) === 'SESSION_INVALIDE') { await perdreSession(); return; }
    importEtat.textContent = '';
    prevenirErreur('L\'import a échoué', String(e));
  } finally {
    importBtn.disabled = false;
    // Le champ se vide : sans ça, réimporter le MÊME fichier ne déclenche pas
    // de « change » et le bouton paraît mort.
    importFichier.value = '';
  }
}

// ---- Les connexions ouvertes ------------------------------------------------

function ligneSession(s) {
  const l = document.createElement('div');
  l.className = 'session' + (s.courante ? ' courante' : '');

  const quand = document.createElement('span');
  quand.className = 'session-quand';
  quand.textContent = 'Ouverte le ' + dateLisible(s.creeLe);

  const jusque = document.createElement('span');
  jusque.className = 'session-jusque';
  jusque.textContent = 'jusqu\'au ' + dateLisible(s.expireLe);

  l.appendChild(quand);
  l.appendChild(jusque);

  if (s.courante) {
    // Celle d'où l'on parle. La fermer déconnecterait — c'est ce que fait le
    // bouton « Se déconnecter », et le proposer deux fois sous deux noms
    // différents ne rendrait service à personne.
    const ici = document.createElement('span');
    ici.className = 'session-ici';
    ici.textContent = 'celle-ci';
    l.appendChild(ici);
  } else {
    const fermer = document.createElement('button');
    fermer.className = 'session-fermer';
    fermer.type = 'button';
    fermer.textContent = 'Fermer';
    fermer.addEventListener('click', function(){ fermerUneSession(s.id); });
    l.appendChild(fermer);
  }
  return l;
}

async function chargerSessions() {
  if (!sessionsListe) return;
  sessionsListe.innerHTML = '<div class="state-msg">Chargement…</div>';
  let r;
  try {
    r = await invoke('sessions');
  } catch (e) {
    if (String(e) === 'SESSION_INVALIDE') { await perdreSession(); return; }
    sessionsListe.innerHTML = '<div class="state-msg">Connexions indisponibles.</div>';
    return;
  }
  const liste = r.sessions || [];
  sessionsListe.innerHTML = '';
  liste.forEach(function(s){ sessionsListe.appendChild(ligneSession(s)); });

  const autres = liste.filter(function(s){ return !s.courante; }).length;
  sessionsAutres.style.display = autres ? '' : 'none';
  sessionsAutres.textContent = autres > 1
    ? 'Fermer les ' + autres + ' autres'
    : 'Fermer l\'autre';
}

async function fermerUneSession(id) {
  try {
    await invoke('fermer_session', { id: id });
    await chargerSessions();
  } catch (e) {
    if (String(e) === 'SESSION_INVALIDE') { await perdreSession(); return; }
    prevenirErreur('Impossible de fermer cette connexion', String(e));
  }
}

async function fermerLesAutresSessions() {
  const veut = await demanderConfirmation({
    eyebrow: 'Connexions',
    titre: 'Fermer toutes les autres ?',
    note: 'Les autres appareils devront se reconnecter avec Discord. Celle-ci '
        + 'n\'est pas touchée — tu restes connecté ici.',
    libelleAction: 'Fermer les autres'
  });
  if (!veut) return;
  try {
    await invoke('fermer_les_autres');
    await chargerSessions();
  } catch (e) {
    if (String(e) === 'SESSION_INVALIDE') { await perdreSession(); return; }
    prevenirErreur('Impossible de fermer les connexions', String(e));
  }
}

// ---- Administration ---------------------------------------------------------
//
// Le bloc n'apparaît que pour l'administrateur, et ce n'est PAS l'application
// qui en décide : elle demande, et l'API répond 404 à tout le monde sauf lui.
// Un contrôle côté application ne protégerait rien — le code est distribué, et
// qui veut voir le bloc n'a qu'à le dévoiler dans l'inspecteur. Ce qui compte
// est que la route refuse, et elle refuse.

async function verifierAdmin() {
  if (!adminBloc) return;
  try {
    // Une demande volontairement vide : l'API vérifie d'abord qui parle. Un
    // administrateur reçoit une erreur de saisie — donc il l'est ; les autres
    // reçoivent « Route inconnue ».
    await invoke('renommer_dresseur', { pseudo: '', nouveau: '' });
    devoilerAdmin();
  } catch (e) {
    const message = String(e);
    if (message === 'SESSION_INVALIDE') return;
    if (message.indexOf('Route inconnue') !== -1) return;   // pas administrateur
    devoilerAdmin();
  }
}

function devoilerAdmin() {
  adminTitre.hidden = false;
  adminBloc.hidden = false;
}

async function renommerQuelquun() {
  const pseudo = (adminPseudo.value || '').trim();
  const nouveau = (adminNouveau.value || '').trim();
  if (!pseudo || !nouveau) {
    adminEtat.textContent = 'Les deux pseudos sont nécessaires.';
    return;
  }
  const veut = await demanderConfirmation({
    eyebrow: 'Administration',
    titre: 'Renommer « ' + pseudo + ' » ?',
    note: 'Il deviendra « ' + nouveau + ' ». La personne le verra au prochain '
        + 'chargement, sans être prévenue autrement.',
    libelleAction: 'Renommer',
    danger: true
  });
  if (!veut) return;

  adminRenommer.disabled = true;
  try {
    const r = await invoke('renommer_dresseur', { pseudo: pseudo, nouveau: nouveau });
    adminEtat.textContent = 'Renommé en « ' + r.pseudo +' ».';
    adminPseudo.value = '';
    adminNouveau.value = '';
  } catch (e) {
    if (String(e) === 'SESSION_INVALIDE') { await perdreSession(); return; }
    adminEtat.textContent = String(e);
  } finally {
    adminRenommer.disabled = false;
  }
}

// ---- Branchements -----------------------------------------------------------

document.addEventListener('DOMContentLoaded', function(){
  if (exportBtn) exportBtn.addEventListener('click', exporterMesDonnees);
  // Le bouton ouvre le champ ; le champ déclenche l'import. Deux gestes pour
  // l'utilisateur, un seul pour lui : cliquer, choisir.
  if (importBtn) importBtn.addEventListener('click', function(){ importFichier.click(); });
  if (importFichier) importFichier.addEventListener('change', function(){
    importerUnFichier(importFichier.files && importFichier.files[0]);
  });
  if (sessionsAutres) sessionsAutres.addEventListener('click', fermerLesAutresSessions);
  if (adminRenommer) adminRenommer.addEventListener('click', renommerQuelquun);
  if (visibleDresseurs) visibleDresseurs.addEventListener('change', basculerVisibilite);
  if (echangesOuverts) echangesOuverts.addEventListener('change', basculerEchangesOuverts);
  if (messagesDe) messagesDe.addEventListener('change', changerQuiPeutEcrire);
});

/** Appelé par chargerProfil() : la page vient de s'ouvrir. */
function chargerDonneesPerso() {
  chargerSessions();
  verifierAdmin();
  if (typeof dresseurCourant !== 'undefined') poserVisibilite(dresseurCourant);
  if (typeof dresseurCourant !== 'undefined') poserEchangesOuverts(dresseurCourant);
  if (typeof dresseurCourant !== 'undefined') poserMessagesDe(dresseurCourant);
}

// ---- Ma presence dans la liste des dresseurs --------------------------------
//
// L'etat vient du serveur, jamais de localStorage : c'est une donnee de compte,
// pas une preference d'appareil. Se retirer sur une machine doit valoir partout.

async function basculerVisibilite() {
  if (!visibleDresseurs) return;
  const veut = visibleDresseurs.checked;
  visibleDresseurs.disabled = true;
  visibleEtat.textContent = '';
  try {
    const r = await invoke('changer_visibilite', { visible: veut });
    visibleDresseurs.checked = r.visible;
    visibleEtat.textContent = r.visible
      ? 'Tu apparais dans le classement.'
      : 'Tu n\u2019apparais plus ni dans le classement, ni dans la recherche.';
    // Le classement affiche pour la session en cours doit suivre, sinon on s'y
    // voit encore apres s'en etre retire.
    if (typeof chargerDresseurs === 'function' && currentPage === 'dresseurs') chargerDresseurs();
  } catch (e) {
    if (String(e) === 'SESSION_INVALIDE') { await perdreSession(); return; }
    // Remettre la case ou elle etait : une case qui a bouge alors que rien n'a
    // change ment sur l'etat du compte.
    visibleDresseurs.checked = !veut;
    visibleEtat.textContent = String(e);
  } finally {
    visibleDresseurs.disabled = false;
  }
}

/** Coche la case d'apres ce que le serveur dit du compte. */
function poserVisibilite(dresseur) {
  if (!visibleDresseurs || !dresseur) return;
  // Absent d'une ancienne API : on suppose visible, ce qui est le defaut.
  visibleDresseurs.checked = dresseur.visible !== false;
}

// ---- Ma porte aux propositions d'echange ------------------------------------
//
// Meme dessin que la visibilite, et pour la meme raison : c'est une donnee de
// COMPTE et non une preference d'appareil. Fermer sa porte depuis le portable
// doit la fermer aussi sur la machine du salon — sans quoi le reglage ne veut
// rien dire, puisque les propositions arrivent au compte.

async function basculerEchangesOuverts() {
  if (!echangesOuverts) return;
  const veut = echangesOuverts.checked;
  echangesOuverts.disabled = true;
  echangesOuvertsEtat.textContent = '';
  try {
    const r = await invoke('changer_echanges_ouverts', { ouverts: veut });
    echangesOuverts.checked = r.echangesOuverts;
    echangesOuvertsEtat.textContent = r.echangesOuverts
      ? 'On peut te proposer des échanges.'
      : 'Personne ne peut plus t’en proposer. Ce qui est en cours continue.';
    if (typeof dresseurCourant !== 'undefined' && dresseurCourant) {
      dresseurCourant.echangesOuverts = r.echangesOuverts;
    }
  } catch (e) {
    if (String(e) === 'SESSION_INVALIDE') { await perdreSession(); return; }
    // Remettre la case ou elle etait : une case qui a bouge alors que rien n'a
    // change au serveur est un mensonge, et le prochain chargement le defera.
    echangesOuverts.checked = !veut;
    echangesOuvertsEtat.textContent = String(e);
  } finally {
    echangesOuverts.disabled = false;
  }
}

// ---- Qui peut m'ecrire ------------------------------------------------------
//
// Trois crans plutot qu'une bascule, parce que le cas du milieu est celui que
// la plupart des gens veulent : joignable par ceux qu'on a choisis, tranquille
// vis-a-vis des autres. Une bascule aurait force a choisir entre tout ouvrir et
// tout fermer, et la plupart auraient tout ferme.

const QUI_PEUT_ECRIRE_DIT = {
  tous: 'Tout le monde peut t’écrire.',
  amis: 'Seuls les dresseurs que tu suis peuvent t’écrire.',
  personne: 'Personne ne peut plus t’écrire. Tes conversations restent lisibles.',
};

async function changerQuiPeutEcrire() {
  if (!messagesDe) return;
  const veut = messagesDe.value;
  const avant = (typeof dresseurCourant !== 'undefined' && dresseurCourant)
    ? (dresseurCourant.messagesDe || 'tous') : 'tous';
  messagesDe.disabled = true;
  messagesDeEtat.textContent = '';
  try {
    const r = await invoke('changer_messages_de', { valeur: veut });
    messagesDe.value = r.messagesDe;
    messagesDeEtat.textContent = QUI_PEUT_ECRIRE_DIT[r.messagesDe] || '';
    if (typeof dresseurCourant !== 'undefined' && dresseurCourant) {
      dresseurCourant.messagesDe = r.messagesDe;
    }
  } catch (e) {
    if (String(e) === 'SESSION_INVALIDE') { await perdreSession(); return; }
    // Remettre le menu ou il etait : un reglage qui a bouge alors que rien n'a
    // change au serveur est un mensonge, et le prochain chargement le defera.
    messagesDe.value = avant;
    messagesDeEtat.textContent = String(e);
  } finally {
    messagesDe.disabled = false;
  }
}

function poserMessagesDe(dresseur) {
  if (!messagesDe || !dresseur) return;
  // Absent d'une ancienne API : on suppose « tous », le defaut de la colonne.
  messagesDe.value = dresseur.messagesDe || 'tous';
}

function poserEchangesOuverts(dresseur) {
  if (!echangesOuverts || !dresseur) return;
  // Absent d'une ancienne API : on suppose ouvert, ce qui est le defaut de la
  // colonne. Supposer ferme couperait les echanges de tout le monde le jour
  // d'une API en retard d'une version.
  echangesOuverts.checked = dresseur.echangesOuverts !== false;
}
