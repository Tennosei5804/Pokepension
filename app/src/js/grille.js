// Grille, modales pseudo et profils, apercu d un Pokemon.
// Script classique (pas de module ES) : l'app reste ouvrable en file://

function renderList(reset){
  // La vue boîtes ne pagine pas et ne filtre pas : elle a son propre dessin,
  // et il vaut mieux le dire ici que d'émailler la suite de conditions.
  if(typeof vueBoites !== 'undefined' && vueBoites){
    if(typeof majJetonsEtFiltres === 'function') majJetonsEtFiltres();
    renderBoites();
    return;
  }
  listEl.classList.remove('en-boites');
  if(boiteNav) boiteNav.hidden = true;

  if(reset){
    currentFiltered = getFiltered();
    // Ce que la recherche a compris. Elle se met à jour au même moment que la
    // liste, sans quoi la ligne dirait l'analyse d'avant.
    if(typeof majJetonsEtFiltres === 'function') majJetonsEtFiltres();
    renderedCount = 0;
    lastGenHeader = null;
    listEl.innerHTML = '';
  }
  if(currentFiltered.length === 0){
    listEl.innerHTML = '<div class="state-msg">Aucun Pokémon ne correspond à ta recherche.</div>';
    loadMoreBtn.style.display = 'none';
    updateBulkBar();
    return;
  }
  // Un Pokédex de jeu affiche les pastilles d'obtention : on demande la
  // réserve des lieux au premier dessin, et la grille se redessine seule quand
  // elle arrive.
  if(typeof gameByKey !== 'undefined' && gameByKey[currentTab]
     && typeof assurerLieux === 'function') assurerLieux();

  const showHeaders = sortEl.value === 'gen';
  const fragment = document.createDocumentFragment();
  const next = currentFiltered.slice(renderedCount, renderedCount + BATCH_SIZE);
  next.forEach(function(entry){
    if(showHeaders && entry.gen !== lastGenHeader){
      const header = document.createElement('div');
      header.className = 'gen-header';
      header.textContent = genHeaderLabel(entry.gen);
      fragment.appendChild(header);
      lastGenHeader = entry.gen;
    }
    fragment.appendChild(renderCard(entry));
  });
  listEl.appendChild(fragment);
  if(typeof majLegendeObtention === 'function') majLegendeObtention();
  renderedCount += next.length;
  loadMoreBtn.style.display = renderedCount < currentFiltered.length ? 'block' : 'none';
  updateBulkBar();
  // Une seule case atteignable au Tab, après chaque dessin.
  poserTabulation(null);
}

// ---- Le clavier dans la grille ---------------------------------------------
//
// Une grille de mille deux cent quatre-vingt-une cartes se parcourt aux
// flèches. Jusqu'ici elle ne se parcourait qu'à la souris : hors des modales,
// la seule touche traitée dans toute l'application était Échap.
//
// LA CASE À COCHER PORTE LE FOCUS, et non la carte. C'est elle qui a déjà la
// bonne sémantique et le bon libellé — « Capturé — forme normale : Pikachu » —
// et l'espace la bascule tout seul, sans qu'on ait à réécrire ce que le
// navigateur fait mieux.
//
// TABULATION MOBILE : une seule case est atteignable au Tab, les autres
// portent -1. Sans cela, sortir de la grille au clavier demandait de traverser
// mille deux cent quatre-vingt-une cases une à une — c'était déjà le cas avant
// ce bloc, et c'était déjà une impasse.

function casesDeLaGrille(){
  return Array.prototype.slice.call(listEl.querySelectorAll('.chip-check input'));
}

// Le nombre de colonnes se mesure, il ne se calcule pas : la grille est en
// « auto-fill », et les en-têtes de génération occupent une rangée entière.
// On compte les cartes qui partagent le haut de la première.
function colonnesDeLaGrille(cartes){
  if(cartes.length < 2) return 1;
  const haut = cartes[0].getBoundingClientRect().top;
  let n = 1;
  while(n < cartes.length
        && Math.abs(cartes[n].getBoundingClientRect().top - haut) < 4) n++;
  return n;
}

