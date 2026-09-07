// La cloche : ce qui est arrivé POUR TOI.
//
// Script classique, chargé APRÈS amis.js et troc.js : il leur emprunte
// pontNotif, bullePermise, trocNom, trocJeuNom et ouvrirDiscussion.
//
// DEUX SOURCES, ET UNE SEULE CLOCHE. Les captures des amis se déduisent de leur
// journal et ne s'écrivent nulle part — c'est /api/amis/nouveautes, et amis.js
// s'en occupe déjà, avec sa propre pastille sur l'onglet. Ce qui passe ici est
// l'autre famille : ce qui s'ADRESSE à toi et attend quelque chose de toi. Une
// proposition d'échange, une réponse, un message.
//
// La différence n'est pas un détail d'implémentation, elle se voit à l'écran :
// une capture d'ami est une nouvelle qu'on lit ou pas, une proposition est une
// question à laquelle il faut répondre. Les mélanger ferait perdre les
// secondes dans les premières.
//
// POURQUOI UN SONDAGE, ET PAS UNE CONNEXION OUVERTE. L'API tourne sur un
// hébergement gratuit ; y maintenir une socket par joueur coûterait bien plus
// que trois requêtes à l'heure. Deux minutes de retard sur une proposition
// d'échange ne gênent personne — on n'échange pas à la seconde.
//
// ET CE SONDAGE N'EST PLUS LE SIEN. Il tournait ici, à la même cadence que
// celui des amis et décalé d'une seconde : deux allers-retours toutes les deux
// minutes pour une seule cadence. C'est `veiller()`, dans amis.js, qui demande
// désormais une fois pour deux et distribue — la cloche reçoit par
// recevoirVeille().

// La cadence n'est plus ici : c'est la veille commune d'amis.js qui rythme les
// deux, en une seule requête. Le minuteur reste déclaré pour qu'arreterSondageNotifs
// ait quelque chose à annuler si un jour la cloche reprend un sondage à elle.
let notifsMinuteur = null;
let notifsListe = [];
let notifsNonLues = 0;
// Le plus grand identifiant déjà annoncé au système. Sert à ne pas refaire
// sonner une bulle pour ce qu'on a déjà montré.
let notifsAnnoncees = 0;

// ---- Les phrases ------------------------------------------------------------

/**
 * Le détail d'une notification.
 *
 * Le serveur ne stocke QUE le nom de la personne dans le titre. Les Pokémon
 * n'y sont pas : en base ils n'existent que sous leur identifiant d'espèce
 * (« mr-mime »), et la langue d'affichage est un réglage de cette machine —
 * une phrase figée à l'écriture serait fausse pour qui lit dans l'autre
 * langue, ou après avoir changé de réglage. On la compose donc ici, à partir
 * de l'échange que l'API renvoie avec.
 */
function notifDetail(n){
  if(n.jeDonne && n.jeRecois){
    const quoi = trocNom(n.jeRecois) + ' contre ' + trocNom(n.jeDonne);
    return n.dex ? quoi + '  ·  sur ' + trocJeuNom(n.dex) : quoi;
  }
  return n.detail || '';
}

// LE NOM D'UNE ICONE, ET NON SON DESSIN. Le tableau portait des caracteres —
// dont deux emojis, rendus par la police du systeme en pastilles brillantes au
// milieu d'une liste sobre. Voir l'en-tete de icones.js.
const NOTIF_ICONES = {
  echange: 'echange', echange_accepte: 'coche', echange_refuse: 'croix',
  echange_fait: 'poignee', message: 'bulle',
};

// ---- La pastille ------------------------------------------------------------

function majPastilleCloche(){
  if(!clochePastille || !clocheBtn) return;
  clochePastille.hidden = notifsNonLues === 0;
  clochePastille.textContent = notifsNonLues > 9 ? '9+' : String(notifsNonLues);
  clocheBtn.title = notifsNonLues
    ? notifsNonLues + (notifsNonLues > 1 ? ' choses nouvelles' : ' chose nouvelle')
    : 'Ce qui est arrivé';
}

// ---- Le panneau -------------------------------------------------------------

function dessinerCloche(){
  if(!clocheListe) return;
  clocheListe.innerHTML = '';

  if(!notifsListe.length){
    clocheListe.innerHTML = '<div class="state-msg">Rien pour l’instant.</div>';
    return;
  }

  notifsListe.forEach(function(n){
    const ligne = document.createElement('button');
    ligne.type = 'button';
    ligne.className = 'cloche-ligne' + (n.lu ? '' : ' neuve');

    const icone = document.createElement('span');
    icone.className = 'cloche-icone';
    icone.innerHTML = iconeHtml(NOTIF_ICONES[n.genre] || 'bulle', 16);
    ligne.appendChild(icone);

    const corps = document.createElement('span');
    corps.className = 'cloche-corps';
    const titre = document.createElement('span');
    titre.className = 'cloche-titre';
    titre.textContent = n.titre;
    corps.appendChild(titre);

    const detail = notifDetail(n);
    if(detail){
      const d = document.createElement('span');
      d.className = 'cloche-detail';
      d.textContent = detail;
      corps.appendChild(d);
    }
    if(typeof dateLisible === 'function'){
      const quand = document.createElement('span');
      quand.className = 'cloche-quand';
      quand.textContent = dateLisible(n.quand);
      corps.appendChild(quand);
    }
    ligne.appendChild(corps);

    ligne.addEventListener('click', function(){ allerVersNotif(n); });
    clocheListe.appendChild(ligne);
  });
}

