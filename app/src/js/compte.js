// Identité Discord et sauvegarde en ligne.
// Script classique (pas de module ES), chargé APRÈS serveur.js et AVANT app.js :
// il écrase les fonctions qui parlaient au serveur local.
//
// Le reste de l'application ne voit aucune différence : elle appelle toujours
// readServerSave / writeServerSave, qui passent désormais par des commandes
// Rust, lesquelles interrogent l'API. Le jeton de session ne descend jamais
// jusqu'à cette page — une page web n'a aucun besoin de manipuler un secret.

const invoke = window.__TAURI__?.core?.invoke;
if (!invoke) {
  document.body.innerHTML =
    '<p style="padding:40px;text-align:center;color:#e4665a">'
    + 'Le pont Tauri est absent : vérifie « withGlobalTauri » dans tauri.conf.json.</p>';
  throw new Error('window.__TAURI__ indisponible');
}

let dresseurCourant = null;

// ---- Sans compte, on regarde -----------------------------------------------
//
// L'APPLICATION SE LIT SANS COMPTE ET NE S'ECRIT PAS. Parcourir le Pokedex,
// ouvrir une fiche, lire les cadeaux mysteres ou le catalogue des verrous : un
// almanach n'a besoin de personne. Cocher une capture, creer une aventure,
// proposer un echange : ces gestes-la appartiennent a quelqu'un.
//
// LE REFUS EXISTAIT DEJA, MAIS MUET. `queueSave()` renonce a ecrire quand il n'y
// a pas de pseudo ; l'interface, elle, acceptait le clic. La case se cochait, la
// barre de progression avancait, et tout disparaissait au rechargement. C'est
// le pire des deux mondes : on croit avoir enregistre.
//
// POURQUOI PAS `dresseurCourant` ? Parce qu'il ne dit pas « connecte », il dit
// « l'API a repondu ». Au demarrage sans reseau, la session stockee est bonne,
// `moi` echoue quand meme, et dresseurCourant reste nul : s'y fier verrouillerait
// un joueur legitime hors ligne — or c'est precisement le cas que l'application
// sait traiter, `playerName` etant relu du stockage local et `queueSave` y
// ecrivant. On garde donc a part la seule question qui ne demande pas le reseau :
// « ai-je un jeton ? », que le Rust tranche avec `session.is_some()`.
let sessionOuverte = false;

/**
 * Ce geste demande-t-il un compte, et l'a-t-on ?
 *
 * Rend true si l'on peut continuer. Sinon ouvre la connexion en DISANT CE QU'ON
 * VOULAIT FAIRE — « Connecte-toi pour cocher une capture » se comprend, une
 * fenetre de connexion surgie sans raison, non.
 */
function exigeCompte(geste){
  if(sessionOuverte) return true;
  ouvrirAuthModal('Connecte-toi pour ' + (geste || 'enregistrer quoi que ce soit') + '.');
  return false;
}

// MODES_DEX et infoMode vivent dans donnees.js : la grille en a besoin, et
// compte.js n'est pas chargé par les pages de génération.

/**
 * Supprimer une aventure : la même demande, d'où qu'on la déclenche.
 *
 * Le serveur refuse de supprimer la dernière — il rend un 409. Autant le dire
 * avant plutôt qu'après : la modale des aventures n'avait pas ce garde-fou et
 * menait toute la cérémonie, nom à recopier compris, pour finir sur un refus.
 */
async function confirmerSuppression(p){
  if(profilsConnus.length <= 1){
    await prevenirErreur('C\'est ta seule aventure',
      'Il en faut au moins une pour enregistrer ta progression. Renomme-la ou '
      + 'réinitialise-la plutôt que de la supprimer.');
    return false;
  }
  return demanderConfirmation({
    eyebrow: 'Suppression définitive',
    titre: 'Supprimer « ' + p.nom + ' » ?',
    danger: true,
    resume: [
      { cle: 'capturés', valeur: p.captures || 0 },
      { cle: 'en chromatique', valeur: p.shiny || 0 },
      { cle: infoMode(p.mode).court, valeur: infoMode(p.mode).icone }
    ],
    pertes: [
      'Son Pokédex, tous jeux confondus',
      'Son journal de captures',
      'Ses chasses chromatiques en cours'
    ],
    note: ((p.captures || 0) + (p.shiny || 0))
      ? 'Rien de tout cela ne peut être récupéré, ni par toi ni par nous.'
      : 'Cette aventure est vide : il n\'y a rien à perdre, mais la suppression '
        + 'reste définitive.',
    // Recopier le nom : le seul garde-fou qui résiste à un clic distrait.
    motAEcrire: p.nom,
    libelleAction: 'Supprimer définitivement'
  });
}

/**
 * Vider une aventure : la même demande, d'où qu'on la déclenche.
 *
 * Elle efface un Pokédex entier sans rien supprimer d'autre — le journal et
 * l'aventure survivent. C'est la seule différence avec la suppression, et elle
 * mérite d'être dite plutôt que devinée.
 */
function confirmerVidage(p){
  const total = (p.captures || 0) + (p.shiny || 0);
  return demanderConfirmation({
    eyebrow: 'Réinitialisation',
    titre: 'Vider le Pokédex de « ' + p.nom + ' » ?',
    danger: true,
    resume: [
      { cle: 'capturés', valeur: p.captures || 0 },
      { cle: 'en chromatique', valeur: p.shiny || 0 },
      { cle: infoMode(p.mode).court, valeur: infoMode(p.mode).icone }
    ],
    pertes: ['Toutes les cases cochées, tous jeux confondus'],
    note: total
      ? 'Le journal des captures et l\'aventure elle-même sont conservés ; tes '
        + 'autres aventures ne sont pas touchées. Les cases, elles, ne reviennent pas.'
      : 'Ce Pokédex est déjà vide : l\'opération ne changera rien.',
    // Même magnitude qu'une suppression : un dex entier part.
    motAEcrire: total ? p.nom : null,
    libelleAction: 'Vider le Pokédex'
  });
}

/**
 * Le nettoyage du serveur pour un nom d'aventure (nettoyerNomProfil, dans
 * api/src/comptes.js), recopié à la lettre.
 *
 * Même raison que pour le pseudo : le serveur nettoie avant de valider, donc
 * valider la saisie brute refuserait des noms qu'il accepte — et acceptait
 * jusqu'ici un nom d'une seule lettre, que lui refuse.
 */
function nettoyerNomProfilClient(brut){
  const sansInterdits = String(brut || '').normalize('NFC')
    .replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, ' ');
  return [...sansInterdits].slice(0, 40).join('').replace(/^[-_ ]+|[-_ ]+$/gu, '');
}

/** La règle d'un nom d'aventure. Rend un message, ou null si tout va bien. */
function validerNomProfil(v){
  const n = nettoyerNomProfilClient(v);
  const taille = [...n].length;
  if(taille < 2) return 'Deux caractères au minimum, une fois nettoyé.';
  if(!/^[\p{L}\p{N}](?:[\p{L}\p{N} _-]*[\p{L}\p{N}])?$/u.test(n)){
    return 'Lettres, chiffres, espace, tiret et souligné seulement.';
  }
  return null;
}

/** Ce que le nom deviendra, quand le nettoyage change quelque chose. */
function apercuNomProfil(v){
  const n = nettoyerNomProfilClient(v);
  return (n && n !== v.trim()) ? 'Sera enregistré sous « ' + n + ' »' : '';
}

/**
 * Renommer une aventure : la même demande, d'où qu'on la déclenche.
 *
 * Rend le nouveau nom, ou null si l'on renonce ou si rien n'a changé — les
 * deux appelants n'ont alors rien à faire.
 */
async function demanderNouveauNom(p){
  const propose = await demanderSaisie({
    eyebrow: 'Renommer',
    titre: 'Nouveau nom pour « ' + p.nom + ' »',
    libelleChamp: 'De deux à quarante caractères : lettres, chiffres, espace, tiret, souligné',
    valeur: p.nom,
    maxlength: 40,
    note: 'Le nom ne sert qu\'à t\'y retrouver : le Pokédex, le journal et le '
      + 'mode de l\'aventure ne bougent pas.',
    valider: validerNomProfil,
    apercu: apercuNomProfil,
    libelleAction: 'Renommer'
  });
  if(propose === null || propose === p.nom) return null;
  return propose;
}

/**
 * Enregistre le niveau de formes sur l'aventure ouverte.
 *
 * Silencieux à dessein : c'est un réglage d'affichage, pas une action. Le faire
 * échouer bruyamment interromprait quelqu'un qui ne fait que regarder sa
 * collection autrement. Il repartira au prochain changement.
 */
async function enregistrerNiveauProfil(niveau){
  if(!profilCourant) return;
  if(profilCourant.niveau_formes === niveau) return;
  profilCourant.niveau_formes = niveau;
  try{
    await invoke('modifier_profil', { id: profilCourant.id, niveauFormes: niveau });
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    console.error('Niveau de formes non enregistré :', e);
  }
}

// La pastille qui dit ce que compte une aventure. Elle suit son nom partout :
// sans elle, deux totaux côte à côte laissent croire à une comparaison qui
// n'en est pas une.
function pastilleMode(cle){
  const m = infoMode(cle);
  const el = document.createElement('span');
  el.className = 'mode-pastille mode-' + (MODES_DEX[cle] ? cle : 'capture');
  el.textContent = m.icone + ' ' + m.court;
  el.title = m.titre + ' — ' + m.aide;
  return el;
}

// ---- La couture avec le reste de l'application ------------------------------
// Ces quatre fonctions existent dans serveur.js ; on les remplace.

detectServer = async function(){ return true; };


// Rien à maintenir en vie : la fenêtre fait foi.
startHeartbeat = function(){};

// ---- Les aventures ---------------------------------------------------------
// Un compte Discord, plusieurs profils, un dex chacun. Le profil courant
// accompagne chaque lecture et chaque ecriture ; sans lui, l'API repond sur
// l'aventure par defaut du dresseur.
let profilCourant = null;      // { id, nom, public, par_defaut, captures, shiny }
let profilsConnus = [];

readServerProfiles = async function(){
  if(!dresseurCourant) return [];
  try{
    const r = await invoke('profils');
    profilsConnus = r.profils || [];
    return profilsConnus;
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return []; }
    console.error('Lecture des aventures :', e);
    return [];
  }
};

readServerSave = async function(){
  if(!dresseurCourant) return null;
  try{
    return await invoke('lire_dex', { profil: profilCourant ? profilCourant.id : null });
  }catch(e){
    // « Aucun dex en ligne » est le cas normal d'une aventure toute neuve.
    if(String(e).indexOf('Aucun dex') === -1) console.error('Lecture du dex :', e);
    return null;
  }
};

writeServerSave = async function(){
  if(!dresseurCourant) return;
  try{
    const etat = await invoke('ecrire_dex', {
      donnees: construireDex(),
      profil: profilCourant ? profilCourant.id : null
    });
    // L'API renvoie le profil retenu : au premier enregistrement d'un compte
    // neuf, c'est ainsi qu'on apprend sur quelle aventure on travaille.
    if(etat.profilId && (!profilCourant || profilCourant.id !== etat.profilId)){
      profilCourant = profilsConnus.find(function(p){ return p.id === etat.profilId; })
        || { id: etat.profilId, nom: 'Aventure' };
    }
    if(profilCourant){ profilCourant.captures = etat.captures; profilCourant.shiny = etat.shiny; }
    majBoutonProfil();
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    // La progression reste en mémoire et dans le stockage local : une panne
    // réseau ne doit pas faire perdre une case cochée. La prochaine écriture
    // rattrapera.
  }
};

/**
 * Ce qui part vers l'API. On garde le format historique (« caught » / « shiny »
 * en noms PokeAPI) : ce sont des identifiants stables, et c'est ce qui rendra
 * possible la comparaison entre deux dresseurs.
 */
function construireDex(){
  const charge = buildSavePayload();
  return {
    version: 1,
    player: charge.player,
    exportedAt: charge.exportedAt,
    dex: charge.dex,
    captures: charge.caught,
    shiny: charge.shiny,
    // LES CHASSES NE PARTAIENT PAS. buildSavePayload() les écrivait depuis le
    // début, progressFromJSON() savait les relire, et cette fonction — la
    // seule qui parle au serveur — les laissait sur le quai. Elles vivaient
    // donc dans le localStorage de la machine et nulle part ailleurs : changer
    // d'aventure les effaçait, changer d'ordinateur aussi, et le LISEZMOI
    // promettait le contraire depuis le premier jour.
    //
    // Le tableau de chasse et les objectifs suivent le même chemin, pour la
    // même raison : ils appartiennent à l'aventure.
    chasses: charge.chasses,
    chassesFinies: charge.chassesFinies,
    objectifs: charge.objectifs,
    detailsCapture: charge.detailsCapture,
  };
}