// Une seule case atteignable au Tab : celle-ci. Appelée après chaque dessin,
// et à chaque déplacement.
function poserTabulation(cible){
  const cases = casesDeLaGrille();
  if(!cases.length) return;
  let choisie = cible && cases.indexOf(cible) !== -1 ? cible : null;
  // Sans cible, on garde celle qui l'était déjà : « Afficher plus » ajoute des
  // cartes et ne doit pas ramener le point d'entrée en haut de la grille.
  if(!choisie) choisie = cases.find(function(c){ return c.tabIndex === 0; }) || cases[0];
  cases.forEach(function(c){ c.tabIndex = c === choisie ? 0 : -1; });
}

function allerVersCase(depuis, pas){
  const cases = casesDeLaGrille();
  const i = cases.indexOf(depuis);
  if(i === -1) return;
  let cible = i + pas;
  // Au-delà de la dernière carte dessinée, on charge la suite plutôt que de
  // buter : la grille est paginée, et l'utilisateur ne le sait pas.
  if(cible >= cases.length && renderedCount < currentFiltered.length){
    renderList(false);
    const apres = casesDeLaGrille();
    if(cible >= apres.length) cible = apres.length - 1;
    if(apres[cible]){ poserTabulation(apres[cible]); apres[cible].focus(); }
    return;
  }
  cible = Math.max(0, Math.min(cases.length - 1, cible));
  poserTabulation(cases[cible]);
  cases[cible].focus();
  // « nearest » et non « center » : sur un déplacement d'une case, recentrer
  // ferait sauter toute la grille pour un pas de rien du tout.
  const carte = cases[cible].closest('.card');
  if(carte && carte.scrollIntoView) carte.scrollIntoView({ block: 'nearest' });
}

listEl.addEventListener('keydown', function(e){
  const boite = e.target && e.target.closest && e.target.closest('.chip-check input')
    ? e.target : null;
  if(!boite) return;
  if(e.altKey || e.ctrlKey || e.metaKey) return;

  const colonnes = colonnesDeLaGrille(casesDeLaGrille());
  let pas = null;
  if(e.key === 'ArrowRight') pas = 1;
  else if(e.key === 'ArrowLeft') pas = -1;
  else if(e.key === 'ArrowDown') pas = colonnes;
  else if(e.key === 'ArrowUp') pas = -colonnes;
  else if(e.key === 'PageDown') pas = colonnes * 4;
  else if(e.key === 'PageUp') pas = -colonnes * 4;

  if(pas !== null){
    e.preventDefault();
    allerVersCase(boite, pas);
    return;
  }

  if(e.key === 'Home' || e.key === 'End'){
    e.preventDefault();
    const cases = casesDeLaGrille();
    allerVersCase(boite, e.key === 'Home' ? -cases.length : cases.length);
    return;
  }

  // Entrée ouvre la fiche. L'espace, lui, n'est pas traité ici : il coche la
  // case, et c'est le navigateur qui le fait — le réécrire n'apporterait qu'un
  // risque de le faire moins bien.
  if(e.key === 'Enter'){
    e.preventDefault();
    const carte = boite.closest('.card');
    const img = carte && carte.querySelector('.card-sprite img');
    if(img) img.click();
    return;
  }

  // Échap rend la main à la recherche : c'est de là qu'on est parti.
  if(e.key === 'Escape'){
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
  }
});

// « / » saute à la recherche depuis n'importe où — sauf en train d'écrire,
// où c'est une barre oblique et rien d'autre.
document.addEventListener('keydown', function(e){
  if(e.key !== '/' || e.ctrlKey || e.altKey || e.metaKey) return;
  const ou = document.activeElement;
  const nom = ou && ou.tagName;
  if(nom === 'INPUT' || nom === 'TEXTAREA' || nom === 'SELECT'
     || (ou && ou.isContentEditable)) return;
  // Pas pendant qu'une modale est ouverte : le champ est derrière elle.
  if(document.querySelector('.modal-overlay[style*="flex"]')) return;
  // Le champ n'existe que sur un Pokédex : ailleurs, « / » reste une barre.
  if(currentPage !== 'dex') return;
  e.preventDefault();
  searchEl.focus();
  searchEl.select();
});

// Le pseudo vient du compte Discord ; l'en-tête et l'accueil s'y accordent.
function updatePlayerBadge(){
  playerNameText.textContent = playerName || 'Dresseur';
  homePlayerEl.textContent = playerName || 'Dresseur';
}

