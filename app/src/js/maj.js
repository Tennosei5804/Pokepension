// Les mises à jour de l'application.
//
// Script classique comme les autres, chargé après confirmer.js — il se sert de
// ses dialogues plutôt que d'en inventer un.
//
// Le principe : au lancement, l'application demande à GitHub s'il existe une
// version plus récente. Le fichier interrogé est publié avec la Release et dit
// trois choses — le numéro de version, l'adresse de l'installeur, et sa
// signature. Le plugin refuse tout ce qui n'est pas signé avec notre clé : sans
// cela, qui peut intercepter le téléchargement peut livrer son propre programme.
//
// Ce qu'on ne fait PAS : installer sans demander. Une application qui se met à
// jour dans le dos de son utilisateur redémarre au mauvais moment, et il n'y a
// aucune urgence à corriger un Pokédex.

const MAJ_ATTENTE_AU_LANCEMENT = 4000;

let majTrouvee = null;      // l'objet rendu par check(), gardé entre les deux temps
let majEnCours = false;     // garde : deux téléchargements simultanés casseraient

/**
 * Le pont vers le plugin. Absent dans le banc d'essai et dans les pages de
 * génération, qui n'ont pas de Tauri derrière — d'où la vérification plutôt
 * qu'un plantage au chargement.
 */
function pontMaj(){
  const t = window.__TAURI__;
  return (t && t.updater && typeof t.updater.check === 'function') ? t.updater : null;
}

/**
 * Le numéro de la version installée.
 *
 * Il vient de Tauri, qui le tient de tauri.conf.json — la même source que celle
 * comparée aux Releases. L'écrire en dur ici en ferait un quatrième endroit à
 * tenir d'accord avec les trois autres, et c'est exactement ce qui finit périmé.
 *
 * Absent hors de l'application : le banc et les pages de génération n'ont pas de
 * Tauri. On rend alors une chaîne vide, et l'appelant se tait plutôt que
 * d'annoncer une version qu'il ne connaît pas.
 */
async function versionInstallee(){
  const t = window.__TAURI__;
  if(!t || !t.app || typeof t.app.getVersion !== 'function') return '';
  try{ return await t.app.getVersion(); }
  catch(e){ return ''; }
}

/**
 * Regarde s'il existe une version plus récente.
 *
 * `discret` : au lancement, on ne dit rien quand il n'y a rien — et on ne dit
 * rien non plus quand ça échoue. Une machine hors ligne n'a pas à recevoir un
 * message d'erreur pour une vérification qu'elle n'a pas demandée.
 */
async function verifierMaj(discret){
  const pont = pontMaj();
  if(!pont){
    if(!discret){
      prevenir({
        eyebrow: 'Mises à jour',
        titre: 'Indisponible ici',
        note: 'La vérification passe par l\'application installée. Depuis le banc '
            + 'd\'essai ou un navigateur, il n\'y a rien à mettre à jour.'
      });
    }
    return null;
  }

  try{
    const maj = await pont.check();
    if(maj && maj.available){
      majTrouvee = maj;
      montrerBoutonMaj(maj.version);
      if(!discret) proposerMaj();
      return maj;
    }
    if(!discret){
      const v = await versionInstallee();
      prevenir({
        eyebrow: 'Mises à jour',
        titre: v ? 'Tu es en ' + v : 'Vous êtes à jour',
        note: 'Aucune version plus récente n\'est publiée.',
        genre: 'succes'
      });
    }
    return null;
  }catch(e){
    // Hors ligne, GitHub indisponible, aucune Release encore publiée : trois
    // situations normales qui ne méritent pas d'interrompre qui que ce soit.
    if(!discret){
      prevenirErreur('La vérification a échoué',
        'Impossible de joindre GitHub. Vérifiez la connexion, et réessayez plus tard.');
    }
    return null;
  }
}

