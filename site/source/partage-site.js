// La page d'un lien de partage. Voir site/source/partage.html.
//
// SANS COMPTE, ET SANS PONT. C'est la seule page du site qui ne charge pas
// pont-api.js : elle n'a qu'un appel à faire, et cet appel est le seul du
// service qui se passe de jeton. Charger le pont y poserait une session, une
// gestion d'erreurs et un window.__TAURI__ dont personne ici n'a besoin.
//
// ELLE BÂTIT LE MOBILIER DE L'APPLICATION, PAS LE SIEN. Les jauges sont
// celles de l'accueil (.home-gauge et son anneau SVG), les cases sont les
// cartes du Pokédex (.card, .card-sprite, .card-id, .card-name). On les
// construit ici avec les mêmes classes plutôt que d'en dessiner d'autres :
// une seconde apparence dériverait de la première au premier changement de
// palette, et personne ne le verrait avant longtemps.
//
// LA LISTE VIENT DE LA MÊME RÉSERVE QUE L'APPLICATION. GAMES dit quels
// Pokédex régionaux appartiennent au jeu ; DONNEES_EMBARQUEES.dex les porte
// sous la forme [[espèce, n° régional], …] et .entrees le nom français de
// chaque espèce.

(function(){
  'use strict';

  var API = (window.POKEPENSION_API || 'http://127.0.0.1:8787').replace(/\/+$/, '');

  // Le même rayon que dans l'accueil de l'application : r = 31 dans le SVG.
  var TOUR_JAUGE = 2 * Math.PI * 31;

  var attente = document.getElementById('ptAttente');
  var echec = document.getElementById('ptEchec');
  var contenu = document.getElementById('ptContenu');

  function montrerEchec(titre, mot){
    attente.hidden = true;
    contenu.hidden = true;
    echec.hidden = false;
    document.getElementById('ptEchecTitre').textContent = titre;
    document.getElementById('ptEchecMot').textContent = mot;
  }

  /**
   * Le code, tiré de l'adresse.
   *
   * Deux formes acceptées : « /p/K7M2-QX4P », celle qu'on colle, et
   * « ?code=… », celle qu'on tape quand on a reçu le code sans le lien.
   */
  function codeDeLAdresse(){
    var m = location.pathname.match(/\/p\/([A-Za-z0-9-]+)/);
    if(m) return m[1];
    return new URLSearchParams(location.search).get('code') || '';
  }

  // ---- La réserve, telle que l'application la lit ---------------------------

  function jeuDe(cle){
    if(typeof GAMES === 'undefined') return null;
    for(var i = 0; i < GAMES.length; i++){ if(GAMES[i].key === cle) return GAMES[i]; }
    return null;
  }

  /**
   * Les entrées d'un Pokédex de jeu : [{ espece, numero, nom, slug }].
   *
   * UN JEU PEUT AVOIR PLUSIEURS DEX — Épée / Bouclier et ses deux extensions,
   * Écarlate / Violet et les siennes. GAMES les liste dans regional.dexes, et
   * on les met bout à bout dans cet ordre : c'est celui du jeu.
   */
  function listeDuJeu(cleJeu){
    var jeu = jeuDe(cleJeu);
    if(!jeu || !jeu.regional || !jeu.regional.dexes) return null;
    var tables = DONNEES_EMBARQUEES.dex || {};
    var parEspece = {};
    (DONNEES_EMBARQUEES.entrees || []).forEach(function(e){
      // La forme de BASE représente son espèce : c'est elle que la liste
      // régionale numérote, et son nom est celui qu'on attend à l'écran.
      if(e.id === e.speciesId && !e.spriteOnly) parEspece[e.speciesId] = e;
    });

    var vues = {};
    var sortie = [];
    jeu.regional.dexes.forEach(function(nomDex){
      (tables[nomDex] || []).forEach(function(paire){
        var espece = paire[0], numero = paire[1];
        if(vues[espece]) return;          // une extension peut redire une espèce
        vues[espece] = true;
        var e = parEspece[espece];
        if(e) sortie.push({ espece: espece, numero: numero, nom: e.display,
                          slug: e.name, gen: e.gen || 0, national: e.speciesId });
      });
    });
    return sortie.length ? sortie : null;
  }

  function spriteUrl(slug, shiny){
    return 'https://play.pokemonshowdown.com/sprites/'
      + (shiny ? 'home-shiny/' : 'home/') + slug + '.png';
  }

  // ---- Les jauges de l'accueil, à l'identique ------------------------------

  function jauge(cible, libelle, combien, total, shiny){
    var pct = total ? Math.round((combien / total) * 100) : 0;

    var bloc = document.createElement('div');
    bloc.className = 'home-gauge' + (shiny ? ' shiny' : '');

    var anneau = document.createElement('div');
    anneau.className = 'gauge';
    anneau.innerHTML =
      '<svg viewBox="0 0 74 74">'
      + '<circle class="track" cx="37" cy="37" r="31"></circle>'
      + '<circle class="fill" cx="37" cy="37" r="31" stroke-dasharray="' + TOUR_JAUGE
      + '" stroke-dashoffset="' + (TOUR_JAUGE * (1 - pct / 100)) + '"></circle>'
      + '</svg>'
      + '<div class="gauge-value">' + (total ? pct + '%' : '—') + '</div>';

    var etiquette = document.createElement('div');
    etiquette.className = 'home-gauge-label';
    var fort = document.createElement('strong');
    fort.textContent = String(combien);
    var sur = document.createElement('span');
    sur.textContent = total ? '/ ' + total : '';
    var quoi = document.createElement('em');
    quoi.textContent = (shiny ? '✨ ' : '⬤ ') + libelle;
    etiquette.append(fort, sur, quoi);

    bloc.append(anneau, etiquette);
    cible.append(bloc);
  }

  // ---- Les cartes du Pokédex, à l'identique --------------------------------

  function carte(e, pris, brillant){
    var card = document.createElement('div');
    // .is-owned est la classe de l'application : le vert de « possédé ».
    // .est-shiny est la seule que cette page ajoute — l'application peint l'or
    // par un mode global, alors qu'ici les deux formes coexistent à l'écran.
    card.className = 'card' + (pris || brillant ? ' is-owned' : '')
      + (brillant ? ' est-shiny' : '');
    if(!pris && !brillant) card.dataset.manque = '1';

    var cadre = document.createElement('div');
    cadre.className = 'card-sprite';

    var num = document.createElement('span');
    num.className = 'card-id';
    num.textContent = '#' + String(e.numero).padStart(3, '0');
    num.title = 'N° ' + e.numero + ' dans ce Pokédex';
    cadre.append(num);

    var img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = '';
    img.src = spriteUrl(e.slug, brillant);
    // Un sprite chromatique peut manquer là où l'ordinaire existe : on
    // retombe dessus plutôt que de laisser un cadre vide.
    img.addEventListener('error', function(){
      if(img.dataset.repli) return;
      img.dataset.repli = '1';
      img.src = spriteUrl(e.slug, false);
    });
    cadre.append(img);

    var nom = document.createElement('div');
    nom.className = 'card-name';
    nom.textContent = e.nom;

    card.append(cadre, nom);
    return card;
  }

  // ---- L'affichage ---------------------------------------------------------

  function jourLisible(iso){
    try{
      return new Date(iso).toLocaleDateString('fr-FR',
        { day: 'numeric', month: 'long', year: 'numeric' });
    }catch(e){ return String(iso).slice(0, 10); }
  }

  function dessiner(p){
    document.title = 'Le Pokédex de ' + p.pseudo + ' — PokéPension';
    document.getElementById('ptPseudo').textContent = p.pseudo;
    document.getElementById('ptBadge').hidden = false;

    var av = document.getElementById('ptAvatar');
    if(p.avatar){ av.src = p.avatar; av.alt = ''; }
    else av.remove();

    var jeu = jeuDe(p.jeu);
    var titreJeu = jeu ? jeu.title
      : (p.jeu === 'national' ? 'Collection Pokémon HOME' : p.jeu);
    document.getElementById('ptEyebrow').textContent = 'Aventure « ' + p.profil + ' »';
    document.getElementById('ptTitre').textContent = titreJeu;

    if(jeu && jeu.visuels && jeu.visuels[0]){
      var logo = document.getElementById('ptLogo');
      logo.src = '/vignettes/' + jeu.visuels[0] + '.webp';
      logo.alt = titreJeu;
      logo.hidden = false;
    }

    var pris = {};
    (p.dex.caught || []).forEach(function(n){ pris[n] = true; });
    var brillants = {};
    (p.dex.shiny || []).forEach(function(n){ brillants[n] = true; });

    var liste = listeDuJeu(p.jeu);
    var jauges = document.getElementById('ptJauges');

    if(liste){
      var combien = 0, combienShiny = 0;
      liste.forEach(function(e){
        if(pris[e.slug]) combien++;
        if(brillants[e.slug]) combienShiny++;
      });
      jauge(jauges, 'forme normale', combien, liste.length, false);
      jauge(jauges, 'forme shiny', combienShiny, liste.length, true);

      // LA PHRASE QUE L'ACCUEIL DE L'APPLICATION ÉCRIT AUSSI : un compte se
      // lit mieux dit que compté. « 101 / 151 » est exact ; « il lui en
      // manque 50 » est ce qu'on retient.
      var manque = liste.length - combien;
      document.getElementById('ptPhrase').textContent = manque === 0
        ? (p.pseudo + ' a terminé ce Pokédex en forme normale — il lui reste '
           + (liste.length - combienShiny) + ' formes shiny à chasser.')
        : ('Il manque ' + manque + ' Pokémon à ' + p.pseudo + ' sur ce Pokédex, '
           + 'et ' + combienShiny + ' y sont déjà en chromatique.');

      dessinerGrille(liste, pris, brillants,
        (jeu && jeu.regional && jeu.regional.label) || 'Le Pokédex',
        combien);
    }else{
      // NATIONAL, OU UN JEU SANS LISTE RÉGIONALE. On ne fabrique pas un
      // dénominateur : compter sur 1 281 supposerait le niveau de formes de
      // l'autre, qu'on ne connaît pas ici. On dit ce qu'on sait — combien de
      // Pokémon — et on se tait sur le reste.
      jauge(jauges, 'possédés', (p.dex.caught || []).length, 0, false);
      jauge(jauges, 'en chromatique', (p.dex.shiny || []).length, 0, true);
      document.getElementById('ptPhrase').textContent =
        'Cette collection réunit tous les jeux : son total dépend du niveau de '
        + 'formes choisi par ' + p.pseudo + ', qu’un visiteur ne peut pas deviner.';
    }

    if(p.majLe){
      document.getElementById('ptFraicheur').textContent =
        'Dernière mise à jour de ce Pokédex : ' + jourLisible(p.majLe) + '.';
    }

    attente.hidden = true;
    contenu.hidden = false;
  }

  function dessinerGrille(liste, pris, brillants, libelle, combien){
    document.getElementById('ptGrilleTitre').textContent = libelle;
    document.getElementById('ptGrilleCompte').textContent =
      combien + ' sur ' + liste.length;
    var grille = document.getElementById('ptGrille');
    liste.forEach(function(e, rang){
      var c = carte(e, pris[e.slug], brillants[e.slug]);
      // CE QUE LE TRI RELIRA. On pose sur la carte de quoi la reclasser, pour
      // n'avoir jamais a la rebatir : rebatir redemanderait cent cinquante
      // sprites a chaque changement d'ordre.
      c.dataset.rang = rang;                 // l'ordre du jeu, tel quel
      c.dataset.gen = e.gen || 0;
      c.dataset.national = e.national || 0;
      c.dataset.nom = e.nom;
      grille.append(c);
    });
  }

  // ---- Trier et filtrer ----------------------------------------------------
  //
  // LES DEUX MENUS DU POKEDEX, AUX MEMES LIBELLES. On ne rebatit jamais la
  // grille : les cartes portent de quoi se reclasser et de quoi se cacher, et
  // rebatir redemanderait cent cinquante sprites a chaque changement.
  //
  // Ce sont des <select> nus : menus.js les habille, comme partout ailleurs
  // dans le projet. Ecrire un menu a la main ici en aurait fait un second a
  // tenir d'accord avec le premier — la derive que menus.js existe pour
  // empecher, et qu'il porte ecrite en toutes lettres dans son en-tete.

  var TRIS = {
    jeu: function(a, b){ return Number(a.dataset.rang) - Number(b.dataset.rang); },
    national: function(a, b){ return Number(a.dataset.national) - Number(b.dataset.national); },
    // A generation egale, on garde l'ordre du jeu : deux Pokemon d'une meme
    // generation ne doivent pas se croiser d'un tri a l'autre.
    gen: function(a, b){
      return (Number(a.dataset.gen) - Number(b.dataset.gen))
          || (Number(a.dataset.rang) - Number(b.dataset.rang));
    },
    nom: function(a, b){ return a.dataset.nom.localeCompare(b.dataset.nom, 'fr'); },
  };

  function trier(quoi){
    var grille = document.getElementById('ptGrille');
    var cartes = Array.prototype.slice.call(grille.children);
    cartes.sort(TRIS[quoi] || TRIS.jeu);
    // Un seul remaniement du document, et les images ne rechargent pas : un
    // noeud deplace garde sa ressource.
    var lot = document.createDocumentFragment();
    cartes.forEach(function(c){ lot.append(c); });
    grille.append(lot);
  }

  function filtrer(quoi){
    var grille = document.getElementById('ptGrille');
    grille.classList.toggle('manquants', quoi === 'manque');
    grille.classList.toggle('possedes', quoi === 'pris');
  }

  document.getElementById('ptTri').addEventListener('change', function(e){
    trier(e.target.value);
  });
  document.getElementById('ptFiltre').addEventListener('change', function(e){
    filtrer(e.target.value);
  });

  // ---- L'appel -------------------------------------------------------------

  var code = codeDeLAdresse();
  if(!code){
    montrerEchec('Il manque le code',
      'Cette adresse ne porte aucun code de partage. Celui qui te l’a envoyée '
      + 'a peut-être coupé la fin du lien.');
  }else{
    fetch(API + '/api/partage/' + encodeURIComponent(code))
      .then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(d){
          return { statut: r.status, corps: d };
        });
      })
      .then(function(r){
        if(r.statut === 410){
          montrerEchec('Ce lien a été retiré',
            'Son auteur l’a révoqué. Ce n’est pas une erreur de ta part, et le '
            + 'code que tu as est bien celui qu’il t’avait donné.');
          return;
        }
        if(r.statut === 404){
          montrerEchec('Ce lien n’existe pas',
            'Le code « ' + code + ' » ne correspond à aucun partage. Un caractère '
            + 'a peut-être sauté en le recopiant.');
          return;
        }
        if(r.statut !== 200 || !r.corps || !r.corps.dex){
          montrerEchec('Le Pokédex n’a pas pu être ouvert',
            (r.corps && r.corps.erreur) || 'Réessaie dans un instant.');
          return;
        }
        dessiner(r.corps);
      })
      .catch(function(){
        montrerEchec('PokéPension ne répond pas',
          'Le lien est peut-être bon : c’est le serveur qui ne répond pas pour '
          + 'l’instant. Réessaie dans un moment.');
      });
  }
})();