// ---- Session ----------------------------------------------------------------
//
// TROIS ÉTATS, ET NON UN BOOLÉEN. C'est le défaut que cette fonction portait,
// et il se voyait au pire moment : juste après une mise à jour.
//
// Elle rendait `false` pour deux situations qui n'ont rien à voir — « il n'y a
// pas de compte » et « il y a un compte mais le serveur n'a pas répondu ». Le
// démarrage traitait les deux pareil : il vidait la progression affichée et
// n'ouvrait aucune aventure. La session était pourtant intacte sur le disque,
// et le jeton bon pour quatre-vingt-dix jours. À l'écran, cela s'appelait
// « la mise à jour m'a déconnecté ».
//
// Et c'est le moment où le serveur a le plus de chances de ne pas répondre :
// l'installeur vient de rendre la main, la machine finit d'écrire, la pile
// réseau se remet en place. Sur un ordinateur modeste, cela dure.
//
// Les trois états portent donc un nom, et app.js décide pour chacun :
//   'connecte'    un dresseur, et le serveur l'a confirmé ;
//   'sans-compte' aucune session : la fenêtre de connexion s'ouvre ;
//   'hors-ligne'  une session valide, un serveur muet. On ne touche à RIEN.
const SESSION_CONNECTE = 'connecte';
const SESSION_SANS_COMPTE = 'sans-compte';
const SESSION_HORS_LIGNE = 'hors-ligne';

async function ouvrirSession(){
  let etat;
  try{ etat = await invoke('etat'); }
  catch(e){ etat = { connecte: false }; }

  sessionOuverte = Boolean(etat.connecte);
  if(!sessionOuverte){
    ouvrirAuthModal();
    marquerSansCompte();
    // ET L'EN-TETE AVEC. Sans cette ligne, « Annuler » laissait une barre sans
    // badge ni bouton : plus aucune porte visible tant qu'on ne relancait pas
    // l'application. C'est aussi ce qui allume l'invitation de l'accueil.
    afficherEtatCompte(false);
    return SESSION_SANS_COMPTE;
  }

  try{
    const data = await invoke('moi');
    appliquerDresseur(data.dresseur);
    return SESSION_CONNECTE;
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){
      await perdreSession();
      return SESSION_SANS_COMPTE;
    }
    // API INJOIGNABLE, ET LA SESSION RESTE. Elle est probablement bonne : le
    // serveur n'a pas dit non, il n'a rien dit du tout. On travaille hors
    // ligne, la synchronisation reprendra d'elle-même.
    return SESSION_HORS_LIGNE;
  }
}

/**
 * Le menu de compte et le bouton de connexion occupent la meme place et
 * s'excluent : connecte, on voit son pseudo ; deconnecte, on voit par ou
 * entrer. Passer par une seule fonction empeche l'etat batard ou les deux
 * sont masques — c'est ce qui arrivait apres « Annuler », et l'interface
 * n'offrait alors plus aucune issue.
 */
function afficherEtatCompte(connecte){
  compteMenu.hidden = !connecte;
  var b = document.getElementById('btnConnexion');
  if (b) b.hidden = connecte;
  majInviteAccueil(connecte);
}

/**
 * L'invitation de l'accueil : se connecter, et prendre l'application.
 *
 * DEUX CHOSES DIFFERENTES DANS UNE SEULE CARTE, et chacune a sa condition.
 * Le bouton Discord ne sert qu'a qui n'est pas connecte. Le telechargement
 * ne sert qu'a qui est dans un navigateur — le proposer DANS l'application
 * serait proposer ce qu'on a deja. `window.PONT_HTTP` est pose par le pont
 * du site et par lui seul : c'est ce qui distingue les deux mondes.
 *
 * Quand il ne reste rien a proposer — connecte, dans l'application — la
 * carte entiere s'efface plutot que de garder un cadre vide.
 */
function majInviteAccueil(connecte){
  var bloc = document.getElementById('homeInvite');
  if(!bloc) return;
  var surLeWeb = Boolean(window.PONT_HTTP);
  var co = document.getElementById('homeConnexion');
  var dl = document.getElementById('homeTelecharger');
  if(co) co.hidden = connecte;
  if(dl) dl.hidden = !surLeWeb;

  var mot = document.getElementById('homeInviteMot');
  if(mot) mot.textContent = connecte
    ? 'PokéPension existe aussi en application de bureau : ta collection hors '
      + 'ligne, les notifications, et l’overlay pour ton stream.'
    : 'Ta collection ne tient qu’à ce navigateur, et ne te suivra pas '
      + 'ailleurs. Connecte-toi avec Discord pour la retrouver d’un '
      + 'ordinateur à l’autre, et la comparer à celle de tes amis.';

  bloc.hidden = connecte && !surLeWeb;
}

/**
 * Le texte d'une erreur, sans l'emballage du langage.
 *
 * `String(e)` sur un objet Error rend « Error: Connexion annulee. » : le mot
 * « Error » vient de JavaScript, pas de nous, et il s'affichait tel quel dans
 * la modale de connexion. Le Rust, lui, rejette des chaines nues — les deux
 * passent ici et en ressortent dans la meme langue.
 */
function messageErreur(e){
  var t = (e && e.message) ? e.message : String(e === null || e === undefined ? '' : e);
  return t.replace(/^[A-Za-z]*Error\s*:\s*/, '').trim();
}

function appliquerDresseur(d){
  dresseurCourant = d;
  sessionOuverte = true;
  marquerSansCompte();
  playerName = d.pseudo;         // le reste de l'app s'appuie dessus
  fermerAuthModal();

  playerNameText.textContent = d.pseudo;
  comptePseudo.textContent = d.pseudo;
  const img = document.getElementById('avatar');
  img.src = avatarDiscord(d.discordId, d.avatar);
  img.alt = 'Avatar de ' + d.pseudo;
  afficherEtatCompte(true);

  // La carte de dresseur vit dans ses propres tables, hors de la sauvegarde
  // d'aventure : elle a donc son propre moment pour descendre, et c'est ici —
  // le seul endroit qui sait qu'une session vient de s'ouvrir. Voir parties.js.
  if(typeof partiesSynchroniser === 'function') partiesSynchroniser();

  chargerDresseurs();
}

// ---- Choisir et changer d'aventure -----------------------------------------

// Ouvre l'aventure demandée : sa progression remplace celle affichée.
async function ouvrirProfil(profil){
  profilCourant = profil;
  // Le niveau de formes appartient à l'aventure : on l'applique avant de
  // dessiner quoi que ce soit, sinon la grille s'affiche au niveau du voisin.
  if(typeof appliquerNiveauFormes === 'function'){
    await appliquerNiveauFormes(profil.niveau_formes, false);
  }
  const distant = await readServerSave();
  if(distant) progressFromJSON(distant);
  else resetAllProgress();
  majBoutonProfil();
  updateProgress();
  renderList(true);
  fermerProfilModal();
}

// L'aventure ouverte s'affiche à deux endroits : l'en-tête du menu du compte,
// et le bandeau de l'accueil. Le bouton du bas qui la portait a été retiré avec
// la barre d'actions.
function majBoutonProfil(){
  if(compteAventure){
    // Vide, la ligne se retire : un tiret sous le pseudo n'apprend rien.
    const texte = profilCourant
      ? profilCourant.nom + (profilCourant.public ? '' : ' · privée') : '';
    compteAventure.textContent = texte;
    compteAventure.style.display = texte ? '' : 'none';
  }
  if(typeof majAccueilAventure === 'function') majAccueilAventure();
}

// Au lancement : on charge les aventures et on ouvre celle par défaut. Le
// choix reste offert, mais sans imposer un clic à qui n'en a qu'une.
async function demarrerProfils(){
  const liste = await readServerProfiles();
  if(!liste.length) return;
  const defaut = liste.find(function(p){ return p.par_defaut; }) || liste[0];
  // On ouvre, et on ne demande rien. Marquer une aventure « par défaut » puis
  // faire choisir au lancement annulerait le réglage : le défaut existe
  // justement pour supprimer ce clic. Changer d'aventure reste à un clic, dans
  // le menu du compte, sur l'accueil ou depuis la page Profil.
  //
  // ouvrirProfil charge le dex du serveur : c'est par là que la progression
  // arrive sur une machine où l'on n'a jamais joué.
  await ouvrirProfil(defaut);

  // Un compte tout neuf a droit à deux questions plutôt qu'à dix onglets et
  // un compteur à zéro. depart.js décide lui-même s'il y a lieu — il ne
  // s'ouvre que sur une aventure unique et vide, et une seule fois.
  if(typeof peutEtrePremierLancement === 'function') peutEtrePremierLancement();
}

async function perdreSession(){
  await invoke('deconnexion').catch(function(){});
  // La veille de fond n'a plus rien à surveiller : sans cet arrêt, elle
  // continuait de sonner toutes les deux minutes, échouant en silence jusqu'à
  // la fermeture de la fenêtre.
  if(typeof arreterSondages === 'function') arreterSondages();
  // La présence Discord porte le pseudo et le nom d'aventure : la laisser
  // après une déconnexion, c'est continuer à les afficher à toute une liste
  // d'amis alors qu'on a justement voulu partir.
  if(typeof presenceEffacer === 'function') presenceEffacer();
  dresseurCourant = null;
  sessionOuverte = false;
  marquerSansCompte();
  profilCourant = null;
  profilsConnus = [];
  playerName = '';
  afficherEtatCompte(false);
  fermerCompteMenu();
  ouvrirAuthModal('Ta session a expiré. Reconnecte-toi.');
}

// Discord calcule l'avatar par défaut à partir de l'identifiant.
// Le portrait de qui n'a pas de compte Discord : une Poké Ball, dessinée dans
// l'adresse elle-même. Sans elle, le site allait chercher l'avatar par défaut
// de Discord — une requête vers cdn.discordapp.com pour quelqu'un qui n'a
// jamais touché à Discord, sur une application qui se veut hors ligne.
const AVATAR_LOCAL = 'data:image/svg+xml;utf8,'
  + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
      + '<circle cx="32" cy="32" r="30" fill="#e8e9f0"/>'
      + '<path d="M2 32a30 30 0 0 1 60 0z" fill="#b5211f"/>'
      + '<rect x="2" y="29" width="60" height="6" fill="#1c1e29"/>'
      + '<circle cx="32" cy="32" r="10" fill="#1c1e29"/>'
      + '<circle cx="32" cy="32" r="6" fill="#f6f5f0"/>'
      + '</svg>');

function avatarDiscord(discordId, hash, taille){
  taille = taille || 64;
  // Pas d'identifiant Discord : rien à demander à Discord.
  if(!discordId) return AVATAR_LOCAL;
  if(hash){
    const ext = hash.indexOf('a_') === 0 ? 'gif' : 'png';
    return 'https://cdn.discordapp.com/avatars/' + discordId + '/' + hash + '.' + ext
         + '?size=' + taille;
  }
  let n = 0;
  try{ n = Number((BigInt(discordId) >> 22n) % 6n); }catch(e){ n = 0; }
  return 'https://cdn.discordapp.com/embed/avatars/' + n + '.png';
}

// ---- Modale de connexion ----------------------------------------------------
function ouvrirAuthModal(message){
  // ON REPART D'UNE FEUILLE BLANCHE. Rouvrir la fenêtre pendant qu'une
  // tentative court laissait un bouton grisé marqué « Validation dans ton
  // navigateur… », sans moyen de relancer : la fenêtre paraissait morte.
  authTentative++;
  authErreur.textContent = message || '';
  authErreur.classList.toggle('visible', Boolean(message));
  authErreur.classList.remove('patiente');
  authConnexion.disabled = false;
  authLibelle.textContent = 'Se connecter avec Discord';
  authOverlay.style.display = 'flex';
}

function fermerAuthModal(){ authOverlay.style.display = 'none'; }

/**
 * Pose ou retire `sans-compte` sur <body>.
 *
 * LE REFUS DOIT SE VOIR AVANT LE GESTE, pas apres. Une case qu'on peut cocher
 * et qui refuse ensuite est une promesse rompue ; une case grisee ne promet
 * rien. La feuille de style se charge du reste — c'est elle qui sait a quoi
 * ressemble un bouton qu'on ne peut pas presser, et cela evite de dupliquer
 * ici une liste de selecteurs qui vivrait mal.
 */
