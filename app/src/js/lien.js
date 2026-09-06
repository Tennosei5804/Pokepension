// Le lien de partage d'un Pokédex.
// Script classique (pas de module ES), comme le reste de l'application.
//
// CE QU'IL PARTAGE, ET CE QU'IL NE PARTAGE PAS. Un lien porte UN Pokédex :
// celui du jeu ouvert, dans l'aventure ouverte. Partager son Rouge Feu ne
// montre pas son Écarlate. Le découpage se fait côté serveur, dans
// `lirePartage()` — une page peut être réécrite, une réponse d'API part telle
// qu'elle est construite.
//
// POURQUOI PAS UN FICHIER. L'export existe déjà et rend un `pokearchive-1`
// complet : c'est ce qu'on s'envoie pour DÉMÉNAGER une collection. Un lien
// répond à l'autre besoin, celui qu'on a dix fois par semaine — « regarde où
// j'en suis » — et il ne demande à personne d'installer quoi que ce soit ni de
// se créer un compte.
//
// LE LIEN SUIT L'AVANCÉE. On le colle une fois dans un salon, il reste juste.
// C'est pour cela qu'il se révoque : ce qui ne se fige pas doit pouvoir
// s'éteindre.

const lienOverlay = document.getElementById('lienOverlay');
const lienSous = document.getElementById('lienSous');
const lienBoite = document.getElementById('lienBoite');
const lienCode = document.getElementById('lienCode');
const lienAdresse = document.getElementById('lienAdresse');
const lienEtat = document.getElementById('lienEtat');
const lienExistants = document.getElementById('lienExistants');
const lienListe = document.getElementById('lienListe');
const lienRevoquerBtn = document.getElementById('lienRevoquer');

// Le partage affiché en ce moment : { code, lisible, jeu, profil }.
let lienCourant = null;

/**
 * L'adresse d'un partage.
 *
 * DEUX MONDES, DEUX ORIGINES. Sur le site, l'adresse est celle de la page où
 * l'on se trouve — c'est la même qu'on collera. Dans l'application, il n'y a
 * pas d'adresse : `location` pointe sur un fichier local, et un lien
 * « tauri://… » ne s'ouvre chez personne. On y écrit donc le site en dur, et
 * c'est la seule fois du projet où cette adresse est écrite à la main.
 */
const LIEN_SITE = 'https://pokepension.fr';

function adresseDuPartage(code){
  const base = (window.PONT_HTTP && location.origin.indexOf('http') === 0)
    ? location.origin
    : LIEN_SITE;
  return base + '/p/' + code;
}

function lienDire(texte){
  lienEtat.textContent = texte || '';
}

/** Le nom du jeu tel que l'application le nomme, jamais écrit de mémoire. */
function lienNomDuJeu(cleJeu){
  if(cleJeu === 'national') return 'la collection Pokémon HOME';
  const g = (typeof GAMES !== 'undefined')
    ? GAMES.find(function(x){ return x.key === cleJeu; }) : null;
  return g ? g.title : cleJeu;
}

async function lienCopier(texte, quoi){
  try{
    await navigator.clipboard.writeText(texte);
    lienDire(quoi + ' copié.');
  }catch(e){
    // Le presse-papier peut être refusé — fenêtre sans focus, permission
    // retirée. On ne laisse pas la personne sans recours : le texte est déjà
    // à l'écran, on le lui dit.
    lienDire('Copie refusée par le navigateur — le ' + quoi.toLowerCase()
      + ' est affiché au-dessus, il se sélectionne à la main.');
  }
}

function lienAfficher(p){
  lienCourant = p;
  lienCode.textContent = p.lisible;
  lienAdresse.textContent = adresseDuPartage(p.code);
  lienBoite.hidden = false;
  lienRevoquerBtn.hidden = false;
  lienDire('');
}

/**
 * Ouvre la fenêtre pour le Pokédex affiché.
 *
 * On ne crée rien avant que la personne l'ait demandé : ouvrir la fenêtre ne
 * doit pas semer un lien qu'on n'a pas voulu. C'est le bouton qui le crée.
 */
async function ouvrirLienPartage(){
  if(!sessionOuverte){
    ouvrirAuthModal('Connecte-toi pour partager un Pokédex : le lien vit sur ton compte.');
    return;
  }
  const jeu = (typeof seauCapture === 'function') ? seauCapture() : 'national';
  lienCourant = null;
  lienBoite.hidden = true;
  lienRevoquerBtn.hidden = true;
  lienDire('');
  lienSous.textContent = 'Tu partages ' + lienNomDuJeu(jeu)
    + (profilCourant ? ' — aventure « ' + profilCourant.nom + ' »' : '') + '.';
  lienOverlay.style.display = 'flex';
  await lienDessinerListe();

  try{
    const p = await invoke('partage_creer', {
      profil: profilCourant ? profilCourant.id : null, jeu: jeu });
    lienAfficher({ code: p.code, lisible: p.lisible, jeu: jeu });
    await lienDessinerListe();
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    lienBoite.hidden = true;
    lienDire(messageErreur(e) || 'Impossible d’ouvrir un lien pour l’instant.');
  }
}

