// Navigation entre pages et tableau de bord d accueil.
// Script classique (pas de module ES) : l'app reste ouvrable en file://

// ---- Pages ------------------------------------------------------------
// Chaque page est une <section> ; naviguer = changer laquelle porte .active.
// Pour en ajouter une : une <section class="page" id="page-x"> et un
// <button class="page-tab" data-page="x"> dans la nav, rien de plus.
let currentPage = 'home';

// Les jeux n'ont plus d'onglet chacun : à vingt, la barre débordait sur deux
// rangées et on ne trouvait plus rien. Ils vivent maintenant dans la page
// « Pokédex », qui les liste avec leur avancement.

// Combien d'espèces de ce jeu sont cochées, dans la collection du jeu.
//
// « source » permet de faire le même calcul sur le dex d'un autre dresseur :
// on lui passe alors { caught, shiny } construits depuis ce qu'a renvoyé
// l'API. Sans ce paramètre, c'est la collection locale qui répond.
async function avancementDuJeu(game, source){
  const b = source || bucketFor(game.key);
  const variant = game.regional;
  let total = 0, normal = 0, shiny = 0;

  if(variant.upTo){
    poolEntries().forEach(function(e){
      if(e.speciesId > variant.upTo) return;
      total++;
      if(b.caught.has(e.name)) normal++;
      if(b.shiny.has(e.name)) shiny++;
    });
    return { total: total, normal: normal, shiny: shiny };
  }

  let ids;
  try{
    const maps = await Promise.all(variant.dexes.map(fetchDex));
    ids = new Set();
    maps.forEach(function(m){ m.forEach(function(_, id){ ids.add(id); }); });
  }catch(e){
    return { total: 0, normal: 0, shiny: 0 };
  }

  // Une carte par espèce, comme dans le jeu : on compte les espèces, pas les
  // formes, sinon un jeu à variantes afficherait un total incohérent.
  const vues = new Set();
  poolEntries().forEach(function(e){
    if(!ids.has(e.speciesId) || vues.has(e.speciesId)) return;
    vues.add(e.speciesId);
    total++;
    if(b.caught.has(e.name)) normal++;
    if(b.shiny.has(e.name)) shiny++;
  });
  return { total: total, normal: normal, shiny: shiny };
}

// ---- Les visuels d'un jeu ----
// GAMES declare la liste plutot qu'un nom de fichier devine depuis la cle :
// les bannieres portent le nom du jeu, pas son identifiant interne. Une seule
// suffit aujourd'hui, mais la liste en accepte plusieurs — elles s'empilent.
function remplirJaquette(cadre, game){
  const visuels = game.visuels || [];
  visuels.forEach(function(nom){
    const img = document.createElement('img');
    img.src = 'logos/' + nom + '.png';
    img.alt = game.title;
    img.loading = 'lazy';
    // Un visuel introuvable s'efface ; si le cadre finit vide, il porte le nom
    // du jeu plutot qu'un trou.
    img.addEventListener('error', function(){
      img.remove();
      if(!cadre.querySelector('img')) secoursJaquette(cadre, game);
    });
    // Les vingt-quatre bannieres tiennent dans un mouchoir : de 698x151 a
    // 700x158, soit un rapport de 4,42 a 4,62. Le cadre n'imposant pas de
    // hauteur, un visuel plus carre grandirait sa carte et decalerait son
    // compteur — c'est ce qui arrivait a Let's Go, dont le fichier trainait
    // 29 lignes transparentes en haut (698x186, rapport 3,75) : la banniere
    // a ete recoupee a 698x157, rien de visible n'a bouge. Ce repli reste
    // pour un futur visuel qui ne serait pas une banniere du tout.
    img.addEventListener('load', function(){
      if(img.naturalWidth / img.naturalHeight < 3) cadre.classList.add('vignette');
    });
    cadre.appendChild(img);
  });
  if(!visuels.length) secoursJaquette(cadre, game);
}

function secoursJaquette(cadre, game){
  if(cadre.querySelector('.jeu-secours')) return;
  cadre.classList.add('vignette');
  const secours = document.createElement('span');
  secours.className = 'jeu-secours';
  secours.textContent = game.tab;
  cadre.appendChild(secours);
}

function etiquetteAvancement(a){
  if(!a.total) return { texte: 'Pokédex non chargé', classe: 'attente' };
  if(!a.normal) return { texte: 'Non commencé', classe: 'zero' };
  if(a.normal >= a.total) return { texte: 'Complet', classe: 'complet' };
  return { texte: 'En cours', classe: 'encours' };
}

