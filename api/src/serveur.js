// API PokéPension.
//
//   npm start   → http://127.0.0.1:8787
//
// Aucune page web : ce service ne sert que l'application. Il détient le mot de
// passe MySQL, mène la connexion Discord, et distribue aux joueurs des jetons
// de session qui ne valent que pour leur propre compte.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import express from 'express';
import helmet from 'helmet';

import { config, verifierConfig } from './config.js';
import { creerSchema, description } from './base.js';
import { etatVersion } from './version.js';
import * as comptes from './comptes.js';
import * as amis from './amis.js';
// « troc » et non « echanges » : ce fichier tient deja une Map nommee
// echanges, celle des codes d'authentification Discord. Deux sens du meme
// mot, et un seul espace de noms.
import * as troc from './echanges.js';
import * as notifications from './notifications.js';
import * as images from './images.js';
import * as messagerie from './messagerie.js';
import * as discord from './discord.js';
import { limiter } from './debit.js';

const journal = (m) => console.log(`${new Date().toLocaleTimeString('fr-FR')}  ${m}`);

// L'application écoute sur l'un de ces ports pour recevoir sa session. Valider
// cette plage n'est pas une formalité : sans elle, un lien forgé ferait
// rediriger un jeton vers n'importe quel service tournant sur la machine du
// joueur.
const PORT_APP_MIN = 8730;
const PORT_APP_MAX = 8749;

const portApp = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= PORT_APP_MIN && n <= PORT_APP_MAX ? String(n) : '';
};

const app = express();
app.disable('x-powered-by');

// UN saut de proxy, pas « true ». Chez l'hébergeur, une requête passe par
// son proxy avant d'arriver ici : sans cette ligne, req.ip rend l'adresse du
// proxy, la même pour tout le monde, et la limitation ci-dessous bloquerait
// tous les visiteurs à la fois plutôt que le seul qui abuse.
//
// « true » ferait confiance à toute la chaîne X-Forwarded-For, y compris à ce
// que le client y écrit lui-même : n'importe qui contournerait la limite en
// annonçant une adresse différente à chaque requête. On n'en croit qu'un.
app.set('trust proxy', 1);

app.use(helmet());

/**
 * L'entente CORS avec le site web.
 *
 * Le site parle à la même API que l'application, mais depuis un navigateur :
 * sans cet en-tête, le navigateur refuse la réponse avant même que la page la
 * voie. L'application, elle, n'en a pas besoin — une requête faite par le Rust
 * n'a pas d'origine.
 *
 * ON NOMME L'ORIGINE, ON NE MET PAS D'ÉTOILE. Le jeton reste nécessaire, donc
 * l'étoile ne donnerait accès à rien par elle-même ; mais elle laisserait une
 * page tierce faire faire des requêtes au navigateur d'un joueur connecté, et
 * il n'y a aucune raison de l'autoriser.
 *
 * PAS DE `credentials` : l'authentification passe par un en-tête Authorization
 * que la page pose elle-même, jamais par un cookie. Le navigateur n'a donc rien
 * à joindre d'office, et une page tierce ne peut rien emprunter.
 */
app.use((req, res, next) => {
  const origine = req.get('Origin');
  if (origine && config.siteOrigines.includes(origine.replace(/\/+$/, ''))) {
    res.set('Access-Control-Allow-Origin', origine);
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.set('Access-Control-Max-Age', '86400');
    // VARY : sans lui, un cache intermédiaire servirait à une origine la
    // réponse autorisée pour une autre.
    res.set('Vary', 'Origin');
  }
  // Le pré-vol ne va pas plus loin : il ne demande que la permission.
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
});

app.use(express.json({ limit: '2mb' }));

// Deux budgets, parce que les deux familles de routes ne coûtent pas pareil.
// Un départ de connexion appelle Discord et écrit en base ; il est rare dans
// un usage normal — on en ouvre une par session, pas trente par minute.
app.use('/auth', limiter({ nom: 'auth', max: 30, fenetre: 10 * 60_000 }));
// Le reste suit l'application : elle lit son dex à l'ouverture, l'écrit à
// chaque coche, consulte des dresseurs. Large, donc, pour ne jamais gêner
// quelqu'un de réel — et bien assez bas pour arrêter un martelage.
app.use('/api', limiter({ nom: 'api', max: 600, fenetre: 5 * 60_000 }));

