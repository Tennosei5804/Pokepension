// Une adresse par écran : « /lieu », « /chasse », « /pixelmonworld »…
//
// Site seulement. L'application de bureau n'a pas de barre d'adresse, et
// l'assembleur n'injecte ce script que dans les pages du site — voir
// site/outils/assembler.py, où vit la table ADRESSES.
//
// ─── CE QUE ÇA RÈGLE ──────────────────────────────────────────────────────────
//
// « /dex » était la seule adresse de l'application. Pour montrer les lieux à
// quelqu'un, il fallait lui dire « va sur /dex, puis clique sur Lieux » — et
// recharger la page ramenait toujours à l'accueil, où qu'on soit.
//
// ─── TROIS GESTES, UNE SEULE TABLE ────────────────────────────────────────────
//
//   · à l'arrivée, l'adresse ouvre son écran ;
//   · à chaque changement d'écran, la barre d'adresse suit — ce qu'on copie
//     est ce qu'on voit ;
//   · le bouton Précédent revient à l'écran d'avant, et non hors du site.
//
// La table vient de l'assembleur (window.POKEPENSION_ADRESSES). Elle n'est pas
// recopiée ici : une seconde liste aurait fini par ne plus dire la même chose,
// et une adresse aurait ouvert une page que la barre ne savait plus nommer.

(function(){
  'use strict';

  const TABLE = window.POKEPENSION_ADRESSES || {};
  if(typeof showPage !== 'function') return;

  // L'écran vers son adresse, pour la barre. Construit depuis la table.
  const VERS_ADRESSE = {};
  Object.keys(TABLE).forEach(function(nom){ VERS_ADRESSE[TABLE[nom]] = nom; });

  // Le nom qui suit la dernière barre, sans extension ni barre finale :
  // « /lieu », « /lieu/ » et « /lieu.html » désignent le même écran.
  function nomDeLAdresse(){
    const bout = location.pathname.replace(/\/+$/, '').split('/').pop() || '';
    return bout.replace(/\.html$/, '');
  }

  /**
   * L'adresse de l'écran ouvert.
   *
   * UN ÉCRAN SANS ADRESSE RAMÈNE À « /dex ». Le Pokédex d'un jeu, les
   * paramètres, la galerie n'en ont pas : laisser « /lieu » dans la barre
   * pendant qu'on regarde le Pokédex d'Émeraude ferait partager un lien qui
   * ouvre autre chose que ce qu'on montre.
   */
  function adresseDe(page){
    const nom = VERS_ADRESSE[page];
    return nom ? '/' + nom : '/dex';
  }

  // Pendant qu'on applique une adresse, showPage ne doit pas en réécrire une :
  // ouvrir l'écran demandé ajouterait sinon une entrée d'historique, et
  // Précédent ramènerait… au même écran.
  let enRestitution = false;

  const origine = showPage;
  window.showPage = function(nom){
    const r = origine.apply(this, arguments);
    if(enRestitution || typeof currentPage === 'undefined') return r;
    const voulue = adresseDe(currentPage);
    if(location.pathname !== voulue){
      try{
        history.pushState({ page: currentPage }, '', voulue + location.search);
      }catch(e){ /* adresse refusée : l'écran s'ouvre quand même */ }
    }
    return r;
  };

  function ouvrir(page){
    enRestitution = true;
    try{ window.showPage(page); }
    finally{ enRestitution = false; }
  }

  // Précédent et Suivant.
  window.addEventListener('popstate', function(){
    const page = TABLE[nomDeLAdresse()];
    ouvrir(page || 'home');
  });

  /**
   * L'arrivée sur une adresse.
   *
   * ON ATTEND QUE LA RÉSERVE SOIT LÀ. showPage() rend la main tout de suite,
   * mais plusieurs écrans lisent allEntries en s'ouvrant : le Pokédex de
   * PixelmonWorld relie ses espèces à celles de l'application au premier
   * dessin, et ouvert trop tôt il les aurait toutes crues inconnues — sans
   * sprite ni fiche. C'est la même attente que depart.js pose avant d'ouvrir
   * un Pokédex, bornée de la même façon : au-delà, on ouvre quand même.
   */
  async function arriver(){
    const page = TABLE[nomDeLAdresse()];
    if(!page) return;

    // L'adresse arrivée telle quelle devient l'entrée courante : sans cette
    // ligne, le premier Précédent n'aurait rien sous lui pour revenir ici.
    try{ history.replaceState({ page: page }, '', location.pathname + location.search); }
    catch(e){ /* sans historique, l'écran s'ouvre quand même */ }

    for(let i = 0; i < 60; i++){
      if(typeof allEntries !== 'undefined' && allEntries.length) break;
      await new Promise(function(r){ setTimeout(r, 100); });
    }
    ouvrir(page);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', arriver);
  } else {
    arriver();
  }
})();