// escapeHtml sert encore à la fiche et à la visite d'un dresseur.
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

// ---- Aperçu d'un Pokémon ------------------------------------------------
// Le clic sur une carte agrandit le sprite. On réutilise la même chaîne de
// repli que la grille, en repartant du sprite déjà résolu quand il existe :
// l'image est alors déjà en cache et s'affiche instantanément.
// L'aperçu a sa propre bascule normal / shiny, indépendante de la vue de la
// grille : on veut pouvoir regarder un chromatique sans changer de mode.
let previewEntry = null;
let previewShiny = false;

// Deux sources pour le portrait : le sprite animé de Showdown, ou le rendu
// HOME. Un GIF ne sait pas se mettre en pause — si le système demande moins de
// mouvement, on ouvre sur le rendu fixe, le bouton restant disponible pour
// demander l'animation malgré tout.
let previewSource = window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'rendu' : 'anime';

function majBoutonsSource(){
  if(!portraitSource) return;
  portraitSource.querySelectorAll('button').forEach(function(b){
    b.classList.toggle('actif', b.dataset.source === previewSource);
  });
}

if(portraitSource){
  portraitSource.addEventListener('click', function(e){
    const b = e.target.closest('button[data-source]');
    if(!b || b.dataset.source === previewSource) return;
    previewSource = b.dataset.source;
    majBoutonsSource();
    dessinerPreviewImage(null);
  });
}

// Showdown ne sert pas ses GIF à une taille unique : Bulbizarre fait 45 × 49,
// Dracolosse 85 × 98, Kyogre 234 × 55. La fiche les posait tous en 170 × 196 —
// la taille relevée sur Dracolosse seul — ce qui gonflait les petits de quatre
// fois et écrasait Kyogre d'un rapport de 4,25:1 à 0,87:1.
//
// On double donc chaque sprite d'après SA taille. Quand le double déborderait
// du cadre, on se contente du facteur qui tient : mieux vaut un Lugia à 1,7×
// qu'un Lugia rogné. Le rapport est gardé dans les deux cas.
function dimensionnerSpriteAnime(){
  if(!previewFrame.classList.contains('anime')) return;
  const l = previewImg.naturalWidth, h = previewImg.naturalHeight;
  if(!l || !h) return;
  // La modale peut être encore masquée quand le GIF arrive : on retombe alors
  // sur la largeur que le CSS donne au portrait.
  const cadre = (previewFrame.clientWidth || 264) * 0.92;
  const haut  = (previewFrame.clientHeight || 264) * 0.92;
  const facteur = Math.min(2, cadre / l, haut / h);
  previewImg.style.width  = Math.round(l * facteur) + 'px';
  previewImg.style.height = Math.round(h * facteur) + 'px';
  // Le plus proche voisin ne sert que le double exact ; sur une réduction il
  // donne des pixels de tailles inégales, et le lissage rend mieux.
  previewFrame.classList.toggle('ajuste', facteur < 2);
}

function oublierDimensionAnime(){
  previewImg.style.width = '';
  previewImg.style.height = '';
  previewFrame.classList.remove('ajuste');
}

