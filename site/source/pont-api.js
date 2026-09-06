// Le pont du site vers la VRAIE API.
//
// Il remplace `pont.js`, qui simulait tout dans le localStorage : une
// collection par navigateur, aucun compte, aucun échange, aucun message. Ce
// pont-ci parle au même serveur que l'application, donc à la même base — le
// site voit les mêmes dresseurs, les mêmes échanges, les mêmes conversations.
//
// ─── CE QU'IL FAUT SAVOIR AVANT DE LIRE ───────────────────────────────────────
//
// LE JETON DESCEND DANS LA PAGE, ET C'EST UN RECUL ASSUMÉ. compte.js dit en
// tête : « Le jeton de session ne descend jamais jusqu'à cette page — une page
// web n'a aucun besoin de manipuler un secret. » C'est vrai dans l'application,
// où le Rust le garde. Un navigateur n'a pas de Rust : soit le jeton vit dans
// la page, soit il n'y a pas de session du tout.
//
// Conséquence à regarder en face : n'importe quel script tiers chargé par cette
// page pourrait le lire. Le site n'en charge aucun — pas d'analytique, pas de
// CDN, pas de police distante — et c'est cette absence qui rend le choix
// tenable, pas une protection active. Le jour où l'on ajoute un script tiers,
// cette ligne devient un problème et il faudra la relire.
//
// ─── LA CORRESPONDANCE ────────────────────────────────────────────────────────
//
// Les cinquante-huit commandes du pont Tauri sont des enveloppes minces autour
// d'un appel HTTP. On les redit ici en TABLE plutôt qu'en cinquante-huit
// fonctions : chaque ligne donne la méthode, le chemin et le corps, et la seule
// mécanique — jeton, erreurs, JSON — est écrite une fois.
//
// Cinq commandes n'ont pas d'équivalent HTTP direct et sont écrites à la main
// plus bas : `etat`, `connexion`, `deconnexion` (la session), `image_envoyer`
// et `image_charger` (des octets, pas du JSON).