async function renderJeux(){
  const liste = document.getElementById('listeJeux');
  if(!liste) return;
  liste.innerHTML = '<div class="state-msg">Chargement des Pokédex…</div>';

  const lignes = [];
  for(const game of GAMES){
    const a = await avancementDuJeu(game);
    lignes.push({ game: game, a: a });
  }

  liste.innerHTML = '';
  lignes.forEach(function(x){
    const game = x.game, a = x.a;
    const etat = etiquetteAvancement(a);

    const carte = document.createElement('button');
    carte.type = 'button';
    carte.className = 'jeu-carte';
    // Le nom vit dans l'infobulle : la jaquette le porte deja, et le repeter
    // sous chaque carte alourdirait la grille pour rien.
    carte.title = game.title + ' — ' + game.machine;

    const cadre = document.createElement('span');
    cadre.className = 'jeu-jaquette';
    remplirJaquette(cadre, game);

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

    const jauge = document.createElement('span');
    jauge.className = 'jeu-jauge';
    const rempli = document.createElement('i');
    rempli.style.width = (a.total ? (a.normal / a.total) * 100 : 0) + '%';
    jauge.appendChild(rempli);

    carte.appendChild(cadre);
    carte.appendChild(jauge);
    carte.appendChild(avancee);
    carte.addEventListener('click', function(){ showPage(game.key); });

    // Pokémon HOME prend sa place dans la grille, juste avant Cobblemon :
    // il ferme la série des jeux officiels, dont il est l'aboutissement.
    // En bannière pleine largeur au-dessus, il écrasait la page et se lisait
    // comme un en-tête plutôt que comme une collection parmi les autres.
    if(game.key === 'cobblemon') liste.appendChild(carteHome());
    liste.appendChild(carte);
  });
  // Cobblemon absent de la liste : HOME ferme quand même la marche.
  if(!liste.querySelector('.jeu-home')) liste.appendChild(carteHome());
}

// La carte Pokémon HOME : même forme que celles des jeux, mais son périmètre
// est la collection d'ensemble — toutes les espèces, tous jeux confondus.
function carteHome(){
  const b = bucketFor('national');
  const pool = poolHome();
  let normal = 0, shiny = 0;
  pool.forEach(function(e){
    if(b.caught.has(e.name)) normal++;
    if(b.shiny.has(e.name)) shiny++;
  });
  const a = { total: pool.length, normal: normal, shiny: shiny };

  const carte = document.createElement('button');
  carte.type = 'button';
  carte.className = 'jeu-carte jeu-home';
  carte.title = 'Pokémon HOME — la collection d\'ensemble, toutes espèces confondues';

  const cadre = document.createElement('span');
  cadre.className = 'jeu-jaquette';
  const img = document.createElement('img');
  img.src = 'logos/home.png';
  img.alt = 'Pokémon HOME';
  img.loading = 'lazy';
  cadre.appendChild(img);

  const jauge = document.createElement('span');
  jauge.className = 'jeu-jauge';
  const rempli = document.createElement('i');
  rempli.style.width = (a.total ? (a.normal / a.total) * 100 : 0) + '%';
  jauge.appendChild(rempli);

  const avancee = document.createElement('span');
  avancee.className = 'jeu-avancee ' + etiquetteAvancement(a).classe;
  const chiffres = document.createElement('b');
  chiffres.textContent = a.total ? a.normal + ' / ' + a.total : '—';
  avancee.appendChild(chiffres);
  if(a.shiny){
    const s = document.createElement('em');
    s.textContent = '✨ ' + a.shiny;
    avancee.appendChild(s);
  }

  carte.appendChild(cadre);
  carte.appendChild(jauge);
  carte.appendChild(avancee);
  carte.addEventListener('click', function(){ showPage('national'); });
  return carte;
}

// Tous les onglets sauf « Accueil » affichent la même page Dex ; ce qui
// change, c'est la liste d'espèces qu'elle montre (son « scope »).
// Les filtres décrivent une recherche dans un Pokédex précis : les traîner
// d'un onglet à l'autre donne une grille vide sans qu'on comprenne pourquoi.
// Les deux filtres qui parlent de possession changent de mot avec l'aventure.
// « Capturés » sur un dex de rencontres serait faux, et c'est le genre de
// détail qui fait douter du reste.
function majLibellesMode(){
  const m = infoMode(modeCourant());
  const dit = { caught: m.pluriel + ' (vue active)', uncaught: 'Manquants (vue active)' };
  if(filterEl){
    Object.keys(dit).forEach(function(v){
      const o = filterEl.querySelector('option[value="' + v + '"]');
      if(o) o.textContent = dit[v];
    });
  }
  if(typeof syncSelects === 'function') syncSelects();
}

function resetFilters(){
  // Changer d'onglet passe par ici : c'est le moment le plus sûr pour remettre
  // les libellés d'accord avec l'aventure ouverte.
  majLibellesMode();
  searchEl.value = '';
  filterEl.value = 'all';
  genFilterEl.value = 'all';
  typeFilterEl.value = 'all';
  markActiveFilters();
}

/**
 * Combien d'espèces, et combien de lignées d'évolution.
 *
 * C'est toute la différence entre les deux façons de tenir un Pokédex. Une
 * lignée — Bulbizarre, Herbizarre, Florizarre — se remplit avec UNE capture
 * dans un Pokédex ordinaire : on fait évoluer, et les trois s'enregistrent. En
 * Living Dex il faut les trois en même temps, donc trois Pokémon.
 */
function compterLignees(){
  const f = (typeof fichesEmbarquees === 'function') ? fichesEmbarquees() : null;
  const lignees = new Set();
  let especes = 0;
  allEntries.forEach(function(e){
    if(e.id !== e.speciesId) return;          // une entrée par espèce
    especes++;
    const fi = f && f.especes[e.id];
    // Sans lignée connue, l'espèce est sa propre famille : on ne la fusionne
    // avec personne plutôt que de fausser le compte.
    lignees.add(fi && fi.lignee ? 'l' + fi.lignee : 'x' + e.speciesId);
  });
  return { especes: especes, lignees: lignees.size };
}

/**
 * Le bloc « ce que compte cette aventure ».
 *
 * Il ne sert à rien tant qu'on ne compare pas — et il sert énormément dès
 * qu'on compare. Deux amis dont l'un tient un Living Dex et l'autre un Pokédex
 * ordinaire verront des totaux très différents pour un travail comparable.
 */