function dessinerPreviewImage(resolvedSrc){
  previewFrame.classList.toggle('chromatique', previewShiny);
  previewImg.alt = nomAffiche(previewEntry);
  previewImg.style.display = '';
  oublierDimensionAnime();
  majBoutonsSource();
  // La carte a peut-être déjà trouvé son image : on la réutilise (elle est en
  // cache, l'affichage est instantané). Sinon on rejoue la même cascade que la
  // grille, sans quoi la pop-up resterait sur une URL qui n'existe pas.
  const chain = [];
  // Le sprite animé passe devant quand on le demande. Il n'existe pas pour
  // toutes les formes : la chaîne habituelle reprend derrière, et la classe
  // « anime » ne tient que tant qu'on est sur cette première image.
  const anime = previewSource === 'anime'
    ? spriteAnimeUrl(toShowdownSlug(previewEntry.name), previewShiny) : null;
  if(anime) chain.push(anime);
  previewFrame.classList.toggle('anime', !!anime);
  if(resolvedSrc && resolvedSrc !== anime) chain.push(resolvedSrc);
  if(!previewEntry.spriteOnly){
    chain.push(pokeosHomeUrl(previewEntry.id, previewShiny));
    chain.push(officialArtworkUrl(previewEntry.id, previewShiny));
  }
  const slugs = previewEntry.spriteOnly
    ? showdownFormCandidates(previewEntry.name)
    : [toShowdownSlug(previewEntry.name)];
  slugs.forEach(function(s){ chain.push(showdownSpriteUrl(s, previewShiny)); });

  let step = 0;
  previewImg.onerror = function(){
    step++;
    // Dès qu'on quitte le sprite animé, l'image n'est plus un GIF doublé :
    // sans ça un rendu HOME héritait du rendu pixelisé et de sa taille calculée.
    previewFrame.classList.remove('anime');
    oublierDimensionAnime();
    if(step < chain.length) previewImg.src = chain[step];
    else previewImg.style.display = 'none';
  };
  // Le GIF ne dit sa taille qu'une fois chargé : c'est là qu'on la double.
  previewImg.onload = dimensionnerSpriteAnime;
  previewImg.src = chain[0];

  const gen = GEN_RANGES.find(function(g){ return g.gen === previewEntry.gen; });
  previewMeta.innerHTML = '';
  [
    'Pokédex national',
    null,                                   // la puce de génération, à part
    previewShiny ? 'forme chromatique' : 'forme normale'
  ].forEach(function(t, i){
    const el = document.createElement('span');
    if(i === 1){
      el.className = 'gen-puce';
      el.textContent = 'Gén. ' + previewEntry.gen;
    } else {
      el.textContent = t;
    }
    previewMeta.appendChild(el);
  });
}

function dessinerPreviewEtats(){
  previewStates.innerHTML = '';
  const modeApercu = infoMode(modeCourant());
  // La collection de l'onglet ouvert — sauf depuis PixelmonWorld, dont la fiche
  // ne parle que du serveur : elle lit alors la collection du serveur. Voir
  // pwSeauDeLaFiche() dans pixelmonworld.js.
  const seau = (typeof pwSeauDeLaFiche === 'function' && pwSeauDeLaFiche())
    || { caught: caughtSet, shiny: shinySet };
  [
    { cle:'normal', label:'Normal', ic:'disque',
      on: seau.caught.has(previewEntry.name), gold:false },
    { cle:'shiny',  label:'Shiny',  ic:'etincelle',
      on: seau.shiny.has(previewEntry.name),  gold:true }
  ].forEach(function(s){
    const el = document.createElement('button');
    el.type = 'button';
    const actif = (s.cle === 'shiny') === previewShiny;
    el.className = 'etat' + (s.on ? ' on' : '') + (s.gold ? ' or' : '')
      + (actif ? ' actif' : '');
    // La coche reste un caractère : c'est une marque d'état posée APRÈS le mot,
    // pas un pictogramme de commande, et elle suit déjà la police du bouton.
    boutonIcone(el, s.ic, s.label + (s.on ? ' ✓' : ''));
    // La coche dit « je l'ai » ; ce que « avoir » veut dire dépend de l'aventure.
    el.title = 'Afficher la forme ' + (s.cle === 'shiny' ? 'chromatique' : 'normale')
      + (s.on ? '  ·  ' + modeApercu.verbe : '');
    // Cliquer bascule l'image affichée, sans toucher à la progression.
    el.addEventListener('click', function(){
      previewShiny = (s.cle === 'shiny');
      dessinerPreviewImage(null);
      dessinerPreviewEtats();
    });
    previewStates.appendChild(el);
  });
}

