// La page d'un lien de partage. Voir site/source/partage.html.
//
// SANS COMPTE, ET SANS PONT. C'est la seule page du site qui ne charge pas
// pont-api.js : elle n'a qu'un appel à faire, et cet appel est le seul du
// service qui se passe de jeton. Charger le pont y poserait une session, une
// gestion d'erreurs et un window.__TAURI__ dont personne ici n'a besoin.
//
// LA LISTE VIENT DE LA MÊME RÉSERVE QUE L'APPLICATION. GAMES dit quels Pokédex
// régionaux appartiennent au jeu ; DONNEES_EMBARQUEES.dex porte chaque liste
// sous la forme [[espèce, n° régional], …] et .entrees le nom français de
// chaque espèce. Rien n'est recopié ici : une seconde liste dériverait au
// premier jeu ajouté, et personne ne s'en apercevrait avant des semaines.

(function(){
  'use strict';

  var API = (window.POKEPENSION_API || 'http://127.0.0.1:8787').replace(/\/+$/, '');

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
    var p = new URLSearchParams(location.search).get('code');
    return p || '';
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
        if(!e) return;
        sortie.push({ espece: espece, numero: numero, nom: e.display, slug: e.name });
      });
    });
    return sortie.length ? sortie : null;
  }

  function spriteUrl(slug, shiny){
    return 'https://play.pokemonshowdown.com/sprites/'
      + (shiny ? 'home-shiny/' : 'home/') + slug + '.png';
  }

  // ---- L'affichage ---------------------------------------------------------

  function jauge(cible, libelle, combien, total, teinte){
    var pct = total ? Math.round((combien / total) * 100) : 0;
    var bloc = document.createElement('div');
    bloc.className = 'pt-jauge ' + teinte;
    var chiffre = document.createElement('b');
    chiffre.textContent = combien + (total ? ' / ' + total : '');
    var nom = document.createElement('span');
    nom.textContent = libelle;
    var barre = document.createElement('i');
    var dedans = document.createElement('u');
    dedans.style.width = pct + '%';
    barre.append(dedans);
    var part = document.createElement('em');
    part.textContent = total ? pct + ' %' : '';
    bloc.append(chiffre, nom, barre, part);
    cible.append(bloc);
  }

  function dessiner(p){
    document.getElementById('ptPseudo').textContent = p.pseudo;
    document.title = 'Le Pokédex de ' + p.pseudo + ' — PokéPension';

    var av = document.getElementById('ptAvatar');
    if(p.avatar){ av.src = p.avatar; av.alt = 'Avatar de ' + p.pseudo; }
    else av.remove();

    var jeu = jeuDe(p.jeu);
    var titreJeu = jeu ? jeu.title
      : (p.jeu === 'national' ? 'Collection Pokémon HOME' : p.jeu);
    document.getElementById('ptSous').textContent =
      titreJeu + ' · aventure « ' + p.profil + ' »';

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
      jauge(jauges, 'forme normale', combien, liste.length, 'normal');
      jauge(jauges, 'forme chromatique', combienShiny, liste.length, 'shiny');
      dessinerGrille(liste, pris, brillants,
        (jeu && jeu.regional && jeu.regional.label) || 'Le Pokédex');
    }else{
      // NATIONAL, OU UN JEU SANS LISTE RÉGIONALE. On ne fabrique pas un
      // dénominateur : compter sur 1 281 supposerait le niveau de formes de
      // l'autre, qu'on ne connaît pas ici. On dit ce qu'on sait — combien de
      // Pokémon — et on se tait sur le reste.
      jauge(jauges, 'Pokémon possédés', (p.dex.caught || []).length, 0, 'normal');
      jauge(jauges, 'en chromatique', (p.dex.shiny || []).length, 0, 'shiny');
    }

    if(p.majLe){
      document.getElementById('ptFraicheur').textContent =
        'Dernière mise à jour de ce Pokédex : ' + jourLisible(p.majLe) + '.';
    }

    attente.hidden = true;
    contenu.hidden = false;
  }

  function jourLisible(iso){
    try{
      return new Date(iso).toLocaleDateString('fr-FR',
        { day: 'numeric', month: 'long', year: 'numeric' });
    }catch(e){ return String(iso).slice(0, 10); }
  }

  function dessinerGrille(liste, pris, brillants, libelle){
    var grille = document.getElementById('ptGrille');
    document.getElementById('ptGrilleTitre').textContent = libelle;
    document.getElementById('ptGrilleBloc').hidden = false;

    liste.forEach(function(e){
      var a = pris[e.slug], b = brillants[e.slug];
      var case_ = document.createElement('div');
      case_.className = 'pt-case' + (b ? ' shiny' : (a ? ' pris' : ''));
      if(!a && !b) case_.dataset.manque = '1';

      var boite = document.createElement('div');
      boite.className = 'pt-case-image';
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = '';
      img.src = spriteUrl(e.slug, b);
      // Un sprite chromatique peut manquer là où l'ordinaire existe : on
      // retombe dessus plutôt que de laisser un cadre vide.
      img.addEventListener('error', function(){
        if(img.dataset.repli) return;
        img.dataset.repli = '1';
        img.src = spriteUrl(e.slug, false);
      });
      boite.append(img);

      var nom = document.createElement('span');
      nom.className = 'pt-case-nom';
      nom.textContent = e.nom;
      var num = document.createElement('span');
      num.className = 'pt-case-num';
      num.textContent = (b ? '✨ ' : '') + 'N° ' + String(e.numero).padStart(3, '0');

      case_.append(boite, nom, num);
      grille.append(case_);
    });
  }

  // ---- Les deux filtres ----------------------------------------------------

  function filtrer(manquantsSeuls){
    document.getElementById('ptGrille').classList.toggle('manquants', manquantsSeuls);
    document.getElementById('ptTous').setAttribute('aria-pressed', String(!manquantsSeuls));
    document.getElementById('ptManquants').setAttribute('aria-pressed', String(manquantsSeuls));
  }
  document.getElementById('ptTous').addEventListener('click', function(){ filtrer(false); });
  document.getElementById('ptManquants').addEventListener('click', function(){ filtrer(true); });

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