function marquerSansCompte(){
  document.body.classList.toggle('sans-compte', !sessionOuverte);
}

/**
 * Le numero de la tentative en cours.
 *
 * POURQUOI UN COMPTEUR. « Annuler » ferme la fenêtre mais n'arrête pas
 * l'écoute : elle vit dans le Rust et attend son retour jusqu'au bout. La
 * promesse abandonnée finissait donc par retomber, dix minutes plus tard, sur
 * une interface qui était passée à autre chose — en écrivant « délai
 * dépassé » par-dessus une session peut-être ouverte entre-temps, ou en
 * connectant quelqu'un qui avait renoncé.
 *
 * Chaque tentative prend un numéro ; celles qui ne portent plus le dernier se
 * taisent en revenant.
 */
let authTentative = 0;

authConnexion.addEventListener('click', async function(){
  const mienne = ++authTentative;
  authConnexion.disabled = true;
  authLibelle.textContent = 'Validation dans ton navigateur…';
  // CE QUI SE PASSE, ET COMBIEN DE TEMPS ON ATTEND. Le bouton se grisait sans
  // un mot : si Discord demandait de se connecter d'abord — mot de passe,
  // double authentification, changement de compte — l'application paraissait
  // figée pendant tout ce temps.
  authErreur.textContent = 'Discord peut te demander de te connecter d’abord : '
    + 'prends le temps qu’il faut, PokéPension attend dix minutes. Reviens ici '
    + 'une fois l’autorisation donnée.';
  authErreur.classList.add('visible', 'patiente');
  try{
    await invoke('connexion');
    if(mienne !== authTentative) return;   // annulée, ou doublée par une autre
    authErreur.classList.remove('patiente');
    const data = await invoke('moi');
    appliquerDresseur(data.dresseur);
    // Le dex du compte fait foi : c'est celui qu'on a laissé en partant du
    // dernier ordinateur.
    const distant = await readServerSave();
    if(distant) progressFromJSON(distant);
    updateProgress();
    renderList(true);
    updateHome();
  }catch(e){
    if(mienne !== authTentative) return;   // on a renoncé : on ne dit rien
    authErreur.classList.remove('patiente');
    authErreur.textContent = messageErreur(e) || 'Connexion impossible.';
    authErreur.classList.add('visible');
    authConnexion.disabled = false;
    authLibelle.textContent = 'Réessayer avec Discord';
  }
});

// Le badge porte le bouton « Quitter » : on intercepte avant qu'il ne remonte
// au badge lui-même.
document.getElementById('quitter').addEventListener('click', async function(e){
  e.stopPropagation();
  // Rien ne se perd ici : le bouton neutre, pas le rouge.
  const ok = await demanderConfirmation({
    eyebrow: 'Ton compte',
    titre: 'Te déconnecter ?',
    note: 'Ta progression reste enregistrée sur ton compte. Tu la retrouveras '
      + 'intacte à la prochaine connexion, sur n\'importe quel ordinateur.',
    libelleAction: 'Se déconnecter'
  });
  if(!ok) return;
  await invoke('deconnexion').catch(function(){});
  if(typeof presenceEffacer === 'function') presenceEffacer();
  dresseurCourant = null;
  sessionOuverte = false;
  marquerSansCompte();
  profilCourant = null;
  profilsConnus = [];
  playerName = '';
  afficherEtatCompte(false);
  fermerCompteMenu();
  resetAllProgress();
  updateProgress();
  renderList(true);
  ouvrirAuthModal();
});

// ---- La page Dresseurs ------------------------------------------------------
// Deux usages dans un seul écran : le classement, et la recherche d'un dresseur
// précis. Chercher remplace la liste ; le bouton « ← Classement » revient.

const dresseurQ = document.getElementById('dresseurQ');
const dresseurRetour = document.getElementById('dresseurRetour');
const dresseurVisite = document.getElementById('dresseurVisite');
const dresseurModeEl = document.getElementById('dresseurMode');

// Ce qu'une aventure compte, et sur quel dénominateur.
//
// Trois cents captures ne veulent pas dire la même chose d'une ligne à
// l'autre : « vu » compte les Pokémon rencontrés, « living » exige un
// exemplaire de chacun en même temps, et le niveau de formes décide combien de
// formes alternatives entrent dans le total. Les classer ensemble sans le dire
// présentait comme une performance ce qui n'est qu'une règle différente.
const MODES_AVENTURE = {
  capture: '',                       // l'ordinaire : rien à signaler
  vu: 'Vus',
  living: 'Living dex',
};

// Le niveau 3 est celui par défaut, et de loin le plus répandu : le nommer sur
// chaque ligne noierait le signal. On ne montre que ce qui s'en écarte.
const NIVEAUX_FORMES = { 1: 'Formes 1', 2: 'Formes 2', 4: 'Formes 4' };

/** Les étiquettes qui disent sur quelle base un score est calculé. */
function basesDuScore(p){
  const out = [];
  const m = MODES_AVENTURE[p.mode];
  if(m) out.push(m);
  const n = NIVEAUX_FORMES[Number(p.niveau_formes)];
  if(n) out.push(n);
  return out;
}

// Une carte par dresseur. Le rang, l'avatar, le nom et l'aventure qui le
// représente, puis une barre qui situe son avancement par rapport au meilleur —
// des chiffres nus ne disent pas si 152 est beaucoup ou peu. Les trois premiers
// portent une couleur de podium ; sa propre ligne est encadrée.
function ligneDresseur(p, rang, maxCaptures){
  const carte = document.createElement('div');
  const moi = dresseurCourant && p.pseudo === dresseurCourant.pseudo;
  carte.className = 'dr-carte'
    + (rang && rang <= 3 ? ' podium podium-' + rang : '')
    + (moi ? ' moi' : '');
  carte.tabIndex = 0;
  carte.title = 'Voir les aventures de ' + p.pseudo;

  const place = document.createElement('span');
  place.className = 'dr-rang';
  // Une recherche n'a pas de classement : y afficher un rang serait un
  // contresens, la liste n'étant plus ordonnée par avancement.
  place.textContent = rang ? (rang <= 3 ? ['🥇', '🥈', '🥉'][rang - 1] : rang) : '·';
  carte.appendChild(place);

  const img = document.createElement('img');
  img.className = 'dr-avatar';
  img.src = avatarDiscord(p.discord_id, p.avatar, 64);
  img.alt = '';
  img.loading = 'lazy';
  carte.appendChild(img);

  const infos = document.createElement('div');
  infos.className = 'dr-infos';

  // Le pseudo Discord au-dessus, comme dans la fiche d'un dresseur — sans avoir
  // à cliquer pour l'obtenir. Il manque tant que la personne ne s'est pas
  // reconnectée depuis que la colonne existe : la ligne se retire alors, elle
  // ne reste pas vide.
  const nom = document.createElement('span');
  nom.className = 'dr-nom';
  nom.textContent = p.pseudo;
  if(moi){
    const marque = document.createElement('em');
    marque.textContent = 'toi';
    nom.appendChild(marque);
  }
  infos.appendChild(nom);

  // Le nom Discord sous le nom choisi : c'est lui qui identifie quand
  // quelqu'un s'est renommé ici. Même taille, mais sans la graisse et en
  // --ink-faint — ce qui distingue les deux sans en rapetisser un.
  // Absent tant que la personne ne s'est pas reconnectée depuis que la
  // colonne existe : la ligne se retire alors, elle ne reste pas vide.
  if(p.discord_nom){
    const discord = document.createElement('span');
    discord.className = 'dr-discord';
    discord.textContent = p.discord_nom;
    infos.appendChild(discord);
  }

  const sous = document.createElement('span');
  sous.className = 'dr-aventure';
  // Le classement retient une aventure par dresseur : la nommer évite de
  // croire qu'il s'agit de tout ce qu'il possède.
  sous.textContent = p.profil || (p.captures === undefined ? 'Dresseur' : 'Aucune aventure publique');
  basesDuScore(p).forEach(function(b){
    const puce = document.createElement('em');
    puce.className = 'dr-base';
    puce.textContent = b;
    sous.appendChild(puce);
  });
  if(p.mode && p.mode !== 'capture'){
    sous.title = 'Cette aventure ne compte pas comme un Pokédex de capture : '
      + 'son score ne se compare pas directement aux autres.';
  }
  infos.appendChild(sous);

  if(p.captures !== undefined && maxCaptures > 0){
    const barre = document.createElement('span');
    barre.className = 'dr-barre';
    const rempli = document.createElement('i');
    rempli.style.width = Math.max(2, (p.captures / maxCaptures) * 100) + '%';
    barre.appendChild(rempli);
    infos.appendChild(barre);
  }
  carte.appendChild(infos);

  if(p.captures !== undefined){
    const scores = document.createElement('div');
    scores.className = 'dr-scores';
    const normal = document.createElement('span');
    normal.className = 'dr-score';
    normal.innerHTML = '<b>' + p.captures + '</b> ⬤';
    normal.title = p.captures + ' espèces distinctes, tous Pokédex confondus';
    const chroma = document.createElement('span');
    chroma.className = 'dr-score chroma';
    chroma.innerHTML = '<b>' + p.shiny + '</b> ✨';
    chroma.title = p.shiny + ' espèces en chromatique';
    scores.appendChild(normal); scores.appendChild(chroma);
    carte.appendChild(scores);
  }

  const fleche = document.createElement('span');
  fleche.className = 'dr-fleche';
  fleche.textContent = '›';
  carte.appendChild(fleche);

  const aller = function(){ visiterDresseur(p.pseudo); };
  carte.addEventListener('click', aller);
  carte.addEventListener('keydown', function(e){ if(e.key === 'Enter') aller(); });
  return carte;
}

/**
 * Le champ et le filtre, montrés ou cachés ensemble.
 *
 * Ils appartiennent au CLASSEMENT. Sur la fiche d'un dresseur ils n'avaient
 * plus de sens : le champ cherchait dans une liste qu'on ne voyait plus, et le
 * filtre — qui recharge le classement — renvoyait dehors celui qui s'en
 * servait en croyant trier les aventures affichées sous ses yeux.
 */
/**
 * L'élément qui SE VOIT, pour un contrôle donné.
 *
 * menus.js remplace chaque <select> par un bouton dessiné et garde le select
 * natif invisible à côté, dans une enveloppe, pour que le reste du code
 * continue de lire sa .value. Masquer le select ne masque donc rien à l'écran :
 * c'est l'enveloppe qu'il faut cacher.
 *
 * C'est ce qui laissait le filtre visible sur la fiche d'un dresseur alors que
 * le champ de recherche, lui, disparaîssait bien — l'un est un <input> nu,
 * l'autre un <select> habillé, et les traiter pareil ne suffisait pas.
 */
function partieVisible(el){
  if(!el) return null;
  return (el.closest && el.closest('.select-wrap')) || el;
}

function montrerOutilsClassement(oui){
  [dresseurQ, dresseurModeEl].forEach(function(el){
    const cible = partieVisible(el);
    if(cible) cible.style.display = oui ? '' : 'none';
  });
}

/** Ce que le champ demande, ou null s'il n'en dit pas assez pour chercher. */
function motCherche(){
  const q = ((dresseurQ && dresseurQ.value) || '').trim();
  return q.length >= 2 ? q : null;
}