function majBlocMode(){
  majLibellesMode();
  if(!homeModeEl || typeof profilCourant === 'undefined' || !profilCourant
     || typeof MODES_DEX === 'undefined' || !allEntries.length){
    if(homeModeEl) homeModeEl.style.display = 'none';
    return;
  }
  const cle = profilCourant.mode || 'capture';
  const m = MODES_DEX[cle] || MODES_DEX.capture;
  const c = compterLignees();
  const parEvolution = c.especes - c.lignees;

  homeModeEl.style.display = '';
  homeModeEl.className = 'home-mode mode-' + cle;
  homeModeEl.innerHTML = '';

  const titre = document.createElement('div');
  titre.className = 'home-mode-titre';
  titre.textContent = m.icone + '  ' + m.titre;
  homeModeEl.appendChild(titre);

  const texte = document.createElement('p');
  texte.className = 'home-mode-texte';
  if(cle === 'living'){
    texte.innerHTML = 'Les <b>' + c.especes + '</b> espèces se répartissent en <b>'
      + c.lignees + '</b> lignées. Il te faut les ' + c.especes + ' <em>en même temps</em> : '
      + 'faire évoluer ton Bulbizarre ne te laisse plus de Bulbizarre. C\'est <b>'
      + parEvolution + '</b> Pokémon de plus à garder qu\'un Pokédex ordinaire.';
  } else if(cle === 'vu'){
    texte.innerHTML = '<b>' + c.especes + '</b> espèces à croiser au moins une fois. '
      + 'Ni capture ni conservation : le Pokédex s\'enregistre à la rencontre.';
  } else {
    texte.innerHTML = '<b>' + c.lignees + '</b> lignées suffisent pour <b>' + c.especes
      + '</b> espèces : les <b>' + parEvolution + '</b> autres s\'enregistrent en faisant '
      + 'évoluer, sans capture supplémentaire. Bulbizarre en donne trois à lui seul.';
  }
  homeModeEl.appendChild(texte);

  // Le contraste, chiffré. C'est lui qu'on regarde avant de comparer.
  const chiffres = document.createElement('div');
  chiffres.className = 'home-mode-chiffres';
  [
    { v: c.lignees, l: 'lignées', aide: 'Familles d\'évolution distinctes' },
    { v: c.especes, l: 'espèces', aide: 'Entrées du Pokédex national' },
    { v: parEvolution, l: 'par évolution',
      aide: 'Espèces qu\'un Pokédex ordinaire obtient sans capture de plus' }
  ].forEach(function(x){
    const b = document.createElement('span');
    b.className = 'home-mode-chiffre';
    b.title = x.aide;
    b.innerHTML = '<b>' + x.v + '</b> ' + x.l;
    chiffres.appendChild(b);
  });
  homeModeEl.appendChild(chiffres);
}

// Souligne visuellement les filtres qui restreignent l'affichage.
function markActiveFilters(){
  [filterEl, genFilterEl, typeFilterEl].forEach(function(el){
    el.classList.toggle('filtering', el.value !== 'all');
  });
  // Les menus stylisés recopient l'état du <select> caché.
  if(typeof syncSelects === 'function') syncSelects();
}

// Met en évidence l'onglet courant. Sorti de showPage parce que la page des
// dresseurs en a besoin sans passer par toute la mécanique du Pokédex.
// Les trois écrans que l'onglet « Outils » réunit. Ils gardent chacun leur
// page — ce sont des écrans à part entière, pas des panneaux — et partagent
// seulement une barre et une entrée de nav.
const EST_UN_OUTIL = ['strategie', 'reproduction', 'transferts', 'obtenir'];

// La sous-barre est recopiée en tête des trois sections : chacune doit pouvoir
// s'afficher seule. On allume donc la bonne dans TOUTES, et pas seulement dans
// celle qui est visible — sinon la barre de la page suivante garde l'ancienne.
function majSousNavOutils(name){
  document.querySelectorAll('.outils-onglet').forEach(function(b){
    b.classList.toggle('active', b.dataset.outils === name);
  });
}

document.addEventListener('click', function(e){
  const b = e.target.closest && e.target.closest('.outils-onglet');
  if(b) showPage(b.dataset.outils);
});

