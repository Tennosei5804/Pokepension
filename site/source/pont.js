// Le pont : ce que Tauri faisait, fait par le navigateur.
//
// Script classique, chargé AVANT tous les autres — il doit poser
// window.__TAURI__ avant que compte.js ne le cherche, sans quoi l'application
// affiche « Le pont Tauri est absent » et s'arrête là.
//
// POURQUOI CE FICHIER SUFFIT. Le frontend de PokéPension est du web ordinaire :
// sur ses trente-sept scripts, cinq seulement nomment window.__TAURI__, et
// quatre le font derrière une garde qui les fait se taire s'il manque. Le seul vrai point
// de contact est invoke(), trente-huit commandes. Les recréer ici suffit à
// faire tourner l'application entière dans un navigateur — c'est déjà ce que
// fait le banc d'essai avec un jeu de fausses réponses.
//
// LA DIFFÉRENCE AVEC LE BANC, c'est qu'ici les réponses sont vraies. Ce qu'on
// coche est gardé, retrouvé au retour, et daté au passage.
//
// ────────────────────────────────────────────────────────────────────────────
// CE SITE NE PARLE À AUCUN SERVEUR, et c'est délibéré pour l'instant.
//
// L'API refuse les requêtes venues d'un autre domaine — elle n'ouvre pas le
// CORS —, et sa connexion Discord est bâtie pour l'application de bureau :
// elle renvoie vers un port ouvert sur la machine du joueur. Tant que
// l'hébergement du site n'est pas décidé, prétendre se connecter ne ferait
// qu'échouer.
//
// Tout vit donc dans ce navigateur, et RIEN N'EN SORT. C'est écrit en clair
// dans le bandeau du site : personne ne doit croire que sa collection est
// sauvegardée ailleurs alors qu'elle tient dans un localStorage.
//
// LE JOUR OÙ L'API SERA JOIGNABLE, il n'y a qu'un endroit à changer : la
// fonction repondre() plus bas choisit entre la réserve locale et le réseau.
// Les trente-huit commandes gardent la même forme des deux côtés, parce que
// c'est celle que l'application attend — les formes sont copiées de l'API,
// pas inventées ici.