async function chargerDresseurs(recherche){
  const liste = document.getElementById('listeDresseurs');
  if(!liste) return;
  // Appel nu — changement d'onglet, rechargement après un import : c'est le
  // champ qui fait foi. Sans cette ligne, revenir sur l'onglet rendait le
  // classement entier sous une recherche toujours écrite dans le champ, et le
  // filtre paraissait « effacer la recherche » alors qu'il ne faisait que la
  // perdre en chemin. Un null explicite reste possible : c'est « ← Classement ».
  if(recherche === undefined) recherche = motCherche();

  dresseurVisite.style.display = 'none';
  liste.style.display = '';
  montrerOutilsClassement(true);
  dresseurRetour.style.display = recherche ? '' : 'none';
  liste.innerHTML = '<div class="state-msg">Chargement…</div>';

  let dresseurs;
  try{
    ({ dresseurs } = await invoke('dresseurs', { recherche: recherche || null }));
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    liste.innerHTML = '<div class="state-msg">Liste indisponible pour le moment.</div>';
    return;
  }

  // Ne comparer que ce qui se compare. Le filtre est facultatif et « Tous »
  // reste le defaut : masquer d'office les autres modes ferait disparaitre des
  // gens de la liste sans qu'ils sachent pourquoi.
  const mode = dresseurModeEl ? dresseurModeEl.value : 'tous';
  const montres = (mode === 'tous') ? dresseurs
    : dresseurs.filter(function(p){ return (p.mode || 'capture') === mode; });

  liste.innerHTML = '';
  if(!dresseurs.length){
    liste.innerHTML = '<div class="state-msg">'
      + (recherche ? 'Aucun dresseur ne porte ce nom.' : 'Personne d\'autre pour l\'instant.')
      + '</div>';
    return;
  }

  if(!montres.length){
    liste.innerHTML = '<div class="state-msg">Personne ne mène ce type d’aventure '
      + 'pour l’instant.</div>';
    return;
  }

  // L'échelle des barres : le meilleur occupe toute la largeur, les autres se
  // situent par rapport à lui. Elle se recalcule sur la liste MONTRÉE, sinon le
  // premier d'un mode minoritaire aurait une barre au tiers sans raison visible.
  const maxCaptures = montres.reduce(function(m, p){
    return Math.max(m, p.captures || 0);
  }, 0);

  montres.forEach(function(p, i){
    liste.appendChild(ligneDresseur(p, recherche ? null : i + 1, maxCaptures));
  });

  // Ce que le filtre met de côté, dit plutôt que taire : sans cette ligne, une
  // liste raccourcie ressemble à une liste complète.
  const caches = dresseurs.length - montres.length;
  if(caches > 0){
    const note = document.createElement('div');
    note.className = 'dr-note';
    note.textContent = caches + (caches > 1 ? ' dresseurs mènent' : ' dresseur mène')
      + ' un autre type d’aventure, et n’apparaissent pas ici.';
    liste.appendChild(note);
  }
}

// ---- Chez un autre dresseur -------------------------------------------------
async function visiterDresseur(pseudo){
  const liste = document.getElementById('listeDresseurs');
  liste.style.display = 'none';
  dresseurVisite.style.display = '';
  dresseurRetour.style.display = '';
  // On ne garde que le retour : voir montrerOutilsClassement.
  montrerOutilsClassement(false);
  dresseurVisite.innerHTML = '<div class="state-msg">Chargement…</div>';

  let chez;
  try{
    chez = await invoke('profils_de', { pseudo: pseudo });
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    dresseurVisite.innerHTML = '<div class="state-msg">Ce dresseur est introuvable.</div>';
    return;
  }

  dresseurVisite.innerHTML = '';
  const entete = document.createElement('div');
  entete.className = 'visite-entete';
  const img = document.createElement('img');
  img.src = avatarDiscord(chez.dresseur.discordId, chez.dresseur.avatar, 128);
  img.alt = '';
  // Trois lignes, de la plus stable à la plus changeante :
  //
  //     Tennôsei      son nom affiché sur Discord, qu'on ne change pas ici
  //     Tenno         le pseudo PokéArchive, qu'on choisit
  //     Aventure 1    l'aventure qui le représente
  //
  // Le premier manque tant que la personne ne s'est pas reconnectée depuis que
  // la colonne existe : la ligne se retire alors plutôt que de rester vide, et
  // l'affichage retombe sur les deux lignes d'avant.
  //
  // « 1 aventure publique » ne figure plus nulle part : la liste juste en
  // dessous les compte déjà, et ce qu'on veut savoir en arrivant est laquelle
  // représente la personne. Les profils arrivent triés par défaut d'abord.
  const titre = document.createElement('div');

  const nom = document.createElement('strong');
  nom.textContent = chez.dresseur.pseudo;
  titre.appendChild(nom);

  if(chez.dresseur.nomDiscord){
    const discord = document.createElement('span');
    discord.className = 'visite-discord';
    discord.textContent = chez.dresseur.nomDiscord;
    discord.title = 'Son nom sur Discord — il ne se change pas depuis PokéArchive';
    titre.appendChild(discord);
  }

  const sous = document.createElement('span');
  const autres = chez.profils.length - 1;
  sous.textContent = chez.profils.length
    ? chez.profils[0].nom + (autres > 0
        ? ' · et ' + autres + ' autre' + (autres > 1 ? 's' : '') : '')
    : 'Aucune aventure publique';
  titre.appendChild(sous);

  // DEPUIS QUAND IL EST LÀ. La colonne existait depuis le premier jour et
  // personne ne la lisait — or c'est la question qu'on se pose en arrivant sur
  // la fiche de quelqu'un, avant même de regarder ses chiffres.
  //
  // La date exacte ET le temps écoulé : « 12 mars 2026 » se compare aux siennes,
  // « il y a 6 mois » se comprend sans compter. Les deux tiennent sur la ligne.
  if(chez.dresseur.creeLe){
    const inscrit = document.createElement('span');
    inscrit.className = 'visite-inscrit';
    const depuis = (typeof depuisQuand === 'function')
      ? depuisQuand(chez.dresseur.creeLe) : '';
    inscrit.textContent = 'Inscrit le ' + jourLisible(chez.dresseur.creeLe)
      + (depuis ? ' · ' + depuis : '');
    titre.appendChild(inscrit);
  }

  entete.appendChild(img); entete.appendChild(titre);

  // Les succès de quelqu'un d'autre, dans la même pop-up que les siens. Ils se
  // déduisent de son dex et de l'agrégat de son journal — tous deux déjà
  // publics, l'un affiché au classement, l'autre résumé pour l'occasion.
  const succes = document.createElement('button');
  succes.type = 'button';
  succes.className = 'toggle-btn';
  succes.textContent = '🏅 Ses succès';
  succes.title = 'Le tableau de chasse de ' + chez.dresseur.pseudo;
  succes.addEventListener('click', function(){
    if(typeof ouvrirSucces === 'function') ouvrirSucces(chez.dresseur.pseudo);
  });
  entete.appendChild(succes);

  // « Ajouter en ami ». Il manquait, et c'était la friction la plus bête de
  // l'application : on arrivait sur la fiche de quelqu'un par la recherche, et
  // il fallait retenir son pseudo pour aller le retaper deux onglets plus loin.
  //
  // Pas sur sa propre fiche : se suivre soi-même est refusé par l'API, et un
  // bouton qui ne peut qu'échouer n'a rien à faire là.
  const cestMoi = typeof dresseurCourant !== 'undefined' && dresseurCourant
                  && dresseurCourant.pseudo === chez.dresseur.pseudo;
  if(typeof basculerAmi === 'function' && !cestMoi){
    entete.appendChild(boutonAmi(chez.dresseur.pseudo));
  }

  // Ses photos. Le bouton ne s'affiche que si photos.js est chargé : les pages
  // de génération n'ont ni pont ni session.
  if(typeof ouvrirMur === 'function'){
    const mur = document.createElement('button');
    mur.type = 'button';
    mur.className = 'toggle-btn';
    mur.textContent = '📷 Ses photos';
    mur.title = 'Les captures qu’il a attachées à ses chasses et à ses défis';
    mur.addEventListener('click', function(){ ouvrirMur(chez.dresseur.pseudo, false); });
    entete.appendChild(mur);
  }

  dresseurVisite.appendChild(entete);

  // SA CARTE, AVANT SES AVENTURES. Ce qu'il aime se lit en trois secondes et
  // dit qui il est ; ses Pokédex demandent qu'on les ouvre. On présente la
  // personne avant sa collection.
  //
  // Le bloc est construit par parties.js — il y tient déjà les vignettes, les
  // noms d'espèce et le vocabulaire des états. Il rend null quand la carte est
  // vide, et rien ne s'affiche alors : un cadre vide sur la fiche de quelqu'un
  // ressemble à une panne.
  if(typeof carteBlocPublic === 'function'){
    const bloc = carteBlocPublic(chez.carte, chez.parties);
    if(bloc) dresseurVisite.appendChild(bloc);
  }

  if(!chez.profils.length){
    const rien = document.createElement('div');
    rien.className = 'state-msg';
    // Ne pas laisser croire à une panne : c'est un choix de sa part.
    rien.textContent = 'Ce dresseur garde ses aventures privées.';
    dresseurVisite.appendChild(rien);
    return;
  }

  chez.profils.forEach(function(p){
    const ligne = document.createElement('div');
    ligne.className = 'visite-profil';

    // La ligne entière ouvre son Pokédex : c'est ce qu'on vient chercher en
    // cliquant sur le nom d'une aventure.
    const ouvrir = document.createElement('button');
    ouvrir.type = 'button';
    ouvrir.className = 'visite-ouvrir';
    // Le nombre vient de la liste des jeux : en le figeant, il devenait faux
    // au premier jeu ajouté.
    ouvrir.title = 'Voir les ' + GAMES.length + ' Pokédex de « ' + p.nom + ' »';

    const nom = document.createElement('div');
    nom.className = 'visite-nom';
    nom.textContent = p.nom + (p.par_defaut ? '  ★' : '');
    nom.appendChild(pastilleMode(p.mode));
    const chiffres = document.createElement('div');
    chiffres.className = 'visite-chiffres';
    chiffres.textContent = '⬤ ' + p.captures + ' · ✨ ' + p.shiny;
    ouvrir.appendChild(nom); ouvrir.appendChild(chiffres);
    ouvrir.addEventListener('click', function(){
      voirPokedexDe(chez.dresseur.pseudo, p);
    });

    const comparer = document.createElement('button');
    comparer.type = 'button';
    comparer.className = 'toggle-btn';
    comparer.textContent = '👥 Comparer';
    comparer.title = 'Confronter cette aventure à la tienne, Pokémon par Pokémon';
    comparer.addEventListener('click', function(){
      comparerAvec(chez.dresseur.pseudo, p);
    });

    const fleche = document.createElement('span');
    fleche.className = 'visite-fleche';
    fleche.textContent = '›';

    ligne.appendChild(ouvrir);
    ligne.appendChild(comparer);
    ligne.appendChild(fleche);
    dresseurVisite.appendChild(ligne);
  });
}

/**
 * Le bouton « ajouter en ami », qui sait déjà où l'on en est.
 *
 * Il se dessine EN ATTENTE puis se corrige, parce que savoir si l'on suit
 * quelqu'un demande un aller-retour. L'alternative — retarder tout l'en-tête
 * jusqu'à la réponse — ferait clignoter la fiche entière pour un seul bouton.
 */
function boutonAmi(pseudo){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'toggle-btn';
  b.textContent = '＋ Ajouter en ami';
  b.disabled = true;

  const peindre = function(suit){
    b.disabled = false;
    b.textContent = suit ? '✓ Tu le suis' : '＋ Ajouter en ami';
    b.classList.toggle('primary', !suit);
    b.title = suit
      ? 'Cliquer pour ne plus suivre ' + pseudo
      : 'Voir ses captures dans ton fil, et pouvoir lui proposer des échanges';
  };

  lesAmisConnus().then(function(connus){
    if(!connus){ b.textContent = '＋ Ajouter en ami'; b.disabled = false; return; }
    peindre(connus.has(pseudo.toLowerCase()));
  });

  b.addEventListener('click', async function(){
    const suit = b.textContent.indexOf('✓') === 0;
    b.disabled = true;
    try{
      await basculerAmi(pseudo, !suit);
      peindre(!suit);
    }catch(e){
      if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
      prevenirErreur('Impossible', String(e));
      b.disabled = false;
    }
  });
  return b;
}

/**
 * Charge le dex d'une aventure publique et bascule la grille en comparaison.
 * partage.js sait déjà afficher deux collections côte à côte : on lui fournit
 * les données, il fait le reste.
 */
async function comparerAvec(pseudo, profil){
  try{
    const autre = await invoke('dex_de', { pseudo: pseudo, profil: profil.id });
    if(!autre || !autre.dex){
      prevenirErreur('Rien à comparer',
        'Cette aventure n\'a encore aucun Pokémon enregistré.');
      return;
    }
    // Le format de partage attend des ensembles par Pokédex : on reprend celui
    // du dex distant tel quel, il a la même forme que le nôtre.
    demarrerComparaison(pseudo + ' · ' + profil.nom, autre.dex,
      (autre.profil && autre.profil.mode) || profil.mode,
      autre.profil && autre.profil.niveau_formes, pseudo,
      function(){ showPage('dresseurs'); visiterDresseur(pseudo); });
    showPage('national');
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    prevenirErreur('Comparaison impossible', String(e));
  }
}

dresseurQ.addEventListener('input', function(){
  // On attend une frappe stable : interroger l'API à chaque lettre serait
  // inutilement bavard.
  clearTimeout(dresseurQ._minuteur);
  dresseurQ._minuteur = setTimeout(chargerDresseurs, 300);
});