function marquerOnglet(name){
  pageNav.querySelectorAll('.page-tab').forEach(function(tab){
    const on = tab.dataset.page === name;
    tab.classList.toggle('active', on);
    if(on) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

// La vue shiny vit dans app.js, que les pages de génération ne chargent pas :
// elles rejouent l'interface pour lire la réserve, sans pont ni session. Sans
// ce garde, y ouvrir un Pokédex levait « setShinyView is not a function » et
// l'onglet ne basculait pas. Le banc rejoue ce chemin sans app.js.
function vueShiny(valeur){
  if(typeof setShinyView === 'function') setShinyView(valeur);
}

/**
 * Éteint toutes les pages SAUF celle qu'on s'apprête à montrer.
 *
 * CE QUE ÇA REMPLACE, ET LE DÉFAUT QUE ÇA CORRIGE. `showPage` éteignait à la
 * main, avec TROIS listes distinctes — une par branche — qu'il fallait
 * allonger à chaque page ajoutée. Elles ne l'ont pas été : les Messages, la
 * Galerie, le Relevé, les Paramètres et six autres manquaient à deux d'entre
 * elles. Quitter les Messages pour un Pokédex laissait donc les deux écrans
 * EMPILÉS l'un sous l'autre, la grille au-dessus de la conversation.
 *
 * Une boucle sur `.page` n'a rien à tenir à jour : une page ajoutée demain
 * s'éteindra sans qu'on ait à y penser. Les sous-écrans des Outils portent
 * `strat-outil` et non `page` — ils ne sont pas concernés.
 *
 * ON GARDE LA CIBLE ALLUMÉE plutôt que de tout éteindre puis rallumer :
 * `.page.active` porte une animation d'entrée, qui rejouerait à chaque appel
 * sur la page déjà ouverte.
 */
function eteindreAutresPages(garde){
  document.querySelectorAll('.page').forEach(function(p){
    if(p.id !== garde) p.classList.remove('active');
  });
}

function showPage(name){
  // Un objectif ouvert ne survit pas à un changement de page : sa liste est
  // figée pour UN Pokédex, et la garder ailleurs viderait la grille sans que
  // rien ne l'explique. Il se repose après coup — voir ouvrirObjectif().
  if(typeof objectifAffiche !== 'undefined' && objectifAffiche){
    objectifAffiche = null;
    if(typeof majBarreObjectif === 'function') majBarreObjectif();
  }

  // La page des dresseurs n'est pas un Pokédex : ni périmètre, ni collection,
  // ni filtres. On la traite avant tout le reste — sinon useDexProgress
  // créerait une collection pour un Pokédex qui n'existe pas.
  // « Outils » n'est pas une page : c'est le nom que porte la nav pour trois
  // écrans qui partagent une sous-barre. On entre par la Stratégie, qui est le
  // plus consulté des trois.
  if(name === 'outils') name = 'strategie';

  if(name === 'dresseurs' || name === 'profil' || name === 'chasse'
     || name === 'verrous' || name === 'strategie' || name === 'reproduction'
     || name === 'transferts' || name === 'obtenir'
     || name === 'amis' || name === 'lieux'
     || name === 'parametres' || name === 'cadeaux' || name === 'messages'
     || name === 'galerie' || name === 'releve'){
    currentPage = name;
    eteindreAutresPages('page-' + name);
    if(pageDresseursEl) pageDresseursEl.classList.toggle('active', name === 'dresseurs');
    if(pageAmisEl) pageAmisEl.classList.toggle('active', name === 'amis');
    if(pageMessagesEl) pageMessagesEl.classList.toggle('active', name === 'messages');
    if(pageGalerieEl) pageGalerieEl.classList.toggle('active', name === 'galerie');
    if(pageReleveEl) pageReleveEl.classList.toggle('active', name === 'releve');
    // QUITTER L'ÉCRAN ARRÊTE SON SONDAGE RAPIDE. Il bat toutes les cinq
    // secondes — bien plus vite que la veille commune — et c'est acceptable
    // parce qu'il ne tourne QUE pendant qu'on parle. Sans cette ligne, il
    // continuerait sur une page qu'on a quittée.
    if(name !== 'messages' && typeof fermerMessagerie === 'function') fermerMessagerie();
    if(pageLieuxEl) pageLieuxEl.classList.toggle('active', name === 'lieux');
    if(pageProfilEl) pageProfilEl.classList.toggle('active', name === 'profil');
    if(pageParametresEl) pageParametresEl.classList.toggle('active', name === 'parametres');
    if(pageChasseEl) pageChasseEl.classList.toggle('active', name === 'chasse');
    if(pageVerrousEl) pageVerrousEl.classList.toggle('active', name === 'verrous');
    if(pageCadeauxEl) pageCadeauxEl.classList.toggle('active', name === 'cadeaux');
    if(pageStrategieEl) pageStrategieEl.classList.toggle('active', name === 'strategie');
    if(pageReproductionEl) pageReproductionEl.classList.toggle('active', name === 'reproduction');
    if(pageTransfertsEl) pageTransfertsEl.classList.toggle('active', name === 'transferts');
    if(pageObtenirEl) pageObtenirEl.classList.toggle('active', name === 'obtenir');
    // Les trois écrans d'outils allument le même onglet : c'est de là qu'on
    // vient, et c'est là qu'on retourne.
    // Shiny-lock n'a pas d'onglet à lui : on y entre depuis Chasse, et c'est
    // Chasse qui reste allumé — sinon la barre n'indique plus d'où l'on vient.
    marquerOnglet(EST_UN_OUTIL.indexOf(name) !== -1 ? 'outils'
      : (name === 'verrous' ? 'chasse' : name));
    majSousNavOutils(name);
    if(name === 'dresseurs' && typeof chargerDresseurs === 'function') chargerDresseurs();
    if(name === 'amis' && typeof chargerAmis === 'function') chargerAmis();
    if(name === 'amis' && typeof chargerTroc === 'function') chargerTroc();
    if(name === 'amis' && typeof chargerQuiA === 'function') chargerQuiA();
    if(name === 'lieux' && typeof chargerPageLieux === 'function') chargerPageLieux();
    if(name === 'profil' && typeof chargerProfil === 'function') chargerProfil();
    // La carte et les données jeux se redessinent en entrant : leur premier
    // dessin a lieu au chargement de parties.js, avant qu'app.js n'ait rempli
    // allEntries, et il sort donc sans les vignettes d'équipe.
    if(name === 'profil' && typeof partiesToutDessiner === 'function') partiesToutDessiner();
    if(name === 'parametres' && typeof chargerParametres === 'function') chargerParametres();
    if(name === 'chasse' && typeof dessinerChasses === 'function') dessinerChasses();
    if(name === 'cadeaux' && typeof chargerCadeaux === 'function') chargerCadeaux();
    if(name === 'verrous' && typeof dessinerVerrousPage === 'function') dessinerVerrousPage();
    if(name === 'strategie' && typeof dessinerStrategie === 'function') dessinerStrategie();
    if(name === 'reproduction' && typeof dessinerReproduction === 'function') dessinerReproduction();
    if(name === 'transferts' && typeof dessinerTransferts === 'function') dessinerTransferts();
    if(name === 'obtenir' && typeof chargerPageObtenir === 'function') chargerPageObtenir();
    return;
  }

  // La liste des jeux : le sommaire du Pokédex, pas un Pokédex lui-même.
  if(name === 'jeux'){
    currentPage = 'jeux';
    eteindreAutresPages('page-jeux');
    if(pageJeuxEl) pageJeuxEl.classList.add('active');
    marquerOnglet('jeux');
    renderJeux();
    return;
  }

  const isHome = (name === 'home');
  eteindreAutresPages(isHome ? 'page-home' : 'page-dex');
  // Changer de jeu réouvre toujours sur son Pokédex régional : garder la
  // variante du jeu précédent afficherait le mauvais Dex sans prévenir.
  if(name !== currentTab){
    currentVariant = 'regional';
    resetFilters();
    // La vue shiny revient au normal : on ouvre toujours un Pokédex sur sa
    // forme de base, sinon on coche des chromatiques sans s'en rendre compte.
    vueShiny(false);
  }
  currentPage = isHome ? 'home' : 'dex';
  currentTab = name;
  // Chaque Pokédex a sa propre collection : on bascule dessus avant tout
  // affichage, sinon on lirait celle de l'onglet précédent.
  useDexProgress(name);
  // Le bouton des pastilles suit l'onglet : il n'a rien à expliquer ailleurs
  // que sur le Pokédex d'un jeu.
  if(typeof majLegendeObtention === 'function') majLegendeObtention();
  pageHomeEl.classList.toggle('active', isHome);
  pageDexEl.classList.toggle('active', !isHome);
  // Un jeu n'a plus d'onglet à lui : c'est « Pokédex » qui reste allumé, parce
  // que c'est de là qu'on vient et là qu'on retourne.
  marquerOnglet(isHome ? 'home' : 'jeux');
  if(isHome){ updateHome(); return; }
  // Un jeu sans Pokédex National ne doit pas rester bloqué sur cet onglet.
  const game = gameByKey[name];
  if(game && !game.second) currentVariant = 'regional';
  applyScope();
}

pageNav.addEventListener('click', function(e){
  const tab = e.target.closest('.page-tab');
  if(tab) showPage(tab.dataset.page);
});


// Raccourcis de l'accueil : ils préparent le Dex (vue + filtre) avant d'y aller.
// Les raccourcis de l'accueil — « Ouvrir le Pokédex », « Mes manquants »,
// « Ma chasse shiny » — portent tous sur le Dex National.
//
// L'ouverture vient AVANT le préréglage, et l'ordre inverse a longtemps donné
// des boutons qui ne faisaient rien : showPage() remet les filtres à zéro quand
// on change de Pokédex, et on en change à tous les coups puisqu'on arrive de
// l'accueil. Le filtre posé juste avant était donc effacé dans la foulée, et
// « ✨ Ma chasse shiny » ouvrait le Dex entier en vue normale, sans un mot.
function gotoDex(preset, gen){
  showPage('national');
  if(preset === 'missing'){ vueShiny(false); filterEl.value = 'uncaught'; }
  else if(preset === 'hunt'){ vueShiny(true); filterEl.value = 'normal-not-shiny'; }
  else if(preset === 'all'){ filterEl.value = 'all'; }
  genFilterEl.value = gen ? String(gen) : 'all';
  searchEl.value = '';
  // showPage() a déjà dessiné la grille, mais sans le préréglage : elle se
  // redessine avec, sinon le filtre est juste affiché dans le menu.
  markActiveFilters();
  renderList(true);
}

pageHomeEl.addEventListener('click', function(e){
  const btn = e.target.closest('[data-goto]');
  if(btn) gotoDex(btn.dataset.goto);
});

function updateHome(){
  majBlocMode();
  // L'accueil suit le mode « Toutes les formes » : afficher un total pendant
  // que le Dex en montre un autre donnerait deux vérités différentes.
  const pool = poolHome();
  const total = pool.length;
  // L'accueil parle toujours de la collection Pokémon HOME, quel que soit
  // l'onglet d'où l'on vient.
  const home = bucketFor('national');
  homePlayerEl.textContent = playerName || 'Dresseur';
  homeNormalCount.textContent = String(home.caught.size);
  homeShinyCount.textContent = String(home.shiny.size);
  homeNormalTotal.textContent = String(total);
  homeShinyTotal.textContent = String(total);

  const pctN = total ? Math.round((home.caught.size / total) * 100) : 0;
  const pctS = total ? Math.round((home.shiny.size / total) * 100) : 0;
  homeGaugeNormal.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - pctN / 100));
  homeGaugeShiny.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - pctS / 100));
  homeGaugeNormalValue.textContent = pctN + '%';
  homeGaugeShinyValue.textContent = pctS + '%';

  if(!total){
    homeSummaryEl.textContent = 'Chargement du Pokédex…';
    return;
  }
  const missing = total - home.caught.size;
  const toHunt = countNormalNotShiny(home);
  homeSummaryEl.textContent = 'Collection Pokémon HOME — ' + (missing === 0
    ? 'complète en forme normale ; il reste ' + (total - home.shiny.size) + ' formes shiny à chasser.'
    : 'il te manque ' + missing + ' Pokémon en forme normale, et ' + toHunt
      + ' que tu possèdes en normal attendent encore leur version shiny.');
  renderHomeGens(total, home);
  if(typeof dessinerObjectifs === 'function') dessinerObjectifs();
  renderAPortee();
  renderProgramme();
  if(typeof dessinerDefi === 'function') dessinerDefi();
  // Definies dans compte.js, charge apres celui-ci : au premier appel elles
  // existent deja, l'accueil n'etant dessine qu'une fois l'application prete.
  if(typeof majAccueilAventure === 'function') majAccueilAventure();
  if(typeof chargerDernieresCaptures === 'function') chargerDernieresCaptures();
}