/**
 * Le bouton passe de sa flèche discrète à la pilule dorée.
 *
 * Il est là en permanence — au repos, il ressemble à ses voisins et sert à
 * vérifier soi-même. Il n'était d'abord affiché qu'en cas de mise à jour, ce
 * qui privait de deux choses : demander soi-même, et savoir que l'application
 * le fait déjà.
 */
/**
 * Écrit sur le bouton, quelle que soit sa forme.
 *
 * Il vit à deux endroits : une pastille ronde dans les pages de génération, et
 * une ligne du menu du compte dans l'application. La ligne porte son libellé
 * dans un <span> — y écrire directement effacerait la mise en page du menu,
 * et un « ⟳ » seul au milieu d'une liste de mots ne se comprendrait pas.
 */
function direSurMaj(bouton, court, long){
  const nom = bouton.querySelector('.compte-item-nom');
  if(nom) nom.textContent = long;
  else bouton.textContent = court;
}

function montrerBoutonMaj(version){
  const bouton = document.getElementById('majBtn');
  if(!bouton) return;
  bouton.classList.add('trouvee');
  direSurMaj(bouton, '⬇ Mise à jour', '⬇ Installer la version ' + version);
  bouton.title = 'La version ' + version + ' est disponible';
}

// Ce que le bouton dit quand il n'y a rien : une flèche, et le reste en
// infobulle. Sert aussi à revenir en arrière après un échec.
function reposerBoutonMaj(){
  const bouton = document.getElementById('majBtn');
  if(!bouton) return;
  bouton.classList.remove('trouvee', 'cherche');
  bouton.disabled = false;
  direSurMaj(bouton, '⟳', '⟳ Vérifier les mises à jour');
  bouton.title = 'Vérifier les mises à jour';
}

/** Le nom du fichier de notes est libre : on affiche ce qui vient, ou rien. */
function notesDeVersion(maj){
  const brut = (maj && maj.body || '').trim();
  if(!brut) return 'Cette version n\'annonce pas ses changements.';
  return brut.length > 600 ? brut.slice(0, 600).trimEnd() + '…' : brut;
}

// ---- La fenêtre de mise à jour ----------------------------------------------
//
// CE QU'ELLE REMPLACE. La progression existait déjà — `downloadAndInstall` rend
// la main par étapes, `Started` donne la taille et `Progress` chaque morceau —
// mais elle finissait écrite dans le bouton de l'en-tête, en « ⬇ 42 % ». On
// téléchargeait neuf mégaoctets en regardant deux chiffres changer dans un
// cadre de trente pixels, et si l'on avait cliqué ailleurs entre-temps, plus
// rien ne disait que ça tournait.
//
// TROIS TEMPS, ET ILS N'ONT PAS LA MÊME NATURE :
//
//   téléchargement  on sait où l'on en est, en mégaoctets. Jauge pleine.
//   installation    l'installeur Windows reprend la main et ne dit plus rien.
//                   Jauge en mouvement perpétuel : prétendre un pourcentage
//                   ici serait inventer. C'est le moment où l'application
//                   paraissait figée.
//   échec           il reste DANS la fenêtre, avec de quoi la fermer. Il
//                   partait autrefois dans une autre modale, et le bouton de
//                   l'en-tête redevenait doré comme si de rien n'était.
//
// PAS DE CROIX NI D'ÉCHAP pendant l'opération : on ne « ferme » pas une
// installation en cours, et un bouton qui laisserait croire le contraire
// mentirait. Le seul bouton apparaît quand il n'y a plus rien à attendre.

const majOverlay = document.getElementById('majOverlay');
const majFenetreTitre = document.getElementById('majFenetreTitre');
const majJauge = document.getElementById('majJauge');
const majJaugeBarre = document.getElementById('majJaugeBarre');
const majEtatEl = document.getElementById('majEtat');
const majNote = document.getElementById('majNote');
const majActions = document.getElementById('majActions');
const majFermerBtn = document.getElementById('majFermer');

/** Des octets, dits comme on les lit. */
function majMo(octets){
  return (octets / 1048576).toFixed(1).replace('.', ',');
}