dresseurRetour.addEventListener('click', function(){
  dresseurQ.value = '';
  chargerDresseurs(null);
});

if(dresseurModeEl){
  // Le filtre porte sur la liste déjà rapatriée : rien à redemander au serveur,
  // qui renvoie de toute façon les deux cents premiers tous modes confondus.
  dresseurModeEl.addEventListener('change', function(){
    // SUR LA FICHE D'UN DRESSEUR, ON NE BOUGE PAS. Le filtre est caché là-bas,
    // mais un menu habillé garde ses raccourcis clavier : le laisser recharger
    // le classement rejetterait dehors quelqu'un qui croit trier les aventures
    // affichées sous ses yeux. Le choix est retenu, il s'appliquera au retour.
    if(dresseurVisite && dresseurVisite.style.display !== 'none') return;
    // Sans argument : la recherche en cours est conservée. C'est l'autre moitié
    // du correctif — le filtre lisait le champ pour son compte, et une recherche
    // trop courte le faisait retomber sur le classement complet.
    chargerDresseurs();
  });
}

// ---- La modale des aventures -----------------------------------------------
// Elle sert au lancement comme en cours de partie : c'est le même écran, et il
// n'y a donc qu'un seul comportement à comprendre.

const profilOverlay = document.getElementById('profilOverlay');
const profilListe = document.getElementById('profilListe');
const profilErreur = document.getElementById('profilErreur');
const profilNouveauNom = document.getElementById('profilNouveauNom');
const profilNouveauMode = document.getElementById('profilNouveauMode');

function direErreurProfil(texte){
  profilErreur.textContent = texte || '';
  profilErreur.classList.toggle('visible', !!texte);
}

// UN NOM D'ICONE, ET NON UN CARACTERE. Les trois boutons d'une ligne
// d'aventure portaient « 👁 », « 🔒 », « ✎ » : deux emojis rendus par la police
// du systeme, un caractere typographique rendu par celle du texte. Trois tailles,
// trois couleurs, trois alignements — dans trois boutons de meme largeur.
// Voir l'en-tete de icones.js.
function boutonAction(icone, titre, classes, action){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'profil-action ' + (classes || '');
  b.innerHTML = iconeHtml(icone, 15);
  b.title = titre;
  b.setAttribute('aria-label', titre);
  b.addEventListener('click', function(e){ e.stopPropagation(); action(); });
  return b;
}

// Enveloppe commune : une action échouée doit dire pourquoi, pas rester muette.
async function agirSurProfil(promesse){
  direErreurProfil('');
  try{
    // L'action rend parfois la liste qu'elle vient de lire — la suppression a
    // besoin de savoir sur quelle aventure retomber. Dans ce cas, la relire
    // serait un aller-retour pour rien.
    const deja = await promesse;
    if(!Array.isArray(deja)) await readServerProfiles();
    dessinerProfils();
    majBoutonProfil();
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    direErreurProfil(String(e));
  }
}

function dessinerProfils(){
  profilListe.innerHTML = '';
  profilsConnus.forEach(function(p){
    const courante = profilCourant && p.id === profilCourant.id;
    const ligne = document.createElement('div');
    ligne.className = 'profil-ligne' + (courante ? ' courante' : '');

    const ouvrir = document.createElement('button');
    ouvrir.type = 'button';
    ouvrir.className = 'profil-ouvrir';
    ouvrir.title = courante ? 'Aventure déjà ouverte' : 'Ouvrir cette aventure';
    const nom = document.createElement('span');
    nom.className = 'profil-nom';
    nom.textContent = p.nom;
    nom.appendChild(pastilleMode(p.mode));
    if(courante){
      const ici = document.createElement('span');
      ici.className = 'ici';
      ici.textContent = '  — ouverte';
      nom.appendChild(ici);
    }
    const chiffres = document.createElement('span');
    chiffres.className = 'profil-chiffres';
    chiffres.textContent = '⬤ ' + (p.captures || 0) + ' · ✨ ' + (p.shiny || 0)
      + (p.par_defaut ? ' · ouverte au lancement' : '')
      + (p.public ? '' : ' · privée');
    ouvrir.appendChild(nom); ouvrir.appendChild(chiffres);
    ouvrir.addEventListener('click', function(){ if(!courante) ouvrirProfil(p); });
    ligne.appendChild(ouvrir);

    const actions = document.createElement('div');
    actions.className = 'profil-actions';

    actions.appendChild(boutonAction(p.par_defaut ? '★' : '☆',
      p.par_defaut ? 'C\'est l\'aventure ouverte au lancement'
                   : 'Ouvrir celle-ci au lancement',
      p.par_defaut ? 'active' : '',
      function(){
        if(p.par_defaut) return;
        agirSurProfil(invoke('modifier_profil', { id: p.id, parDefaut: true }));
      }));

    actions.appendChild(boutonAction(p.public ? 'oeil' : 'cadenas',
      p.public ? 'Visible par les autres dresseurs — cliquer pour la rendre privée'
               : 'Privée — cliquer pour la partager',
      p.public ? 'active' : '',
      function(){
        agirSurProfil(invoke('modifier_profil', { id: p.id, public: !p.public }));
      }));

    actions.appendChild(boutonAction('crayon', 'Renommer', '', async function(){
      const propose = await demanderNouveauNom(p);
      if(propose === null) return;
      agirSurProfil(invoke('modifier_profil', { id: p.id, nom: propose }));
    }));

    // Asynchrone : la confirmation est une modale de l'application, pas une
    // boîte du système, et elle s'attend.
    actions.appendChild(boutonAction('🗑', 'Supprimer cette aventure', 'danger', async function(){
      if(!await confirmerSuppression(p)) return;
      agirSurProfil((async function(){
        await invoke('supprimer_profil', { id: p.id });
        // On ne reste pas sur une aventure qui n'existe plus.
        if(courante){
          const reste = await readServerProfiles();
          const suivante = reste.find(function(x){ return x.par_defaut; }) || reste[0];
          if(suivante) await ouvrirProfil(suivante);
          return reste;          // déjà à jour : agirSurProfil ne relira pas
        }
      })());
    }));

    ligne.appendChild(actions);
    profilListe.appendChild(ligne);
  });
}

function ouvrirProfilModal(){
  direErreurProfil('');
  profilNouveauNom.value = '';
  dessinerProfils();
  profilOverlay.style.display = 'flex';
}

function fermerProfilModal(){
  profilOverlay.style.display = 'none';
}

async function creerAventure(){
  if(!exigeCompte('créer une aventure')) return;
  const nom = profilNouveauNom.value.trim();
  // La même règle qu'au renommage : sans elle, un nom d'une lettre partait au
  // serveur pour en revenir refusé.
  const souci = validerNomProfil(nom);
  if(souci){ direErreurProfil(souci); profilNouveauNom.focus(); return; }
  direErreurProfil('');
  try{
    const r = await invoke('creer_profil', { nom: nom, mode: profilNouveauMode.value });
    profilNouveauNom.value = '';
    await readServerProfiles();
    // Une aventure qu'on vient de créer, on veut y entrer : elle démarre vide.
    if(r && r.profil) await ouvrirProfil(
      profilsConnus.find(function(p){ return p.id === r.profil.id; }) || r.profil);
    ouvrirProfilModal();
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    direErreurProfil(String(e));
  }
}

document.getElementById('profilCreer').addEventListener('click', creerAventure);
profilNouveauNom.addEventListener('keydown', function(e){
  if(e.key === 'Enter') creerAventure();
});
document.getElementById('profilFermer').addEventListener('click', fermerProfilModal);
profilOverlay.addEventListener('click', function(e){
  if(e.target === profilOverlay) fermerProfilModal();
});

// ---- Le menu du compte -------------------------------------------------------
// Ce qui touche à l'identité et aux données du dresseur se trouve là, sous son
// pseudo. « Quitter » y gagne aussi : collé au nom, c'était une cible de
// quelques pixels qu'on frôlait sans le vouloir.

function ouvrirCompteMenu(){
  comptePanneau.classList.add('ouvert');
  playerBadge.setAttribute('aria-expanded', 'true');
}

function fermerCompteMenu(){
  if(!comptePanneau) return;
  comptePanneau.classList.remove('ouvert');
  playerBadge.setAttribute('aria-expanded', 'false');
}

playerBadge.addEventListener('click', function(e){
  e.stopPropagation();
  if(comptePanneau.classList.contains('ouvert')) fermerCompteMenu();
  else ouvrirCompteMenu();
});

// Un clic ailleurs, ou Échap, referme : un menu qui reste ouvert derrière soi
// finit par masquer ce qu'on regarde.
document.addEventListener('click', function(e){
  if(!e.target.closest('#compteMenu')) fermerCompteMenu();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape') fermerCompteMenu();
});

document.getElementById('menuAventures').addEventListener('click', function(){
  fermerCompteMenu();
  ouvrirProfilModal();
});

document.getElementById('menuDresseurs').addEventListener('click', function(){
  fermerCompteMenu();
  showPage('dresseurs');
});

document.getElementById('menuParametres').addEventListener('click', function(){
  showPage('parametres');
});

// Les commandes qui ont rejoint le menu — lexique, nouveautés, paramètres,
// thème — referment le panneau derrière elles. Le laisser ouvert par-dessus
// l'écran qu'on vient d'appeler cacherait exactement ce qu'on est venu voir.
//
// DEUX EXCEPTIONS, et la même raison pour les deux : leur libellé est le
// résultat. Le bouton de mise à jour porte la progression du téléchargement, et
// celui du thème dit vers quoi le prochain clic bascule — refermer sur eux
// escamoterait la seule réponse qu'ils donnent.
if(comptePanneau){
  comptePanneau.addEventListener('click', function(e){
    const item = e.target.closest ? e.target.closest('.compte-item') : null;
    if(!item || item.id === 'majBtn' || item.id === 'themeBtn') return;
    fermerCompteMenu();
  });
}

// La réinitialisation ne touche QUE l'aventure ouverte : c'est tout l'intérêt
// d'en avoir plusieurs. On le dit dans la confirmation, en nommant l'aventure
// et ce qu'elle contient — un « es-tu sûr ? » n'apprend rien à personne.
document.getElementById('menuReset').addEventListener('click', async function(){
  fermerCompteMenu();
  if(!profilCourant){
    prevenirErreur('Aucune aventure ouverte',
      'Ouvre-en une depuis « Mes aventures » avant de la réinitialiser.');
    return;
  }
  if(!await confirmerVidage(profilCourant)) return;
  resetAllProgress();
  updateProgress();
  renderList(true);
  await writeServerSave();
});

// LES DEUX BOUTONS QUI RAMENENT A LA CONNEXION : celui de l'en-tete et celui
// de l'accueil. Ils ouvrent la MEME modale — une seule facon de se connecter,
// un seul endroit a corriger le jour ou elle change.
//
// Sans message : la modale dit deja ce qu'elle propose, et le seul endroit ou
// elle sait ecrire un mot est la ligne d'erreur. Y poser une invitation la
// ferait lire comme une panne.
['btnConnexion', 'homeConnexion'].forEach(function(id){
  var b = document.getElementById(id);
  if (b) b.addEventListener('click', function(){ ouvrirAuthModal(); });
});

// « Annuler » sur la connexion : sans lui, la modale n'a aucune issue tant que
// Discord n'a pas répondu, et l'application paraît bloquée alors qu'elle
// attend simplement une validation dans le navigateur.
document.getElementById('authAnnuler').addEventListener('click', function(){
  // LA TENTATIVE EN COURS EST ABANDONNEE. L'écoute Rust continue jusqu'à son
  // terme — on ne peut pas l'interrompre d'ici — mais son retour ne touchera
  // plus à rien : le numéro qu'elle porte n'est plus le dernier.
  authTentative++;
  fermerAuthModal();
  authConnexion.disabled = false;
  authErreur.classList.remove('patiente');
  authLibelle.textContent = 'Se connecter avec Discord';
  // Sans compte il n'y a rien à enregistrer : on le dit dans le bandeau plutôt
  // que de laisser croire à une application prête à l'emploi.
});

// ---- Choisir avec qui se comparer -------------------------------------------
// « Comparer » demandait de coller un code envoyé par un ami — un héritage de
// l'époque sans comptes. Puisque tous les dresseurs sont dans la même base, on
// les propose directement.

const comparerOverlay = document.getElementById('comparerOverlay');
const comparerListe = document.getElementById('comparerListe');
const comparerErreur = document.getElementById('comparerErreur');
const comparerQ = document.getElementById('comparerQ');