/**
 * Là où mène une notification.
 *
 * Une discussion s'ouvre directement — c'est ce qu'on venait faire. Le reste
 * mène à la page des amis, où l'échange est en tête de liste avec ses boutons :
 * ouvrir une pop-up « accepter / refuser » par-dessus le panneau empilerait
 * deux couches pour une décision qui tient dans la liste.
 */
function allerVersNotif(n){
  fermerCloche();

  // UN MESSAGE OUVRE LA PAGE DES MESSAGES. Toujours, et sans fenêtre par-dessus.
  //
  // Il y avait trois chemins ici, dont un menait à l'ancienne fenêtre de
  // discussion d'un échange — celle qui n'existe plus. Il n'en reste qu'un :
  // la notification porte le pseudo de qui a écrit, message direct ou message
  // d'échange, et l'on va à SA conversation.
  //
  // Sans pseudo — une notification d'avant cette version — on ouvre la page sur
  // sa liste plutôt que d'échouer : la conversation y est, en tête.
  if(n.genre === 'message' && typeof ouvrirMessagerie === 'function'){
    ouvrirMessagerie(n.de || null);
    return;
  }

  // Une proposition mène à la page des amis, où elle est en tête de liste avec
  // ses boutons : ouvrir une fenêtre « accepter / refuser » par-dessus
  // empilerait deux couches pour une décision qui tient dans la liste.
  showPage('amis');
}

function ouvrirCloche(){
  if(!clochePanneau) return;
  clochePanneau.classList.add('ouvert');
  clocheBtn.setAttribute('aria-expanded', 'true');
  clocheListe.innerHTML = '<div class="state-msg">Chargement…</div>';
  // On relit en ouvrant : la pastille peut dater de deux minutes.
  verifierNotifs(true);
}

function fermerCloche(){
  if(!clochePanneau) return;
  clochePanneau.classList.remove('ouvert');
  if(clocheBtn) clocheBtn.setAttribute('aria-expanded', 'false');
}

// ---- Le sondage -------------------------------------------------------------

/**
 * Regarde ce qui est arrivé.
 *
 * `enOuvrant` distingue les deux appels : le sondage de fond se contente de la
 * pastille et d'une bulle, l'ouverture du panneau redessine et marque comme lu.
 *
 * L'ORDRE COMPTE, comme pour les amis : on montre D'ABORD, on marque ensuite.
 * Si l'application se ferme entre les deux, on reverra la notification — un
 * doublon se pardonne, une proposition jamais vue ne se rattrape pas.
 */
async function verifierNotifs(enOuvrant, deja){
  if(typeof invoke !== 'function') return;
  if(typeof dresseurCourant !== 'undefined' && !dresseurCourant) return;

  // `deja` arrive de la veille commune, qui a demandé pour deux. Sans elle —
  // ouverture du panneau, marquage manuel — on demande pour son compte.
  let r = deja;
  if(!r){
    try{
      r = await invoke('notifications');
    }catch(e){
      // Hors ligne, ou session expirée : on se tait. Un sondage de fond n'a pas
      // à faire surgir une erreur que personne n'a demandée.
      if(enOuvrant && clocheListe){
        clocheListe.innerHTML = '<div class="state-msg">Indisponible pour le moment.</div>';
      }
      return;
    }
  }

  notifsListe = (r && r.notifications) || [];
  notifsNonLues = (r && r.nonLues) || 0;
  majPastilleCloche();

  await sonner();

  if(enOuvrant){
    dessinerCloche();
    await marquerCloche();
  }
}