(function(){
  'use strict';

  // L'adresse de l'API. Posée par assembler.py au moment de la construction :
  // le site de production et le site local ne parlent pas au même serveur, et
  // le deviner depuis window.location serait faux dans les deux cas.
  const API = (window.POKEPENSION_API || 'http://127.0.0.1:8787').replace(/\/+$/, '');

  // Le jeton, dans le stockage local. Voir l'avertissement en tête.
  const CLE_JETON = 'pokearchive-jeton';

  function jeton(){
    try{ return localStorage.getItem(CLE_JETON) || ''; }
    catch(e){ return ''; }
  }
  function poserJeton(v){
    try{
      if(v) localStorage.setItem(CLE_JETON, v);
      else localStorage.removeItem(CLE_JETON);
    }catch(e){ /* navigation privée : la session ne survivra pas, tant pis */ }
  }

  /**
   * Base64 sans remplissage ni caractère à échapper dans une adresse.
   *
   * MÊME ALPHABET QUE LE SERVEUR : il calcule l'empreinte du vérifieur avec
   * `digest('base64url')`. Un « + » ou un « / » de trop, et les deux empreintes
   * ne se rencontreraient jamais — le refus serait juste, et incompréhensible.
   */
  function base64url(octets){
    let s = '';
    octets.forEach(function(o){ s += String.fromCharCode(o); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** Un identifiant de profil en paramètre, ou rien. Comme param_profil() en Rust. */
  function paramProfil(p){
    return p ? '?profil=' + encodeURIComponent(p) : '';
  }
  function avant(a, base){
    return a ? base + (base.indexOf('?') === -1 ? '?' : '&') + 'avant=' + encodeURIComponent(a) : base;
  }
  const enc = encodeURIComponent;

  // ─── La table ───────────────────────────────────────────────────────────────
  // [méthode, chemin(args), corps(args)] — le corps est facultatif.
  const ROUTES = {
    moi:                      ['GET',    () => '/api/moi'],
    lire_dex:                 ['GET',    a => '/api/dex' + paramProfil(a.profil)],
    ecrire_dex:               ['POST',   a => '/api/dex' + paramProfil(a.profil), a => a.donnees],
    profils:                  ['GET',    () => '/api/profils'],
    carte:                    ['GET',    () => '/api/carte'],
    carte_ecrire:             ['POST',   () => '/api/carte', a => a.donnees],
    creer_profil:             ['POST',   () => '/api/profils',
                               a => ({ nom: a.nom, mode: a.mode })],
    // LE CORPS SE CONSTRUIT CHAMP PAR CHAMP, comme le fait le Rust. Les
    // appelants passent l'aventure a plat — { id, public: true } — et non
    // regroupee sous une cle. JSON.stringify laisse tomber les valeurs
    // `undefined` : le corps ne porte donc que ce qui a ete demande, et
    // « publier sans renommer » reste possible.
    //
    // `notes` a sa nuance, reprise du Rust : la chaine vide est un effacement
    // voulu, pas une absence. Elle passe, la ou `undefined` veut dire « ne
    // touche pas au carnet ».
    modifier_profil:          ['PATCH',  a => '/api/profils/' + a.id,
                               a => ({ nom: a.nom, notes: a.notes, public: a.public,
                                       parDefaut: a.parDefaut, mode: a.mode,
                                       niveauFormes: a.niveauFormes })],
    supprimer_profil:         ['DELETE', a => '/api/profils/' + a.id],
    historique:               ['GET',    a => avant(a.avant, '/api/profils/' + a.id + '/historique')],
    exporter:                 ['GET',    () => '/api/export'],
    importer:                 ['POST',   () => '/api/import', a => a.contenu],
    rarete:                   ['GET',    () => '/api/rarete'],
    retrospective:            ['GET',    () => '/api/retrospective'],
    journal:                  ['GET',    a => avant(a.avant, '/api/journal')],

    sessions:                 ['GET',    () => '/api/sessions'],
    fermer_session:           ['DELETE', a => '/api/sessions/' + a.id],
    fermer_les_autres:        ['POST',   () => '/api/sessions/fermer-les-autres', () => ({})],

    dresseurs:                ['GET',    a => (a.recherche && a.recherche.trim())
                                 ? '/api/dresseurs?q=' + enc(a.recherche.trim())
                                 : '/api/dresseurs'],
    // Partager le Pokedex d'un jeu. Trois lignes et pas quatre : LIRE un
    // partage ne passe pas par ici. Cette table sert l'application connectee ;
    // la lecture d'un lien se fait sans jeton, sur sa propre page, par
    // quelqu'un qui n'a justement pas de session.
    partage_creer:            ['POST',   () => '/api/partages',
                               a => ({ profil: a.profil, jeu: a.jeu })],
    partages:                 ['GET',    () => '/api/partages'],
    partage_revoquer:         ['DELETE', a => '/api/partages/' + enc(a.code)],
    profils_de:               ['GET',    a => '/api/dresseurs/' + enc(a.pseudo) + '/profils'],
    dex_de:                   ['GET',    a => '/api/dex/' + enc(a.pseudo) + paramProfil(a.profil)],
    succes_de:                ['GET',    a => '/api/dresseurs/' + enc(a.pseudo) + '/succes'],
    photos_de:                ['GET',    a => '/api/dresseurs/' + enc(a.pseudo) + '/photos'],
    changer_pseudo:           ['POST',   () => '/api/pseudo', a => ({ pseudo: a.pseudo })],
    renommer_dresseur:        ['POST',   () => '/api/admin/renommer',
                               a => ({ pseudo: a.pseudo, nouveau: a.nouveau })],

    changer_visibilite:       ['POST',   () => '/api/visibilite', a => ({ visible: a.visible })],
    changer_echanges_ouverts: ['POST',   () => '/api/echanges-ouverts', a => ({ ouverts: a.ouverts })],
    changer_messages_de:      ['POST',   () => '/api/messages-de', a => ({ valeur: a.valeur })],

    amis:                     ['GET',    () => '/api/amis'],
    suivre:                   ['POST',   () => '/api/amis', a => ({ pseudo: a.pseudo })],
    ne_plus_suivre:           ['DELETE', a => '/api/amis/' + enc(a.pseudo)],
    amis_fil:                 ['GET',    a => avant(a.avant, '/api/amis/fil')],
    amis_nouveautes:          ['GET',    () => '/api/amis/nouveautes'],
    amis_vu:                  ['POST',   () => '/api/amis/vu', a => ({ jusqua: a.jusqua })],
    qui_a:                    ['POST',   () => '/api/amis/qui-a', a => ({ noms: a.noms })],
    veille:                   ['GET',    () => '/api/veille'],

    echanges:                 ['GET',    () => '/api/echanges'],
    echange_proposer:         ['POST',   () => '/api/echanges',
                               a => ({ pseudo: a.pseudo, dex: a.dex, offert: a.offert,
                                       demande: a.demande, mot: a.mot })],
    echange_reponse:          ['POST',   a => '/api/echanges/' + a.id + '/reponse',
                               a => ({ reponse: a.reponse })],
    echange_annuler:          ['POST',   a => '/api/echanges/' + a.id + '/annuler'],
    echange_fait:             ['POST',   a => '/api/echanges/' + a.id + '/fait'],
    echange_messages:         ['GET',    a => '/api/echanges/' + a.id + '/messages'],
    echange_ecrire:           ['POST',   a => '/api/echanges/' + a.id + '/messages',
                               a => ({ texte: a.texte })],

    messages_liste:           ['GET',    () => '/api/messages'],
    messages_chercher:        ['GET',    a => '/api/messages-recherche?q=' + enc(a.q || '')],
    messages_avec:            ['GET',    a => '/api/messages/' + enc(a.pseudo)],
    messages_ecrire:          ['POST',   a => '/api/messages/' + enc(a.pseudo),
                               a => ({ texte: a.texte, espece: a.espece, image: a.image })],

    notifications:            ['GET',    () => '/api/notifications'],
    notifications_lues:       ['POST',   () => '/api/notifications/lues', a => ({ jusqua: a.jusqua })],

    images_place:             ['GET',    () => '/api/images'],
    image_supprimer:          ['DELETE', a => '/api/images/' + a.id],
  };

  /**
   * L'appel, et la seule mécanique du fichier.
   *
   * SESSION_INVALIDE EST UNE CHAÎNE, PAS UN CODE. Tout le reste de
   * l'application la reconnaît telle quelle — `if(String(e) === 'SESSION_INVALIDE')`
   * — et rend la main à perdreSession(). Le pont Rust rend exactement cela ; on
   * le rend aussi, sinon une session expirée se lirait comme une panne.
   */
  async function appeler(methode, chemin, corps){
    const j = jeton();
    if(!j) throw new Error('SESSION_INVALIDE');

    let r;
    try{
      r = await fetch(API + chemin, {
        method: methode,
        headers: Object.assign(
          { Authorization: 'Bearer ' + j },
          corps === undefined ? {} : { 'Content-Type': 'application/json' }),
        body: corps === undefined ? undefined : JSON.stringify(corps),
      });
    }catch(e){
      // Réseau coupé, serveur éteint : on le dit en clair. L'application sait
      // se taire là-dessus — les sondages de fond avalent leurs erreurs.
      throw new Error('L’API est injoignable.');
    }

    if(r.status === 401){
      poserJeton('');
      throw new Error('SESSION_INVALIDE');
    }
    const texte = await r.text();
    let data = null;
    try{ data = texte ? JSON.parse(texte) : null; }catch(e){ data = null; }
    if(!r.ok){
      throw new Error((data && data.erreur) || ('Erreur ' + r.status));
    }
    return data;
  }

  // ─── Les cinq commandes qui ne sont pas de simples appels ───────────────────

  /**
   * La session, vue du navigateur.
   *
   * `etat` ne demande RIEN au serveur : il répond « ai-je un jeton ? », et
   * l'application s'en sert au démarrage pour décider si elle ouvre la fenêtre
   * de connexion. Un aller-retour ici retarderait le premier écran pour une
   * question dont la réponse est dans le stockage local.
   */
  const LOCALES = {
    etat: async () => ({ connecte: Boolean(jeton()) }),

    /**
     * Se connecter par Discord, dans une fenêtre surgissante.
     *
     * POURQUOI UNE FENÊTRE ET NON UNE REDIRECTION. Rediriger la page entière
     * ferait tout perdre : le Pokédex en cours, les filtres, la position. La
     * fenêtre s'ouvre, Discord y répond, elle nous renvoie le code et se ferme
     * — l'écran principal n'a pas bougé.
     *
     * Le code voyage par `postMessage`, et l'on VÉRIFIE L'ORIGINE : sans ce
     * contrôle, n'importe quelle page ouverte ailleurs pourrait nous envoyer un
     * message et se faire passer pour le retour de Discord.
     */
    connexion: async () => {
      // PKCE, ET CE N'EST PAS FACULTATIF. Le serveur retient à l'aller
      // l'empreinte d'un secret, et exige le secret lui-même au retour : sans
      // lui, `/auth/echange` refuse. C'est ce qui rend inoffensive
      // l'interception de l'adresse de retour — le code seul n'ouvre rien.
      const verifieur = base64url(crypto.getRandomValues(new Uint8Array(32)));
      const defi = base64url(new Uint8Array(await crypto.subtle.digest(
        'SHA-256', new TextEncoder().encode(verifieur))));

      const nonce = String(Math.random()).slice(2) + String(Date.now());
      const url = API + '/auth/discord?web=1&nonce=' + enc(nonce) + '&defi=' + enc(defi);
      const fen = window.open(url, 'pokearchive-discord', 'width=520,height=760');
      if(!fen) throw new Error('La fenêtre de connexion a été bloquée par le navigateur.');

      const code = await new Promise(function(resoudre, rejeter){
        let fini = false;
        const surMessage = function(e){
          if(e.origin !== new URL(API).origin) return;   // l'origine, d'abord
          const d = e.data || {};
          if(d.pokepension !== 'auth' || d.nonce !== nonce) return;
          fini = true;
          window.removeEventListener('message', surMessage);
          clearInterval(veille);
          if(d.code) resoudre(d.code);
          else rejeter(new Error(d.erreur || 'Connexion refusée.'));
        };
        window.addEventListener('message', surMessage);

        // La fenêtre fermée à la main ne renvoie rien : sans cette veille, on
        // attendrait indéfiniment un message qui ne viendra jamais.
        //
        // CE QUE CE MESSAGE DOIT DIRE. « Connexion annulée » décrivait la
        // conclusion et non le fait : la fenêtre s'est fermée avant d'avoir
        // rien renvoyé. Tant que le serveur renvoyait la mauvaise page, cette
        // veille était le SEUL retour visible d'une connexion qui avait
        // pourtant réussi — et elle accusait la personne d'avoir renoncé.
        const veille = setInterval(function(){
          if(fini || !fen.closed) return;
          clearInterval(veille);
          window.removeEventListener('message', surMessage);
          rejeter(new Error('La fenêtre Discord s’est fermée avant la fin de '
            + 'l’autorisation. Tu peux réessayer.'));
        }, 500);
      });

      const r = await fetch(API + '/auth/echange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, verifieur: verifieur }),
      });
      const data = await r.json().catch(() => null);
      if(!r.ok || !data || !data.jeton){
        throw new Error((data && data.erreur) || 'Connexion refusée.');
      }
      poserJeton(data.jeton);
      return { connecte: true };
    },

    deconnexion: async () => {
      // On prévient le serveur, mais on oublie le jeton QUOI QU'IL ARRIVE :
      // rester connecté parce que le réseau a lâché au mauvais moment est le
      // contraire de ce qu'on vient de demander.
      try{ await appeler('POST', '/api/deconnexion'); }catch(e){ /* on part quand même */ }
      poserJeton('');
      return { ok: true };
    },

    /**
     * Une photo. Des octets bruts, pas du JSON.
     *
     * L'AVENTURE ET LE SUJET VOYAGENT DANS L'ADRESSE, comme le fait le Rust.
     * Sans eux, le serveur retombait sur l'aventure PAR DÉFAUT et sur le sujet
     * « chasse » : une photo posée depuis une seconde aventure atterrissait
     * dans la première, où le ménage — qui ne la voyait réclamée par aucune de
     * SES chasses — l'effaçait au prochain enregistrement.
     */
    image_envoyer: async (a) => {
      const j = jeton();
      if(!j) throw new Error('SESSION_INVALIDE');
      const octets = new Uint8Array(a.octets || []);
      const q = new URLSearchParams({ sujet: a.sujet || 'chasse' });
      if(a.profil) q.set('profil', String(a.profil));
      const r = await fetch(API + '/api/images?' + q.toString(), {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + j, 'Content-Type': a.mime || 'image/png' },
        body: octets,
      });
      const data = await r.json().catch(() => null);
      if(r.status === 401){ poserJeton(''); throw new Error('SESSION_INVALIDE'); }
      if(!r.ok) throw new Error((data && data.erreur) || 'Envoi refusé.');
      return data;
    },

    /**
     * Lire une photo.
     *
     * UNE ADRESSE `data:`, EXACTEMENT CE QUE REND LE RUST. L'écran pose le
     * résultat dans un `img.src` sans le regarder : lui rendre un objet
     * `{ mime, octets }` — ce que faisait cette ligne — donnait un
     * « [object Object] » en guise d'image, sur toutes les photos du site.
     *
     * Le détour par le pont reste nécessaire : l'adresse exige le jeton, et
     * une balise <img> ne sait pas le présenter.
     */
    image_charger: async (a) => {
      const j = jeton();
      if(!j) throw new Error('SESSION_INVALIDE');
      const r = await fetch(API + '/api/images/' + enc(a.id), {
        headers: { Authorization: 'Bearer ' + j },
      });
      if(r.status === 401){ poserJeton(''); throw new Error('SESSION_INVALIDE'); }
      if(!r.ok) throw new Error('Image introuvable.');
      const mime = r.headers.get('Content-Type') || 'image/png';
      const octets = new Uint8Array(await r.arrayBuffer());
      // PAR TRANCHES : `String.fromCharCode` prend ses octets en arguments, et
      // une photo de deux méga-octets dépasse la pile d'appels d'un coup.
      let brut = '';
      for(let i = 0; i < octets.length; i += 8192){
        brut += String.fromCharCode.apply(null, octets.subarray(i, i + 8192));
      }
      return 'data:' + mime + ';base64,' + btoa(brut);
    },
  };

  async function repondre(commande, args){
    if(LOCALES[commande]) return LOCALES[commande](args || {});

    const route = ROUTES[commande];
    if(!route){
      // Une commande inconnue est un défaut de CE fichier, pas de l'appelant :
      // le dire par son nom fait gagner le temps de la chercher.
      throw new Error('Commande absente du pont : ' + commande);
    }
    const [methode, chemin, corps] = route;
    const a = args || {};

    // UNE ROUTE QUI DECLARE UN CORPS DOIT EN PRODUIRE UN, et le manquement se
    // dit tout haut.
    //
    // C'EST LE DEFAUT QUI A COUTE DES COLLECTIONS. `ecrire_dex` lisait `a.dex`
    // quand l'appelant envoie `a.donnees` : la fonction rendait `undefined`,
    // `appeler()` partait alors SANS CORPS ni Content-Type, l'API recevait un
    // `{}` d'express — et remplacait le Pokedex du joueur par un dex vide.
    // Rien ne levait, rien ne s'affichait : la sauvegarde disait « enregistre ».
    // `importer` et `modifier_profil` avaient la meme faute, en plus silencieuse
    // encore : renommer une aventure ou la rendre publique ne faisait rien.
    //
    // Un corps absent n'est jamais voulu ici : les routes sans corps n'en
    // declarent pas. Lever nomme la commande et arrete la premiere fois, au
    // lieu de laisser passer une requete qui detruit ce qu'elle devait ecrire.
    const charge = corps ? corps(a) : undefined;
    if(corps && charge === undefined){
      throw new Error('Le pont n’a rien à envoyer pour « ' + commande
        + ' » : les arguments attendus ne sont pas ceux reçus.');
    }
    return appeler(methode, chemin(a), charge);
  }

  window.__TAURI__ = {
    core: { invoke: function(commande, args){ return repondre(commande, args); } },
  };

  // PAS DE `PONT_WEB` ICI, ET C'EST VOULU. Ce drapeau signalait un site sans
  // compte : l'overlay OBS et la messagerie s'éteignaient en le voyant. Le site
  // a désormais de vrais comptes et une vraie messagerie ; le laisser
  // continuerait d'éteindre des écrans qui marchent.
  //
  // L'overlay OBS, lui, ne peut pas marcher dans un navigateur — il écoute un
  // port local. On le dit par un drapeau à lui, qui ne parle que de cela.
  window.PONT_HTTP = { version: 1, api: API, overlayImpossible: true };
})();