(function(){
  'use strict';

  // ---- La réserve -----------------------------------------------------------
  //
  // Une seule clé, un seul objet. Le dex complet pèse quelques dizaines de
  // kilo-octets une fois en JSON : très loin des cinq mégaoctets que les
  // navigateurs accordent, et bien plus simple à relire d'un bloc qu'éparpillé
  // en vingt clés qu'il faudrait garder d'accord.
  const CLE = 'pokearchive-site-v1';

  const VIDE = {
    dresseur: null,          // { pseudo } — un nom local, pas un compte Discord
    profils: [],             // les aventures
    dex: {},                 // profilId -> le dex enregistré
    journal: [],             // { id, profilId, jour, pokemon, dex, chromatique }
    dernierId: 0,            // pour les aventures
    dernierJournalId: 0,     // pour les lignes de journal
  };

  function lire(){
    try{
      const brut = localStorage.getItem(CLE);
      if(!brut) return JSON.parse(JSON.stringify(VIDE));
      const x = JSON.parse(brut);
      // Une réserve écrite par une version plus ancienne peut manquer d'un
      // champ. On complète plutôt que de refuser : perdre la collection de
      // quelqu'un parce qu'un tableau manque serait le pire des échanges.
      return Object.assign(JSON.parse(JSON.stringify(VIDE)), x);
    }catch(e){
      // JSON abîmé, stockage refusé, navigation privée pleine : on repart d'un
      // état vide plutôt que de laisser l'application morte au chargement.
      console.error('Réserve illisible, on repart à neuf :', e);
      return JSON.parse(JSON.stringify(VIDE));
    }
  }

  function ecrire(etat){
    try{
      localStorage.setItem(CLE, JSON.stringify(etat));
      return true;
    }catch(e){
      // Quota dépassé, ou stockage interdit. Le dire fort : une sauvegarde qui
      // échoue en silence est pire que pas de sauvegarde du tout, puisqu'on
      // continue de cocher en croyant que c'est gardé.
      console.error('Enregistrement impossible :', e);
      if(typeof prevenirErreur === 'function'){
        prevenirErreur('Enregistrement impossible',
          'Ton navigateur a refusé d’écrire. En navigation privée, ou si le '
          + 'stockage est plein, rien ne peut être gardé.');
      }
      return false;
    }
  }

  // ---- Les dates -------------------------------------------------------------
  //
  // Même format que le serveur — « AAAA-MM-JJ » —, parce que la rétrospective
  // et les succès le comparent tel quel. Une Date introduirait un fuseau, et un
  // fuseau décale les jours : assez pour qu'une capture de 23 h tombe le
  // lendemain.

  function aujourdhui(){
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  const maintenant = () => new Date().toISOString();

  // ---- Le journal ------------------------------------------------------------

  /**
   * Ce qui vient d'apparaître dans le dex, comparé à ce qui y était.
   *
   * Le dex s'enregistre en bloc : rien n'indique QUAND une case a été cochée.
   * En confrontant l'ancien enregistrement au nouveau, on retrouve les ajouts
   * et on les date — c'est mot pour mot ce que fait l'API dans nouveautes(),
   * et c'est ce qui fait marcher la rétrospective et les succès ici aussi.
   *
   * Les retraits ne sont pas journalisés : décocher est une correction, pas un
   * événement de collection.
   */
  function dater(avant, apres, profilId, prochainId){
    const ajouts = [];
    let id = prochainId;
    const jour = aujourdhui();
    const anciens = (avant && avant.dex) || {};
    const recents = (apres && apres.dex) || {};

    Object.keys(recents).forEach(function(cle){
      ['caught', 'shiny'].forEach(function(champ){
        const deja = new Set((anciens[cle] && anciens[cle][champ]) || []);
        ((recents[cle] && recents[cle][champ]) || []).forEach(function(nom){
          if(!deja.has(nom)){
            // Un identifiant croissant, parce que la pagination se fait DESSUS
            // et non sur un décalage : c'est le contrat de l'API, et une
            // insertion pendant la lecture ne décale alors aucune page.
            ajouts.push({ id: ++id, profilId: profilId, jour: jour,
                          pokemon: String(nom), dex: String(cle),
                          chromatique: champ === 'shiny' ? 1 : 0 });
          }
        });
      });
    });
    return ajouts;
  }

  /** Les captures par jour, du plus récent au plus ancien. */
  function parJour(journal){
    const m = new Map();
    journal.forEach(function(l){
      if(!m.has(l.jour)) m.set(l.jour, { jour: l.jour, combien: 0, chromatiques: 0 });
      const j = m.get(l.jour);
      j.combien++;
      if(l.chromatique) j.chromatiques++;
    });
    return [...m.values()].sort((a, b) => (a.jour < b.jour ? 1 : -1));
  }

  /** Les captures par jeu, du plus fourni au moins fourni. */
  function parJeu(journal){
    const m = new Map();
    journal.forEach(function(l){ m.set(l.dex, (m.get(l.dex) || 0) + 1); });
    return [...m.entries()].map(([dex, combien]) => ({ dex: dex, combien: combien }))
                           .sort((a, b) => b.combien - a.combien);
  }

  /** Une ligne de journal, dans la forme que l'application affiche. */
  function ligneJournal(l){
    return { id: l.id, pokemon: l.pokemon, dex: l.dex,
             chromatique: l.chromatique, ajoute_le: l.jour };
  }

  /**
   * Une page de journal, du plus récent au plus ancien.
   *
   * « avant » est un IDENTIFIANT et non un rang : on rend ce qui lui est
   * strictement antérieur. Une ligne de plus que demandé est lue pour savoir
   * s'il y a une suite, exactement comme le fait l'API — sans avoir à compter
   * la table entière à chaque page.
   */
  function pageAvant(lignes, avant, combien){
    const borne = Math.min(Math.max(Number(combien) || 50, 1), 200);
    const curseur = Number(avant);
    let suite = lignes.slice().sort((a, b) => b.id - a.id);
    if(Number.isInteger(curseur) && curseur > 0){
      suite = suite.filter((l) => l.id < curseur);
    }
    return { lignes: suite.slice(0, borne), encore: suite.length > borne };
  }

  // ---- Les aventures ---------------------------------------------------------

  /**
   * L'aventure sur laquelle on travaille.
   *
   * L'application passe « profil: null » tant qu'elle ne sait pas encore
   * laquelle : c'est le cas au tout premier chargement. On rend alors celle par
   * défaut, exactement comme le fait l'API.
   */
  function profilRetenu(etat, id){
    if(id != null){
      const x = etat.profils.find((p) => p.id === id);
      if(x) return x;
    }
    return etat.profils.find((p) => p.par_defaut) || etat.profils[0] || null;
  }

  /** La première aventure, créée sans qu'on ait à la demander. */
  function premiereAventure(etat){
    if(etat.profils.length) return etat;
    etat.dernierId = 1;
    etat.profils.push({
      id: 1, nom: 'Aventure 1', public: 0, par_defaut: 1,
      mode: 'capture', niveau_formes: 3,
      captures: 0, shiny: 0, cree_le: maintenant(), maj_le: null,
    });
    return etat;
  }

  /**
   * L'union de deux dex — la règle de fusion de l'import.
   *
   * Recopiée de reunirDex() dans api/src/comptes.js, à la lettre. Les deux se
   * modifient ensemble : une union qui diffère d'un côté ferait diverger les
   * deux collections dès le premier aller-retour entre le site et
   * l'application, et c'est cet aller-retour que l'import existe pour rendre
   * possible.
   */
  function reunirDex(ancien, nouveau){
    const sortie = Object.assign({}, ancien || {});
    const listes = (o, cle) => (o && Array.isArray(o[cle]) ? o[cle] : []);

    ['captures', 'caught', 'shiny'].forEach(function(cle){
      const reunion = new Set(listes(ancien, cle).concat(listes(nouveau, cle)));
      if(reunion.size) sortie[cle] = [...reunion];
    });

    const parJeu = Object.assign({}, (ancien && ancien.dex) || {});
    Object.keys((nouveau && nouveau.dex) || {}).forEach(function(jeu){
      const a = parJeu[jeu] || {};
      const b = nouveau.dex[jeu] || {};
      parJeu[jeu] = {
        caught: [...new Set(listes(a, 'caught').concat(listes(b, 'caught')))],
        shiny: [...new Set(listes(a, 'shiny').concat(listes(b, 'shiny')))],
      };
    });
    if(Object.keys(parJeu).length) sortie.dex = parJeu;

    // Les chasses en cours sont des compteurs : les additionner donnerait un
    // nombre faux. On garde le côté le plus avancé.
    const cA = (ancien && ancien.chasses) || [];
    const cB = (nouveau && nouveau.chasses) || [];
    sortie.chasses = cB.length > cA.length ? cB : cA;

    // Les fiches de capture se réunissent par clé, et LA VALEUR EXISTANTE
    // GAGNE : un import ajoute, il n'écrase pas.
    const details = Object.assign({}, (nouveau && nouveau.detailsCapture) || {});
    Object.keys((ancien && ancien.detailsCapture) || {}).forEach(function(jeu){
      details[jeu] = Object.assign({}, details[jeu] || {}, ancien.detailsCapture[jeu]);
    });
    if(Object.keys(details).length) sortie.detailsCapture = details;

    // Les chasses abouties sont des évènements datés : elles se réunissent.
    const finies = new Map();
    [].concat((ancien && ancien.chassesFinies) || [],
              (nouveau && nouveau.chassesFinies) || []).forEach(function(c){
      if(!c || typeof c !== 'object') return;
      finies.set(c.pokemon + '|' + c.dex + '|' + c.fin, c);
    });
    if(finies.size) sortie.chassesFinies = [...finies.values()];

    return sortie;
  }

  /** Compter les espèces d'un dex, comme le fait l'API : sans doublon. */
  function compter(donnees, champ){
    const vus = new Set();
    const ajouter = (l) => { for(const n of l || []) vus.add(n); };
    ajouter(champ === 'caught' ? (donnees.captures || donnees.caught) : donnees.shiny);
    const jeux = donnees.dex || {};
    for(const cle of Object.keys(jeux)) ajouter(jeux[cle] && jeux[cle][champ]);
    return vus.size;
  }

  // ---- Ce qui a besoin d'un serveur ------------------------------------------
  //
  // Le classement, les amis, la visite d'un dresseur : tout cela suppose
  // d'autres joueurs, donc une base commune. Hors ligne, on rend des listes
  // vides plutôt que d'inventer des gens — un classement peuplé de dresseurs
  // imaginaires serait une tromperie, et un écran vide se comprend.
  //
  // L'application affiche déjà « Personne d'autre pour l'instant » dans ce cas,
  // sans qu'il y ait rien à changer.
  const HORS_LIGNE = new Error('HORS_LIGNE');

  // ---- Les trente-huit commandes ----------------------------------------------
  //
  // Les formes rendues sont celles de l'API, pas des approximations : elles
  // sont reprises de api/src/serveur.js et du banc d'essai. Une forme
  // approchée casserait l'application à l'endroit le moins prévisible.

  const COMMANDES = {

    // --- Session et identité -------------------------------------------------
    //
    // IL N'Y A PAS DE COMPTE ICI, et il ne doit donc pas y avoir d'écran de
    // connexion. La collection tient dans le localStorage de ce navigateur :
    // personne ne s'authentifie auprès de personne, rien ne part nulle part, et
    // demander un nom avant de laisser cocher une case était un péage sans
    // guichet — on le payait sans que quiconque encaisse.
    //
    // On ouvre donc le carnet directement. Le nom sert à l'affichage, se change
    // dans « Profil » quand on en a envie, et vaut « Dresseur » en attendant.
    //
    // Se déconnecter oublie ce nom, PAS la collection — et le prochain
    // chargement en repose un neuf. C'est ce que veut dire « se déconnecter »
    // d'un carnet qui n'appartient qu'à ce navigateur.
    etat: function(){
      const e = premiereAventure(lire());
      if(!e.dresseur) e.dresseur = { pseudo: 'Dresseur' };
      ecrire(e);
      return { connecte: true };
    },

    moi: function(){
      const e = lire();
      if(!e.dresseur) throw new Error('SESSION_INVALIDE');
      const p = profilRetenu(e, null);
      const d = (p && e.dex[p.id]) || null;
      return {
        dresseur: { id: 1, pseudo: e.dresseur.pseudo, discordId: null, avatar: null },
        resume: {
          captures: d ? compter(d, 'caught') : 0,
          shiny: d ? compter(d, 'shiny') : 0,
          majLe: (p && p.maj_le) || null,
        },
      };
    },

    // Pas de Discord ici : il n'y a pas de serveur pour tenir l'échange. On
    // ouvre un compte local, dont le nom ne sert qu'à l'affichage.
    connexion: function(a){
      const e = premiereAventure(lire());
      const nom = (a && a.pseudo) || (e.dresseur && e.dresseur.pseudo) || 'Dresseur';
      e.dresseur = { pseudo: String(nom).slice(0, 12) };
      ecrire(e);
      return { pseudo: e.dresseur.pseudo };
    },

    deconnexion: function(){
      const e = lire();
      // On oublie le nom, PAS la collection. Se déconnecter d'un compte local
      // ne doit pas effacer des mois de cochage — et il n'y a pas de serveur
      // d'où la retélécharger.
      e.dresseur = null;
      ecrire(e);
      return { ok: true };
    },

    changer_pseudo: function(a){
      const e = lire();
      if(!e.dresseur) throw new Error('SESSION_INVALIDE');
      e.dresseur.pseudo = String((a && a.pseudo) || '').slice(0, 12) || e.dresseur.pseudo;
      ecrire(e);
      return { pseudo: e.dresseur.pseudo };
    },

    changer_visibilite: () => ({ ok: true }),

    // Une session par navigateur, et c'est celle-ci. La liste existe pour que
    // l'écran qui l'affiche ait quelque chose de vrai à montrer.
    sessions: function(){
      return { sessions: [{ id: 1, courante: true, cree_le: maintenant(),
                            vue_le: maintenant(), agent: 'Ce navigateur' }] };
    },
    fermer_session: () => ({ ok: true }),
    fermer_les_autres: () => ({ fermees: 0 }),

    // --- Les aventures --------------------------------------------------------

    profils: function(){
      const e = premiereAventure(lire());
      ecrire(e);
      return { profils: e.profils.map((p) => Object.assign({}, p)) };
    },

    creer_profil: function(a){
      const e = lire();
      const n = {
        id: ++e.dernierId, nom: String((a && a.nom) || 'Nouvelle aventure').slice(0, 32),
        public: 0, par_defaut: e.profils.length ? 0 : 1,
        mode: (a && a.mode) || 'capture',
        niveau_formes: (a && a.niveauFormes) != null ? a.niveauFormes : 3,
        captures: 0, shiny: 0, cree_le: maintenant(), maj_le: null,
      };
      e.profils.push(n);
      ecrire(e);
      return { profil: Object.assign({}, n) };
    },

    modifier_profil: function(a){
      const e = lire();
      const x = e.profils.find((p) => p.id === (a && a.id));
      if(!x) throw new Error('PROFIL_INTROUVABLE');
      if(a.nom != null) x.nom = String(a.nom).slice(0, 32);
      if(a.mode != null) x.mode = a.mode;
      if(a.niveauFormes != null) x.niveau_formes = a.niveauFormes;
      if(a.parDefaut) e.profils.forEach((p) => { p.par_defaut = p.id === x.id ? 1 : 0; });
      ecrire(e);
      return { ok: true };
    },

    supprimer_profil: function(a){
      const e = lire();
      const i = e.profils.findIndex((p) => p.id === (a && a.id));
      if(i < 0) throw new Error('PROFIL_INTROUVABLE');
      // Le même refus que l'API : sans aventure, il n'y a plus rien où cocher.
      if(e.profils.length <= 1) throw new Error("C'est ta seule aventure.");
      const [ote] = e.profils.splice(i, 1);
      delete e.dex[ote.id];
      if(ote.par_defaut && e.profils.length) e.profils[0].par_defaut = 1;
      ecrire(e);
      return { ok: true };
    },

    // --- Le dex ---------------------------------------------------------------

    lire_dex: function(a){
      const e = lire();
      const p = profilRetenu(e, a && a.profil);
      if(!p) throw new Error('Aucun dex en ligne.');
      const d = e.dex[p.id];
      if(!d) throw new Error('Aucun dex en ligne.');   // aventure neuve : normal
      return Object.assign({}, d, { profilId: p.id });
    },

    ecrire_dex: function(a){
      const e = premiereAventure(lire());
      const p = profilRetenu(e, a && a.profil);
      if(!p) throw new Error('PROFIL_INTROUVABLE');
      const donnees = (a && a.donnees) || {};

      // Dater AVANT d'écraser : c'est la comparaison avec l'ancien qui dit ce
      // qui est neuf, et une fois remplacé il n'y a plus rien à comparer.
      const ajouts = dater(e.dex[p.id], donnees, p.id, e.dernierJournalId);
      if(ajouts.length) e.dernierJournalId = ajouts[ajouts.length - 1].id;
      e.journal = e.journal.concat(ajouts);

      e.dex[p.id] = donnees;
      p.captures = compter(donnees, 'caught');
      p.shiny = compter(donnees, 'shiny');
      p.maj_le = maintenant();
      ecrire(e);
      return { profilId: p.id, captures: p.captures, shiny: p.shiny };
    },

    // --- Le journal -----------------------------------------------------------

    // Deux commandes, parce que deux questions : « qu'ai-je attrapé dans CETTE
    // aventure » et « qu'ai-je attrapé, tout court ». La seconde nomme
    // l'aventure de chaque ligne, la première n'en a pas besoin.
    //
    // LA PAGINATION SE FAIT SUR L'IDENTIFIANT et non sur un décalage : c'est le
    // contrat de l'API, et l'application passe « avant ». Un décalage aurait
    // fait tourner « voir plus » en rond, la première page se resservant
    // indéfiniment.
    historique: function(a){
      const e = lire();
      const p = profilRetenu(e, a && a.id);
      const sien = e.journal.filter((l) => !p || l.profilId === p.id);
      const page = pageAvant(sien, a && a.avant, 60);
      return { lignes: page.lignes.map(ligneJournal),
               total: sien.length, encore: page.encore };
    },

    journal: function(a){
      const e = lire();
      const noms = {};
      e.profils.forEach((p) => { noms[p.id] = p.nom; });
      const page = pageAvant(e.journal, a && a.avant, 50);
      return {
        lignes: page.lignes.map((l) => Object.assign(ligneJournal(l),
                  { aventure: noms[l.profilId] || 'Aventure supprimée' })),
        encore: page.encore,
      };
    },

    retrospective: function(){
      const e = lire();
      const jours = parJour(e.journal);
      return {
        jours: jours,
        jeux: parJeu(e.journal).slice(0, 10),
        total: e.journal.length,
        premier: e.journal.length ? e.journal[0].jour : null,
      };
    },

    /**
     * Le format d'échange, et non le dex brut.
     *
     * C'EST LE FORMAT DE LA SYNCHRO. « pokearchive-1 » est versionné et complet
     * — toutes les aventures, leur dex ET leur historique — et c'est l'API qui
     * le définit, dans exporter(). Le respecter ici n'est pas une politesse :
     * donnees-perso.js lit contenu.aventures pour annoncer « n aventures
     * enregistrées », et le dex brut lui en faisait compter zéro. Le fichier
     * produit par le site était illisible par l'application.
     *
     * Les identifiants d'aventure ne sortent pas : un identifiant de base n'a
     * aucun sens hors de la base, et l'API les retire pour la même raison.
     */
    exporter: function(){
      const e = lire();
      return {
        exporteLe: maintenant(),
        format: 'pokearchive-1',
        dresseur: {
          pseudo: (e.dresseur && e.dresseur.pseudo) || null,
          avatar: null,
          creeLe: null,
        },
        aventures: e.profils.map(function(p){
          return {
            nom: p.nom, public: p.public, par_defaut: p.par_defaut,
            mode: p.mode, niveau_formes: p.niveau_formes,
            cree_le: p.cree_le, maj_le: p.maj_le,
            dex: e.dex[p.id] || null,
            historique: e.journal
              .filter((l) => l.profilId === p.id)
              .map((l) => ({ pokemon: l.pokemon, dex: l.dex,
                             chromatique: l.chromatique, ajoute_le: l.jour })),
          };
        }),
      };
    },

    /**
     * Relire une sauvegarde « pokearchive-1 ».
     *
     * La MÊME règle de fusion que l'API, parce que c'est la même opération :
     * le dex se réunit, l'historique se dédoublonne sur les quatre colonnes,
     * et `maj_le` départage le mode et le niveau de formes. Une règle
     * approchée d'un côté ferait diverger les deux collections dès le premier
     * aller-retour, et c'est précisément l'aller-retour que cet import existe
     * pour permettre.
     *
     * Rend la même forme que l'API : donnees-perso.js n'a pas à savoir de quel
     * côté il parle.
     */
    importer: function(a){
      const contenu = (a && a.contenu) || null;
      if(!contenu || typeof contenu !== 'object') throw new Error('Fichier illisible.');
      if(contenu.format !== 'pokearchive-1'){
        throw new Error('Ce fichier n\'est pas une sauvegarde PokéPension '
          + '(format « pokearchive-1 » attendu).');
      }
      const aventures = Array.isArray(contenu.aventures) ? contenu.aventures : [];
      if(!aventures.length) throw new Error('Ce fichier ne contient aucune aventure.');

      const e = premiereAventure(lire());
      const detail = [];

      // La clé d'une aventure : son nom, comparé sans casse ni espaces en trop.
      const cleDe = (nom) => String(nom || '').trim().toLowerCase();

      aventures.forEach(function(a2, rang){
        if(!a2 || typeof a2 !== 'object') return;
        const nom = String(a2.nom || ('Import ' + (rang + 1))).slice(0, 40);
        let cible = e.profils.find(function(p){ return cleDe(p.nom) === cleDe(nom); });
        let creee = false;

        if(!cible){
          cible = {
            id: ++e.dernierId, nom: nom, public: 0,
            par_defaut: e.profils.length ? 0 : 1,
            mode: a2.mode || 'capture',
            niveau_formes: a2.niveau_formes != null ? a2.niveau_formes : 3,
            captures: 0, shiny: 0,
            cree_le: a2.cree_le || maintenant(), maj_le: null,
          };
          e.profils.push(cible);
          creee = true;
        } else if(a2.maj_le && (!cible.maj_le || String(a2.maj_le) > String(cible.maj_le))){
          // Le fichier est plus récent : c'est lui qui dit le mode et le niveau.
          if(a2.mode) cible.mode = a2.mode;
          if(a2.niveau_formes != null) cible.niveau_formes = a2.niveau_formes;
        }

        const avant = e.dex[cible.id] || null;
        const avantCombien = avant ? compter(avant, 'caught') : 0;
        const reuni = reunirDex(avant, a2.dex);
        e.dex[cible.id] = reuni;
        cible.captures = compter(reuni, 'caught');
        cible.shiny = compter(reuni, 'shiny');
        cible.maj_le = maintenant();

        // Le journal : dédoublonné sur (pokemon, dex, chromatique, jour).
        let journalisees = 0;
        const brutes = Array.isArray(a2.historique) ? a2.historique : [];
        if(brutes.length){
          const deja = new Set(e.journal
            .filter(function(l){ return l.profilId === cible.id; })
            .map(function(l){ return l.pokemon + '|' + l.dex + '|' + l.chromatique + '|' + l.jour; }));
          brutes.forEach(function(b){
            const pokemon = String((b && b.pokemon) || '').slice(0, 64);
            const dex = String((b && b.dex) || '').slice(0, 32);
            const jour = String((b && (b.ajoute_le || b.ajouteLe)) || '').slice(0, 64);
            if(!pokemon || !dex || !jour) return;
            const chromatique = (b && b.chromatique) ? 1 : 0;
            const empreinte = pokemon + '|' + dex + '|' + chromatique + '|' + jour;
            if(deja.has(empreinte)) return;
            deja.add(empreinte);
            e.journal.push({ id: ++e.dernierJournalId, profilId: cible.id,
                             jour: jour, pokemon: pokemon, dex: dex,
                             chromatique: chromatique });
            journalisees++;
          });
        }

        detail.push({ nom: cible.nom, creee: creee,
                      captures: cible.captures, shiny: cible.shiny,
                      gagnees: Math.max(0, cible.captures - avantCombien),
                      journalisees: journalisees });
      });

      ecrire(e);
      return {
        ok: true,
        aventures: detail.length,
        creees: detail.filter(function(d){ return d.creee; }).length,
        gagnees: detail.reduce(function(n, d){ return n + d.gagnees; }, 0),
        journalisees: detail.reduce(function(n, d){ return n + d.journalisees; }, 0),
        detail: detail,
      };
    },

    // --- Ce qui demande d'autres joueurs --------------------------------------

    // La rareté suppose d'autres collections que la sienne. Hors ligne il n'y
    // en a aucune : on rend zéro dresseur plutôt qu'un pourcentage inventé, et
    // l'application n'affiche alors rien du tout.
    rarete: () => ({ dresseurs: 0, entrees: {}, calculeLe: null }),

    dresseurs: () => ({ dresseurs: [] }),
    profils_de: () => { throw HORS_LIGNE; },
    dex_de: () => { throw HORS_LIGNE; },
    succes_de: () => { throw HORS_LIGNE; },
    amis: () => ({ amis: [] }),
    amis_fil: () => ({ lignes: [] }),
    amis_nouveautes: () => ({ groupes: [] }),
    veille: () => ({ amis: { annonces: [], jusqua: 0, total: 0 },
                     notifications: { notifications: [], nonLues: 0 } }),
    amis_vu: () => ({ ok: true }),
    suivre: () => { throw HORS_LIGNE; },
    ne_plus_suivre: () => { throw HORS_LIGNE; },
    renommer_dresseur: () => { throw HORS_LIGNE; },

    // Les échanges supposent quelqu'un en face, et la discussion un serveur qui
    // porte les messages. Ni l'un ni l'autre n'existe ici : le site tient une
    // collection dans le localStorage du navigateur, il ne connaît personne.
    //
    // On rend des listes VIDES plutôt que de lever : la page des amis se dessine
    // alors normalement, avec « aucun échange pour l'instant », au lieu de
    // s'ouvrir sur un message d'erreur pour une fonction qu'on n'a pas demandée.
    // Ce qui ÉCRIT, en revanche, lève — parce que là, quelque chose est
    // réellement attendu, et se taire ferait croire que c'est parti.
    echanges: () => ({ echanges: [] }),
    echange_messages: () => { throw HORS_LIGNE; },
    echange_proposer: () => { throw HORS_LIGNE; },
    echange_reponse: () => { throw HORS_LIGNE; },
    echange_annuler: () => { throw HORS_LIGNE; },
    echange_fait: () => { throw HORS_LIGNE; },
    echange_ecrire: () => { throw HORS_LIGNE; },
    notifications: () => ({ notifications: [], nonLues: 0 }),
    notifications_lues: () => ({ ok: true, nonLues: 0 }),

    // Les photos de chasse supposent un disque où les poser. Le site n'en a
    // pas : il tient une collection dans le localStorage du navigateur, dont
    // le budget entier — quelques mégaoctets — serait mangé par deux captures
    // d'écran, et la collection cesserait de s'enregistrer.
    //
    // On lève donc plutôt que de faire semblant : l'appareil photo du tableau
    // de chasse dit franchement que ça ne marche pas ici, au lieu d'avaler une
    // image qui disparaîtrait au rechargement.
    image_envoyer: () => { throw HORS_LIGNE; },
    image_charger: () => { throw HORS_LIGNE; },
    image_supprimer: () => { throw HORS_LIGNE; },
    images_place: () => ({ combien: 0, octets: 0, combienMax: 0, octetsMax: 0 }),
    photos_de: () => ({ pseudo: '', photos: [] }),
    // La liste d'envies vit dans la sauvegarde et marche donc hors ligne ;
    // c'est « chez qui la trouver » qui suppose des amis, et il n'y en a pas.
    qui_a: () => ({ chez: {} }),

    // --- Propres au bureau ----------------------------------------------------
    //
    // La présence Discord suppose un client Discord sur la machine. Ne rien
    // faire est la bonne réponse : l'application ne regarde pas le résultat.
    presence_maj: () => ({ ok: true }),
    presence_effacer: () => ({ ok: true }),

    // L'overlay OBS ouvre une écoute sur 127.0.0.1 : un navigateur n'en a pas
    // le droit, et c'est très bien ainsi. L'écran de chasse masque le bouton
    // quand il tourne ici — ces réponses ne servent qu'à ce qu'un appel
    // égaré ne fasse pas tomber la page.
    overlay_demarrer: () => {
      throw new Error("L'overlay OBS n'existe que dans l'application de bureau.");
    },
    overlay_arreter: () => true,
    overlay_etat: () => false,
    overlay_adresse: () => '',
  };

  // ---- Le pont proprement dit --------------------------------------------------

  /**
   * L'aiguillage.
   *
   * C'est ici, et nulle part ailleurs, qu'on branchera l'API : il suffira de
   * tenter le réseau d'abord et de retomber sur la réserve locale en cas
   * d'échec. Les commandes ci-dessus n'auront pas à changer, puisqu'elles
   * rendent déjà les formes de l'API.
   */
  async function repondre(commande, args){
    const f = COMMANDES[commande];
    if(!f){
      // Une commande inconnue est un défaut de ce fichier, pas de l'appelant :
      // le dire par son nom fait gagner le temps de la chercher.
      throw new Error('Commande absente du pont : ' + commande);
    }
    return f(args || {});
  }

  // Seul core.invoke est fourni. C'est voulu : maj.js et presence.js vérifient
  // la présence de .updater, .app et .process avant de s'en servir, et se
  // taisent proprement quand ils manquent — un site web n'a ni mise à jour à
  // installer ni processus à fermer.
  window.__TAURI__ = {
    core: {
      invoke: function(commande, args){
        return repondre(commande, args);
      },
    },
  };

  // Un repère pour le reste du code, et pour qui ouvre la console.
  window.PONT_WEB = { version: 1, reserve: CLE, enLigne: false };
})();