/** Une bulle du système pour ce qui vient d'arriver, jamais deux fois. */
async function sonner(){
  const neuves = notifsListe.filter(function(n){
    return !n.lu && n.id > notifsAnnoncees;
  });
  if(!neuves.length) return;
  notifsAnnoncees = Math.max.apply(null, neuves.map(function(n){ return n.id; }));

  // La cloche remue : c'est visible même quand les bulles du système sont
  // refusées, et c'est le seul signe pour qui garde l'application au premier
  // plan.
  if(clocheBtn){
    clocheBtn.classList.remove('sonne');
    // Forcer le navigateur à reprendre l'animation : sans cette lecture, le
    // retrait et l'ajout dans le même tour ne relancent rien.
    void clocheBtn.offsetWidth;
    clocheBtn.classList.add('sonne');
  }

  if(typeof pontNotif !== 'function') return;
  const pont = pontNotif();
  if(!pont) return;
  if(typeof bullePermise === 'function' && !(await bullePermise(pont))) return;

  // Au plus trois : revenir après une semaine ne doit pas ensevelir le bureau.
  neuves.slice(0, 3).forEach(function(n){
    try{ pont.sendNotification({ title: n.titre, body: notifDetail(n) }); }
    catch(e){ /* une bulle refusée n'empêche pas les suivantes */ }
  });
}

async function marquerCloche(){
  if(!notifsListe.length) return;
  // Le plus grand identifiant AFFICHÉ, et pas « tout » : ce qui arrive pendant
  // qu'on lit reste non lu plutôt que d'être avalé sans avoir été vu.
  const jusqua = Math.max.apply(null, notifsListe.map(function(n){ return n.id; }));
  try{
    const r = await invoke('notifications_lues', { jusqua: jusqua });
    notifsNonLues = (r && r.nonLues) || 0;
    notifsListe.forEach(function(n){ if(n.id <= jusqua) n.lu = true; });
    majPastilleCloche();
  }catch(e){ /* on réessaiera à la prochaine ouverture */ }
}

/**
 * Ce que la veille commune rapporte pour la cloche.
 *
 * LE SONDAGE PROPRE À NOTIFS.JS N'EXISTE PLUS. Il tournait à la même cadence que
 * celui des amis, décalé d'une seconde : deux allers-retours toutes les deux
 * minutes pour une seule cadence. C'est amis.js qui appelle désormais, une fois,
 * et qui distribue — voir veiller().
 */
function recevoirVeille(notifications, messagesNonLus){
  verifierNotifs(false, notifications);
  if(typeof majPastilleMessages === 'function') majPastilleMessages(messagesNonLus);
}

function arreterSondageNotifs(){
  if(notifsMinuteur){ clearInterval(notifsMinuteur); notifsMinuteur = null; }
}

// ---- Le câblage -------------------------------------------------------------

if(clocheBtn){
  // PAS DE stopPropagation() ICI. Il ne protegeait que la fermeture ci-dessous
  // — role repris par l'exception sur clocheBtn — et il rendait aveugles les
  // fermetures des autres menus : cloche ouverte, un clic sur elle laissait le
  // menu du compte ouvert derriere.
  clocheBtn.addEventListener('click', function(){
    if(clochePanneau.classList.contains('ouvert')) fermerCloche();
    else ouvrirCloche();
  });
}
// La cloche elle-meme. Posee ici et non dans le HTML : le dessin vit dans
// icones.js, et le recopier en dur dans la page en ferait une seconde copie a
// tenir d'accord.
const clocheDessin = document.getElementById('clocheDessin');
if(clocheDessin) clocheDessin.innerHTML = iconeHtml('cloche', 19);

if(clocheToutLu){
  clocheToutLu.addEventListener('click', async function(){
    try{
      const r = await invoke('notifications_lues', {});
      notifsNonLues = (r && r.nonLues) || 0;
      notifsListe.forEach(function(n){ n.lu = true; });
      majPastilleCloche();
      dessinerCloche();
    }catch(e){ /* sans effet visible : la pastille reste, on réessaiera */ }
  });
}
// UN CLIC AILLEURS REFERME — ET ON ECOUTE EN CAPTURE.
//
// Cette fermeture ecoutait le bouillonnement, et ne s'executait donc que si
// personne n'arretait le clic en chemin. Or le badge du compte, a deux
// centimetres de la cloche dans le meme en-tete, appelait stopPropagation()
// sur le sien : cloche ouverte, un clic sur l'avatar n'atteignait jamais
// document, et le panneau restait ouvert derriere le menu du compte. Les cinq
// fermetures « clic ailleurs » du projet se rendaient mutuellement aveugles de
// cette facon, chacune n'ayant fait que se proteger elle-meme.
//
// La capture descend depuis document AVANT d'atteindre la cible : aucun
// stopPropagation() pose en route ne peut plus nous empecher de fermer. En
// echange elle nous montre aussi le clic sur la cloche elle-meme, avant son
// propre gestionnaire — d'ou l'exception ci-dessous. Sans elle on fermerait
// juste avant que le bouton ne rouvre, et la cloche ne s'ouvrirait plus.
document.addEventListener('click', function(e){
  if(!clochePanneau || !clochePanneau.classList.contains('ouvert')) return;
  if(clochePanneau.contains(e.target)) return;
  if(clocheBtn && clocheBtn.contains(e.target)) return;
  fermerCloche();
}, true);
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && clochePanneau
     && clochePanneau.classList.contains('ouvert')) fermerCloche();
});