function direErreurComparer(texte){
  comparerErreur.textContent = texte || '';
  comparerErreur.classList.toggle('visible', !!texte);
}

async function dessinerListeComparer(recherche){
  comparerListe.innerHTML = '<div class="state-msg">Chargement…</div>';
  let dresseurs;
  try{
    ({ dresseurs } = await invoke('dresseurs', { recherche: recherche || null }));
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    comparerListe.innerHTML = '<div class="state-msg">Liste indisponible.</div>';
    return;
  }

  // Se comparer à soi-même n'apprendrait rien.
  const autres = dresseurs.filter(function(p){
    return !dresseurCourant || p.pseudo !== dresseurCourant.pseudo;
  });

  comparerListe.innerHTML = '';
  if(!autres.length){
    comparerListe.innerHTML = '<div class="state-msg">'
      + (recherche ? 'Aucun dresseur ne porte ce nom.' : 'Personne d\'autre pour l\'instant.')
      + '</div>';
    return;
  }

  autres.forEach(function(p){
    const ligne = document.createElement('div');
    ligne.className = 'profil-ligne';

    const choisir = document.createElement('button');
    choisir.type = 'button';
    choisir.className = 'profil-ouvrir comparer-choix';
    choisir.title = 'Comparer avec ' + p.pseudo;

    const img = document.createElement('img');
    img.className = 'comparer-avatar';
    img.src = avatarDiscord(p.discord_id, p.avatar, 64);
    img.alt = '';

    const textes = document.createElement('span');
    const nom = document.createElement('span');
    nom.className = 'profil-nom';
    nom.textContent = p.pseudo;
    const sous = document.createElement('span');
    sous.className = 'profil-chiffres';
    // Le classement ne renvoie que l'aventure principale : c'est elle qu'on
    // comparera, et le dire évite de croire qu'on voit tout son compte.
    sous.textContent = p.profil
      ? p.profil + ' · ⬤ ' + (p.captures || 0) + ' · ✨ ' + (p.shiny || 0)
      : 'Aventure principale';
    textes.appendChild(nom); textes.appendChild(sous);

    choisir.appendChild(img); choisir.appendChild(textes);
    choisir.addEventListener('click', function(){ lancerComparaison(p.pseudo); });
    ligne.appendChild(choisir);
    comparerListe.appendChild(ligne);
  });
}

/**
 * Compare avec l'aventure principale du dresseur choisi.
 *
 * On ne précise pas de profil : l'API répond alors sur l'aventure marquée par
 * défaut, et seulement si elle est publique. C'est exactement la règle voulue —
 * un dresseur qui tient plusieurs aventures est représenté par sa principale.
 */
async function lancerComparaison(pseudo){
  direErreurComparer('');
  try{
    const autre = await invoke('dex_de', { pseudo: pseudo, profil: null });
    if(!autre || !autre.dex){
      direErreurComparer(autre && autre.profil
        ? pseudo + ' n\'a encore rien enregistré dans « ' + autre.profil.nom + ' ».'
        : pseudo + ' n\'a aucune aventure publique.');
      return;
    }
    fermerComparerModal();
    demarrerComparaison(pseudo + (autre.profil ? ' · ' + autre.profil.nom : ''), autre.dex,
      autre.profil ? autre.profil.mode : null,
      autre.profil ? autre.profil.niveau_formes : null, pseudo);
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    direErreurComparer(String(e));
  }
}

function ouvrirComparerModal(){
  direErreurComparer('');
  comparerQ.value = '';
  comparerOverlay.style.display = 'flex';
  dessinerListeComparer(null);
  setTimeout(function(){ comparerQ.focus(); }, 10);
}

function fermerComparerModal(){ comparerOverlay.style.display = 'none'; }

comparerQ.addEventListener('input', function(){
  clearTimeout(comparerQ._minuteur);
  const v = comparerQ.value.trim();
  comparerQ._minuteur = setTimeout(function(){
    dessinerListeComparer(v.length >= 2 ? v : null);
  }, 300);
});

document.getElementById('comparerFermer').addEventListener('click', fermerComparerModal);
comparerOverlay.addEventListener('click', function(e){
  if(e.target === comparerOverlay) fermerComparerModal();
});

// « 👥 Comparer », dans la barre de modes du Pokédex. partage.js ne pose plus
// aucun écouteur dessus depuis la disparition des codes à recopier : on branche
// donc directement. Le remplacement par un clone qui traînait ici laissait la
// référence de noyau.js pointer sur un nœud détaché du document.
importCodeBtn.addEventListener('click', ouvrirComparerModal);

// ---- La page Profil ---------------------------------------------------------
// Tout ce qui touche au compte au même endroit : l'identité, les aventures avec
// leurs réglages, et le journal des captures. La modale des aventures reste
// pour les changements rapides ; ici on prend le temps.

const profilIdentite = document.getElementById('profilIdentite');
const profilAventures = document.getElementById('profilAventures');
const profilPageErreur = document.getElementById('profilPageErreur');
const profilPageNom = document.getElementById('profilPageNom');
const profilPageMode = document.getElementById('profilPageMode');
const journalListe = document.getElementById('journalListe');
const journalQuoi = document.getElementById('journalQuoi');
const journalTotal = document.getElementById('journalTotal');
const journalPlus = document.getElementById('journalPlus');
const journalPortee = document.getElementById('journalPortee');

let journalCurseur = null;   // identifiant de la dernière ligne affichée

// Le journal montre l'aventure ouverte, ou toutes. La page Profil parle de
// « tes captures » sans preciser lesquelles : jusqu'ici c'etait celles de
// l'aventure courante, et rien ne le disait.
let journalToutes = false;

function direErreurPage(texte){
  profilPageErreur.textContent = texte || '';
  profilPageErreur.classList.toggle('visible', !!texte);
}

// Une date ISO en quelque chose de lisible. Les dates de la base sont en UTC
// sans fuseau : on les rend telles quelles plutôt que d'inventer un décalage.
/**
 * Le jour seul : « 12 mars 2026 ».
 *
 * Une date d'inscription n'a que faire d'une heure : personne ne retient qu'il
 * s'est inscrit a 14 h 32, et la minute allonge la ligne sans rien apprendre.
 */