function fermerLienPartage(){
  lienOverlay.style.display = 'none';
}

/** Les liens déjà ouverts, actifs d'abord, avec de quoi les éteindre. */
async function lienDessinerListe(){
  let liste = [];
  try{ liste = (await invoke('partages')).partages || []; }
  catch(e){ liste = []; }

  const autres = liste.filter(function(x){
    return !lienCourant || x.code !== lienCourant.code;
  });
  lienExistants.hidden = autres.length === 0;
  lienListe.textContent = '';

  autres.forEach(function(x){
    const ligne = document.createElement('div');
    ligne.className = 'lien-ligne' + (x.actif ? '' : ' eteint');

    const quoi = document.createElement('div');
    quoi.className = 'lien-ligne-quoi';
    const titre = document.createElement('b');
    titre.textContent = lienNomDuJeu(x.jeu);
    const sous = document.createElement('span');
    // Un lien éteint le dit ; un lien vivant dit ce qu'il a servi. « 0 vue »
    // n'est pas un échec : c'est un lien qu'on vient de créer.
    sous.textContent = x.actif
      ? (x.profil + ' · ' + x.lisible + ' · ' + x.vues + (x.vues > 1 ? ' vues' : ' vue'))
      : (x.profil + ' · révoqué');
    quoi.append(titre, sous);

    ligne.append(quoi);

    if(x.actif){
      const eteindre = document.createElement('button');
      eteindre.className = 'toggle-btn danger';
      eteindre.type = 'button';
      eteindre.textContent = '⛔ Révoquer';
      eteindre.addEventListener('click', function(){ lienRevoquer(x.code); });
      ligne.append(eteindre);
    }
    lienListe.append(ligne);
  });
}

async function lienRevoquer(code){
  const ok = await demanderConfirmation({
    eyebrow: 'Partage',
    titre: 'Révoquer ce lien ?',
    note: 'Qui l’a reçu verra « ce lien a été retiré ». Ton Pokédex ne change '
      + 'pas, et tu pourras en rouvrir un — mais ce sera un autre code, et '
      + 'l’ancien ne reviendra pas.',
    libelleAction: 'Révoquer',
    danger: true
  });
  if(!ok) return;
  try{
    await invoke('partage_revoquer', { code: code });
    if(lienCourant && lienCourant.code === code){
      lienCourant = null;
      lienBoite.hidden = true;
      lienRevoquerBtn.hidden = true;
      lienDire('Lien révoqué. Rouvre la fenêtre pour en créer un autre.');
    }
    await lienDessinerListe();
  }catch(e){
    if(String(e) === 'SESSION_INVALIDE'){ await perdreSession(); return; }
    lienDire(messageErreur(e) || 'Impossible de révoquer ce lien.');
  }
}

// ---- Les commandes de la fenêtre --------------------------------------------

document.getElementById('partageBtn').addEventListener('click', ouvrirLienPartage);
document.getElementById('lienFermer').addEventListener('click', fermerLienPartage);

document.getElementById('lienCopier').addEventListener('click', function(){
  if(!lienCourant) return;
  lienCopier(adresseDuPartage(lienCourant.code), 'Lien');
});

document.getElementById('lienCopierCode').addEventListener('click', function(){
  if(!lienCourant) return;
  lienCopier(lienCourant.lisible, 'Code');
});

document.getElementById('lienOuvrir').addEventListener('click', function(){
  if(!lienCourant) return;
  const adresse = adresseDuPartage(lienCourant.code);
  // Dans l'application, ouvrir une adresse extérieure passe par le système :
  // la fenêtre de l'application n'est pas un navigateur, et y charger le site
  // remplacerait le Pokédex par une page web sans retour possible.
  const T = window.__TAURI__;
  if(T && T.opener && typeof T.opener.openUrl === 'function'){
    T.opener.openUrl(adresse).catch(function(){ lienDire('Ouverture refusée.'); });
  }else{
    window.open(adresse, '_blank', 'noopener');
  }
});

lienRevoquerBtn.addEventListener('click', function(){
  if(lienCourant) lienRevoquer(lienCourant.code);
});

// Fermer en cliquant à côté, comme les autres fenêtres de l'application.
lienOverlay.addEventListener('click', function(e){
  if(e.target === lienOverlay) fermerLienPartage();
});
