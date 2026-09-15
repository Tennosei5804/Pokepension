// Qui a le droit d'ouvrir le Pokédex de PixelmonWorld.
//
// Script classique (pas de module ES), chargé après pixelmonworld.js dont il
// lit les droits, et après compte.js pour `invoke`.
//
// ─── CE QUE CE PANNEAU FAIT, ET RIEN D'AUTRE ──────────────────────────────────
//
// Ouvrir l'accès à quelqu'un, le fermer, le rouvrir, le retirer. C'est tout.
//
// Il ne modifie NI zone, NI sous-zone, NI apparition : celles-ci viennent
// entièrement du Pokédex de PixelmonWorld, relevé par
// `cd app && py outils/relever-pixelmonworld.py` et versé en base par
// `api/outils/importer-pixelmonworld.js`. Une seconde façon de les écrire
// serait une seconde vérité à tenir d'accord avec le relevé.
//
// ─── DEUX FAÇONS D'AJOUTER QUELQU'UN ──────────────────────────────────────────
//
// Par la liste des dresseurs connus, d'un clic : la personne s'est déjà
// connectée, son identifiant Discord est en base, et le recopier à la main
// serait une occasion de se tromper d'un chiffre.
//
// Par son identifiant, collé à la main : elle n'est jamais venue. L'accès
// l'attend alors, et s'applique à sa première connexion — c'est pourquoi la
// table garde l'identifiant Discord et non l'identifiant de dresseur.
//
// ─── FERMER N'EST PAS RETIRER ────────────────────────────────────────────────
//
// Fermer éteint la ligne et la garde : on rouvre d'un clic, sans recoller
// l'identifiant ni se rappeler qui c'était. Retirer l'efface pour de bon, et
// demande donc confirmation.

let pwAccesListe = null;      // ce que l'API a rendu, tel quel
let pwAccesDresseurs = null;  // les dresseurs connus, chargés à la demande
let pwAccesOuvert = false;

function pwAccesPanneau(){ return document.getElementById('pwPanneau'); }

/** Jamais de HTML construit à la main : les pseudos viennent des joueurs. */
function pwTexte(balise, classe, contenu){
  const el = document.createElement(balise);
  if(classe) el.className = classe;
  if(contenu !== undefined) el.textContent = contenu;
  return el;
}

async function pwAccesCharger(){
  pwAccesListe = await invoke('pw_acces');
  return pwAccesListe;
}

/**
 * Le jour où quelqu'un s'est connecté pour la dernière fois, en clair.
 *
 * Une ligne sans dresseur n'est PAS une erreur : c'est un accès posé d'avance,
 * pour quelqu'un qui n'est pas encore venu. Le dire évite qu'on le supprime en
 * croyant à une faute de frappe.
 */
function pwAccesQuand(a){
  if(!a.pseudo) return 'jamais connecté';
  if(!a.vu_le) return 'connecté';
  // jourLisible() existe déjà dans l'application : on ne redate pas à côté.
  if(typeof jourLisible === 'function') return 'vu ' + jourLisible(a.vu_le);
  return 'vu le ' + String(a.vu_le).slice(0, 10);
}