// --- Connexion Discord ------------------------------------------------------
//
// Le jeton ne voyage PLUS dans l'adresse de retour. C'est le point important :
// l'application est distribuée, donc son code est public, et une adresse de
// redirection se retrouve dans l'historique du navigateur, dans les journaux,
// et sous les yeux de tout ce qui écoute la boucle locale. Un jeton qui y
// passe est un jeton qu'on peut ramasser.
//
// À la place, un échange en deux temps, sur le principe de PKCE :
//   1. l'application tire au sort un « vérifieur » qu'elle garde en mémoire,
//      et n'envoie que son empreinte SHA-256, le « défi » ;
//   2. après Discord, l'API renvoie sur la boucle locale un simple code
//      d'échange, à usage unique et valable deux minutes ;
//   3. l'application présente ce code AVEC son vérifieur, en POST, et reçoit
//      le jeton dans le corps de la réponse.
//
// Qui intercepte l'adresse de retour n'obtient donc qu'un code inutilisable :
// il lui manque le vérifieur, qui n'a jamais quitté la mémoire de l'app.
//
// Un « nonce » distinct fait le chemin inverse : l'API le réémet tel quel vers
// la boucle locale, et l'application refuse tout retour qui ne le porte pas.
// Sans lui, n'importe quel programme de la machine pourrait appeler l'écoute
// locale et lui faire adopter une session choisie par l'attaquant.
const etats = new Map();
const echanges = new Map();

const ECHANGE_VALIDITE = 120_000;   // deux minutes suffisent à un aller-retour

// Un état ou un code oublié doit disparaître : sinon la mémoire enfle
// indéfiniment sur un service qui tourne des mois.
setInterval(() => {
  const limiteEtats = Date.now() - 600_000;
  for (const [k, v] of etats) if (v.ne < limiteEtats) etats.delete(k);
  const limiteCodes = Date.now() - ECHANGE_VALIDITE;
  for (const [k, v] of echanges) if (v.ne < limiteCodes) echanges.delete(k);
}, 60_000).unref();

const empreinte = (v) => createHash('sha256').update(v, 'utf8').digest('base64url');

// Une chaîne opaque venue du client : on borne sa taille et son alphabet avant
// de la garder, plutôt que de stocker n'importe quoi en mémoire.
const opaque = (v, max = 128) => {
  const s = String(v || '');
  return /^[A-Za-z0-9_-]{16,}$/.test(s) && s.length <= max ? s : '';
};

app.get('/auth/discord', (req, res) => {
  if (!discord.actif()) return res.status(503).type('txt').send('Discord non configuré.');
  const etat = discord.nouvelEtat();
  etats.set(etat, {
    port: portApp(req.query.app),
    defi: opaque(req.query.defi),      // empreinte du vérifieur, jamais le vérifieur
    nonce: opaque(req.query.nonce),
    // D'OÙ VIENT LA DEMANDE. L'application écoute sur un port local et se fait
    // rediriger ; un navigateur, lui, a ouvert une fenêtre et attend un
    // message. Le retour ne peut pas le deviner — il faut le lui dire ici.
    web: req.query.web === '1',
    ne: Date.now(),
  });
  res.redirect(302, discord.urlDepart(etat));
});

/**
 * Deuxième temps de l'échange : le code contre le jeton.
 *
 * Le code seul ne suffit pas — il faut présenter le vérifieur dont l'empreinte
 * avait été annoncée au départ. C'est ce qui rend inoffensive l'interception de
 * l'adresse de retour.
 *
 * Le code est consommé quoi qu'il arrive : un vérifieur faux ne donne pas droit
 * à un second essai, sinon on pourrait le deviner à force de tentatives.
 */
app.post('/auth/echange', (req, res) => {
  const code = opaque(req.body?.code);
  const verifieur = opaque(req.body?.verifieur);
  const attendu = code ? echanges.get(code) : null;
  if (code) echanges.delete(code);

  if (!attendu || Date.now() - attendu.ne > ECHANGE_VALIDITE) {
    return res.status(400).json({ erreur: "Code d'échange inconnu ou expiré." });
  }
  if (!verifieur) {
    return res.status(400).json({ erreur: 'Vérifieur manquant.' });
  }

  // Comparaison à temps constant : comparer deux empreintes avec « === » laisse
  // fuir, par la durée, le nombre de caractères devinés justes.
  const attenduBuf = Buffer.from(attendu.defi);
  const fourniBuf = Buffer.from(empreinte(verifieur));
  const bon = attenduBuf.length === fourniBuf.length
    && timingSafeEqual(attenduBuf, fourniBuf);
  if (!bon) {
    journal('échange refusé : vérifieur invalide');
    return res.status(403).json({ erreur: 'Vérifieur invalide.' });
  }

  res.json({ jeton: attendu.jeton, pseudo: attendu.pseudo });
});