function ouvrirFenetreMaj(version){
  if(!majOverlay) return;
  majFenetreTitre.textContent = 'PokéArchive ' + version;
  majJauge.classList.remove('indeterminee');
  majJaugeBarre.style.width = '0%';
  majEtatEl.textContent = 'Préparation…';
  majNote.textContent = 'L’application se fermera le temps de l’installation, '
    + 'puis se rouvrira seule. Ton Pokédex et tes aventures ne sont pas touchés : '
    + 'ils vivent sur ton compte, pas dans le programme.';
  majActions.hidden = true;
  majOverlay.style.display = 'flex';
}

/**
 * Le téléchargement, en mégaoctets et non en seul pourcentage.
 *
 * « 3,2 sur 9,1 Mo » dit ce qu'il reste ; « 35 % » demande de le calculer. Et
 * quand la taille totale est inconnue — l'en-tête peut manquer — on montre ce
 * qui est arrivé plutôt qu'un pourcentage faux.
 */
function majProgression(recu, total){
  if(!majOverlay) return;
  majJauge.classList.remove('indeterminee');
  if(total){
    const part = Math.min(100, Math.round(100 * recu / total));
    majJaugeBarre.style.width = part + '%';
    majEtatEl.textContent = 'Téléchargement… ' + majMo(recu) + ' sur '
      + majMo(total) + ' Mo';
  } else {
    majJauge.classList.add('indeterminee');
    majEtatEl.textContent = 'Téléchargement… ' + majMo(recu) + ' Mo';
  }
}

function majInstallation(){
  if(!majOverlay) return;
  // AUCUNE PROGRESSION ICI, et c'est la vérité : l'installeur Windows reprend
  // la main. Une jauge qui continuerait d'avancer inventerait un chiffre.
  majJauge.classList.add('indeterminee');
  majEtatEl.textContent = 'Installation…';
  majNote.textContent = 'L’application va se fermer et se rouvrir. '
    + 'Ne l’arrête pas.';
}

function majEchec(quoi){
  if(!majOverlay) return;
  majJauge.classList.remove('indeterminee');
  majJaugeBarre.style.width = '0%';
  majEtatEl.textContent = 'La mise à jour n’a pas abouti.';
  majNote.textContent = quoi;
  majActions.hidden = false;
  setTimeout(function(){ if(majFermerBtn) majFermerBtn.focus(); }, 10);
}

function fermerFenetreMaj(){
  if(majOverlay) majOverlay.style.display = 'none';
}

if(majFermerBtn) majFermerBtn.addEventListener('click', fermerFenetreMaj);

/**
 * Le premier temps : on montre ce qui va se passer, et on demande.
 *
 * Le second temps — télécharger, installer, relancer — ne commence qu'après un
 * oui franc, parce qu'il ferme l'application.
 */