function pwAccesLigne(a){
  const ligne = pwTexte('div', 'pw-acces-ligne' + (a.actif ? '' : ' eteint'));

  const qui = pwTexte('div', 'pw-acces-qui');
  // Le pseudo quand on le connaît, le libellé donné au moment de l'ajout
  // sinon — « utilisateur 9 » —, et l'identifiant nu en dernier recours.
  const nom = pwTexte('span', 'pw-acces-nom',
    a.pseudo || a.libelle || a.discord_id);
  qui.appendChild(nom);
  if(a.libelle && a.pseudo){
    qui.appendChild(pwTexte('span', 'pw-acces-libelle', a.libelle));
  }
  const dessous = pwTexte('div', 'pw-acces-id',
    a.discord_id + ' · ' + pwAccesQuand(a));
  qui.appendChild(dessous);
  ligne.appendChild(qui);

  const etat = pwTexte('span', 'pw-acces-etat', a.actif ? 'Ouvert' : 'Fermé');
  ligne.appendChild(etat);

  const bascule = pwTexte('button', 'toggle-btn', a.actif ? 'Fermer' : 'Rouvrir');
  bascule.type = 'button';
  bascule.title = a.actif
    ? 'Il ne verra plus le Pokédex. La ligne reste, pour rouvrir d’un clic.'
    : 'Il reverra le Pokédex.';
  bascule.addEventListener('click', async function(){
    bascule.disabled = true;
    try{
      await invoke('pw_acces_basculer', { id: a.id, actif: !a.actif });
      await pwAccesDessiner();
    }catch(e){
      pwAccesErreur(e);
      bascule.disabled = false;
    }
  });
  ligne.appendChild(bascule);

  const retirer = pwTexte('button', 'toggle-btn danger', 'Retirer');
  retirer.type = 'button';
  retirer.title = 'Efface la ligne. « Fermer » suffit si c’est temporaire.';
  retirer.addEventListener('click', async function(){
    // La confirmation de l'application, pas celle du navigateur : c'est la
    // même dans tout le projet, et window.confirm ne s'affiche pas dans la
    // fenêtre Tauri.
    const ok = typeof demanderConfirmation === 'function'
      ? await demanderConfirmation({
          eyebrow: 'PixelmonWorld',
          titre: 'Retirer cet accès ?',
          note: 'Il perdra l’accès au Pokédex, et la ligne sera effacée. '
            + '« Fermer » suffit si c’est temporaire — elle se rouvre alors '
            + 'd’un clic.',
          libelleAction: 'Retirer',
          danger: true })
      : true;
    if(!ok) return;
    try{
      await invoke('pw_acces_retirer', { id: a.id });
      await pwAccesDessiner();
    }catch(e){ pwAccesErreur(e); }
  });
  ligne.appendChild(retirer);

  return ligne;
}

function pwAccesErreur(e){
  const message = (e && (e.message || e)) || 'Erreur inconnue';
  if(typeof prevenirErreur === 'function'){
    prevenirErreur('Accès PixelmonWorld', String(message));
  } else {
    console.error('pw : ', message);
  }
}

/** Le formulaire d'ajout : un identifiant, un libellé, un bouton. */
function pwAccesFormulaire(){
  const bloc = pwTexte('div', 'pw-acces-ajout');

  const id = document.createElement('input');
  id.type = 'text';
  id.id = 'pwAccesId';
  id.placeholder = 'Identifiant Discord (suite de chiffres)';
  id.setAttribute('aria-label', 'Identifiant Discord');
  id.autocomplete = 'off';

  const libelle = document.createElement('input');
  libelle.type = 'text';
  libelle.id = 'pwAccesLibelle';
  libelle.placeholder = 'Nom donné ici (facultatif) — « utilisateur 9 »';
  libelle.setAttribute('aria-label', 'Nom donné à cette personne');
  libelle.autocomplete = 'off';

  const poser = pwTexte('button', 'toggle-btn', '＋ Ouvrir l’accès');
  poser.type = 'button';
  poser.addEventListener('click', async function(){
    const valeur = id.value.trim();
    if(!valeur) return;
    poser.disabled = true;
    try{
      await invoke('pw_acces_poser', { discordId: valeur, libelle: libelle.value.trim() });
      id.value = '';
      libelle.value = '';
      await pwAccesDessiner();
    }catch(e){ pwAccesErreur(e); }
    poser.disabled = false;
  });
  // Entrée vaut le bouton : on colle un identifiant, on valide.
  id.addEventListener('keydown', function(ev){ if(ev.key === 'Enter') poser.click(); });
  libelle.addEventListener('keydown', function(ev){ if(ev.key === 'Enter') poser.click(); });

  bloc.appendChild(id);
  bloc.appendChild(libelle);
  bloc.appendChild(poser);

  const aide = pwTexte('p', 'pw-acces-aide',
    'Sur Discord : Paramètres → Avancés → Mode développeur, puis clic droit '
    + 'sur la personne → « Copier l’identifiant ». L’accès peut être ouvert '
    + 'avant sa première connexion.');
  bloc.appendChild(aide);
  return bloc;
}