app.get('/auth/discord/retour', async (req, res) => {
  const attendu = etats.get(String(req.query.state || ''));
  etats.delete(String(req.query.state || ''));
  const port = attendu?.port || '';

  const fin = (params) => {
    // LE SITE WEB : on répond dans la fenêtre surgissante, qui reparle à la
    // page qui l'a ouverte. Rediriger la page entière ferait tout perdre — le
    // Pokédex en cours, les filtres, la position dans la liste.
    if (attendu?.web) {
      // UN NONCE, PLUTOT QUE DE DESSERRER LA POLITIQUE GLOBALE. helmet pose
      // `script-src 'self'`, qui interdit les scripts en ligne : cette page
      // s'affichait, son script ne s'exécutait pas, et la fenêtre restait là
      // sans jamais rien renvoyer. Le symptôme était « Connexion annulée »,
      // c'est-à-dire le message qu'on donne quand l'utilisateur ferme lui-même.
      //
      // Le nonce n'autorise QUE ce script-ci, sur CETTE réponse. Ajouter
      // 'unsafe-inline' à la configuration de helmet aurait ouvert toutes les
      // pages du service pour une seule ligne.
      const nonce = randomBytes(16).toString('base64');
      res.set('Content-Security-Policy',
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'`);
      // MEME HISTOIRE QUE LE NONCE, UN CRAN PLUS LOIN. helmet pose aussi
      // `Cross-Origin-Opener-Policy: same-origin`, qui COUPE le lien
      // `window.opener` des que la fenetre surgissante est sur une autre
      // origine que la page qui l'a ouverte — et c'est exactement notre
      // cas : l'API est sur api.<domaine>, le site sur <domaine>.
      //
      // Le symptome est trompeur : Discord authentifie, le compte est
      // cree, la session ouverte, et le site affiche quand meme
      // « Connexion annulee » — car `window.opener` vaut null, le
      // postMessage n'est jamais emis, la fenetre se ferme, et la veille
      // conclut que la personne a renonce. Rien dans le journal du
      // serveur ne le laisse deviner : cote API, tout s'est bien passe.
      //
      // On desserre pour CETTE REPONSE seulement. Le reste du service
      // garde sa politique : cette page-ci ne fait rien d'autre que
      // reparler a son ouvreur, c'est toute sa raison d'etre.
      res.set('Cross-Origin-Opener-Policy', 'unsafe-none');
      return res.type('html').send(pageWeb(params, nonce));
    }
    if (port) return res.redirect(302, `http://127.0.0.1:${port}/retour?${params}`);
    return res.type('html').send(page(params.startsWith('erreur')
      ? ['✕', 'Connexion impossible', 'Relance la connexion depuis PokéPension.']
      : ['✓', 'Connecté', 'Tu peux fermer cet onglet.']));
  };

  // Le joueur a refusé l'autorisation : ce n'est pas une panne.
  if (req.query.error) return fin('erreur=refus');

  // Anti-CSRF : un état inconnu, c'est une connexion que nous n'avons pas
  // lancée. Sans cette vérification, un site tiers pourrait la déclencher.
  if (!req.query.code || !attendu) return fin('erreur=etat');

  let profil;
  try {
    profil = await discord.identite(String(req.query.code));
  } catch (e) {
    journal(`discord : ${e.message}`);
    return fin('erreur=discord');
  }

  const { dresseur, jeton, nouveau } = await comptes.depuisDiscord(profil);
  journal(`${nouveau ? 'inscription' : 'connexion'} : ${dresseur.pseudo}`);

  // LE SITE N'A PAS DE PORT, ET N'EN A PAS BESOIN. Seule l'application Tauri
  // annonce un port : elle écoute en local, et le retour va la trouver là.
  // Le site, lui, a ouvert une fenêtre et attend un `postMessage` — c'est
  // `web` qui le dit, pas le port.
  //
  // Ce garde-fou testait le port SEUL. Une connexion venue du site tombait
  // donc ici, juste après que Discord ait dit oui : la fenêtre affichait
  // « Bonjour untel », `fin()` n'était jamais appelée, aucun code d'échange
  // n'était émis, et le site — qui n'avait rien reçu — concluait au bout du
  // compte « Connexion annulée ». Le compte était bel et bien créé : c'est
  // pour cela que le journal du serveur annonçait une réussite à chaque
  // tentative ratée.
  if (!attendu.web && !port) {
    return res.type('html').send(page(['✓', `Bonjour ${dresseur.pseudo}`,
      "Aucune application n'attendait cette connexion. Relance-la depuis PokéPension."]));
  }

  // Sans défi annoncé au départ, l'application est trop ancienne pour l'échange
  // en deux temps. On refuse plutôt que de retomber sur l'envoi du jeton dans
  // l'adresse : ce serait garder ouverte la faille qu'on vient de fermer.
  if (!attendu.defi) {
    journal('connexion refusée : application sans défi PKCE (version trop ancienne)');
    return fin('erreur=obsolete');
  }

  const codeEchange = randomBytes(32).toString('base64url');
  echanges.set(codeEchange, {
    jeton, pseudo: dresseur.pseudo, defi: attendu.defi, ne: Date.now(),
  });

  // Ni jeton ni pseudo dans l'adresse : seulement un code sans valeur propre,
  // et le nonce que l'application reconnaîtra comme le sien.
  fin(`code=${encodeURIComponent(codeEchange)}`
    + `&nonce=${encodeURIComponent(attendu.nonce || '')}`);
});

const page = ([icone, titre, texte]) => `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><title>PokéPension</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0f14;color:#e8e9f0;
     font-family:"Segoe UI",system-ui,sans-serif;text-align:center;padding:24px}
.r{width:56px;height:56px;border-radius:50%;background:#1d3b2b;display:grid;place-items:center;
   font-size:27px;margin:0 auto 18px}
h1{font-size:21px;margin:0 0 8px}p{color:#a0a4b4;margin:0;line-height:1.6}
</style></head><body><div><div class="r">${icone}</div><h1>${titre}</h1><p>${texte}</p></div></body></html>`;

/**
 * La page de retour d'une connexion venue du site.
 *
 * Elle ne fait qu'une chose : rendre le code à la fenêtre qui l'a ouverte, puis
 * se fermer.
 *
 * ON NOMME CHAQUE ORIGINE AUTORISÉE, une par une, plutôt que de poster vers
 * « * ». Un `postMessage` en étoile est lisible par n'importe quelle page ayant
 * une référence sur cette fenêtre : le code d'échange y fuirait. Les origines
 * sont celles de la configuration, les mêmes que pour CORS.
 *
 * Le code n'ouvre d'ailleurs rien à lui seul — il faut le vérifieur PKCE, qui
 * n'a jamais quitté la page d'origine. Nommer l'origine reste la bonne
 * pratique : deux verrous valent mieux qu'un.
 */
const pageWeb = (params, nonce) => {
  const cible = JSON.stringify(config.siteOrigines);
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>PokéPension</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0f14;
     color:#e8e9f0;font-family:"Segoe UI",system-ui,sans-serif;text-align:center;padding:24px}
</style></head><body><p>Connexion en cours…</p><script nonce="${nonce}">
(function(){
  var p = new URLSearchParams(${JSON.stringify(params)});
  var m = { pokepension: 'auth', nonce: p.get('nonce') || '',
            code: p.get('code') || '', erreur: p.get('erreur') || '' };
  var cibles = ${cible};
  if (window.opener) cibles.forEach(function(o){
    try { window.opener.postMessage(m, o); } catch (e) {}
  });
  setTimeout(function(){ window.close(); }, 300);
})();
<\/script></body></html>`;
};

// --- API --------------------------------------------------------------------
// L'application présente son jeton dans un en-tête Authorization.
async function exiger(req, res) {
  const e = req.get('Authorization') || '';
  const dresseur = e.startsWith('Bearer ') ? await comptes.session(e.slice(7).trim()) : null;
  if (!dresseur) { res.status(401).json({ erreur: 'Non connecté.' }); return null; }
  return dresseur;
}

const route = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e instanceof comptes.ErreurCompte) return res.status(e.code).json({ erreur: e.message });
    journal(`erreur sur ${req.path} : ${e.stack || e}`);
    res.status(500).json({ erreur: 'Erreur de notre côté.' });
  }
};

app.get('/api/moi', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  const dex = await comptes.lireDex(d.id);
  res.json({ dresseur: d, resume: dex
    ? { captures: (dex.captures || []).length, shiny: (dex.shiny || []).length, majLe: dex.majLe }
    : { captures: 0, shiny: 0, majLe: null } });
}));

// --- Les aventures ----------------------------------------------------------
// Un compte, plusieurs profils. Le profil visé se donne en paramètre ; sans
// lui, c'est l'aventure par défaut du dresseur qui répond.
const profilDemande = (req) => {
  const v = req.query.profil ?? req.body?.profil;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

app.get('/api/profils', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ profils: await comptes.listerProfils(d.id) });
}));

app.post('/api/profils', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.status(201).json({ ok: true,
    profil: await comptes.creerProfil(d.id, req.body?.nom, req.body?.mode) });
}));

app.patch('/api/profils/:id', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  const profil = await comptes.modifierProfil(d.id, Number(req.params.id), {
    nom: req.body?.nom,
    public: req.body?.public,
    parDefaut: req.body?.parDefaut,
    mode: req.body?.mode,
    notes: req.body?.notes,
    niveauFormes: req.body?.niveauFormes,
  });
  res.json({ ok: true, profil });
}));

// Le journal d'une aventure. La pagination se fait par curseur : « avant »
// est l'identifiant de la dernière ligne déjà reçue.
app.get('/api/profils/:id/historique', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await comptes.historique(
    d.id, Number(req.params.id), req.query.avant, req.query.limite));
}));

app.delete('/api/profils/:id', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...await comptes.supprimerProfil(d.id, Number(req.params.id)) });
}));

app.get('/api/dex', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  const dex = await comptes.lireDex(d.id, profilDemande(req));
  if (!dex) return res.status(404).json({ erreur: 'Aucun dex en ligne.' });
  res.json(dex);
}));

app.post('/api/dex', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  // Le profil voyage à côté du dex, pas dedans : le corps est la sauvegarde
  // telle quelle, et on ne veut rien y injecter.
  const r = await comptes.ecrireDex(d.id, req.body, profilDemande(req));

  // LE SEUL MOMENT OÙ L'ON APPREND QU'UNE CHASSE A DISPARU. Les chasses vivent
  // dans la sauvegarde et non dans une table : les supprimer n'est pas une
  // requête qui passe par ici, c'est un tableau qui revient plus court. Sans ce
  // rattrapage, chaque chasse effacée laisserait sa photo sur le disque pour
  // toujours. Il ne doit jamais faire échouer l'enregistrement — la
  // progression compte plus que le ménage.
  let photosOtees = 0;
  try {
    photosOtees = await images.menage(r.profilId, req.body);
  } catch (e) {
    console.error('ménage des photos :', e.message);
  }

  res.json({ ok: true, ...r, photosOtees });
}));

// --- La carte de dresseur ---------------------------------------------------
//
// POST ET NON PATCH, comme pour le dex : l'application envoie l'etat COMPLET
// de sa carte et de ses donnees jeux, et le serveur remplace. Un PATCH aurait
// laisse croire qu'on peut envoyer un seul champ, alors que retirer un jeu de
// sa liste ne s'exprime que par son absence de l'envoi.
app.get('/api/carte', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await comptes.lireCarte(d.id));
}));

app.post('/api/carte', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...await comptes.ecrireCarte(d.id, req.body) });
}));

app.post('/api/pseudo', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, pseudo: await comptes.changerPseudo(d.id, req.body?.pseudo) });
}));

// Le partage : le classement, ou une recherche par pseudo.
app.get('/api/dresseurs', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  const q = String(req.query.q || '').trim();
  if (q) return res.json({ dresseurs: await comptes.chercherDresseurs(q) });
  res.json({ dresseurs: await comptes.classement() });
}));

// Les aventures publiques d'un dresseur.
app.get('/api/dresseurs/:pseudo/profils', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  const chez = await comptes.profilsPublics(req.params.pseudo);
  if (!chez) return res.status(404).json({ erreur: 'Dresseur inconnu.' });
  res.json(chez);
}));

// Le dex d'un pote, pour la comparaison. Sans profil précisé, son aventure
// principale ; jamais une aventure privée.
app.get('/api/dex/:pseudo', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  const autre = await comptes.dexDe(req.params.pseudo, profilDemande(req));
  if (!autre) return res.status(404).json({ erreur: 'Dresseur inconnu.' });
  res.json(autre);
}));


// Les succès d'un autre dresseur : l'agrégat de son journal et son dex,
// jamais le journal lui-même. Voir succesDe().
app.get('/api/dresseurs/:pseudo/succes', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  const r = await comptes.succesDe(req.params.pseudo);
  if (!r) return res.status(404).json({ erreur: 'Dresseur inconnu.' });
  res.json(r);
}));

// La rarete de chaque entree : combien de dresseurs la possedent. Calculee sur
// les collections deja publiques, et mise en cache douze heures — voir rarete().
app.get('/api/rarete', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await comptes.rarete());
}));

// Ce que le journal raconte une fois compte : jours, jeux, total.
app.get('/api/retrospective', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await comptes.retrospective(d.id));
}));

// Figurer ou non dans la liste des dresseurs. Voir changerVisibilite().
app.post('/api/visibilite', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...(await comptes.changerVisibilite(d.id, !!req.body?.visible)) });
}));

app.post('/api/echanges-ouverts', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...(await comptes.changerEchangesOuverts(d.id, !!req.body?.ouverts)) });
}));

// --- La messagerie ----------------------------------------------------------
// Ecrire a quelqu'un sans passer par un echange. Voir messagerie.js pour ce que
// cela ouvre, et ce qui le garde.

app.post('/api/messages-de', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...(await comptes.changerMessagesDe(d.id, req.body?.valeur)) });
}));

app.get('/api/messages', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await messagerie.conversations(d.id));
}));

// AVANT /api/messages/:pseudo, sinon « recherche » serait pris pour un pseudo.
// Express essaie les routes dans l'ordre de declaration.
app.get('/api/messages-recherche', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await messagerie.chercher(d.id, req.query.q));
}));

app.get('/api/messages/:pseudo', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await messagerie.conversation(d.id, req.params.pseudo));
}));

app.post('/api/messages/:pseudo', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await messagerie.ecrireA(
    d.id, req.params.pseudo, req.body?.texte, req.body?.espece, req.body?.image));
}));

// --- Les amis ---------------------------------------------------------------
// Abonnement a sens unique : pas de demande, pas d'acceptation. Voir amis.js.

app.get('/api/amis', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await amis.mesAmis(d.id));
}));

app.post('/api/amis', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...(await amis.suivre(d.id, req.body?.pseudo)) });
}));

app.delete('/api/amis/:pseudo', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...(await amis.nePlusSuivre(d.id, req.params.pseudo)) });
}));

// Le fil complet, pagine.
app.get('/api/amis/fil', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await amis.fil(d.id, req.query.avant));
}));

// Ce qui n'a pas encore ete annonce, deja groupe en annonces.
app.get('/api/amis/nouveautes', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await amis.nouveautes(d.id));
}));

// L'application le dit une fois les notifications reellement affichees, pas
// avant : si elle se ferme entre les deux, on les revoit plutot que de les
// perdre.
app.post('/api/amis/vu', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...(await amis.marquerVu(d.id, req.body?.jusqua)) });
}));

// --- Les echanges -----------------------------------------------------------
// Un accord entre deux joueurs. Rien ne bouge ici : l'application tient
// l'accord, la console tient l'echange. Voir api/src/echanges.js.

app.get('/api/echanges', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await troc.mesEchanges(d.id));
}));

app.post('/api/echanges', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...(await troc.proposer(d.id, req.body || {})) });
}));

app.post('/api/echanges/:id/reponse', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...(await troc.repondre(d.id, req.params.id, req.body?.reponse)) });
}));

app.post('/api/echanges/:id/annuler', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...(await troc.annuler(d.id, req.params.id)) });
}));

// « C'est fait » : pose a la main, parce que le service ne voit pas les
// consoles et ne peut pas le constater.
app.post('/api/echanges/:id/fait', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...(await troc.conclure(d.id, req.params.id)) });
}));

app.get('/api/echanges/:id/messages', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await troc.messages(d.id, req.params.id));
}));

app.post('/api/echanges/:id/messages', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...(await troc.ecrireMessage(d.id, req.params.id, req.body?.texte)) });
}));

// --- Les photos de chasse ---------------------------------------------------
// Montrer son Pokemon, pas seulement le nommer. La regle d'acces est celle de
// l'aventure : publique, la photo se voit ; privee, elle ne sort pas. Voir
// api/src/images.js.

// Le corps est l'image elle-meme, en octets. express.json plus haut ne touche
// qu'au JSON et laisse donc passer ; celui-ci ne prend QUE les trois types
// acceptes, et refuse le reste avant meme d'entrer dans la route.
app.post('/api/images', express.raw({ type: images.typesAcceptes, limit: images.OCTETS_MAX }),
  route(async (req, res) => {
    const d = await exiger(req, res); if (!d) return;
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ erreur: 'Envoie une image JPEG, PNG ou WebP.' });
    }
    res.json({ ok: true, ...(await images.deposer(
      d.id, profilDemande(req), String(req.query.sujet || 'chasse'), req.body)) });
  }));

app.get('/api/images/:id', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  const img = await images.servir(d.id, req.params.id);
  // Le contenu d'une photo ne change jamais : son identifiant est cree avec
  // elle et n'est jamais reattribue. Un cache long evite de la retelecharger a
  // chaque ouverture du tableau de chasse. Prive : elle peut appartenir a une
  // aventure qui ne l'est pas.
  res.set('Cache-Control', 'private, max-age=604800, immutable');
  res.type(img.mime).send(img.octets);
}));

app.delete('/api/images/:id', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...(await images.retirer(d.id, req.params.id)) });
}));

// Ce que les photos occupent, pour le dire dans les Parametres.
app.get('/api/images', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await images.place(d.id));
}));

// Le mur d'un dresseur : ses photos, celles qu'on a le droit de voir. C'est
// l'ecran qui manquait — les photos etaient protegees et invisibles.
app.get('/api/dresseurs/:pseudo/photos', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await images.mur(d.id, req.params.pseudo));
}));

// La veille : les deux questions de fond en une requete.
//
// L'application demandait separement « quoi de neuf chez mes amis » et « qu'y
// a-t-il pour moi », toutes les deux minutes chacune, a une seconde d'ecart.
// Deux allers-retours pour une seule cadence, sur un hebergement gratuit. Les
// deux lectures restent distinctes cote serveur — ce sont deux mecanismes
// differents, l'un deduit, l'autre ecrit — mais elles voyagent ensemble.
app.get('/api/veille', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  const [nouveautes, avis, messages] = await Promise.all([
    amis.nouveautes(d.id),
    notifications.mesNotifications(d.id),
    // DANS LA MEME REQUETE. Une pastille de messages non lus meritait un
    // aller-retour de plus toutes les deux minutes ; elle n'en meritait pas un
    // a elle seule, et la veille passait deja par la.
    messagerie.nonLus(d.id),
  ]);
  res.json({ amis: nouveautes, notifications: avis, messagesNonLus: messages });
}));

// --- Les notifications ------------------------------------------------------

app.get('/api/notifications', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await notifications.mesNotifications(d.id));
}));

// Dit jusqu'ou on a affiche. Ce qui est arrive PENDANT l'affichage reste non
// lu plutot que d'etre avale sans avoir ete vu — meme regle que /api/amis/vu.
app.post('/api/notifications/lues', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, ...(await notifications.marquerLues(d.id, req.body?.jusqua)) });
}));

// « Je cherche » : chez qui, parmi mes amis, trouver ce que je veux. La liste
// elle-meme voyage dans la sauvegarde, comme les chasses et les objectifs — ce
// n'est que la question posee a la base qui passe par ici.
app.post('/api/amis/qui-a', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await amis.quiA(d.id, req.body?.noms));
}));

app.post('/api/deconnexion', route(async (req, res) => {
  const e = req.get('Authorization') || '';
  if (e.startsWith('Bearer ')) await comptes.deconnecter(e.slice(7).trim());
  res.json({ ok: true });
}));

// --- Emporter ses donnees ---------------------------------------------------

// Relire une sauvegarde. Le corps est plus gros que partout ailleurs : un
// export complet porte le dex ET le journal de chaque aventure, et la limite
// de 2 Mo posée plus haut le refuserait dès la deuxième année de collection.
// Elle ne vaut QUE pour cette route — les autres n'ont aucune raison de
// recevoir douze mégaoctets.
app.post('/api/import', express.json({ limit: '16mb' }), route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  const r = await comptes.importer(d.id, req.body);
  journal(`import : ${d.pseudo} — ${r.aventures} aventure(s), `
    + `${r.gagnees} capture(s) gagnée(s), ${r.journalisees} ligne(s) de journal`);
  res.json(r);
}));

app.get('/api/export', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  const contenu = await comptes.exporter(d.id);
  // Un nom de fichier lisible, et une invite de telechargement plutot qu'un
  // mur de JSON dans le navigateur.
  const jour = contenu.exporteLe.slice(0, 10);
  res.setHeader('Content-Disposition',
    `attachment; filename="pokepension-${jour}.json"`);
  res.json(contenu);
}));

// --- Les sessions ouvertes --------------------------------------------------

// Le jeton brut sert a reconnaitre la session courante. Il ne quitte pas cette
// fonction : ce qui part vers l'application n'est qu'une poignee numerique.
const jetonDe = (req) => {
  const e = req.get('Authorization') || '';
  return e.startsWith('Bearer ') ? e.slice(7).trim() : '';
};

app.get('/api/sessions', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ sessions: await comptes.sessions(d.id, jetonDe(req)) });
}));

app.delete('/api/sessions/:id', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  await comptes.fermerSession(d.id, req.params.id);
  res.json({ ok: true });
}));

app.post('/api/sessions/fermer-les-autres', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json({ ok: true, fermees: await comptes.fermerLesAutres(d.id, jetonDe(req)) });
}));

// --- Le journal des captures ------------------------------------------------

app.get('/api/journal', route(async (req, res) => {
  const d = await exiger(req, res); if (!d) return;
  res.json(await comptes.journal(d.id, req.query.avant, req.query.limite));
}));

// --- Administration ---------------------------------------------------------

/**
 * L'administrateur, ou personne.
 *
 * Repond 404 et non 403 quand ce n'est pas lui : un 403 confirmerait que la
 * route existe, et inviterait a chercher. Pour tout le monde sauf
 * l'administrateur, ces adresses n'existent tout simplement pas.
 */
async function exigerAdmin(req, res) {
  const d = await exiger(req, res); if (!d) return null;
  if (!config.adminDiscordId || d.discordId !== config.adminDiscordId) {
    res.status(404).json({ erreur: 'Route inconnue.' });
    return null;
  }
  return d;
}

app.post('/api/admin/renommer', route(async (req, res) => {
  const a = await exigerAdmin(req, res); if (!a) return;
  const { pseudo, nouveau } = req.body || {};
  const r = await comptes.renommerDresseur(pseudo, nouveau);
  journal(`admin : ${a.pseudo} a renomme « ${pseudo} » en « ${r.pseudo} »`);
  res.json({ ok: true, pseudo: r.pseudo });
}));

// L'etat du service, sans authentification.
//
// Le commit et l'heure de demarrage sont la pour qu'un deploiement se
// verifie : un lot qui ne touche a aucune route ne change aucun code de statut,
// et sans ces deux champs on redemarre le site sans pouvoir constater que le
// nouveau code tourne. Le depot est public, le numero de commit ne revele rien
// de plus que lui.
app.get('/api/etat', (req, res) => res.json({
  service: 'pokepension',
  discord: discord.actif(),
  ...etatVersion(),
}));

app.use((req, res) => res.status(404).json({ erreur: 'Route inconnue.' }));

// --- Démarrage --------------------------------------------------------------
const manques = verifierConfig();
if (manques.length) {
  journal(`Erreur : réglages manquants dans .env → ${manques.join(', ')}`);
  journal('Copie .env.exemple en .env et remplis-le.');
  process.exit(1);
}

try {
  await creerSchema(journal);
  const purgees = await comptes.menage();
  if (purgees) journal(`ménage : ${purgees} session(s) expirée(s)`);
} catch (e) {
  journal(`Erreur : base inaccessible (${e.message})`);
  process.exit(1);
}

journal(`base    : ${description()}`);
journal(`discord : ${discord.actif() ? config.discord.clientId : 'NON CONFIGURÉ'}`);
journal(`dresseurs : ${await comptes.nombreDresseurs()}`);
app.listen(config.port, config.hote, () =>
  journal(`api     : http://${config.hote}:${config.port}  (retour Discord vers ${config.discord.retour})`));