function openPreview(entry, resolvedSrc){
  previewEntry = entry;
  previewShiny = shinyView;      // on ouvre sur la forme de la vue courante
  previewName.textContent = nomAffiche(entry);
  previewNo.textContent = '#' + String(entry.speciesId || entry.id).padStart(4, '0');
  dessinerPreviewImage(resolvedSrc);
  dessinerPreviewEtats();

  // « L'envoyer à quelqu'un » : caché là où il n'y a personne à qui écrire —
  // les pages de génération et un site sans compte n'ont pas de messagerie.
  if(ficheEnvoyer){
    // L'icone une seule fois : `boutonIcone` relit le texte courant, et la
    // reposer a chaque ouverture de fiche redessinerait le meme SVG mille fois.
    if(!ficheEnvoyer.classList.contains('avec-ic')) boutonIcone(ficheEnvoyer, 'bulle');
    const possible = typeof messagerieDisponible === 'function' && messagerieDisponible();
    ficheEnvoyer.hidden = !possible;
    // La carte qui les contient suit ses deux boutons : voir majFicheActions().
    if(typeof majFicheActions === 'function') majFicheActions();
    ficheEnvoyer.onclick = function(){
      closePreview();
      envoyerEspeceAQuelquun(entry.name);
    };
  }

  // La fiche de capture se referme d'un Pokémon à l'autre : la laisser ouverte
  // donnerait l'impression que les champs du précédent sont ceux du suivant.
  if(typeof reinitCapture === 'function') reinitCapture();

  previewOverlay.style.display = 'flex';
  setTimeout(function(){ previewClose.focus(); }, 10);
  // Types, première apparition et disponibilité arrivent après l'affichage :
  // la pop-up s'ouvre instantanément, les données se remplissent ensuite.
  remplirFiche(entry);
}

function closePreview(){
  previewOverlay.style.display = 'none';
  previewImg.removeAttribute('src');
  arreterCri();
}

previewClose.addEventListener('click', closePreview);
previewOverlay.addEventListener('click', function(e){
  if(e.target === previewOverlay) closePreview();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && previewOverlay.style.display === 'flex') closePreview();
});


// ---- La vue boîtes -----------------------------------------------------------
//
// En Living Dex, la question n'est pas « est-ce que je l'ai » mais « dans
// quelle boîte, quelle case ». Le mode existait — pa_profils.mode vaut
// « living » —, le rangement non : la grille coulait, et rien ne disait où se
// mettait le trou.
//
// TRENTE PAR BOÎTE, SIX PAR RANGÉE, comme la console. Ce n'est pas une
// coquetterie : c'est ce qui permet de compter les cases à l'œil et de
// retrouver la même place dans le jeu.
//
// LES FILTRES NE S'APPLIQUENT PAS ICI, et c'est le point délicat. Une boîte se
// lit par la PLACE d'un Pokémon ; masquer les manquants décalerait tout le
// monde d'un cran et la vue ne servirait plus à rien. Un manquant occupe donc
// sa case, simplement décoché — exactement comme la case vide qu'il laisse
// dans le jeu. La barre le dit, plutôt que de laisser croire à un filtre en
// panne.

const BOITE_TAILLE = 30;
let vueBoites = false;
let boiteCourante = 0;

const boitesBtn = document.getElementById('boitesBtn');
const boiteNav = document.getElementById('boiteNav');

// Le contenu d'une vue boîtes : le périmètre entier, trié, sans un filtre.
function entreesEnBoites(){
  return trierEntrees(scopeEntries.slice(), sortEl.value);
}

function nombreDeBoites(total){
  return Math.max(1, Math.ceil(total / BOITE_TAILLE));
}

function majBoutonBoites(){
  if(!boitesBtn) return;
  boitesBtn.setAttribute('aria-pressed', String(vueBoites));
  boitesBtn.textContent = vueBoites ? '📦 Vue liste' : '📦 Vue boîtes';
}