/**
 * Les dresseurs connus, en un clic.
 *
 * Chargés seulement quand on déplie la liste : la plupart du temps on vient
 * pour fermer un accès, pas pour en ouvrir un, et soixante lignes de plus
 * n'auraient servi à personne.
 */
function pwAccesConnus(){
  const bloc = pwTexte('div', 'pw-acces-connus');
  const bouton = pwTexte('button', 'toggle-btn', '👥 Choisir parmi ceux qui se sont connectés');
  bouton.type = 'button';
  bouton.setAttribute('aria-expanded', 'false');
  const liste = pwTexte('div', 'pw-acces-connus-liste');
  liste.hidden = true;

  bouton.addEventListener('click', async function(){
    const ouvre = liste.hidden;
    bouton.setAttribute('aria-expanded', String(ouvre));
    liste.hidden = !ouvre;
    if(!ouvre || pwAccesDresseurs) return;
    liste.textContent = 'Chargement…';
    try{
      pwAccesDresseurs = await invoke('pw_acces_dresseurs', { recherche: '' });
    }catch(e){
      liste.textContent = 'Liste indisponible.';
      return;
    }
    liste.textContent = '';
    if(!pwAccesDresseurs.length){
      liste.appendChild(pwTexte('p', 'pw-acces-aide', 'Personne ne s’est encore connecté.'));
      return;
    }
    pwAccesDresseurs.forEach(function(d){
      const item = pwTexte('button', 'pw-acces-connu', d.pseudo);
      item.type = 'button';
      // DÉJÀ OUVERT : on le dit et on n'y touche pas. Le reproposer ferait
      // croire qu'on peut l'ouvrir deux fois.
      if(d.actif){
        item.disabled = true;
        item.appendChild(pwTexte('span', 'pw-acces-deja', 'déjà ouvert'));
      }
      item.addEventListener('click', async function(){
        try{
          await invoke('pw_acces_poser', { discordId: d.discord_id, libelle: d.pseudo });
          pwAccesDresseurs = null;
          await pwAccesDessiner();
        }catch(e){ pwAccesErreur(e); }
      });
      liste.appendChild(item);
    });
  });

  bloc.appendChild(bouton);
  bloc.appendChild(liste);
  return bloc;
}

async function pwAccesDessiner(){
  const panneau = pwAccesPanneau();
  if(!panneau) return;
  panneau.textContent = '';

  const titre = pwTexte('div', 'pw-acces-titre', 'Accès au Pokédex PixelmonWorld');
  panneau.appendChild(titre);

  try{
    await pwAccesCharger();
  }catch(e){
    panneau.appendChild(pwTexte('p', 'pw-acces-aide',
      'La liste des accès n’a pas pu être lue.'));
    return;
  }

  panneau.appendChild(pwAccesFormulaire());
  panneau.appendChild(pwAccesConnus());

  const ouverts = pwAccesListe.filter(function(a){ return a.actif; }).length;
  panneau.appendChild(pwTexte('p', 'pw-acces-compte',
    pwAccesListe.length
      ? ouverts + ' accès ouvert' + (ouverts > 1 ? 's' : '')
        + (pwAccesListe.length > ouverts
            ? ' · ' + (pwAccesListe.length - ouverts) + ' fermé'
              + (pwAccesListe.length - ouverts > 1 ? 's' : '')
            : '')
      : 'Personne n’a encore l’accès. Toi seul vois ce Pokédex.'));

  const liste = pwTexte('div', 'pw-acces-liste');
  pwAccesListe.forEach(function(a){ liste.appendChild(pwAccesLigne(a)); });
  panneau.appendChild(liste);
}

(function(){
  const bouton = document.getElementById('pwAccesBascule');
  if(!bouton) return;
  bouton.addEventListener('click', async function(){
    const panneau = pwAccesPanneau();
    if(!panneau) return;
    pwAccesOuvert = !pwAccesOuvert;
    panneau.hidden = !pwAccesOuvert;
    bouton.setAttribute('aria-expanded', String(pwAccesOuvert));
    if(pwAccesOuvert) await pwAccesDessiner();
  });
})();
