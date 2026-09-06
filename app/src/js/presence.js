// La présence Discord — ce que vos amis voient sous votre nom.
//
// Script classique, chargé APRÈS accueil.js et compte.js : il enveloppe
// showPage() et lit profilCourant, qui n'existent qu'après eux.
//
// Deux lignes, pas plus. Discord n'en affiche pas davantage :
//
//     PokéPension
//     Pokédex de Rouge / Bleu        ← ce qu'on fait
//     Tennosei — Aventure 1          ← qui
//     depuis 42 minutes
//
// CE QUI N'Y VA PAS. Une présence se lit par n'importe qui dans la liste
// d'amis, y compris par des gens qu'on ne connaît pas. Le pseudo et le nom
// d'aventure y sont parce qu'ils sont déjà publics dans l'application. Le reste
// n'y est pas : ni l'avancement chiffré — « 3 / 1025 » n'a pas à s'afficher
// devant tout Discord —, ni rien qui vienne de la session.
//
// Côté Rust, presence.rs se tait si Discord n'est pas ouvert. Ici, on ne
// vérifie donc rien : on annonce, et ce qui doit être ignoré l'est.

// Ce qu'on annonce pour chaque écran. Les libellés sont écrits pour être lus
// par quelqu'un d'autre — « Cherche un dresseur » plutôt que « Dresseurs ».
const PRESENCE_ECRANS = {
  home:         'Sur son tableau de bord',
  jeux:         'Choisit un Pokédex',
  dresseurs:    'Cherche un dresseur',
  chasse:       'À la chasse aux chromatiques',
  strategie:    'Prépare une équipe',
  reproduction: 'Consulte la reproduction',
  profil:       'Sur son profil',
};

// Deux mises à jour à quelques millisecondes d'écart ne servent à rien, et
// showPage() est appelée en rafale au démarrage. On laisse retomber.
let presenceMinuteur = null;
const PRESENCE_DELAI = 400;

// ---- Le réglage ------------------------------------------------------------
//
// DANS localStorage, ET NON SUR LE COMPTE. C'est l'inverse du choix fait pour
// « Apparaître dans la liste des dresseurs », et pour une raison précise : cette
// visibilité-là est une donnée de compte, se retirer sur une machine doit valoir
// partout. La présence Discord, elle, dépend de la machine où Discord tourne.
// Quelqu'un peut vouloir l'afficher chez lui et pas au travail, et un réglage
// de compte lui refuserait ce choix.
//
// Même convention que le volume du cri : une clé, une valeur, et le stockage
// refusé n'est jamais fatal.
const PRESENCE_CLE = 'pokearchive-presence-discord';

// Trois états, et le troisième est le plus utile des trois.
//
// « oui »      l'écran, le pseudo et l'aventure — ce qui existait
// « discrete » l'écran seulement
// « non »      rien du tout
//
// POURQUOI UN ENTRE-DEUX. Ce fichier note lui-même qu'une présence se lit par
// n'importe qui dans la liste d'amis, y compris par des gens qu'on ne connaît
// pas. Or les deux lignes ne racontent pas la même chose : « Pokédex de
// Rouge / Bleu » dit ce qu'on FAIT, « Tennosei — Aventure 1 » dit QUI on est.
// Seule la seconde identifie. Couper le tout pour se protéger de la seconde
// revenait à sacrifier la première sans raison.
const PRESENCE_MODES = ['oui', 'discrete', 'non'];

/**
 * Le mode retenu. ÉTEINT tant que personne n'a dit le contraire.
 *
 * LE DÉFAUT A CHANGÉ DE CAMP, et le raisonnement s'est retourné avec lui. Il
 * valait « oui », et le commentaire d'alors disait qu'une valeur abîmée devait
 * retomber sur le défaut plutôt que sur « non », parce que couper la présence
 * de quelqu'un sans qu'il l'ait demandée était le pire des deux maux.
 *
 * C'est l'inverse. Une présence Discord se lit par TOUTE la liste d'amis, y
 * compris par des gens qu'on ne connaît pas : l'annoncer à quelqu'un qui n'a
 * jamais rien demandé est plus grave que de la taire à quelqu'un qui la
 * voulait — le second s'en aperçoit et rallume, le premier ne saura jamais
 * qu'il a été diffusé. Tout ce qui n'est pas un choix explicite vaut donc
 * « non ».
 *
 * Qui a déjà choisi garde son choix : sa valeur est écrite, et elle est lue
 * ici. Seuls ceux qui n'ont jamais ouvert le réglage basculent — et pour
 * eux, précisément, il n'y avait pas de choix à respecter.
 */
function presenceMode(){
  let v = null;
  try{ v = localStorage.getItem(PRESENCE_CLE); }
  catch(e){ /* stockage refusé : on garde le défaut, qui ne montre rien */ }
  return PRESENCE_MODES.indexOf(v) > -1 ? v : 'non';
}

/** Vrai dès qu'on annonce quelque chose, discrètement ou non. */
function presenceActive(){ return presenceMode() !== 'non'; }