function countNormalNotShiny(bucket){
  let n = 0;
  bucket.caught.forEach(function(name){ if(!bucket.shiny.has(name)) n++; });
  return n;
}

// Chaque jeu ayant sa propre collection, l'accueil en donne la vue d'ensemble.
// C'est le seul endroit d'où l'on voit toutes ses progressions d'un coup.
// ---- À portée ----
// L'accueil listait les vingt-trois jeux, dont vingt à zéro — un catalogue,
// exactement ce que fait déjà la page Pokédex, en mieux. On ne garde ici que
// ce qui est en train de se finir : c'est là que se joue la prochaine session.
const A_PORTEE_MAX = 3;

async function renderAPortee(){
  if(!aPortee) return;
  aPortee.innerHTML = '<div class="state-msg">Calcul en cours…</div>';

  const lignes = [];
  for(const game of GAMES){
    const a = await avancementDuJeu(game);
    // Ni les jeux non commencés — rien n'y est « à portée » — ni ceux déjà
    // terminés : féliciter n'aide pas à choisir quoi faire.
    if(!a.total || !a.normal || a.normal >= a.total) continue;
    lignes.push({ game: game, reste: a.total - a.normal, a: a });
  }

  if(!lignes.length){
    aPortee.innerHTML = '<div class="state-msg">Aucun Pokédex en cours. '
      + 'Ouvre un jeu depuis l\'onglet Pokédex pour commencer.</div>';
    return;
  }

  // Le plus proche de la fin d'abord.
  lignes.sort(function(x, y){ return x.reste - y.reste; });

  aPortee.innerHTML = '';
  lignes.slice(0, A_PORTEE_MAX).forEach(function(l){
    const carte = document.createElement('button');
    carte.type = 'button';
    carte.className = 'portee-carte';
    carte.title = 'Ouvrir ' + l.game.title;

    const haut = document.createElement('div');
    haut.className = 'portee-haut';
    const nom = document.createElement('span');
    nom.className = 'portee-nom';
    nom.textContent = l.game.tab;
    const reste = document.createElement('span');
    reste.className = 'portee-reste';
    reste.innerHTML = 'il te manque <b>' + l.reste + '</b> Pokémon';
    haut.appendChild(nom); haut.appendChild(reste);
    carte.appendChild(haut);

    const barre = document.createElement('span');
    barre.className = 'portee-barre';
    const rempli = document.createElement('i');
    rempli.style.width = (l.a.normal / l.a.total) * 100 + '%';
    barre.appendChild(rempli);
    carte.appendChild(barre);

    const bas = document.createElement('div');
    bas.className = 'portee-bas';
    bas.textContent = l.a.normal + ' / ' + l.a.total
      + '  ·  ' + Math.round((l.a.normal / l.a.total) * 100) + ' %'
      + (l.a.shiny ? '  ·  ✨ ' + l.a.shiny : '');
    carte.appendChild(bas);

    carte.addEventListener('click', function(){ showPage(l.game.key); });
    aPortee.appendChild(carte);
  });
}