function dessinerNavBoites(total){
  if(!boiteNav) return;
  const combien = nombreDeBoites(total);
  boiteNav.hidden = false;
  boiteNav.innerHTML = '';

  const precedent = document.createElement('button');
  precedent.type = 'button';
  precedent.className = 'boite-fleche';
  precedent.textContent = '‹';
  precedent.title = 'Boîte précédente';
  precedent.disabled = boiteCourante <= 0;
  precedent.addEventListener('click', function(){ allerBoite(boiteCourante - 1); });
  boiteNav.appendChild(precedent);

  // Un menu plutôt que quarante-trois boutons : à mille deux cent quatre-vingt
  // entrées, la rangée déborderait sur trois lignes et l'on ne trouverait
  // plus rien — c'est exactement ce qui était arrivé aux onglets de jeu.
  const choix = document.createElement('select');
  choix.className = 'boite-choix';
  choix.setAttribute('aria-label', 'Aller à une boîte');
  const tout = entreesEnBoites();
  for(let i = 0; i < combien; i++){
    const debut = i * BOITE_TAILLE;
    const lot = tout.slice(debut, debut + BOITE_TAILLE);
    const pris = lot.filter(function(e){ return activeSet().has(e.name); }).length;
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = 'Boîte ' + (i + 1) + ' / ' + combien
      + '  ·  ' + pris + ' / ' + lot.length;
    if(i === boiteCourante) opt.selected = true;
    choix.appendChild(opt);
  }
  choix.addEventListener('change', function(){ allerBoite(parseInt(choix.value, 10)); });
  boiteNav.appendChild(choix);

  const suivant = document.createElement('button');
  suivant.type = 'button';
  suivant.className = 'boite-fleche';
  suivant.textContent = '›';
  suivant.title = 'Boîte suivante';
  suivant.disabled = boiteCourante >= combien - 1;
  suivant.addEventListener('click', function(){ allerBoite(boiteCourante + 1); });
  boiteNav.appendChild(suivant);

  const note = document.createElement('span');
  note.className = 'boite-note';
  note.textContent = 'Les filtres ne s\'appliquent pas : une boîte se lit par la place.';
  boiteNav.appendChild(note);
}

/**
 * Entre en vue boîtes, ou en sort.
 *
 * Extraite de l'écouteur du bouton : le plan de rangement doit pouvoir y
 * emmener depuis une fiche, et une fonction anonyme ne s'appelle pas.
 */
function basculerBoites(){
  vueBoites = !vueBoites;
  // On revient toujours à la première boîte en entrant : garder la boîte 27
  // d'un autre Pokédex n'aurait aucun sens.
  boiteCourante = 0;
  majBoutonBoites();
  renderList(true);
  listEl.scrollTop = 0;
}

function allerBoite(n){
  const tout = entreesEnBoites();
  const combien = nombreDeBoites(tout.length);
  boiteCourante = Math.max(0, Math.min(combien - 1, n));
  renderList(true);
  listEl.scrollTop = 0;
}

/**
 * Une boîte à l'écran.
 *
 * Les cartes sont exactement celles de la grille : renderCard() sait déjà
 * cocher, dessiner la pastille d'obtention et le témoin de l'autre forme.
 * Réécrire une carte de boîte aurait fait deux
 * cartes à tenir d'accord, et elles auraient divergé — c'est arrivé à chaque
 * fois que ce projet a recopié un rendu.
 */
function renderBoites(){
  const tout = entreesEnBoites();
  const combien = nombreDeBoites(tout.length);
  if(boiteCourante >= combien) boiteCourante = combien - 1;
  if(boiteCourante < 0) boiteCourante = 0;

  const debut = boiteCourante * BOITE_TAILLE;
  const lot = tout.slice(debut, debut + BOITE_TAILLE);

  // Les actions groupées portent sur la boîte affichée, et rien d'autre :
  // « Tout coché » remplit une boîte, ce qui est un geste qu'on comprend.
  currentFiltered = lot;
  renderedCount = lot.length;

  listEl.innerHTML = '';
  listEl.classList.add('en-boites');
  const fragment = document.createDocumentFragment();
  lot.forEach(function(entry, i){
    const carte = renderCard(entry);
    // Le numéro de case : c'est lui qu'on vient chercher, et il ne se déduit
    // ni du numéro national ni de celui du jeu.
    const place = document.createElement('span');
    place.className = 'card-case';
    place.textContent = String(debut + i + 1 - boiteCourante * BOITE_TAILLE);
    place.title = 'Boîte ' + (boiteCourante + 1) + ', case '
      + (i + 1) + ' — dans l\'ordre affiché';
    const cadre = carte.querySelector('.card-sprite');
    if(cadre) cadre.appendChild(place);
    fragment.appendChild(carte);
  });
  listEl.appendChild(fragment);

  loadMoreBtn.style.display = 'none';
  dessinerNavBoites(tout.length);
  if(typeof majLegendeObtention === 'function') majLegendeObtention();
  updateBulkBar();
  poserTabulation(null);
}

if(boitesBtn){
  boitesBtn.addEventListener('click', basculerBoites);
  majBoutonBoites();
}
