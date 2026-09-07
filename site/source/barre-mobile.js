// La barre de navigation du bas, sur téléphone.
// Script classique (pas de module ES), comme le reste du projet.
//
// ELLE NE CONNAÎT AUCUNE PAGE. Elle se construit à partir des onglets qui
// existent déjà — `.page-tab` et leur `data-page` — et un clic sur la barre
// clique l'onglet correspondant. C'est délibéré : une seconde liste de pages
// écrite ici deviendrait une seconde vérité, et le jour où l'application
// gagne un onglet, la barre du téléphone l'ignorerait sans que personne ne le
// remarque avant des semaines. Le dépôt a déjà payé cette dérive, et l'a
// écrite en toutes lettres à la fin de menus.js.
//
// POURQUOI EN BAS. Sur un téléphone tenu d'une main, le haut de l'écran est
// hors de portée du pouce. Les onze onglets vivaient en une rangée qui
// défilait horizontalement : elle tenait sur cinquante pixels, mais il fallait
// pousser pour atteindre le septième, et rien ne disait qu'il en existait un.
//
// CINQ ENTRÉES, PAS DIX. Une barre de dix icônes de trente pixels ne se vise
// pas. Quatre destinations tiennent la barre — celles où l'on retourne — et
// « Plus » ouvre le reste dans un menu, à portée du pouce lui aussi.

(function(){
  'use strict';

  // Les quatre qui restent visibles. Ce sont les pages où l'on revient : ce
  // qu'on regarde (l'accueil), ce qu'on coche (le Pokédex), où l'on va
  // (les lieux) et ce qu'on traque (la chasse). Le reste se visite.
  var EN_BAS = ['home', 'jeux', 'lieux', 'chasse'];

  // Le libellé porte une émoji et un mot : « 🏠 Accueil ». En bas, l'émoji
  // devient l'icône et le mot son étiquette — on les sépare ici plutôt que de
  // réécrire des libellés qui vivraient alors en double.
  function couper(texte){
    var t = (texte || '').trim();
    var m = t.match(/^(\S+)\s+(.*)$/);
    return m ? { icone: m[1], mot: m[2] } : { icone: '•', mot: t };
  }

  function demarrer(){
    var nav = document.querySelector('.page-nav');
    if(!nav || document.querySelector('.barre-bas')) return;
    var onglets = [].slice.call(nav.querySelectorAll('.page-tab'));
    if(!onglets.length) return;

    var parCle = {};
    onglets.forEach(function(o){ if(o.dataset.page) parCle[o.dataset.page] = o; });

    var barre = document.createElement('nav');
    barre.className = 'barre-bas';
    barre.setAttribute('aria-label', 'Navigation');

    var boutons = {};

    function entree(onglet, cle){
      var d = couper(onglet.textContent);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'barre-bas-item';
      b.dataset.vers = cle;
      b.innerHTML = '<span class="barre-bas-icone" aria-hidden="true"></span>'
                  + '<span class="barre-bas-mot"></span>';
      b.querySelector('.barre-bas-icone').textContent = d.icone;
      b.querySelector('.barre-bas-mot').textContent = d.mot;
      // ON CLIQUE L'ONGLET, ON NE REFAIT PAS SON TRAVAIL. Tout ce que la
      // navigation déclenche — showPage, la sous-barre des outils, la mise à
      // jour de l'accueil — reste écrit à un seul endroit.
      b.addEventListener('click', function(){
        fermerMenu();
        onglet.click();
      });
      boutons[cle] = b;
      return b;
    }

    EN_BAS.forEach(function(cle){
      if(parCle[cle]) barre.append(entree(parCle[cle], cle));
    });

    // ---- « Plus », et le menu des autres pages ----------------------------

    var restants = onglets.filter(function(o){
      return o.dataset.page && EN_BAS.indexOf(o.dataset.page) === -1;
    });

    var menu = document.createElement('div');
    menu.className = 'barre-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Les autres pages');

    restants.forEach(function(o){
      var d = couper(o.textContent);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'barre-menu-item';
      b.dataset.vers = o.dataset.page;
      b.setAttribute('role', 'menuitem');
      b.innerHTML = '<span class="barre-menu-icone" aria-hidden="true"></span><span></span>';
      b.querySelector('.barre-menu-icone').textContent = d.icone;
      b.querySelectorAll('span')[1].textContent = d.mot;
      b.addEventListener('click', function(){ fermerMenu(); o.click(); });
      boutons[o.dataset.page] = b;
      menu.append(b);
    });

    var voile = document.createElement('div');
    voile.className = 'barre-voile';
    voile.hidden = true;
    voile.addEventListener('click', fermerMenu);

    var plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'barre-bas-item barre-bas-plus';
    plus.setAttribute('aria-haspopup', 'menu');
    plus.setAttribute('aria-expanded', 'false');
    plus.innerHTML = '<span class="barre-bas-icone" aria-hidden="true">⋯</span>'
                   + '<span class="barre-bas-mot">Plus</span>';
    plus.addEventListener('click', function(){
      if(menu.hidden) ouvrirMenu(); else fermerMenu();
    });
    barre.append(plus);

    function ouvrirMenu(){
      menu.hidden = false;
      voile.hidden = false;
      plus.setAttribute('aria-expanded', 'true');
    }
    function fermerMenu(){
      menu.hidden = true;
      voile.hidden = true;
      plus.setAttribute('aria-expanded', 'false');
    }

    // Échap ferme, comme partout ailleurs dans l'application.
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && !menu.hidden) fermerMenu();
    });

    document.body.append(voile, menu, barre);

    // ---- L'état actif suit celui des onglets -----------------------------
    //
    // On ne le déduit pas : on le RECOPIE. La navigation change de page pour
    // dix raisons qui ne passent pas toutes par un clic — showPage() appelée
    // depuis une carte, un retour d'échange, l'ouverture d'un jeu. Observer
    // l'onglet, c'est suivre la vérité au lieu d'en tenir une seconde.
    function suivre(){
      var actif = nav.querySelector('.page-tab.active');
      var cle = actif && actif.dataset.page;
      Object.keys(boutons).forEach(function(k){
        boutons[k].classList.toggle('actif', k === cle);
      });
      // Une page atteinte par le menu allume « Plus » : sans cela, la barre
      // n'indique plus rien dès qu'on quitte les quatre du bas.
      plus.classList.toggle('actif', Boolean(cle) && EN_BAS.indexOf(cle) === -1);
    }
    new MutationObserver(suivre).observe(nav, {
      subtree: true, attributes: true, attributeFilter: ['class'],
    });
    suivre();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', demarrer);
  }else{
    demarrer();
  }
})();