function renderHomeGens(total, home){
  if(!total){ return; }
  const buckets = new Map();
  poolHome().forEach(function(entry){
    let b = buckets.get(entry.gen);
    if(!b){ b = { total: 0, normal: 0, shiny: 0 }; buckets.set(entry.gen, b); }
    b.total++;
    if(home.caught.has(entry.name)) b.normal++;
    if(home.shiny.has(entry.name)) b.shiny++;
  });

  const gens = Array.from(buckets.keys()).sort(function(a, b){
    if(a === 0) return 1;  // « Formes spéciales » en dernier
    if(b === 0) return -1;
    return a - b;
  });

  homeGensEl.innerHTML = '';
  gens.forEach(function(gen){
    const b = buckets.get(gen);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'home-gen';
    card.title = 'Ouvrir cette génération dans le Pokédex';

    const name = document.createElement('div');
    name.className = 'home-gen-name';
    name.textContent = genHeaderLabel(gen);
    card.appendChild(name);

    [['⬤', b.normal, ''], ['✨', b.shiny, ' shiny']].forEach(function(pair){
      const row = document.createElement('div');
      row.className = 'home-gen-row';
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = pair[0];
      const bar = document.createElement('div');
      bar.className = 'home-bar' + pair[2];
      const fill = document.createElement('i');
      fill.style.width = (b.total ? (pair[1] / b.total) * 100 : 0) + '%';
      bar.appendChild(fill);
      const num = document.createElement('span');
      num.className = 'home-gen-num';
      num.textContent = pair[1] + ' / ' + b.total;
      row.appendChild(tag); row.appendChild(bar); row.appendChild(num);
      card.appendChild(row);
    });

    // Une génération incomplète en normal s'ouvre sur les manquants ; sinon
    // on bascule directement sur ce qu'il reste à chasser en shiny.
    card.addEventListener('click', function(){
      gotoDex(b.normal < b.total ? 'missing' : 'hunt', gen === 0 ? null : gen);
    });
    homeGensEl.appendChild(card);
  });
}

