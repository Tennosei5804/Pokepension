// Menus deroulants stylises.
// Script classique (pas de module ES) : l'app reste ouvrable en file://

// La liste ouverte d'un <select> natif est dessinee par le systeme : ni sa
// forme, ni ses couleurs, ni son surlignage ne sont modifiables en CSS. On
// garde donc le <select> — invisible mais bien present, pour que tout le reste
// du code continue de lire sa .value — et on affiche par-dessus un bouton et
// une liste que l'on maitrise entierement.
const enhancedSelects = [];

// UN SEUL RENDU, POUR TOUS LES MENUS.
//
// Une molette aimantee a existe ici pour les longues listes ; elle est partie.
// Deux rendus pour un meme controle, c'etait deux comportements a apprendre
// selon le nombre d'options — et le nombre d'options n'est pas quelque chose
// que l'on voit avant d'avoir ouvert. La liste plate vaut pour trois entrees
// comme pour cent : on la lit d'un coup, elle defile si besoin, et le clavier
// s'y comporte partout pareil.
//
// Elle reste dans l'historique si le besoin revient.

function enhanceSelect(sel){
  const wrap = document.createElement('div');
  wrap.className = 'select-wrap';
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.classList.add('select-native');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'select-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  if(sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));

  const label = document.createElement('span');
  label.className = 'select-label';
  const arrow = document.createElement('span');
  arrow.className = 'select-arrow';
  btn.appendChild(label);
  btn.appendChild(arrow);

  const list = document.createElement('div');
  list.className = 'select-list';
  list.setAttribute('role', 'listbox');

  wrap.appendChild(btn);
  wrap.appendChild(list);

  function sync(){
    const opt = sel.options[sel.selectedIndex];
    label.textContent = opt ? opt.textContent : '';
    btn.disabled = sel.disabled;
    btn.classList.toggle('filtering', sel.classList.contains('filtering'));
  }

  function close(){
    wrap.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  // Les options reellement proposables. « N° du jeu » disparait hors d'un jeu,
  // et les types se chargent a la demande : la liste n'est jamais figee.
  function optionsVisibles(){
    return Array.prototype.filter.call(sel.options, function(opt){
      return !opt.hidden && !opt.disabled;
    });
  }

  // Le seul endroit qui ecrit dans le <select>. Le garde sur l'egalite evite de
  // signaler un changement qui n'en est pas un — la molette repasse par la
  // valeur courante des qu'on la fait osciller.
  function choisir(valeur){
    if(sel.value === valeur) return;
    sel.value = valeur;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    sync();
  }

  // ---- La liste plate, pour les menus courts -------------------------------

  function dessinerListe(options){
    list.className = 'select-list';
    list.innerHTML = '';
    options.forEach(function(opt){
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'select-item' + (opt.value === sel.value ? ' selected' : '');
      item.textContent = opt.textContent;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(opt.value === sel.value));
      item.addEventListener('click', function(){
        close();
        choisir(opt.value);
      });
      list.appendChild(item);
    });
    const current = list.querySelector('.selected');
    if(current) current.focus();
  }

  // ---- L'ouverture ---------------------------------------------------------

  function open(){
    // Un seul menu ouvert a la fois.
    enhancedSelects.forEach(function(o){ if(o.wrap !== wrap) o.close(); });
    // AVANT de dessiner : la molette se mesure, et un element masque n'a pas de
    // hauteur. Ouvrir d'abord, remplir ensuite.
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');

    // La liste est reconstruite a chaque ouverture : les options changent
    // (types charges a la demande, « N° du jeu » masque hors d'un jeu).
    dessinerListe(optionsVisibles());
  }

  btn.addEventListener('click', function(){
    if(wrap.classList.contains('open')) close(); else open();
  });
  btn.addEventListener('keydown', function(e){
    if(e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); }
  });
  list.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){ close(); btn.focus(); return; }
    const items = Array.prototype.slice.call(list.querySelectorAll('.select-item'));
    const i = items.indexOf(document.activeElement);
    if(e.key === 'ArrowDown'){ e.preventDefault(); (items[i + 1] || items[0]).focus(); }
    if(e.key === 'ArrowUp'){ e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
  });

  sel.addEventListener('change', sync);
  enhancedSelects.push({ wrap: wrap, sync: sync, close: close });
  sync();
}

// Une valeur changee par le code (reinitialisation des filtres, bascule
// d'onglet) ne declenche pas d'evenement : on resynchronise a la demande.
function syncSelects(){
  enhancedSelects.forEach(function(o){ o.sync(); });
}

// En capture, comme les autres fermetures « clic ailleurs » du projet (la
// raison est écrite au long dans notifs.js) : une liste déroulante ouverte
// doit se refermer même quand le clic est arrêté en chemin.
document.addEventListener('click', function(e){
  if(!e.target.closest || !e.target.closest('.select-wrap')){
    enhancedSelects.forEach(function(o){ o.close(); });
  }
}, true);

// Tous les menus de l'application, sans exception. La liste native est
// dessinée par le système et ne se laisse ni colorer ni arrondir — d'où ce
// remplacement.
//
// C'était une liste tenue à la main, et elle a dérivé trois fois : chaque
// nouveau menu ressortait en gris système au milieu du reste, jusqu'à ce qu'on
// pense à l'ajouter ici. Le document sait quels menus il contient, pas nous.
//
// ET LE DOCUMENT CHANGE APRES LE CHARGEMENT. Balayer une fois au demarrage
// laissait dehors tout menu construit en JavaScript : celui des jeux dans la
// fiche de capture, vingt-quatre choix, et celui des boites dans la vue
// grille, quarante et quelques. Tous deux sortaient en gris systeme au milieu
// de molettes — la derive d'avant, deplacee du fichier vers le temps.
//
// L'observateur ferme la porte pour de bon : un <select> qui entre dans la
// page est habille, qu'il vienne du HTML ou d'un createElement, aujourd'hui ou
// dans six mois. Personne n'a plus rien a penser a appeler.
// Le garde d'idempotence ne tient aucun registre : enhanceSelect() pose
// lui-meme la classe `select-native` sur le menu qu'il vient d'habiller, et
// cette marque suffit a le reconnaitre. Une liste parallele aurait ete un
// second etat a tenir d'accord avec le premier.
function habiller(sel){
  if(sel.classList.contains('select-native')) return;
  enhanceSelect(sel);
}

function habillerDans(racine){
  if(racine.nodeType !== 1) return;
  if(racine.tagName === 'SELECT') habiller(racine);
  else racine.querySelectorAll('select').forEach(habiller);
}

habillerDans(document.body);

// enhanceSelect() insere lui-meme des noeuds : sans le garde du WeakSet,
// l'observateur se rappellerait indefiniment sur son propre travail.
new MutationObserver(function(lots){
  lots.forEach(function(lot){
    lot.addedNodes.forEach(habillerDans);
  });
}).observe(document.body, { childList: true, subtree: true });