/** Ce qu'on fait, en une ligne. */
function presenceQuoi(){
  if(typeof currentPage === 'undefined') return 'Ouvre PokéPension';

  if(currentPage === 'dex' || currentPage === 'home'){
    // Sur un Pokédex de jeu, c'est le jeu qui compte. Sur celui d'ensemble,
    // dire « Pokémon HOME » serait obscur pour qui ne connaît pas.
    const jeu = (typeof gameByKey !== 'undefined') && gameByKey[currentTab];
    if(jeu) return 'Pokédex de ' + (jeu.title || jeu.tab || currentTab);
    if(currentPage === 'home') return PRESENCE_ECRANS.home;
    return 'Sa collection complète';
  }
  return PRESENCE_ECRANS[currentPage] || 'Sur PokéPension';
}

/** Qui, en une ligne. */
function presenceQui(){
  const pseudo = (typeof dresseurCourant !== 'undefined' && dresseurCourant)
    ? dresseurCourant.pseudo : null;
  const aventure = (typeof profilCourant !== 'undefined' && profilCourant)
    ? profilCourant.nom : null;

  if(pseudo && aventure) return pseudo + ' — ' + aventure;
  if(pseudo) return pseudo;
  // Pas encore connecté : on ne laisse pas la ligne vide, Discord afficherait
  // un trou sous le titre.
  return 'Pas encore connecté';
}

/** Annonce l'état courant. Sans effet si Discord n'écoute pas, ou si on l'a coupée. */
function presenceMaj(){
  const invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
  if(!invoke) return;                       // banc d'essai, ou page de génération
  if(!presenceActive()) return;
  // Vide en mode discret, et le Rust omet alors la ligne au lieu de l'annoncer
  // creuse — Discord laisserait un trou sous le titre.
  const qui = presenceMode() === 'discrete' ? '' : presenceQui();
  invoke('presence_maj', { etat: { quoi: presenceQuoi(), qui: qui } })
    .catch(function(){ /* une décoration ne remonte pas d'erreur */ });
}

/** Groupe les appels rapprochés : un seul message part. */
function presencePlusTard(){
  if(presenceMinuteur) clearTimeout(presenceMinuteur);
  presenceMinuteur = setTimeout(presenceMaj, PRESENCE_DELAI);
}

/** Efface la présence — à la déconnexion. */
function presenceEffacer(){
  const invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
  if(!invoke) return;
  invoke('presence_effacer').catch(function(){});
}

/**
 * Appliquer le choix, tout de suite.
 *
 * COUPER DOIT EFFACER, et non simplement cesser d'annoncer. Sans cet effacement,
 * la dernière présence envoyée resterait affichée sous le nom du joueur pour
 * toute sa liste d'amis, jusqu'à ce qu'il ferme l'application. C'est exactement
 * le défaut qu'avait la déconnexion : le pseudo et l'aventure survivaient au
 * départ, et personne ne s'en apercevait de son côté de l'écran.
 */
function presenceAppliquer(precedent){
  if(!presenceActive()){ presenceEffacer(); return; }

  // EFFACER SEULEMENT SI L'ON VIENT DE CHANGER DE MODE. Discord garde les
  // champs qu'on ne renvoie pas : en passant d'« activée » à « discrète », la
  // seconde ligne — le pseudo et l'aventure — resterait affichée alors qu'on
  // vient justement de demander qu'elle ne le soit plus.
  //
  // Au démarrage, en revanche, il n'y a rien à effacer, et le faire coûtait
  // deux allers-retours de plus à chaque ouverture. Le banc l'a vu : la
  // suppression d'une aventure passait de sept appels à dix.
  if(precedent && precedent !== presenceMode()) presenceEffacer();
  presencePlusTard();
}

// On enveloppe showPage plutôt que d'ajouter un appel à chacune de ses sorties :
// elle en compte trois, et une quatrième ajoutée un jour oublierait la
// présence sans que rien ne le signale. Le procédé est déjà celui de compte.js,
// qui remplace les fonctions parlant au serveur local.
document.addEventListener('DOMContentLoaded', function(){
  if(typeof showPage === 'function'){
    const original = showPage;
    window.showPage = function(){
      const r = original.apply(this, arguments);
      presencePlusTard();
      return r;
    };
  }
  const choix = document.getElementById('presenceMode');
  const etat = document.getElementById('presenceEtat');
  if(choix){
    choix.value = presenceMode();
    const dire = function(){
      if(!etat) return;
      const m = presenceMode();
      etat.textContent =
        m === 'non' ? 'Discord n’affiche plus rien sous ton nom.'
      : m === 'discrete' ? 'Tes amis Discord voient l’écran que tu consultes, '
                         + 'mais ni ton pseudo ni le nom de ton aventure.'
      : 'Tes amis Discord voient l’écran que tu consultes, ton pseudo et ton aventure.';
    };
    dire();
    choix.addEventListener('change', function(){
      const avant = presenceMode();
      const veut = PRESENCE_MODES.indexOf(choix.value) > -1 ? choix.value : 'non';
      try{ localStorage.setItem(PRESENCE_CLE, veut); }
      catch(e){ /* stockage refusé : le choix ne tiendra pas au redémarrage */ }
      dire();
      presenceAppliquer(avant);
    });
    if(typeof syncSelects === 'function') syncSelects();
  }
  presenceAppliquer();
});