// Quelle forme la vue courante édite-t-elle ?
function activeSet(){ return shinyView ? shinySet : caughtSet; }
function otherSet(){ return shinyView ? caughtSet : shinySet; }


// ---- Le programme du soir ----------------------------------------------------
//
// « À portée » répond à « quel jeu est près de finir ». Ce n'est pas la même
// question que « je fais quoi maintenant », et c'est la seconde qu'on se pose
// en rallumant la console.
//
// LE BLOC NE DEMANDE AUCUNE DONNÉE NOUVELLE. Le relevé des lieux couvre les
// vingt-deux jeux avec la sous-zone, l'heure, la météo et la saison : il suffit
// de croiser ce qu'il dit de capturable avec ce qui manque à l'aventure.
//
// TIRAGE STABLE DANS LA JOURNÉE. Le hasard est tiré de la date et de la clé du
// jeu, jamais de Math.random() : une liste qui change à chaque rafraîchissement
// ferait perdre celui qu'on était en train de chercher, et c'est le genre de
// détail qui décide si l'on se sert d'un écran ou non.

const PROGRAMME_MAX = 4;

const programmeEl = document.getElementById('programme');
const programmeQuoi = document.getElementById('programmeQuoi');

// Un générateur pseudo-aléatoire à graine (mulberry32) : trente octets, aucune
// dépendance, et la même suite pour la même graine.
function semeur(graine){
  let a = graine >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hachage(texte){
  let h = 2166136261;
  for(let i = 0; i < texte.length; i++){
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function jourCourant(){
  const d = new Date();
  const p = function(n){ return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// Une entrée par identifiant du relevé : la forme d'abord, l'espèce à défaut,
// comme partout ailleurs — le relevé donne sa propre clé à Rattata d'Alola.
function entreeParIdentifiant(id){
  return allEntries.find(function(e){ return e.id === id; })
      || allEntries.find(function(e){ return e.speciesId === id; })
      || null;
}

// Ce que les mentions du relevé disent en clair. Seules celles qui changent la
// façon de s'y prendre figurent : « offert » ou « évolution » ne sont pas des
// conseils de chasse, et ces lignes-là sont déjà écartées.
const MENTIONS_UTILES = {
  rare: '💧 rare', fixe: '📍 fixe', troupeau: '👥 troupeau', raid: '⚔️ raid',
  apparition: '🌟 apparition', 'poke-radar': '📡 Poké Radar',
  distorsion: '🌀 distorsion', peche: '🎣 pêche', surf: '🌊 surf',
  meteo: '🌦 selon la météo', jour: '☀️ le jour', nuit: '🌙 la nuit',
  saison: '🍂 selon la saison'
};

/**
 * Ce qu'il reste à capturer dans ce jeu, d'après le relevé.
 *
 * Seule la catégorie « sauvage » est retenue : un programme du soir qui
 * proposerait « fais évoluer ton Bulbizarre » n'envoie nulle part.
 */
function ciblesDuJeu(cleJeu){
  if(typeof DONNEES_LIEUX === 'undefined') return [];
  const table = DONNEES_LIEUX.jeux[cleJeu];
  if(!table) return [];
  const b = bucketFor(cleJeu);
  const out = [];
  Object.keys(table).forEach(function(id){
    const ligne = table[id];
    if(DONNEES_LIEUX.categories[ligne[1]] !== 'sauvage') return;
    const mentions = (ligne[2] || []).map(function(i){ return DONNEES_LIEUX.mentions[i]; });
    if(mentions.indexOf('introuvable') !== -1) return;
    const texte = DONNEES_LIEUX.textes[ligne[0]] || '';
    // Le relevé range parfois sous « sauvage » une ligne dont le texte dit
    // « À transférer par Pokémon HOME » — Zamazenta dans Écarlate, par
    // exemple. La catégorie ne suffit donc pas : envoyer chercher dans
    // l'herbe un Pokémon qui n'y est pas serait la pire des propositions.
    if(texte.indexOf('À transférer') === 0) return;
    const entry = entreeParIdentifiant(parseInt(id, 10));
    if(!entry || b.caught.has(entry.name)) return;
    out.push({ entry: entry, texte: texte, mentions: mentions });
  });
  return out;
}

// Le relevé sépare les lieux d'une même espèce par des retours à la ligne, et
// certaines espèces en ont onze. Une carte de programme en montre deux : elle
// dit où aller, pas tout ce que la source sait. Le reste est dans l'infobulle,
// et la fiche a la liste entière.
const PROGRAMME_LIEUX_MONTRES = 2;

function lieuxCourts(texte){
  const lignes = String(texte || '').split('\n').filter(Boolean);
  if(!lignes.length) return { court: '', reste: 0 };
  return {
    court: lignes.slice(0, PROGRAMME_LIEUX_MONTRES).join('  ·  '),
    reste: Math.max(0, lignes.length - PROGRAMME_LIEUX_MONTRES)
  };
}

/**
 * Le jeu du soir : celui qu'on a commencé, qu'on n'a pas fini, et où il reste
 * quelque chose à ATTRAPER.
 *
 * Le dernier point compte : un jeu à qui il ne manque que des évolutions et
 * des échanges est « à portée » mais n'a rien à proposer ce soir.
 */
function jeuDuSoir(){
  const candidats = [];
  GAMES.forEach(function(g){
    const b = bucketFor(g.key);
    if(!b.caught.size) return;                   // jamais commencé
    const cibles = ciblesDuJeu(g.key);
    if(!cibles.length) return;                   // fini, ou plus rien à capturer
    candidats.push({ jeu: g, cibles: cibles });
  });
  if(!candidats.length) return null;
  // Le plus près d'être bouclé d'abord : c'est là qu'une soirée se voit.
  candidats.sort(function(a, b){ return a.cibles.length - b.cibles.length; });
  return candidats[0];
}

function carteProgramme(cible, cleJeu){
  const carte = document.createElement('div');
  carte.className = 'prog-carte';

  const cadre = document.createElement('div');
  cadre.className = 'prog-sprite';
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = '';
  img.src = pokeosHomeUrl(cible.entry.id, false);
  img.addEventListener('error', function(){
    img.src = officialArtworkUrl(cible.entry.id, false);
  });
  cadre.appendChild(img);
  carte.appendChild(cadre);

  const corps = document.createElement('div');
  corps.className = 'prog-corps';

  const nom = document.createElement('button');
  nom.type = 'button';
  nom.className = 'prog-nom';
  nom.textContent = nomAffiche(cible.entry);
  nom.title = 'Ouvrir sa fiche';
  nom.addEventListener('click', function(){ openPreview(cible.entry, null); });
  corps.appendChild(nom);

  const ou = document.createElement('div');
  ou.className = 'prog-ou';
  const lieux = lieuxCourts(cible.texte);
  ou.textContent = (lieux.court || 'Lieu non précisé par le relevé')
    + (lieux.reste ? '  ·  +' + lieux.reste + ' autre' + (lieux.reste > 1 ? 's' : '') : '');
  if(cible.texte) ou.title = cible.texte;
  corps.appendChild(ou);

  const utiles = cible.mentions.filter(function(m){ return MENTIONS_UTILES[m]; });
  if(utiles.length){
    const puces = document.createElement('div');
    puces.className = 'prog-puces';
    utiles.forEach(function(m){
      const p = document.createElement('span');
      p.className = 'prog-puce';
      p.textContent = MENTIONS_UTILES[m];
      puces.appendChild(p);
    });
    corps.appendChild(puces);
  }
  carte.appendChild(corps);

  const pris = document.createElement('button');
  pris.type = 'button';
  pris.className = 'toggle-btn prog-pris';
  pris.textContent = '✓ Attrapé';
  pris.title = 'Le cocher dans le Pokédex de ce jeu, sans quitter l\'accueil';
  pris.addEventListener('click', function(){
    bucketFor(cleJeu).caught.add(cible.entry.name);
    queueSave();
    // L'accueil entier se recalcule : la jauge, « À portée » et le programme
    // parlent tous du même chiffre, et n'en laisser bouger qu'un serait faux.
    updateHome();
  });
  carte.appendChild(pris);

  return carte;
}

function renderProgramme(){
  if(!programmeEl) return;

  // Le relevé pèse 1,9 Mo et ne se charge pas au démarrage. On le demande, et
  // l'accueil se redessine tout seul quand il arrive — comme le fait déjà la
  // grille pour ses pastilles d'obtention.
  if(typeof DONNEES_LIEUX === 'undefined'){
    programmeEl.innerHTML = '<div class="state-msg">Lecture du relevé des lieux…</div>';
    if(programmeQuoi) programmeQuoi.textContent = '';
    if(typeof chargerLieux === 'function' && !renderProgramme.demande){
      renderProgramme.demande = true;
      chargerLieux().then(function(){ renderProgramme(); })
                    .catch(function(){
                      renderProgramme.demande = false;
                      programmeEl.innerHTML = '<div class="state-msg">'
                        + 'Le relevé des lieux n\'a pas pu être lu.</div>';
                    });
    }
    return;
  }

  const choix = jeuDuSoir();
  if(!choix){
    if(programmeQuoi) programmeQuoi.textContent = '';
    programmeEl.innerHTML = '<div class="state-msg">Rien à proposer pour l\'instant. '
      + 'Ouvre le Pokédex d\'un jeu et coche ce que tu as déjà : le programme '
      + 'saura alors quoi te sortir.</div>';
    return;
  }

  // Le tirage : stable pour la journée, et propre à ce jeu.
  const tirer = semeur(hachage(jourCourant() + '|' + choix.jeu.key));
  const melange = choix.cibles.map(function(c){ return { c: c, r: tirer() }; })
                              .sort(function(a, b){ return a.r - b.r; })
                              .map(function(x){ return x.c; })
                              .slice(0, PROGRAMME_MAX);

  if(programmeQuoi){
    programmeQuoi.textContent = 'Ce soir, dans ' + choix.jeu.tab
      + '  ·  il te reste ' + choix.cibles.length
      + (choix.cibles.length > 1 ? ' Pokémon à y capturer' : ' Pokémon à y capturer')
      + '  ·  la liste change demain.';
  }

  programmeEl.innerHTML = '';
  melange.forEach(function(c){ programmeEl.appendChild(carteProgramme(c, choix.jeu.key)); });
}