async function proposerMaj(){
  if(!majTrouvee || majEnCours) return;

  // Le résumé attend des paires {cle, valeur} : les deux numéros côte à côte
  // répondent seuls à « qu'est-ce que j'installe, et depuis quoi ».
  const resume = [{ cle: 'votre version', valeur: majTrouvee.currentVersion || '—' },
                  { cle: 'à installer', valeur: majTrouvee.version }];

  const veut = await demanderConfirmation({
    eyebrow: 'Mise à jour disponible',
    titre: 'PokéArchive ' + majTrouvee.version,
    resume: resume,
    note: notesDeVersion(majTrouvee)
        + '\n\nL\'application se ferme le temps de l\'installation, puis se rouvre '
        + 'seule. Votre Pokédex et vos aventures ne sont pas touchés : ils vivent '
        + 'sur votre compte, pas dans le programme.',
    libelleAction: 'Installer maintenant',
    libelleAnnuler: 'Plus tard'
  });
  if(!veut) return;

  majEnCours = true;
  const bouton = document.getElementById('majBtn');
  if(bouton) bouton.disabled = true;
  ouvrirFenetreMaj(majTrouvee.version);

  try{
    // downloadAndInstall rend la main par étapes. La donnée était déjà là ;
    // ce qui manquait, c'était un endroit où la montrer.
    let recu = 0, total = 0;
    await majTrouvee.downloadAndInstall(function(etape){
      if(etape.event === 'Started'){
        total = (etape.data && etape.data.contentLength) || 0;
        majProgression(0, total);
      }else if(etape.event === 'Progress'){
        recu += (etape.data && etape.data.chunkLength) || 0;
        majProgression(recu, total);
      }else if(etape.event === 'Finished'){
        majInstallation();
      }
    });

    // Sur Windows l'installeur reprend la main et referme l'application ; le
    // relaunch n'est atteint que si ce n'est pas le cas.
    const process = window.__TAURI__ && window.__TAURI__.process;
    if(process && typeof process.relaunch === 'function') await process.relaunch();
  }catch(e){
    majEnCours = false;
    // La version reste disponible : on rend le bouton à son état doré plutôt
    // qu'à sa flèche, sinon il faudrait revérifier pour retrouver ce qu'on sait.
    if(bouton) montrerBoutonMaj(majTrouvee.version);
    // L'ÉCHEC RESTE DANS LA FENÊTRE. Il partait dans une autre modale pendant
    // que celle-ci se refermait : deux fenêtres pour un seul événement, et le
    // bouton de l'en-tête redevenait doré comme si de rien n'était.
    majEchec('Le téléchargement ou l\'installation s\'est interrompu. '
      + 'L\'application reste dans sa version actuelle, rien n\'est cassé. Tu peux '
      + 'réessayer, ou télécharger l\'installeur depuis la page des versions '
      + 'sur GitHub.');
  }
}

/**
 * Le clic. Deux gestes derrière un seul bouton, selon ce qu'on sait déjà.
 *
 * Si une version nous attend, on la propose — inutile de redemander à GitHub
 * ce qu'il vient de répondre. Sinon on va voir, et cette fois on parle : c'est
 * une vérification demandée, elle doit dire ce qu'elle a trouvé, même quand
 * c'est « rien ». Une vérification muette laisse croire au bouton mort.
 */
async function auClicMaj(){
  if(majEnCours) return;
  if(majTrouvee) return proposerMaj();

  const bouton = document.getElementById('majBtn');
  if(bouton){ bouton.classList.add('cherche'); bouton.disabled = true; }
  try{
    await verifierMaj(false);
  }finally{
    if(bouton && !majTrouvee) reposerBoutonMaj();
    else if(bouton){ bouton.classList.remove('cherche'); bouton.disabled = false; }
  }
}

// Le bouton de l'en-tête, et la vérification au lancement. Quatre secondes de
// délai : l'application a mieux à faire au démarrage que d'attendre le réseau,
// et une mise à jour n'est jamais pressée.
document.addEventListener('DOMContentLoaded', function(){
  const bouton = document.getElementById('majBtn');
  const versAccueil = document.getElementById('accueilSiteBtn');

  // PAS D'UPDATER, PAS DE BOUTON. Le plugin est du Rust : le site n'en a pas,
  // et le banc non plus. Le bouton y restait pourtant affiche, et repondait
  // « impossible de verifier » a qui le pressait — une commande qui ne peut
  // rien faire vaut moins que pas de commande du tout.
  //
  // A sa place, sur le site, l'entree qui ramene a la page d'accueil : elle
  // n'a de sens que la, l'application etant deja ce qu'on y telechargerait.
  const dansApplication = Boolean(pontMaj());
  if(bouton) bouton.hidden = !dansApplication;
  if(versAccueil) versAccueil.hidden = dansApplication;

  if(bouton) bouton.addEventListener('click', auClicMaj);
  if(versAccueil) versAccueil.addEventListener('click', function(){
    // La racine, et non « accueil.html » : c'est l'adresse que Caddy sert et
    // celle qu'on met en favori.
    location.href = '/';
  });
  if(dansApplication) setTimeout(function(){ verifierMaj(true); }, MAJ_ATTENTE_AU_LANCEMENT);
});