function jourLisible(iso){
  if(!iso) return 'date inconnue';
  const d = new Date(iso);
  if(isNaN(d)) return iso;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// L'heure en plus, pour ce qui vient de se passer — une derniere sauvegarde,
// une session ouverte. Elle s'appuie sur jourLisible : deux facons d'ecrire un
// meme jour auraient fini par ne plus s'ecrire pareil.
function dateLisible(iso){
  const d = new Date(iso);
  if(!iso || isNaN(d)) return jourLisible(iso);
  return jourLisible(iso)
    + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ---- L'identité -------------------------------------------------------------
function dessinerIdentite(){
  profilIdentite.innerHTML = '';
  if(!dresseurCourant){
    profilIdentite.innerHTML = '<div class="state-msg">Connecte-toi pour voir ton profil.</div>';
    return;
  }

  const img = document.createElement('img');
  img.className = 'profil-avatar';
  img.src = avatarDiscord(dresseurCourant.discordId, dresseurCourant.avatar, 128);
  img.alt = '';

  const bloc = document.createElement('div');
  bloc.className = 'profil-identite-texte';

  const nom = document.createElement('div');
  nom.className = 'profil-identite-nom';
  nom.textContent = dresseurCourant.pseudo;
  bloc.appendChild(nom);

  const sous = document.createElement('div');
  sous.className = 'profil-identite-sous';
  // « Compte Discord » était écrit en dur, et c'était faux sur le site : il n'y
  // a là ni Discord ni compte — la collection tient dans le navigateur. Le
  // dresseur porte un identifiant Discord quand il en vient d'un ; sinon, on
  // dit ce qui est.
  const origine = dresseurCourant.discordId ? 'Compte Discord' : 'Carnet local';
  sous.textContent = origine + ' · ' + profilsConnus.length
    + (profilsConnus.length > 1 ? ' aventures' : ' aventure');
  bloc.appendChild(sous);

  const renommer = document.createElement('button');
  renommer.type = 'button';
  renommer.className = 'toggle-btn';
  renommer.textContent = '✎ Changer de pseudo';
  renommer.title = 'Ton pseudo est visible des autres dresseurs. Il est indépendant de celui de Discord.';
  renommer.addEventListener('click', changerMonPseudo);

  profilIdentite.appendChild(img);
  profilIdentite.appendChild(bloc);
  profilIdentite.appendChild(renommer);
}

/**
 * Le nettoyage du serveur, recopie (nettoyerPseudo dans api/src/comptes.js).
 *
 * L'API retire les caractères interdits, resserre les espaces, tronque à vingt
 * caractères, puis rogne les tirets, soulignés et espaces des extrémités — et
 * ce n'est qu'ensuite qu'elle valide. Valider la saisie brute côté client
 * refusait donc des pseudos qu'elle aurait acceptés : « Tennosei_ », qu'elle
 * enregistre sous « Tennosei », restait bloqué sur un message incompréhensible.
 */
function nettoyerPseudoClient(brut){
  const sansInterdits = String(brut || '').normalize('NFC')
    .replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, ' ');
  return [...sansInterdits].slice(0, 20).join('').replace(/^[-_ ]+|[-_ ]+$/gu, '');
}

async function changerMonPseudo(){
  const propose = await demanderSaisie({
    eyebrow: 'Ton identité',
    titre: 'Changer de pseudo',
    libelleChamp: 'Trois à douze caractères : lettres, chiffres, espace, tiret, souligné',
    valeur: dresseurCourant ? dresseurCourant.pseudo : '',
    maxlength: 12,
    note: 'C\'est le nom sous lequel tes amis te trouvent dans le classement et '
      + 'dans la recherche. Ta progression n\'y touche pas.',
    // La règle est vérifiée pendant la frappe : découvrir un refus après avoir
    // validé, c'est refaire la saisie pour rien.
    //
    // Elle recopie celle de l'API (PSEUDO_OK dans comptes.js) à la lettre. Plus
    // stricte, elle refuserait des pseudos que le serveur accepte — à commencer
    // par celui du dresseur, si Discord y a laissé un souligné.
    valider: function(v){
      const n = nettoyerPseudoClient(v);
      const taille = [...n].length;          // en caractères, pas en unités UTF-16
      if(taille < 3) return 'Trois caractères au minimum, une fois nettoyé.';
      if(!/^[\p{L}\p{N}](?:[\p{L}\p{N} _-]*[\p{L}\p{N}])?$/u.test(n)){
        return 'Lettres, chiffres, espace, tiret et souligné seulement.';
      }
      return null;
    },
    // Ce que ça deviendra, quand le nettoyage change quelque chose.
    apercu: function(v){
      const n = nettoyerPseudoClient(v);
      return (n && n !== v.trim()) ? 'Sera enregistré sous « ' + n + ' »' : '';
    },
    libelleAction: 'Changer de pseudo'
  });
  if(propose === null) return;
  direErreurPage('');
  try{
    const r = await invoke('changer_pseudo', { pseudo: propose });
    // Le pseudo vit à trois endroits : l'objet dresseur, l'en-tête, et le nom
    // que la sauvegarde emporte. On les remet d'accord tout de suite.
    dresseurCourant.pseudo = r.pseudo;
    playerName = r.pseudo;
    playerNameText.textContent = r.pseudo;
    comptePseudo.textContent = r.pseudo;
    updatePlayerBadge();
    dessinerIdentite();
    await writeServerSave();
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    direErreurPage(String(e));
  }
}

// ---- Les aventures ----------------------------------------------------------
function dessinerAventures(){
  profilAventures.innerHTML = '';
  if(!profilsConnus.length){
    profilAventures.innerHTML = '<div class="state-msg">Aucune aventure.</div>';
    return;
  }

  profilsConnus.forEach(function(p){
    const courante = profilCourant && p.id === profilCourant.id;
    const carte = document.createElement('div');
    carte.className = 'av-carte' + (courante ? ' courante' : '');

    const entete = document.createElement('div');
    entete.className = 'av-entete';

    const titre = document.createElement('div');
    titre.className = 'av-titre';
    titre.textContent = p.nom;
    titre.appendChild(pastilleMode(p.mode));
    if(p.par_defaut){
      const etoile = document.createElement('span');
      etoile.className = 'av-etiquette defaut';
      etoile.textContent = '★ au lancement';
      titre.appendChild(etoile);
    }
    const visibilite = document.createElement('span');
    visibilite.className = 'av-etiquette ' + (p.public ? 'publique' : 'privee');
    visibilite.textContent = p.public ? '👁 publique' : '🔒 privée';
    titre.appendChild(visibilite);
    if(courante){
      const ici = document.createElement('span');
      ici.className = 'av-etiquette ouverte';
      ici.textContent = 'ouverte';
      titre.appendChild(ici);
    }
    entete.appendChild(titre);

    const chiffres = document.createElement('div');
    chiffres.className = 'av-chiffres';
    chiffres.innerHTML = '<b>' + (p.captures || 0) + '</b> ⬤ &nbsp; <b>' + (p.shiny || 0) + '</b> ✨';
    entete.appendChild(chiffres);
    carte.appendChild(entete);

    const dates = document.createElement('div');
    dates.className = 'av-dates';
    dates.textContent = 'Commencée le ' + dateLisible(p.cree_le)
      + (p.maj_le ? '  ·  dernière capture ' + depuisQuand(p.maj_le) : '');
    carte.appendChild(dates);

    const actions = document.createElement('div');
    actions.className = 'av-actions';

    // `icone` est facultatif : tous ces boutons n'en meritent pas un, et en
    // coller partout ferait une rangee de pictogrammes ou l'on ne distingue
    // plus ce qui compte.
    const bouton = function(libelle, titreInfobulle, classes, action, icone){
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toggle-btn ' + (classes || '');
      b.textContent = libelle;
      if(icone) boutonIcone(b, icone, libelle);
      b.title = titreInfobulle;
      b.addEventListener('click', action);
      return b;
    };

    if(!courante){
      actions.appendChild(bouton('Ouvrir', 'Travailler sur cette aventure', 'primary',
        function(){ ouvrirProfil(p).then(chargerProfil); }));
    }
    if(!p.par_defaut){
      actions.appendChild(bouton('★ Par défaut', 'Ouvrir celle-ci au lancement', '',
        function(){ agirSurPage(invoke('modifier_profil', { id: p.id, parDefaut: true })); }));
    }
    actions.appendChild(bouton(p.public ? 'Rendre privée' : 'Rendre publique',
      p.public ? 'Elle n\'apparaîtra plus au classement ni chez les autres'
               : 'Elle apparaîtra au classement et sera consultable',
      '', function(){
        agirSurPage(invoke('modifier_profil', { id: p.id, public: !p.public }));
      }, p.public ? 'cadenas' : 'oeil'));
    actions.appendChild(bouton('Renommer', 'Changer le nom de cette aventure', '',
      async function(){
        const propose = await demanderNouveauNom(p);
        if(propose === null) return;
        agirSurPage(invoke('modifier_profil', { id: p.id, nom: propose }));
      }));
    actions.appendChild(bouton('♻️ Réinitialiser',
      'Vider son Pokédex, sans toucher aux autres aventures', '', function(){
        reinitialiserAventure(p, courante);
      }));
    actions.appendChild(bouton('🗑 Supprimer', 'Effacer cette aventure et son Pokédex', 'danger',
      function(){ supprimerAventure(p, courante); }));

    carte.appendChild(actions);
    carte.appendChild(carnetDe(p));
    profilAventures.appendChild(carte);
  });
}

/**
 * Le carnet de bord d'une aventure.
 *
 * Sa règle de Nuzlocke, ses surnoms, où elle en est. Les gens tiennent ça dans
 * un fichier texte à côté ; autant que ce soit dedans, et rattaché à l'aventure
 * dont il parle.
 *
 * REPLIÉ PAR DÉFAUT, SAUF S'IL EST ÉCRIT. Une aventure sans carnet ne doit pas
 * étaler une zone de saisie vide au milieu de la liste ; une aventure qui en a
 * un doit le montrer, sinon on oublie qu'il existe.
 *
 * ENREGISTRÉ À LA SORTIE DU CHAMP, pas à chaque frappe : une requête par touche
 * serait absurde, et un bouton « Enregistrer » de plus dans une carte qui en
 * compte déjà six ne servirait qu'à être oublié. Le mot « Enregistré » le dit
 * quand c'est fait — sans lui, on ne saurait pas si ça a pris.
 */
function carnetDe(p){
  const bloc = document.createElement('details');
  bloc.className = 'av-carnet';
  bloc.open = !!(p.notes && p.notes.trim());

  const titre = document.createElement('summary');
  titre.textContent = (p.notes && p.notes.trim()) ? '📓 Carnet de bord' : '📓 Ouvrir un carnet';
  bloc.appendChild(titre);

  const champ = document.createElement('textarea');
  champ.className = 'av-carnet-champ';
  champ.rows = 4;
  champ.maxLength = 8000;
  champ.placeholder = 'Ta règle de Nuzlocke, tes surnoms, où tu en es…';
  champ.value = p.notes || '';
  champ.setAttribute('aria-label', 'Carnet de bord de ' + p.nom);

  const etat = document.createElement('span');
  etat.className = 'av-carnet-etat';

  champ.addEventListener('blur', async function(){
    const texte = champ.value;
    if(texte === (p.notes || '')) return;         // rien n'a bougé
    etat.textContent = 'Enregistrement…';
    try{
      await invoke('modifier_profil', { id: p.id, notes: texte });
      p.notes = texte.trim() ? texte : '';
      etat.textContent = texte.trim() ? 'Enregistré.' : 'Carnet vidé.';
      titre.textContent = texte.trim() ? '📓 Carnet de bord' : '📓 Ouvrir un carnet';
    }catch(e){
      if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
      etat.textContent = String(e);
    }
  });

  bloc.appendChild(champ);
  bloc.appendChild(etat);
  return bloc;
}

async function agirSurPage(promesse){
  direErreurPage('');
  try{
    await promesse;
    await readServerProfiles();
    // profilCourant garde une copie : elle doit suivre le renommage ou le
    // passage en privé, sinon le menu affiche l'ancien état.
    if(profilCourant){
      const frais = profilsConnus.find(function(x){ return x.id === profilCourant.id; });
      if(frais) profilCourant = frais;
    }
    majBoutonProfil();
    chargerProfil();
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    direErreurPage(String(e));
  }
}

async function reinitialiserAventure(p, courante){
  if(!await confirmerVidage(p)) return;

  // Réinitialiser une aventure qu'on n'a pas ouverte suppose de l'ouvrir : la
  // sauvegarde part toujours du dex affiché.
  if(!courante) await ouvrirProfil(p);
  resetAllProgress();
  updateProgress();
  renderList(true);
  await writeServerSave();
  chargerProfil();
}

async function supprimerAventure(p, courante){
  if(!await confirmerSuppression(p)) return;

  direErreurPage('');
  try{
    await invoke('supprimer_profil', { id: p.id });
    const reste = await readServerProfiles();
    if(courante){
      const suivante = reste.find(function(x){ return x.par_defaut; }) || reste[0];
      if(suivante) await ouvrirProfil(suivante);
    }
    chargerProfil(true);
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    direErreurPage(String(e));
  }
}

// ---- Le journal des captures ------------------------------------------------
// Le nom français d'un Pokémon depuis son identifiant PokeAPI, tel qu'il est
// stocké : le journal garde le nom technique, stable, et l'affichage le traduit
// dans la langue du moment.
function nomJournal(slug){
  const e = allEntries.find(function(x){ return x.name === slug; });
  return e ? nomAffiche(e) : slug;
}

function libelleDex(cle){
  if(cle === 'national') return 'Pokémon HOME';
  const jeu = gameByKey[cle];
  return jeu ? jeu.title : cle;
}

// Une ligne du journal, cliquable : elle rouvre la fiche du Pokémon dans le
// Pokédex où il a été coché. C'est le geste qu'on fait naturellement en
// relisant ses dernières captures — « celui-là, c'était où déjà ? ».
function ligneJournal(l, quandTexte, quandTitre){
  const entree = allEntries.find(function(x){ return x.name === l.pokemon; });

  // Un bouton plutôt qu'un div : on gagne le clavier et le focus sans rien
  // réécrire. Sans entrée connue (forme retirée d'une réserve plus récente),
  // la ligne reste affichée mais inerte.
  const ligne = document.createElement(entree ? 'button' : 'div');
  if(entree){
    ligne.type = 'button';
    ligne.title = 'Ouvrir la fiche de ' + nomAffiche(entree) + ' — ' + libelleDex(l.dex);
    ligne.addEventListener('click', function(){ ouvrirDepuisJournal(entree, l.dex); });
  }
  ligne.className = 'journal-ligne' + (l.chromatique ? ' chromatique' : '')
    + (entree ? ' ouvrable' : '');

  const marque = document.createElement('span');
  marque.className = 'journal-marque';
  marque.textContent = l.chromatique ? '✨' : '⬤';

  const nom = document.createElement('span');
  nom.className = 'journal-nom';
  nom.textContent = nomJournal(l.pokemon);

  const ou = document.createElement('span');
  ou.className = 'journal-ou';
  ou.textContent = libelleDex(l.dex);

  const quand = document.createElement('span');
  quand.className = 'journal-heure';
  quand.textContent = quandTexte;
  if(quandTitre) quand.title = quandTitre;

  ligne.appendChild(marque); ligne.appendChild(nom);
  ligne.appendChild(ou);

  // En mode transversal, l'aventure d'où vient la capture — entre le jeu et
  // l'heure. Sans elle, deux parties se mélangent sans qu'on puisse les
  // distinguer, et « Bulbizarre, Rouge / Bleu » apparaîtrait deux fois sans
  // raison visible. Elle ne figure pas dans l'autre mode : la répéter à chaque
  // ligne quand toutes viennent de la même aventure serait du bruit.
  if(journalToutes && l.aventure){
    const av = document.createElement('span');
    av.className = 'journal-aventure';
    av.textContent = l.aventure;
    ligne.appendChild(av);
    // La ligne est une grille à quatre colonnes fixes : un cinquième enfant
    // sans cette classe passerait à la ligne suivante.
    ligne.classList.add('avec-aventure');
  }

  ligne.appendChild(quand);
  return ligne;
}

// On bascule d'abord sur le Pokédex concerné : showPage pose currentTab tout
// de suite, si bien que la fiche parle du bon jeu — ses lieux d'obtention
// comme ses attaques — même si la grille derrière charge encore.
function ouvrirDepuisJournal(entree, cleDex){
  showPage(cleDex === 'national' ? 'national' : cleDex);
  openPreview(entree, null);
}

/**
 * Le début du journal, demandé une seule fois quand deux écrans le veulent.
 *
 * L'accueil affiche les six dernières captures, la page Profil le journal
 * entier : c'est la même requête, et redessiner les deux d'affilée la faisait
 * partir deux fois. On ne met rien en cache — le journal change dès qu'on coche
 * un Pokémon — on partage seulement la requête encore en vol. Une fois rendue,
 * la suivante repart au serveur.
 */
let journalEnVol = null;
let journalEnVolCle = '';

function lireHistorique(id, avant){
  const cle = id + '|' + (avant == null ? '' : avant);
  if(journalEnVol && journalEnVolCle === cle) return journalEnVol;
  journalEnVolCle = cle;
  journalEnVol = invoke('historique', { id: id, avant: avant });
  const mien = journalEnVol;
  // On libère dès que c'est rendu, succès ou échec : garder la promesse
  // servirait indéfiniment un journal figé.
  mien.then(oublierEnVol, oublierEnVol);
  return mien;
}

function oublierEnVol(){
  journalEnVol = null;
  journalEnVolCle = '';
}

async function chargerJournal(suite){
  if(!profilCourant && !journalToutes){
    journalListe.innerHTML = '<div class="state-msg">Aucune aventure ouverte.</div>';
    journalPlus.style.display = 'none';
    return;
  }
  if(!suite){
    journalCurseur = null;
    journalListe.innerHTML = '<div class="state-msg">Chargement…</div>';
  }
  journalQuoi.textContent = journalToutes
    ? 'Toutes mes aventures'
    : (profilCourant ? profilCourant.nom : '—');

  let r;
  try{
    // Deux services, parce que deux questions : « qu'ai-je attrapé dans cette
    // partie » et « qu'ai-je attrapé, tout court ». Le second ne connaît pas
    // de total — le compter à chaque page coûterait un balayage de la table.
    r = journalToutes
      ? await invoke('journal', { avant: journalCurseur })
      : await lireHistorique(profilCourant.id, journalCurseur);
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    journalListe.innerHTML = '<div class="state-msg">Journal indisponible.</div>';
    journalPlus.style.display = 'none';
    return;
  }

  if(!suite) journalListe.innerHTML = '';
  // Le service transversal ne rend pas de total : le compter a chaque page
  // couterait un balayage de la table pour un chiffre decoratif.
  journalTotal.textContent = r.total
    ? r.total + ' capture' + (r.total > 1 ? 's' : '') + ' enregistrées'
    : '';

  if(!r.lignes.length && !suite){
    journalListe.innerHTML = '<div class="state-msg">Rien encore. Le journal se remplit '
      + 'à mesure que tu coches des Pokémon — les captures d\'avant sa mise en place '
      + 'n\'y figurent pas.</div>';
    journalPlus.style.display = 'none';
    return;
  }

  // Un séparateur par jour : une liste de trois cents lignes sans repère
  // temporel ne se lit pas.
  let jourAffiche = journalListe.dataset.dernierJour || '';
  r.lignes.forEach(function(l){
    const d = new Date(l.ajoute_le);
    const jour = isNaN(d) ? '' : d.toLocaleDateString('fr-FR',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if(jour && jour !== jourAffiche){
      const entete = document.createElement('div');
      entete.className = 'journal-jour';
      entete.textContent = jour;
      journalListe.appendChild(entete);
      jourAffiche = jour;
    }

    journalListe.appendChild(ligneJournal(l, isNaN(d) ? '' : d.toLocaleTimeString('fr-FR',
      { hour: '2-digit', minute: '2-digit' })));
    journalCurseur = l.id;
  });
  journalListe.dataset.dernierJour = jourAffiche;
  journalPlus.style.display = r.encore ? 'block' : 'none';
}

async function chargerProfil(dejaAJour){
  direErreurPage('');
  // L'appelant vient parfois de lire la liste pour son propre compte : la
  // redemander dans la foulée est un aller-retour pour rien.
  if(!dejaAJour) await readServerProfiles();
  if(profilCourant){
    const frais = profilsConnus.find(function(x){ return x.id === profilCourant.id; });
    if(frais) profilCourant = frais;
  }
  dessinerIdentite();
  dessinerAventures();
  journalListe.dataset.dernierJour = '';
  chargerJournal(false);
  if(typeof chargerRetrospective === 'function') chargerRetrospective();
}

/**
 * Les Paramètres.
 *
 * Ils vivaient au bas du Profil, sous le journal : pour changer une couleur il
 * fallait dépasser sa rétrospective, ses succès et deux cents lignes de
 * captures. Ce sont deux choses différentes — le Profil dit QUI on est et ce
 * qu'on a fait, les Paramètres disent COMMENT l'application se tient — et elles
 * ont désormais deux écrans.
 *
 * Les blocs eux-mêmes n'ont pas bougé d'un caractère : ils sont remplis par
 * apparence.js et donnees-perso.js, chargés après celui-ci, et retrouvent leurs
 * éléments par identifiant où qu'ils se trouvent dans la page.
 */
function chargerParametres(){
  if(typeof chargerApparence === 'function') chargerApparence();
  if(typeof chargerDonneesPerso === 'function') chargerDonneesPerso();
  if(typeof chargerPlacePhotos === 'function') chargerPlacePhotos();
}

journalPlus.addEventListener('click', function(){ chargerJournal(true); });

// La bascule du journal. Le libellé annonce ce vers quoi on va, pas où l'on
// est : un bouton qui dit « Toutes mes aventures » pendant qu'on les regarde
// déjà laisse croire qu'il ne s'est rien passé.
if(journalPortee){
  journalPortee.addEventListener('click', function(){
    journalToutes = !journalToutes;
    journalPortee.setAttribute('aria-pressed', journalToutes ? 'true' : 'false');
    journalPortee.textContent = journalToutes
      ? 'Seulement cette aventure'
      : 'Toutes mes aventures';
    journalListe.dataset.dernierJour = '';
    chargerJournal(false);
  });
}

document.getElementById('profilPageCreer').addEventListener('click', async function(){
  const nom = profilPageNom.value.trim();
  if(!nom){ direErreurPage('Donne un nom à ton aventure.'); profilPageNom.focus(); return; }
  direErreurPage('');
  try{
    const r = await invoke('creer_profil', { nom: nom, mode: profilPageMode.value });
    profilPageNom.value = '';
    await readServerProfiles();
    if(r && r.profil){
      const cree = profilsConnus.find(function(x){ return x.id === r.profil.id; });
      if(cree) await ouvrirProfil(cree);
    }
    chargerProfil();
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    direErreurPage(String(e));
  }
});

profilPageNom.addEventListener('keydown', function(e){
  if(e.key === 'Enter') document.getElementById('profilPageCreer').click();
});

// ---- L'accueil : l'aventure ouverte, et les dernières captures --------------
// Avec plusieurs aventures, l'accueil ne disait nulle part sur laquelle on
// travaille — et « Bonjour X » ne suffit pas quand X en tient trois.

function majAccueilAventure(){
  if(!accueilAventure) return;
  if(!profilCourant){ accueilAventure.style.display = 'none'; return; }

  accueilAventure.style.display = '';
  accueilAventure.innerHTML = '';
  accueilAventure.title = 'Changer d\'aventure';

  const gauche = document.createElement('span');
  gauche.className = 'accueil-aventure-nom';
  gauche.textContent = '🎒 ' + profilCourant.nom;
  gauche.appendChild(pastilleMode(profilCourant.mode));
  if(!profilCourant.public){
    const prive = document.createElement('em');
    prive.textContent = 'privée';
    gauche.appendChild(prive);
  }

  const droite = document.createElement('span');
  droite.className = 'accueil-aventure-info';
  const depuis = profilCourant.cree_le ? depuisQuand(profilCourant.cree_le) : '';
  droite.textContent = (depuis ? 'commencée ' + depuis + '  ·  ' : '')
    + '⬤ ' + (profilCourant.captures || 0) + '  ✨ ' + (profilCourant.shiny || 0);

  accueilAventure.appendChild(gauche);
  accueilAventure.appendChild(droite);
}

accueilAventure.addEventListener('click', ouvrirProfilModal);

// Les six dernières captures. C'est ce qui dit où l'on s'était arrêté — un
// tableau de bord qui n'affiche que des totaux ne raconte rien.
const ACCUEIL_JOURNAL_MAX = 6;

async function chargerDernieresCaptures(){
  if(!accueilJournal) return;
  if(!profilCourant){
    accueilJournal.innerHTML = '<div class="state-msg">Aucune aventure ouverte.</div>';
    return;
  }

  let r;
  try{
    r = await lireHistorique(profilCourant.id, null);
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    accueilJournal.innerHTML = '<div class="state-msg">Journal indisponible.</div>';
    return;
  }

  accueilJournal.innerHTML = '';
  if(!r.lignes.length){
    accueilJournal.innerHTML = '<div class="state-msg">Rien encore. Coche un Pokémon '
      + 'et il apparaîtra ici — les captures antérieures au journal n\'y figurent pas.</div>';
    return;
  }

  r.lignes.slice(0, ACCUEIL_JOURNAL_MAX).forEach(function(l){
    const d = new Date(l.ajoute_le);
    // Sur l'accueil, la date relative parle mieux que l'heure : on veut savoir
    // si c'était tout à l'heure ou la semaine dernière.
    accueilJournal.appendChild(ligneJournal(l,
      isNaN(d) ? '' : depuisQuand(l.ajoute_le),
      isNaN(d) ? '' : dateLisible(l.ajoute_le)));
  });

  if(r.total > ACCUEIL_JOURNAL_MAX){
    const tout = document.createElement('button');
    tout.type = 'button';
    tout.className = 'journal-tout';
    tout.textContent = 'Voir les ' + r.total + ' captures →';
    tout.addEventListener('click', function(){ showPage('profil'); });
    accueilJournal.appendChild(tout);
  }
}

// ---- Le Pokédex d'un autre dresseur -----------------------------------------
// Voir la liste de ses aventures ne dit pas grand-chose : ce qu'on veut, c'est
// entrer dedans et voir ses vingt-trois Pokédex, comme les siens.

let visiteEnCours = null;   // { pseudo, profil, dex } — pour le bouton Comparer

// Le dex reçu de l'API est du JSON ; avancementDuJeu attend des ensembles.
function collectionDuJeu(dexDistant, cle){
  const bloc = (dexDistant && dexDistant.dex && dexDistant.dex[cle]) || {};
  return {
    caught: new Set(bloc.caught || []),
    shiny: new Set(bloc.shiny || [])
  };
}

async function voirPokedexDe(pseudo, profil){
  const liste = document.getElementById('listeDresseurs');
  liste.style.display = 'none';
  dresseurVisite.style.display = '';
  dresseurRetour.style.display = '';
  dresseurVisite.innerHTML = '<div class="state-msg">Chargement de son Pokédex…</div>';

  let autre;
  try{
    autre = await invoke('dex_de', { pseudo: pseudo, profil: profil.id });
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    dresseurVisite.innerHTML = '<div class="state-msg">Pokédex indisponible.</div>';
    return;
  }
  if(!autre || !autre.dex){
    dresseurVisite.innerHTML = '<div class="state-msg">'
      + escapeHtml(pseudo) + ' n\'a encore rien enregistré dans « '
      + escapeHtml(profil.nom) + ' ».</div>';
    return;
  }
  visiteEnCours = { pseudo: pseudo, profil: profil, dex: autre.dex };

  dresseurVisite.innerHTML = '';

  // L'en-tête : de qui, quelle aventure, et de quoi revenir en arrière.
  const entete = document.createElement('div');
  entete.className = 'visite-entete';
  const retour = document.createElement('button');
  retour.type = 'button';
  retour.className = 'toggle-btn';
  retour.textContent = '← Ses aventures';
  retour.addEventListener('click', function(){ visiterDresseur(pseudo); });

  const titre = document.createElement('div');
  titre.innerHTML = '<strong>' + escapeHtml(pseudo) + '</strong>';
  const sous = document.createElement('span');
  sous.textContent = profil.nom;
  titre.appendChild(sous);

  const comparer = document.createElement('button');
  comparer.type = 'button';
  comparer.className = 'toggle-btn primary';
  comparer.textContent = '👥 Comparer avec la mienne';
  comparer.addEventListener('click', function(){
    demarrerComparaison(pseudo + ' · ' + profil.nom, autre.dex,
      (autre.profil && autre.profil.mode) || profil.mode,
      autre.profil && autre.profil.niveau_formes, pseudo,
      // On revient sur SA FICHE, et non sur le Pokédex qu'on regardait : c'est
      // de là qu'on est parti, et c'est là qu'on retrouve ses autres aventures.
      function(){ showPage('dresseurs'); visiterDresseur(pseudo); });
    showPage('national');
  });

  entete.appendChild(retour);
  entete.appendChild(titre);
  entete.appendChild(comparer);
  dresseurVisite.appendChild(entete);

  const grille = document.createElement('div');
  grille.className = 'jeux';
  grille.innerHTML = '<div class="state-msg">Calcul des Pokédex…</div>';
  dresseurVisite.appendChild(grille);

  // Même calcul que pour soi, sur sa collection à lui.
  const lignes = [];
  for(const game of GAMES){
    lignes.push({ game: game, a: await avancementDuJeu(game, collectionDuJeu(autre.dex, game.key)) });
  }

  grille.innerHTML = '';
  lignes.forEach(function(x){
    const game = x.game, a = x.a;
    const etat = etiquetteAvancement(a);

    // Une carte inerte : on regarde chez quelqu'un d'autre, il n'y a rien à
    // cocher. La rendre cliquable laisserait croire le contraire.
    const carte = document.createElement('div');
    carte.className = 'jeu-carte visite-jeu' + (a.normal ? '' : ' vide');
    carte.title = game.title + ' — ' + game.machine;

    const cadre = document.createElement('span');
    cadre.className = 'jeu-jaquette';
    remplirJaquette(cadre, game);

    const jauge = document.createElement('span');
    jauge.className = 'jeu-jauge';
    const rempli = document.createElement('i');
    rempli.style.width = (a.total ? (a.normal / a.total) * 100 : 0) + '%';
    jauge.appendChild(rempli);

    const avancee = document.createElement('span');
    avancee.className = 'jeu-avancee ' + etat.classe;
    const chiffres = document.createElement('b');
    chiffres.textContent = a.total ? a.normal + ' / ' + a.total : '—';
    avancee.appendChild(chiffres);
    if(a.shiny){
      const s = document.createElement('em');
      s.textContent = '✨ ' + a.shiny;
      avancee.appendChild(s);
    }

    carte.appendChild(cadre); carte.appendChild(jauge); carte.appendChild(avancee);
    grille.appendChild(carte);
  });
}
