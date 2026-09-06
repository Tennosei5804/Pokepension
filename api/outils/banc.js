// Le banc de l'API : le serveur tourne, et se vérifie lui-même.
//
//     cd api
//     node --env-file=.env outils/banc.js
//
// POURQUOI IL MANQUAIT. Il y avait trente-sept vérifications côté application,
// dix-huit côté site, et zéro ici — alors que le serveur porte désormais le plus
// délicat : l'inversion du sens dans un échange, la règle de visibilité des
// photos, le ménage déclenché par une sauvegarde, le retrait de l'EXIF, « qui a
// ce Pokémon ». Tout cela avait été éprouvé à la main, au curl, une fois. Rien
// n'était rejouable.
//
// IL TOURNE SUR LA VRAIE BASE, et c'est délibéré : ce qu'on veut éprouver, ce
// sont les requêtes SQL, les clés étrangères et les contraintes — les simuler
// reviendrait à valider une imitation. Les modules sont appelés directement,
// sans passer par HTTP : on vérifie la règle, pas le routage.
//
// IL NE TOUCHE À AUCUN COMPTE RÉEL. Les dresseurs qu'il crée portent des
// identifiants Discord d'une plage réservée, et il les efface en partant —
// même en cas d'échec, par un try/finally. Rien d'autre n'est lu ni écrit.

import { lire, une, ecrire, creerSchema, description } from '../src/base.js';
import { ecrireDex, lireDex, horodatage, changerEchangesOuverts, changerMessagesDe,
         lireCarte, ecrireCarte, profilsPublics, creerProfil, supprimerProfil,
         creerPartage, partagesDe, revoquerPartage, lirePartage, ecrireCodePartage }
  from '../src/comptes.js';
import { suivre, quiA, nouveautes } from '../src/amis.js';
import { proposer, repondre, annuler, mesEchanges, messages, ecrireMessage }
  from '../src/echanges.js';
import * as images from '../src/images.js';
import { ecrireA, conversations, conversation, nonLus, chercher }
  from '../src/messagerie.js';
import { mesNotifications } from '../src/notifications.js';
import { motInterdit, injurieuxDansPhrase } from '../src/pseudos-interdits.js';

// La plage 991… — voisine de celle de peupler.js, et distincte pour que les
// deux outils ne se marchent jamais dessus.
const FIGURANTS = [
  { discord: '99100000000000001', pseudo: 'BancUn' },
  { discord: '99100000000000002', pseudo: 'BancDeux' },
];
const IDS = FIGURANTS.map((f) => f.discord);

let reussites = 0;
const echecs = [];

async function verifier(quoi, fn) {
  try {
    const dit = await fn();
    if (typeof dit === 'string' && dit.startsWith('échec')) {
      echecs.push([quoi, dit]);
      console.log(`  ✗ ${quoi}\n      ${dit}`);
    } else {
      reussites++;
      console.log(`  · ${quoi}\n      ${dit}`);
    }
  } catch (e) {
    echecs.push([quoi, e.message]);
    console.log(`  ✗ ${quoi}\n      échec : ${e.message}`);
  }
}

// --- Le décor ----------------------------------------------------------------

async function poser() {
  const ids = {};
  for (const f of FIGURANTS) {
    const quand = horodatage();
    const r = await ecrire(
      `INSERT INTO pa_dresseurs (discord_id, pseudo, pseudo_cle, avatar, cree_le, visible)
       VALUES (?, ?, ?, NULL, ?, 1)`,
      [f.discord, f.pseudo, f.pseudo.toLowerCase(), quand]);
    await ecrire(
      `INSERT INTO pa_profils (dresseur_id, nom, nom_cle, public, par_defaut,
                               mode, niveau_formes, cree_le, maj_le)
       VALUES (?, 'Aventure 1', 'aventure 1', 1, 1, 'capture', 3, ?, ?)`,
      [r.insertId, quand, quand]);
    ids[f.pseudo] = r.insertId;
  }
  return ids;
}

async function retirer() {
  await ecrire(
    `DELETE FROM pa_dresseurs WHERE discord_id IN (${IDS.map(() => '?').join(',')})`, IDS);
}

const profilDe = async (id) =>
  (await une('SELECT id FROM pa_profils WHERE dresseur_id = ? LIMIT 1', [id])).id;

/** Une sauvegarde de la forme que l'application envoie. */
const sauvegarde = (caught, extra = {}) => ({
  version: 1, caught, shiny: [],
  dex: { rby: { caught, shiny: [] } },
  ...extra,
});

// --- Un JPEG porteur d'EXIF, fabriqué ici ------------------------------------
//
// Pas de fichier témoin sur le disque : le banc doit tourner sur une machine
// nue. Ce JPEG n'est pas décodable en image, et c'est sans importance — le
// serveur ne le décode jamais, il lit son en-tête.
function jpegAvecExif() {
  const seg = (marqueur, charge) => Buffer.concat([
    Buffer.from([0xff, marqueur]),
    (() => { const b = Buffer.alloc(2); b.writeUInt16BE(charge.length + 2); return b; })(),
    charge,
  ]);
  const sof = Buffer.alloc(9);
  sof[0] = 8; sof.writeUInt16BE(720, 1); sof.writeUInt16BE(1280, 3);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'binary')),
    seg(0xe1, Buffer.from('Exif\0\0II*\0\x08\0\0\0GPS 48.8566 2.3522 SALON')),
    seg(0xdb, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 0x10)])),
    seg(0xc0, sof),
    seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.alloc(256), Buffer.from([0xff, 0xd9]),
  ]);
}

// --- Les vérifications -------------------------------------------------------

async function tout(ids) {
  const un = ids.BancUn, deux = ids.BancDeux;
  const profilUn = await profilDe(un);

  console.log('\nLes échanges');

  await verifier(
    "Le sens est retourné pour le receveur, jamais pour le demandeur",
    async () => {
      // LE PIÈGE DE CE MODULE. En base, offert et demande sont écrits du point
      // de vue du DEMANDEUR. Les rendre tels quels au receveur lui ferait lire
      // « tu offres » sous le Pokémon qu'il reçoit — une inversion qui ne lève
      // rien, ne casse rien, et propose le contraire de ce qui a été cliqué.
      const e = await proposer(un, { pseudo: 'BancDeux', dex: 'rby',
        offert: 'abra', demande: 'machop', mot: null });

      const chezUn = (await mesEchanges(un)).echanges.find((x) => x.id === e.id);
      const chezDeux = (await mesEchanges(deux)).echanges.find((x) => x.id === e.id);

      if (chezUn.jeDonne !== 'abra' || chezUn.jeRecois !== 'machop') {
        return `échec : le demandeur lit ${chezUn.jeDonne}/${chezUn.jeRecois}`;
      }
      if (chezDeux.jeDonne !== 'machop' || chezDeux.jeRecois !== 'abra') {
        return `échec : le receveur lit ${chezDeux.jeDonne}/${chezDeux.jeRecois}`;
      }
      if (chezUn.sens !== 'propose' || chezDeux.sens !== 'recu') {
        return 'échec : le sens annoncé est faux';
      }
      return 'demandeur : donne abra reçoit machop ; receveur : l’inverse';
    });

  await verifier(
    "Le demandeur ne peut pas répondre à sa propre proposition",
    async () => {
      const e = await proposer(un, { pseudo: 'BancDeux', dex: 'rby',
        offert: 'pikachu', demande: 'eevee', mot: null });
      try {
        await repondre(un, e.id, 'accepte');
        return 'échec : il a pu accepter son propre échange';
      } catch (err) {
        if (err.code !== 403) return `échec : refusé, mais en ${err.code}`;
      }
      const r = await repondre(deux, e.id, 'accepte');
      return `refusé au demandeur (403), accepté par le receveur (${r.etat})`;
    });

  await verifier(
    'On parle dès la proposition, plus jamais après un refus',
    async () => {
      // CETTE VÉRIFICATION DISAIT L'INVERSE, et elle avait raison de le dire à
      // l'époque : la discussion n'ouvrait qu'après un oui, pour qu'un
      // abonnement à sens unique ne devienne pas un canal de messages non
      // sollicités.
      //
      // La règle a été renversée sciemment — voir l'en-tête de echanges.js. En
      // résumé : elle ne fermait pas le canal, puisque le `mot` de la
      // proposition livrait déjà du texte libre par notification ; elle
      // empêchait seulement de RÉPONDRE. Elle protégeait l'importun et
      // bâillonnait l'importuné.
      //
      // CE QUI RESTE FERMÉ EST LE POINT DE CETTE VÉRIFICATION. Un échange
      // refusé est clos : continuer à y écrire serait exactement le harcèlement
      // que ce module doit éviter.
      const e = await proposer(un, { pseudo: 'BancDeux', dex: 'rby',
        offert: 'zubat', demande: 'mewtwo', mot: null });
      await ecrireMessage(un, e.id, 'coucou, ça te dit ?');
      const avant = await messages(deux, e.id);
      if (avant.messages.length !== 1) {
        return `échec : ${avant.messages.length} message(s) avant réponse, un attendu`;
      }

      await repondre(deux, e.id, 'refuse');
      try {
        await ecrireMessage(un, e.id, 'et maintenant ?');
        return 'échec : on a pu écrire après un refus';
      } catch { /* attendu */ }

      // LISIBLE MAIS MUET : « rien ne s'efface » vaut aussi pour ce qui a été
      // dit avant le refus. On n'y parle plus, on peut encore le relire.
      const apres = await messages(deux, e.id).catch(() => null);
      if (!apres) return 'échec : la conversation refusée n’est plus lisible';
      return 'on parle dès la proposition, muet après un refus, lisible toujours';
    });

  await verifier(
    "Un tiers ne voit pas un échange qui ne le regarde pas",
    async () => {
      const e = await proposer(un, { pseudo: 'BancDeux', dex: 'rby',
        offert: 'onix', demande: 'ditto', mot: null });
      await repondre(deux, e.id, 'accepte');
      // Le troisième est un dresseur réel quelconque : on ne lit rien de lui,
      // on vérifie seulement qu'il se heurte au mur.
      const autre = await une(
        `SELECT id FROM pa_dresseurs WHERE discord_id NOT IN (${IDS.map(() => '?').join(',')}) LIMIT 1`,
        IDS);
      if (!autre) return 'ignoré : aucun autre dresseur en base';
      try {
        await messages(autre.id, e.id);
        return 'échec : un tiers a lu la discussion';
      } catch (err) {
        if (err.code !== 404) return `échec : refusé en ${err.code} et non 404`;
      }
      return 'refusé en 404 — ne dit même pas que l’échange existe';
    });

  await verifier(
    'Porte fermée, la proposition est refusée — au serveur, pas à l’écran',
    async () => {
      // CE QUE CETTE VÉRIFICATION DÉFEND. Griser un bouton dans l'application
      // n'engage rien : le jeton suffit à appeler la route directement. Un
      // réglage qui ne tient que par l'interface est une suggestion, pas un
      // réglage — on l'éprouve donc en appelant le service, comme le ferait
      // quelqu'un qui contourne la fenêtre.
      await changerEchangesOuverts(deux, false);
      try {
        await proposer(un, {
          pseudo: 'BancDeux', dex: 'rby', offert: 'abra', demande: 'kadabra',
        });
        return 'échec : la proposition est passée malgré la porte fermée';
      } catch (e) {
        if (!/n’accepte pas les propositions/.test(e.message)) {
          return `échec : refusé pour une autre raison — ${e.message}`;
        }
      }

      // LA PORTE SE ROUVRE. Sans cela on ne saurait pas si le refus vient du
      // réglage ou d'autre chose de cassé au passage.
      await changerEchangesOuverts(deux, true);
      const ok = await proposer(un, {
        pseudo: 'BancDeux', dex: 'rby', offert: 'abra', demande: 'kadabra',
      });
      if (!ok?.id) return 'échec : porte rouverte, la proposition ne passe toujours pas';
      return 'refusée porte fermée, acceptée porte ouverte';
    });

  await verifier(
    'Fermer sa porte ne touche à rien de ce qui est déjà en cours',
    async () => {
      // ON FERME LA PORTE, ON NE VIDE PAS LA PIÈCE. Quelqu'un qui attend une
      // réponse depuis trois jours ne doit pas voir son échange disparaître
      // parce que l'autre a changé un réglage — ce serait effacer le travail
      // d'un tiers pour un geste qui ne le concerne pas.
      const avant = await mesEchanges(deux);
      if (!avant.echanges.length) return 'échec : rien en cours, la vérification ne prouve rien';

      await changerEchangesOuverts(deux, false);
      const apres = await mesEchanges(deux);
      await changerEchangesOuverts(deux, true);

      if (apres.echanges.length !== avant.echanges.length) {
        return `échec : ${avant.echanges.length} échange(s) avant, ${apres.echanges.length} après`;
      }
      return `${avant.echanges.length} échange(s) en cours, tous intacts après fermeture`;
    });

  await verifier(
    'Un message d’échange ne se lit pas comme un pseudo',
    async () => {
      // LE PIÈGE, ET IL A ÉTÉ MESURÉ. La lecture collée est indispensable pour
      // un pseudo — « xX_enculé_Xx » n'existe que séparé. Appliquée telle
      // quelle à une phrase, elle FABRIQUE des insultes que personne n'a
      // écrites : « bâtard de » recollé donne « batarde », qui contient
      // « atarde », la racine d'« attardé ». « Le pain bâtard de la
      // boulangerie » était refusé.
      //
      // D'où deux lectures, et cette vérification tient les deux bouts : ce qui
      // doit passer dans une phrase, et ce qui doit continuer de tomber.
      const ordinaires = [
        'Salut ! Je te donne mon Ponyta contre ton Salamèche, ça te va ?',
        'Mon raton laveur préféré, c’est Linéon',
        'Le pain bâtard de la boulangerie',
        'Ma chatte a eu des petits, elle s’appelle Miaouss',
        'Analyse faite : il me manque 3 Pokémon pour boucler Johto',
        'Tu veux mon Chartor ou mon Colossinge ?',
        'On se retrouve sur Écarlate ce soir vers 21h ?',
        'Sacha x Ondine pour toujours',
      ];
      const injurieux = [
        'ferme ta gueule sale con', 'va te faire enculer', 'nique ta mère',
        'espèce de sinjenkuleur', 'xX enculé Xx', 'fils de pute',
      ];

      const faux = ordinaires.filter((t) => injurieuxDansPhrase(t));
      const manques = injurieux.filter((t) => !injurieuxDansPhrase(t));
      if (faux.length) return `échec : phrase ordinaire refusée — ${faux[0]}`;
      if (manques.length) return `échec : injure passée — ${manques[0]}`;

      // Et le pseudo, lui, garde la lecture collée : la nouvelle porte ne doit
      // pas avoir ouvert l'ancienne.
      if (!motInterdit('xX_encule_Xx')) return 'échec : le pseudo ne colle plus les mots';
      if (motInterdit('Cassandre')) return 'échec : le pseudo refuse un prénom réel';

      return `${ordinaires.length} messages ordinaires acceptés, `
        + `${injurieux.length} refusés, la lecture des pseudos intacte`;
    });

  await verifier(
    'Le mot d’une proposition passe par le filtre, comme les messages',
    async () => {
      // LA PORTE QUI CONTOURNAIT LA RÈGLE. L'en-tête de echanges.js pose que la
      // discussion n'ouvre qu'une fois l'échange accepté, « sinon la boîte de
      // réception devient un canal de messages non sollicités ». Le `mot` de la
      // proposition passait au travers : 280 caractères de texte libre, vers
      // n'importe qui par son pseudo, livrés par notification à quelqu'un qui
      // n'a rien accepté. La règle était écrite, elle n'était pas appliquée là.
      try {
        await proposer(deux, {
          pseudo: 'BancUn', dex: 'rby', offert: 'onix', demande: 'lippoutou',
          mot: 'échange avec moi sale con',
        });
        return 'échec : le mot injurieux est passé';
      } catch (e) {
        if (!/ne passe pas/.test(e.message)) {
          return `échec : refusé pour une autre raison — ${e.message}`;
        }
        // On ne NOMME PAS le mot fautif : le dire, c'est apprendre quoi
        // contourner. Même raison qu'à l'inscription.
        if (/\bcon\b/.test(e.message)) return 'échec : le refus nomme le mot fautif';
      }

      // Le même échange, avec un mot correct, doit passer : sans quoi on ne
      // saurait pas si c'est le mot qui a été refusé ou l'échange lui-même.
      const ok = await proposer(deux, {
        pseudo: 'BancUn', dex: 'rby', offert: 'onix', demande: 'lippoutou',
        mot: 'Salut ! Ça t’intéresse ? J’ai aussi un raton laveur… enfin, un Linéon.',
      });
      if (!ok?.id) return 'échec : le mot correct ne passe pas non plus';
      // ON RANGE DERRIÈRE SOI : trois propositions en attente par personne est la
      // limite, et une vérification qui la consomme fait échouer la suivante pour
      // une raison étrangère à ce qu'elle éprouve. C'est arrivé, exactement ainsi.
      await annuler(deux, ok.id);
      return 'mot injurieux refusé sans le nommer, mot ordinaire accepté';
    });

  await verifier(
    'On peut offrir sans rien demander, et les deux le lisent pareil',
    async () => {
      // OFFRIR N'EST PAS ÉCHANGER À MOITIÉ. `demande` vide veut dire « rien en
      // retour » — la colonne est NOT NULL et un identifiant d'espèce n'est
      // jamais vide, donc le vide dit « rien » sans ambiguïté ni migration.
      //
      // CE QUE CETTE VÉRIFICATION DÉFEND VRAIMENT : que les DEUX côtés le
      // lisent pareil. `vueEchange` retourne le sens selon qui regarde, et
      // c'est exactement le genre d'endroit où un don devient « je donne rien »
      // chez l'un et « je reçois rien » chez l'autre.
      const e = await proposer(un, {
        pseudo: 'BancDeux', dex: 'rby', offert: 'mackogneur', demande: '',
        mot: 'Tiens, il te manquait — cadeau.',
      });
      if (!e?.id) return 'échec : le don n’a pas été créé';

      const cotePropose = (await mesEchanges(un)).echanges.find((x) => x.id === e.id);
      const coteRecu = (await mesEchanges(deux)).echanges.find((x) => x.id === e.id);
      if (!cotePropose || !coteRecu) return 'échec : le don manque d’un des deux côtés';

      if (!cotePropose.don || !coteRecu.don) {
        return 'échec : le don n’est pas annoncé comme tel aux deux';
      }
      if (cotePropose.jeDonne !== 'mackogneur' || cotePropose.jeRecois) {
        return `échec : côté offrant, donne=${cotePropose.jeDonne} recoit=${cotePropose.jeRecois}`;
      }
      if (coteRecu.jeRecois !== 'mackogneur' || coteRecu.jeDonne) {
        return `échec : côté receveur, donne=${coteRecu.jeDonne} recoit=${coteRecu.jeRecois}`;
      }

      // Un échange ordinaire ne doit PAS se dire don : sans quoi le drapeau
      // serait vrai partout et n'apprendrait rien.
      const ordinaire = (await mesEchanges(un)).echanges.find((x) => x.id !== e.id && x.jeRecois);
      if (ordinaire && ordinaire.don) return 'échec : un échange ordinaire se dit don';

      await annuler(un, e.id);
      return 'offert d’un côté, reçu de l’autre, et rien en retour pour les deux';
    });

  console.log('\nLa messagerie');

  await verifier(
    'On écrit à quelqu’un sans passer par un échange, et il le lit',
    async () => {
      // CE QUE ÇA REMPLACE. Pour dire « tu aurais un Abra ? » il fallait
      // d'abord PROPOSER quelque chose — donc décider quoi donner et quoi
      // demander avant même d'avoir pu poser la question. L'outil imposait
      // l'ordre inverse de la conversation réelle.
      await ecrireA(un, 'BancDeux', 'Salut ! Tu aurais un Abra en trop ?');

      const chezLui = await conversations(deux);
      const fil = chezLui.conversations.find((c) => c.pseudo === 'BancUn');
      if (!fil) return 'échec : la conversation n’apparaît pas chez le destinataire';
      // AU MOINS UN, ET NON EXACTEMENT UN. Depuis que les messages d'échange
      // vivent dans la même conversation, ce compte dépend aussi de ce que le
      // décor a posé — l'exiger à l'unité faisait échouer cette vérification
      // pour une raison étrangère à ce qu'elle éprouve.
      if (fil.nonLus < 1) return `échec : ${fil.nonLus} non lu, au moins un attendu`;
      if (fil.deMoi) return 'échec : son propre message lui est attribué';

      // LIRE MARQUE LU, sans second aller-retour : un écran ouvert EST la
      // lecture, et un appel séparé se perd un jour sur deux — fenêtre fermée
      // trop vite, réseau coupé.
      const vu = await conversation(deux, 'BancUn');
      // ON CHERCHE LE MESSAGE, PAS UN COMPTE. La conversation contient
      // désormais aussi les messages des échanges avec cette personne : compter
      // les lignes reviendrait à compter le décor.
      const mien = vu.messages.find((m) => /Abra en trop/.test(m.texte));
      if (!mien) return 'échec : le message écrit ne se relit pas dans le fil';
      if (mien.deMoi) return 'échec : le message de l’autre est attribué au lecteur';
      const apres = await conversations(deux);
      const relu = apres.conversations.find((c) => c.pseudo === 'BancUn');
      if (relu.nonLus !== 0) return 'échec : la lecture ne marque pas lu';

      return 'écrit, annoncé non lu, lu en ouvrant';
    });

  await verifier(
    'Les deux portes sont indépendantes : échanges et messages',
    async () => {
      // CETTE VÉRIFICATION DISAIT L'INVERSE. Elle affirmait que fermer
      // `echanges_ouverts` fermait aussi les messages — « on ne ferme pas la
      // moitié de sa porte ». C'était vrai tant qu'il n'y avait qu'un réglage.
      //
      // Il y en a deux maintenant, et la séparation est voulue : une
      // proposition d'échange se refuse d'un clic et disparaît, un message se
      // lit. On peut vouloir rester joignable pour échanger tout en fermant la
      // conversation aux inconnus — et l'inverse existe aussi.
      //
      // CE QUI SE CASSERAIT SANS ELLE : un refactor qui refait passer les
      // messages par `echanges_ouverts` fermerait la messagerie de tous ceux
      // qui ont seulement fermé leurs échanges, sans que personne ne l'ait
      // demandé.
      await changerEchangesOuverts(deux, false);
      await changerMessagesDe(deux, 'tous');
      try {
        await ecrireA(un, 'BancDeux', 'échanges fermés, mais je peux écrire ?');
      } catch (e) {
        return `échec : les échanges fermés bloquent les messages — ${e.message}`;
      }

      await changerEchangesOuverts(deux, true);
      await changerMessagesDe(deux, 'personne');
      const ok = await proposer(un, {
        pseudo: 'BancDeux', dex: 'rby', offert: 'rondoudou', demande: 'melofee',
      });
      if (!ok?.id) return 'échec : les messages fermés bloquent les échanges';
      await annuler(un, ok.id);

      await changerMessagesDe(deux, 'tous');
      return 'échanges fermés n’empêchent pas d’écrire, et réciproquement';
    });

  await verifier(
    'Le monologue est borné, la conversation ne l’est pas',
    async () => {
      // LA SEULE LIMITE QUI VAILLE. Entre deux personnes qui se parlent, il n'y
      // a aucune raison de compter. Face à quelqu'un qui ne répond pas, dix
      // messages sont déjà neuf de trop — et c'est la forme que prend le
      // harcèlement bien plus souvent qu'un seul message très long.
      //
      // BancDeux a répondu à l'étape précédente ? Non : il a LU, pas répondu.
      // La distinction est exactement celle que le service applique.
      let refus = null;
      for (let i = 0; i < 12 && !refus; i++) {
        try {
          await ecrireA(un, 'BancDeux', `message numéro ${i + 2}`);
        } catch (e) { refus = e.message; }
      }
      if (!refus) return 'échec : aucun plafond sur un monologue';
      if (!/pas encore répondu/.test(refus)) {
        return `échec : arrêté pour une autre raison — ${refus}`;
      }

      // Une réponse rouvre le robinet : c'est ce qui distingue la garde d'un
      // simple quota.
      await ecrireA(deux, 'BancUn', 'oui, je regarde ça');
      const encore = await ecrireA(un, 'BancDeux', 'super, merci !');
      if (!encore?.id) return 'échec : une réponse ne rouvre pas la conversation';

      return 'bloqué après dix sans réponse, rouvert dès qu’il répond';
    });

  await verifier(
    'Un message injurieux ne part pas, et le refus ne nomme pas le mot',
    async () => {
      try {
        await ecrireA(deux, 'BancUn', 'ferme ta gueule sale con');
        return 'échec : le message injurieux est passé';
      } catch (e) {
        if (!/ne passe pas/.test(e.message)) {
          return `échec : refusé pour une autre raison — ${e.message}`;
        }
        if (/\bcon\b/.test(e.message)) return 'échec : le refus nomme le mot fautif';
      }
      // Et une phrase ordinaire contenant un mot ambigu doit passer : c'est la
      // moitié qui coûte le plus cher à rater.
      const ok = await ecrireA(deux, 'BancUn', 'mon raton laveur préféré, c’est Linéon');
      if (!ok?.id) return 'échec : une phrase ordinaire est refusée';
      return 'injure refusée sans la nommer, phrase ordinaire acceptée';
    });

  await verifier(
    'Les trois crans de « qui peut m’écrire », et le sens de « amis »',
    async () => {
      // LE PIÈGE DU CRAN DU MILIEU, et c'est tout l'objet de cette
      // vérification. `pa_amis` est à sens unique : dresseur_id suit ami_id.
      // « Seulement mes amis » doit donc interroger QUI LE DESTINATAIRE SUIT.
      // Prendre l'autre sens laisserait n'importe qui s'ouvrir la porte en
      // s'abonnant à sa cible — le réglage protégerait alors exactement
      // personne, tout en ayant l'air de fonctionner.
      const ecrit = async () => {
        try { await ecrireA(un, 'BancDeux', 'toc toc'); return null; }
        catch (e) { return e.message; }
      };

      await changerMessagesDe(deux, 'personne');
      const ferme = await ecrit();
      if (!ferme || !/n’accepte pas les messages/.test(ferme || '')) {
        return `échec : « personne » laisse passer — ${ferme || 'aucun refus'}`;
      }

      await changerMessagesDe(deux, 'amis');
      // BancDeux ne suit PAS BancUn à ce stade — mais BancUn suit BancDeux, ce
      // que le décor a posé. C'est précisément le cas qui distingue les deux
      // lectures du lien.
      const pasAmi = await ecrit();
      if (!pasAmi || !/que des dresseurs qu’il suit/.test(pasAmi || '')) {
        return `échec : « amis » lit le lien à l’envers — ${pasAmi || 'aucun refus'}`;
      }

      await suivre(deux, 'BancUn');
      const ami = await ecrit();
      if (ami) return `échec : refusé alors qu’il le suit — ${ami}`;

      await changerMessagesDe(deux, 'tous');
      const ouvert = await ecrit();
      if (ouvert) return `échec : « tous » refuse quand même — ${ouvert}`;

      // Une valeur inconnue ne doit pas créer un quatrième état silencieux.
      const rabattu = await changerMessagesDe(deux, 'nimporte quoi');
      if (rabattu.messagesDe !== 'tous') {
        return `échec : une valeur inconnue devient « ${rabattu.messagesDe} »`;
      }

      return 'personne refuse, amis lit le lien dans le bon sens, tous accepte';
    });

  await verifier(
    'Une personne, une conversation : les messages d’échange y sont aussi',
    async () => {
      // CE QUE ÇA CORRIGE. Les messages d'un échange vivaient dans un fil à
      // part, qui ne s'ouvrait qu'en passant par la fiche du troc. On avait
      // donc DEUX boîtes pour le même interlocuteur, et rien ne signalait
      // l'existence de la seconde.
      //
      // Le piège technique : les deux sortes de lignes ne désignent pas l'autre
      // personne de la même façon. Un message direct la nomme dans
      // `destinataire_id` ; un message d'échange ne la nomme pas du tout — il
      // faut passer par l'échange pour savoir qui sont les deux parties.
      const e = await proposer(un, {
        pseudo: 'BancDeux', dex: 'rby', offert: 'abra', demande: 'machoc',
        mot: null,
      });
      await ecrireMessage(un, e.id, 'd’accord pour demain ?');
      await ecrireA(un, 'BancDeux', 'et sinon, ça va ?');

      const fil = await conversation(deux, 'BancUn');
      const dEchange = fil.messages.filter((m) => m.echange);
      const directs = fil.messages.filter((m) => !m.echange);
      if (!dEchange.length) return 'échec : le message d’échange manque au fil';
      if (!directs.length) return 'échec : le message direct manque au fil';

      // CHAQUE MESSAGE D'ÉCHANGE DIT DE QUEL ÉCHANGE IL PARLE, et dans le sens
      // de celui qui lit : BancDeux REÇOIT abra, il ne le donne pas.
      const m = dEchange.find((x) => x.texte === 'd’accord pour demain ?');
      if (!m) return 'échec : le message d’échange n’est pas celui attendu';
      if (m.echange.id !== e.id) return 'échec : le message pointe le mauvais échange';
      if (m.echange.jeRecois !== 'abra') {
        return `échec : sens retourné — BancDeux reçoit « ${m.echange.jeRecois} », abra attendu`;
      }

      // ET LA CONVERSATION EXISTE DANS LA LISTE, avec les deux sortes comptées.
      const liste = await conversations(deux);
      const avecLui = liste.conversations.find((c) => c.pseudo === 'BancUn');
      if (!avecLui) return 'échec : la conversation n’apparaît pas dans la liste';

      await annuler(un, e.id);
      return `${dEchange.length} message(s) d’échange et ${directs.length} direct(s), `
        + 'dans un seul fil et dans le bon sens';
    });

  await verifier(
    'Lire la conversation marque lu des DEUX sortes de messages',
    async () => {
      // LE PIÈGE : la remise à zéro visait `destinataire_id`, qui est NUL sur un
      // message d'échange. Sans la seconde branche, une conversation lue
      // gardait des non-lus invisibles — la pastille ne redescendait jamais.
      const e = await proposer(deux, {
        pseudo: 'BancUn', dex: 'rby', offert: 'onix', demande: 'racaillou',
        mot: null,
      });
      await ecrireMessage(deux, e.id, 'toujours partant ?');
      await ecrireA(deux, 'BancUn', 'un mot direct aussi');

      const avant = (await conversations(un)).conversations
        .find((c) => c.pseudo === 'BancDeux');
      if (!avant || avant.nonLus < 2) {
        return `échec : ${avant ? avant.nonLus : 0} non lus, au moins deux attendus`;
      }

      await conversation(un, 'BancDeux');
      const apres = (await conversations(un)).conversations
        .find((c) => c.pseudo === 'BancDeux');
      if (apres.nonLus !== 0) {
        return `échec : ${apres.nonLus} non lu(s) après lecture`;
      }

      await annuler(deux, e.id);
      return `${avant.nonLus} non lus des deux sortes, tous marqués lus en ouvrant`;
    });

  await verifier(
    'Un Pokémon voyage dans un message, et la notification sait d’où elle vient',
    async () => {
      // CE QUE ÇA REMPLACE : on l'écrivait à la main, donc sans image, sans lien
      // vers la fiche, et avec les fautes de frappe de chacun.
      //
      // L'IDENTIFIANT VOYAGE, PAS LE NOM. « mr-mime » et jamais « M. Mime » : la
      // langue est un réglage de celui qui LIT. Un message écrit en français
      // doit se lire en anglais chez qui a choisi l'anglais — garder le nom
      // affiché figerait la langue de l'expéditeur dans la base.
      const r = await ecrireA(un, 'BancDeux', 'il te manque, non ?', 'mr-mime');
      if (!r?.id) return 'échec : le message avec Pokémon n’est pas parti';

      const fil = await conversation(deux, 'BancUn');
      const carte = fil.messages.find((m) => m.espece === 'mr-mime');
      if (!carte) return 'échec : l’espèce ne revient pas avec le message';

      // UN POKÉMON SEUL EST UN MESSAGE : exiger du texte à côté obligerait à
      // écrire « tiens » sous chaque carte, ce que personne ne fait deux fois.
      const seul = await ecrireA(un, 'BancDeux', '', 'pikachu');
      if (!seul?.id) return 'échec : un Pokémon sans texte est refusé';

      // Ce qui n'a pas la forme d'un identifiant est refusé : sinon la pièce
      // jointe devient un second champ de texte, sans longueur ni filtre.
      try {
        await ecrireA(un, 'BancDeux', 'tiens', 'M. Mime <script>');
        return 'échec : une espèce mal formée est acceptée';
      } catch (e) {
        if (!/n’est pas reconnu/.test(e.message)) {
          return `échec : refusé pour une autre raison — ${e.message}`;
        }
      }

      // LA NOTIFICATION PORTE LE PSEUDO DE QUI ÉCRIT. Sans lui, cliquer dessus
      // retombait sur la page des amis : le titre disait bien « BancUn t'a
      // écrit », mais un titre est du texte, et le découper pour en tirer un
      // pseudo casserait à la première reformulation.
      const avis = await mesNotifications(deux);
      const sien = avis.notifications.find((n) => n.genre === 'message' && n.de);
      if (!sien) return 'échec : aucune notification de message ne dit de qui elle vient';
      if (sien.de !== 'BancUn') return `échec : notification attribuée à ${sien.de}`;

      return 'espèce transmise par identifiant, Pokémon seul accepté, '
        + 'forme invalide refusée, notification signée';
    });

  await verifier(
    'Une photo jointe part si l’aventure est publique, et jamais sinon',
    async () => {
      // LE PIÈGE QUE CETTE VÉRIFICATION GARDE. Une photo suit la visibilité de
      // son aventure : servie 404 à qui n'en est pas l'auteur quand l'aventure
      // est privée. Laisser partir une telle photo dans un message produirait
      // chez le destinataire un cadre vide, sans que personne ne comprenne
      // pourquoi — l'expéditeur la voit très bien de son côté.
      //
      // ON REFUSE DONC L'ENVOI, en le disant. C'est le seul endroit où le
      // refus peut être formulé : après coup, il n'y a plus qu'un carré cassé.
      const photo = await images.deposer(un, profilUn, 'chasse', jpegAvecExif());

      const envoye = await ecrireA(un, 'BancDeux', 'regarde ça', null, photo.id);
      if (!envoye?.id) return 'échec : la photo d’une aventure publique est refusée';

      const fil = await conversation(deux, 'BancUn');
      const avec = fil.messages.find((m) => m.image === photo.id);
      if (!avec) return 'échec : la photo ne revient pas avec le message';
      // ET LE DESTINATAIRE PEUT VRAIMENT LA CHARGER : c'est tout l'objet du
      // refus qui suit. Vérifier la colonne sans vérifier l'accès laisserait
      // passer exactement le défaut qu'on essaie d'éviter.
      await images.servir(deux, photo.id);

      // UNE PHOTO SEULE EST UN MESSAGE, comme un Pokémon seul.
      const seule = await ecrireA(un, 'BancDeux', '', null, photo.id);
      if (!seule?.id) return 'échec : une photo sans texte est refusée';

      await ecrire('UPDATE pa_profils SET public = 0 WHERE id = ?', [profilUn]);
      let refuse = null;
      try { await ecrireA(un, 'BancDeux', 'et celle-ci ?', null, photo.id); }
      catch (e) { refuse = e.message; }
      await ecrire('UPDATE pa_profils SET public = 1 WHERE id = ?', [profilUn]);
      if (!refuse) return 'échec : la photo d’une aventure privée est partie quand même';
      if (!/privée/.test(refuse)) return `échec : refusé sans dire pourquoi — ${refuse}`;

      // ET CELLE D'UN AUTRE N'EST PAS LA SIENNE À ENVOYER. Sans cette garde,
      // n'importe quel identifiant d'image ferait l'affaire.
      const profilDeux = await profilDe(deux);
      const sienne = await images.deposer(deux, profilDeux, 'chasse', jpegAvecExif());
      let vole = null;
      try { await ecrireA(un, 'BancDeux', 'tiens', null, sienne.id); }
      catch (e) { vole = e.code; }
      if (vole !== 403) return `échec : la photo d’autrui part (code ${vole})`;

      // EFFACER LA PHOTO N'EFFACE PAS LE MESSAGE. La clé étrangère est en
      // ON DELETE SET NULL et non CASCADE : les mots restent, l'image s'en va.
      // En CASCADE, vider son album emporterait des conversations entières.
      await images.retirer(un, photo.id);
      const apres = await conversation(deux, 'BancUn');
      const survivant = apres.messages.find((m) => m.id === envoye.id);
      if (!survivant) return 'échec : effacer la photo a emporté le message';
      if (survivant.image) return 'échec : le message pointe encore une photo effacée';
      if (survivant.texte !== 'regarde ça') return 'échec : le texte a changé';

      return 'publique : elle part et se charge ; privée : refusée et expliquée ; '
        + 'celle d’autrui : 403 ; effacée : le message reste';
    });

  await verifier(
    'Le compte de non lus voyage avec la veille',
    async () => {
      // IL MÉRITAIT UN ALLER-RETOUR TOUTES LES DEUX MINUTES, PAS UN À LUI SEUL.
      // La pastille du menu se nourrit de ce chiffre ; sans lui elle resterait
      // muette, ou coûterait une requête de plus à chaque battement.
      //
      // ELLE POSE SON PROPRE NON-LU. Elle héritait de ceux que les
      // vérifications précédentes laissaient traîner, et la première d'entre
      // elles à finir par une lecture la faisait échouer — sur un compte juste,
      // pour une raison étrangère à ce qu'elle éprouve. La réponse de BancDeux
      // d'abord : elle rouvre le monologue, borné à dix sans réponse.
      await ecrireA(deux, 'BancUn', 'je te réponds, pour la forme');
      await ecrireA(un, 'BancDeux', 'et un dernier mot qui attend d’être lu');

      const avant = await nonLus(deux);
      if (avant < 1) return `échec : ${avant} non lu, au moins un attendu ici`;

      await conversation(deux, 'BancUn');
      const apres = await nonLus(deux);
      if (apres !== 0) return `échec : ${apres} non lu(s) après lecture`;
      return `${avant} en attente, zéro après lecture`;
    });

  await verifier(
    'Le mot d’une proposition arrive dans la conversation',
    async () => {
      // LE DÉFAUT, VU À L'ÉCRAN. Le mot vivait dans la seule colonne
      // `pa_echanges.mot`, que la conversation ne lit pas — elle lit
      // `pa_messages`. On recevait « salut, ça t'intéresse ? » avec sa
      // notification, on ouvrait les Messages, et l'on y trouvait « Aucune
      // conversation ». La première chose qu'on écrit était la seule à ne pas
      // arriver.
      // ON FAIT DE LA PLACE D'ABORD. Trois propositions en attente chez la même
      // personne est la limite, et les vérifications qui précèdent l'ont
      // consommée : sans ce ménage, celle-ci échoue pour une raison étrangère à
      // ce qu'elle éprouve. C'est arrivé, exactement ainsi.
      const enAttente = await mesEchanges(un);
      for (const x of enAttente.echanges) {
        if (x.etat === 'propose' && x.sens === 'propose') await annuler(un, x.id);
      }

      const e = await proposer(un, {
        pseudo: 'BancDeux', dex: 'rby', offert: 'nosferapti', demande: 'nosferalto',
        mot: 'salut, ça t’intéresse ?',
      });

      const fil = await conversation(deux, 'BancUn');
      const dit = fil.messages.find((m) => m.texte === 'salut, ça t’intéresse ?');
      if (!dit) return 'échec : le mot de la proposition n’arrive pas dans la conversation';
      if (!dit.echange || dit.echange.id !== e.id) {
        return 'échec : le mot n’est pas rattaché à son échange';
      }
      if (dit.deMoi) return 'échec : le mot est attribué à celui qui le reçoit';

      // ET LA CONVERSATION EXISTE : c'est tout le symptôme, « Aucune
      // conversation » alors qu'on venait d'être sollicité.
      const liste = await conversations(deux);
      if (!liste.conversations.some((c) => c.pseudo === 'BancUn')) {
        return 'échec : aucune conversation malgré une proposition reçue';
      }

      // UNE PROPOSITION SANS MOT N'EN INVENTE PAS UN.
      const muette = await proposer(un, {
        pseudo: 'BancDeux', dex: 'rby', offert: 'taupiqueur', demande: 'triopikeur',
      });
      const apres = await conversation(deux, 'BancUn');
      if (apres.messages.some((m) => m.echange && m.echange.id === muette.id)) {
        return 'échec : une proposition sans mot a créé un message';
      }

      await annuler(un, e.id);
      await annuler(un, muette.id);
      return 'le mot arrive, rattaché à son échange, et rien n’est inventé sans lui';
    });

  await verifier(
    'La recherche trouve dans les deux sortes de messages, et rien d’autre',
    async () => {
      // CÔTÉ SERVEUR, ET NON DANS CE QUI EST DÉJÀ CHARGÉ. L'écran ne tient que
      // les deux cents derniers messages d'une seule conversation : y filtrer
      // donnerait une recherche qui ne trouve que ce qu'on a déjà sous les
      // yeux — la définition d'une recherche inutile.
      const e = await proposer(un, {
        pseudo: 'BancDeux', dex: 'rby', offert: 'goupix', demande: 'feunard',
        mot: 'motif-temoin dans un mot de proposition',
      });
      await ecrireA(un, 'BancDeux', 'motif-temoin dans un message direct');

      const r = await chercher(deux, 'motif-temoin');
      const textes = r.resultats.map((x) => x.texte);
      if (!textes.some((x) => /mot de proposition/.test(x))) {
        return 'échec : le mot d’une proposition n’est pas trouvé';
      }
      if (!textes.some((x) => /message direct/.test(x))) {
        return 'échec : un message direct n’est pas trouvé';
      }

      // AVEC QUI, ET DANS QUEL SENS. Sans cela, un résultat ne mène nulle part.
      const premier = r.resultats.find((x) => /message direct/.test(x.texte));
      if (premier.avec !== 'BancUn') return `échec : attribué à ${premier.avec}`;
      if (premier.deMoi) return 'échec : le message de l’autre m’est attribué';

      // ON NE VOIT QUE SES PROPRES CONVERSATIONS. Un tiers ne doit rien trouver
      // de ce qui s'est dit entre deux autres — c'est la garde qui compte.
      const tiers = await chercher(un, 'motif-temoin');
      if (!tiers.resultats.length) return 'échec : le demandeur ne trouve pas ses propres messages';

      await annuler(un, e.id);
      return `${r.resultats.length} résultat(s), des deux sortes, dans le bon sens`;
    });

  await verifier(
    'Le motif est échappé : « 100% » ne ramène pas tout',
    async () => {
      // `%` ET `_` SONT DES CARACTÈRES SPÉCIAUX DE LIKE. Sans les neutraliser,
      // chercher « 100% » ramènerait la totalité des messages — et l'on
      // croirait à un défaut de classement plutôt qu'à un caractère mal
      // compris. Le piège est silencieux : la requête réussit, elle répond
      // simplement n'importe quoi.
      await ecrireA(un, 'BancDeux', 'taux de 100% sur ce coup');
      await ecrireA(un, 'BancDeux', 'rien a voir avec le pourcentage');

      const large = await chercher(deux, '100%');
      if (!large.resultats.length) return 'échec : « 100% » ne trouve rien';
      const horsSujet = large.resultats.filter((x) => !/100%/.test(x.texte));
      if (horsSujet.length) {
        return `échec : ${horsSujet.length} résultat(s) sans le motif — le % n’est pas échappé`;
      }

      // Le souligné pareil : « a_b » ne doit pas trouver « aXb ».
      const souligne = await chercher(deux, 'de_100');
      if (souligne.resultats.length) {
        return 'échec : « de_100 » trouve quelque chose — le souligné passe pour un joker';
      }

      // Et une recherche trop courte ne rend rien plutôt que tout.
      const courte = await chercher(deux, 'a');
      if (courte.resultats.length) return 'échec : une seule lettre déclenche la recherche';

      return '« 100% » trouve le sien et rien d’autre, « _ » n’est pas un joker';
    });

  console.log('\nLes photos');

  await verifier(
    "L'EXIF est retiré, les dimensions lues, le type reconnu aux octets",
    async () => {
      const r = await images.deposer(un, profilUn, 'chasse', jpegAvecExif());
      const servi = await images.servir(un, r.id);
      const dedans = servi.octets.toString('binary');
      if (dedans.includes('SALON')) return 'échec : le GPS a survécu';
      if (dedans.includes('Exif')) return 'échec : le segment APP1 est resté';
      if (r.largeur !== 1280 || r.hauteur !== 720) {
        return `échec : ${r.largeur}×${r.hauteur} au lieu de 1280×720`;
      }
      return `${r.octets} octets, EXIF retiré, 1280×720 lus dans le SOF`;
    });

  await verifier(
    "Ce qui n'est pas une image est refusé",
    async () => {
      try {
        await images.deposer(un, profilUn, 'chasse', Buffer.from('MZ\x90\0 un executable'));
        return 'échec : accepté';
      } catch { /* attendu */ }
      try {
        await images.deposer(un, profilUn, 'inconnu', jpegAvecExif());
        return 'échec : sujet inconnu accepté';
      } catch { /* attendu */ }
      return 'octets étrangers refusés, sujet inconnu refusé';
    });

  await verifier(
    "Une photo suit la visibilité de son aventure",
    async () => {
      const r = await images.deposer(un, profilUn, 'chasse', jpegAvecExif());
      await images.servir(deux, r.id);          // aventure publique : doit passer

      await ecrire('UPDATE pa_profils SET public = 0 WHERE id = ?', [profilUn]);
      let refuse = false;
      try { await images.servir(deux, r.id); } catch (e) { refuse = e.code === 404; }
      await images.servir(un, r.id);            // le propriétaire, toujours
      await ecrire('UPDATE pa_profils SET public = 1 WHERE id = ?', [profilUn]);

      if (!refuse) return 'échec : lisible alors que l’aventure est privée';
      return 'publique : visible de tous ; privée : 404 sauf pour son auteur';
    });

  await verifier(
    'Une image de message se lit dans sa conversation, et le ménage l’épargne',
    async () => {
      // DEUX PIÈGES SYMÉTRIQUES, et c'est pour eux que le sujet « message »
      // existe à côté de « chasse ».
      //
      // LE PREMIER EST LE MÉNAGE. Il efface tout ce qu'aucune chasse ne
      // réclame — et une image envoyée dans une conversation n'est réclamée par
      // aucune : elle vit dans un message, et les messages ne sont pas dans la
      // sauvegarde. Sans exception, envoyer une image puis cocher une capture
      // l'aurait effacée quelques secondes plus tard.
      //
      // LE SECOND EST LA VISIBILITÉ. La rattacher à celle de l'aventure aurait
      // eu deux défauts oposés : privée, le destinataire ne verrait rien ;
      // publique, n'importe qui pourrait lire une image adressée à une seule
      // personne. C'est la conversation qui tranche.
      await ecrire('DELETE FROM pa_images WHERE profil_id = ?', [profilUn]);
      const img = await images.deposer(un, profilUn, 'message', jpegAvecExif());

      // MÊME EN AVENTURE PRIVÉE : elle n'appartient à aucune aventure.
      await ecrire('UPDATE pa_profils SET public = 0 WHERE id = ?', [profilUn]);
      const envoye = await ecrireA(un, 'BancDeux', 'la voilà', null, img.id);
      if (!envoye?.id) return 'échec : refusée alors qu’elle n’est pas une photo de chasse';
      await images.servir(deux, img.id);       // le destinataire, malgré le privé
      await images.servir(un, img.id);         // et son auteur, toujours
      await ecrire('UPDATE pa_profils SET public = 1 WHERE id = ?', [profilUn]);

      // ET PERSONNE D'AUTRE, même aventure redevenue publique : une image
      // adressée à quelqu'un n'est pas une pièce d'album.
      const tiers = await une(
        'SELECT id FROM pa_dresseurs WHERE id NOT IN (?, ?) LIMIT 1', [un, deux]);
      if (tiers) {
        let refuse = false;
        try { await images.servir(tiers.id, img.id); } catch (e) { refuse = e.code === 404; }
        if (!refuse) return 'échec : un tiers lit l’image d’une conversation';
      }

      // LE MÉNAGE PASSE, ET NE L'EMPORTE PAS.
      const otees = await images.menage(profilUn, sauvegarde(['abra'], {
        chasses: [], chassesFinies: [],
      }));
      if (otees !== 0) return `échec : le ménage a emporté ${otees} image(s) de message`;
      await images.servir(deux, img.id);

      // MAIS IL BALAIE CELLE QU'ON A CHOISIE PUIS ABANDONNÉE. Entre le dépôt et
      // l'envoi, une image n'est portée par rien : fermer la fenêtre sans
      // écrire la laisserait pour toujours au quota de quelqu'un.
      const perdue = await images.deposer(un, profilUn, 'message', jpegAvecExif());
      await ecrire('UPDATE pa_images SET cree_le = ? WHERE id = ?',
        [horodatage(new Date(Date.now() - 3 * 3600 * 1000)), perdue.id]);
      const balayees = await images.menage(profilUn, sauvegarde(['abra'], {
        chasses: [], chassesFinies: [],
      }));
      if (balayees !== 1) return `échec : ${balayees} image(s) abandonnée(s) balayée(s), une attendue`;
      await images.servir(deux, img.id);      // celle qui est partie reste

      return 'lisible par les deux malgré le privé, fermée aux tiers, '
        + 'épargnée par le ménage ; l’abandonnée balayée';
    });

  await verifier(
    "Le ménage n'emporte que ce qu'aucune chasse ne réclame",
    async () => {
      // ON PART D'UNE ARDOISE PROPRE. Les vérifications précédentes ont déposé
      // leurs propres photos, qu'aucune chasse ne réclame : sans ce nettoyage
      // le ménage en emporterait trois et le compte serait faux — ce qui est
      // arrivé, et disait un défaut du test, pas du code.
      await ecrire('DELETE FROM pa_images WHERE profil_id = ?', [profilUn]);

      const gardee = await images.deposer(un, profilUn, 'chasse', jpegAvecExif());
      const perdue = await images.deposer(un, profilUn, 'chasse', jpegAvecExif());

      const avecChasse = sauvegarde(['abra'], {
        chasses: [], chassesFinies: [{ pokemon: 'eevee', dex: 'rby', image: gardee.id }],
      });
      const otees = await images.menage(profilUn, avecChasse);
      if (otees !== 1) return `échec : ${otees} photo(s) ôtée(s), une seule attendue`;
      await images.servir(un, gardee.id);       // celle qui est citée reste
      let partie = false;
      try { await images.servir(un, perdue.id); } catch { partie = true; }
      if (!partie) return 'échec : l’orpheline est restée';

      // ET LA PRUDENCE : une sauvegarde qui ne parle pas de chasses du tout ne
      // doit RIEN emporter. Un import partiel ne doit pas vider l'album.
      const muette = sauvegarde(['abra']);
      const rien = await images.menage(profilUn, muette);
      if (rien !== 0) return `échec : ${rien} photo(s) ôtée(s) par une sauvegarde muette`;
      await images.servir(un, gardee.id);
      return 'orpheline effacée, citée gardée, sauvegarde muette sans effet';
    });

  console.log('\nLes amis');

  await verifier(
    "« Qui a ce Pokémon » ignore les aventures privées",
    async () => {
      await ecrireDex(deux, sauvegarde(['lapras', 'snorlax']));
      await suivre(un, 'BancDeux');

      const profilDeux = await profilDe(deux);
      const ouvert = await quiA(un, ['lapras', 'mew']);
      await ecrire('UPDATE pa_profils SET public = 0 WHERE id = ?', [profilDeux]);
      const ferme = await quiA(un, ['lapras']);
      await ecrire('UPDATE pa_profils SET public = 1 WHERE id = ?', [profilDeux]);

      if (!ouvert.chez.lapras.includes('BancDeux')) return 'échec : ne le trouve pas';
      if (ouvert.chez.mew.length) return 'échec : trouve un Pokémon que personne n’a';
      if (ferme.chez.lapras.length) return 'échec : une aventure privée compte encore';
      return 'trouvé quand public, invisible quand privé, rien d’inventé';
    });

  await verifier(
    "Suivre quelqu'un ne déverse pas son passé",
    async () => {
      // vu_jusqua est posé au maximum du moment : sans cela, s'abonner
      // annoncerait six mois de journal d'un coup.
      const n = await nouveautes(un);
      const anciennes = n.annonces.filter((a) => a.pseudo === 'BancDeux');
      if (anciennes.length) {
        return `échec : ${anciennes.length} annonce(s) antérieure(s) à l’abonnement`;
      }
      return 'rien de ce qui précède l’abonnement n’est annoncé';
    });

  await verifier(
    'Une sauvegarde sans le moindre champ est refusée, pas écrite',
    async () => {
      // LE DERNIER REMPART. Un pont mal câblé a déjà fait partir une requête
      // sans corps : express.json() rend alors `{}`, qui passait le garde de
      // forme, comptait zéro espèce, et REMPLAÇAIT la collection. Le pont est
      // corrigé ; ce refus fait que le prochain ne pourra plus.
      const dex = sauvegarde(['bulbasaur', 'charmander', 'squirtle']);
      await ecrireDex(un, dex, profilUn);

      try {
        await ecrireDex(un, {}, profilUn);
        return 'échec : un objet vide a été accepté';
      } catch (e) {
        if (!(e instanceof Error)) return 'échec : levée inattendue';
      }

      // Et la collection est intacte : le refus doit précéder toute écriture.
      // `caught` et non `captures` : c'est la cle que pose sauvegarde() ici,
      // et compterEspeces() cote API lit les deux.
      const apres = await lireDex(un, profilUn);
      if ((apres.caught || []).length !== 3) {
        return `échec : ${(apres.caught || []).length} espèce(s) après le refus`;
      }

      // Vider VOLONTAIREMENT reste possible : « Réinitialiser » envoie une
      // sauvegarde complète dont les listes sont vides, pas un objet nu.
      await ecrireDex(un, sauvegarde([]), profilUn);
      const vide = await lireDex(un, profilUn);
      if ((vide.caught || []).length !== 0) return 'échec : la remise à zéro ne passe plus';
      return '{} refusé, les 3 espèces intactes, la remise à zéro toujours permise';
    });

  console.log('\nLa carte de dresseur');

  await verifier(
    'Une carte jamais remplie se lit vide, pas nulle',
    async () => {
      // L'affichage n'a alors aucun cas particulier : les mêmes champs se
      // remplissent, qu'il y ait quelque chose dedans ou non. Rendre null
      // aurait obligé chaque appelant à s'en souvenir.
      const c = await lireCarte(deux);
      if (!c || !c.carte || !c.parties) return 'échec : forme incomplète';
      if (c.carte.jeu !== '' || c.carte.phrase !== '') return 'échec : carte non vide';
      if (!Array.isArray(c.carte.favoris) || c.carte.favoris.length) {
        return 'échec : favoris n’est pas un tableau vide';
      }
      if (Object.keys(c.parties).length) return 'échec : des parties sortent de nulle part';
      return 'jeu et phrase vides, favoris [], aucune partie';
    });

  await verifier(
    'La carte revient telle qu’elle est partie',
    async () => {
      await ecrireCarte(un, {
        carte: { jeu: 'hgss', spinoff: 'Donjon Mystère',
                 favoris: ['venusaur', 'umbreon', 'gengar'], phrase: 'Chasseur de shiny.' },
        parties: {
          rby:  { etat: 'fini', equipe: ['pikachu', 'charizard'], note: 'Premier run.' },
          sv:   { etat: 'en-cours', equipe: [], note: '' },
        },
      });
      const c = await lireCarte(un);
      if (c.carte.jeu !== 'hgss') return `échec : jeu ${c.carte.jeu}`;
      if (c.carte.favoris.join(',') !== 'venusaur,umbreon,gengar') {
        return `échec : favoris ${c.carte.favoris.join(',')}`;
      }
      if (c.parties.rby.equipe.join(',') !== 'pikachu,charizard') {
        return `échec : équipe ${c.parties.rby.equipe.join(',')}`;
      }
      if (c.parties.sv.equipe.length) return 'échec : une équipe vide revient peuplée';
      if (c.parties.rby.note !== 'Premier run.') return 'échec : la note s’est perdue';
      return '2 jeux, 3 favoris, une équipe et une note relus à l’identique';
    });

  await verifier(
    'Un jeu retiré de l’envoi disparaît de la base',
    async () => {
      // C'EST LE SEUL GESTE QUI DEMANDE UN REMPLACEMENT. Fusionner aurait rendu
      // impossible le retrait d'un jeu : il ne s'exprime que par son absence.
      await ecrireCarte(un, { carte: { jeu: 'hgss' }, parties: {
        rby: { etat: 'fini', equipe: ['pikachu'], note: '' } } });
      const c = await lireCarte(un);
      const restants = Object.keys(c.parties);
      if (restants.length !== 1 || restants[0] !== 'rby') {
        return `échec : il reste ${restants.join(', ') || 'rien'}`;
      }
      // Et une liste vide efface tout, sans laisser la table à demi peuplée.
      await ecrireCarte(un, { carte: {}, parties: {} });
      const apres = await lireCarte(un);
      if (Object.keys(apres.parties).length) return 'échec : un envoi vide n’efface pas';
      return 'sv retiré, puis la liste entière vidée';
    });

  await verifier(
    'Ce qui dépasse les bornes est coupé, pas refusé',
    async () => {
      // UN ENVOI ABERRANT NE DOIT PAS FAIRE ÉCHOUER LE RESTE. Une version plus
      // récente de l'application, un slug abîmé, un copier-coller de trois
      // mille signes : on garde ce qui est lisible et on borne le reste, plutôt
      // que de rejeter la carte entière et de tout perdre.
      await ecrireCarte(un, {
        carte: { jeu: 'hgss', spinoff: 'S'.repeat(200), phrase: 'P'.repeat(400),
                 favoris: ['pikachu', 'eevee', 'abra', 'machop', 'MAUVAIS SLUG', 'pikachu'] },
        parties: { rby: { etat: 'inconnu', note: 'N'.repeat(900),
                          equipe: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7'] } },
      });
      const c = await lireCarte(un);
      if (c.carte.favoris.length !== 3) {
        return `échec : ${c.carte.favoris.length} favoris au lieu de 3`;
      }
      if (c.carte.favoris.indexOf('pikachu') !== c.carte.favoris.lastIndexOf('pikachu')) {
        return 'échec : un doublon a passé';
      }
      if (c.carte.spinoff.length > 60) return `échec : spin-off ${c.carte.spinoff.length}`;
      if (c.carte.phrase.length > 120) return `échec : phrase ${c.carte.phrase.length}`;
      if (c.parties.rby.etat !== 'en-cours') {
        return `échec : état inconnu gardé tel quel (${c.parties.rby.etat})`;
      }
      if (c.parties.rby.equipe.length !== 6) {
        return `échec : ${c.parties.rby.equipe.length} membres d’équipe`;
      }
      return '3 favoris sans doublon, textes bornés, état inconnu ramené à « en cours »';
    });

  await verifier(
    'Le temps de jeu et les dates : « je ne sais plus » n’est pas « zéro »',
    async () => {
      // LA DISTINCTION QUI COMPTE. Un souvenir ancien n'a souvent ni compteur
      // ni dates. Rabattre l'absence sur 0 et sur une date bidon écrirait sur
      // la fiche de quelqu'un des choses qu'il n'a pas dites.
      await ecrireCarte(un, { carte: {}, parties: {
        rby: { etat: 'fini', equipe: [], note: '', heures: 112,
               debut: '2024-03-17', fin: '2024-06-02' },
        gsc: { etat: 'fini', equipe: [], note: '' },
      } });
      const c = await lireCarte(un);
      if (c.parties.rby.heures !== 112) return `échec : heures ${c.parties.rby.heures}`;
      if (c.parties.rby.debut !== '2024-03-17') return `échec : début ${c.parties.rby.debut}`;
      if (c.parties.gsc.heures !== null) {
        return `échec : une partie sans heures rend ${JSON.stringify(c.parties.gsc.heures)} et non null`;
      }
      if (c.parties.gsc.debut !== null || c.parties.gsc.fin !== null) {
        return 'échec : des dates sortent de nulle part';
      }
      return '112 h et deux dates relues ; l’absence reste null';
    });

  await verifier(
    'Une date qui n’existe pas, ou une fin avant le début, ne passent pas',
    async () => {
      // « 2024-02-31 » a la bonne FORME et n'est aucun jour : une expression
      // régulière seule la laisse entrer. Et une fin antérieure au début est
      // presque toujours une saisie en cours — on retire la fin plutôt que de
      // rejeter la ligne, sinon l'équipe et la note partiraient avec.
      await ecrireCarte(un, { carte: {}, parties: {
        rby: { etat: 'fini', equipe: ['pikachu'], note: 'gardée',
               heures: -5, debut: '2024-02-31', fin: 'hier' },
        gsc: { etat: 'fini', equipe: [], note: '',
               debut: '2024-06-01', fin: '2024-03-01' },
      } });
      const c = await lireCarte(un);
      if (c.parties.rby.debut !== null) return `échec : 31 février accepté (${c.parties.rby.debut})`;
      if (c.parties.rby.fin !== null) return `échec : « hier » accepté (${c.parties.rby.fin})`;
      if (c.parties.rby.heures !== null) return `échec : heures négatives gardées (${c.parties.rby.heures})`;
      if (c.parties.rby.note !== 'gardée' || c.parties.rby.equipe.length !== 1) {
        return 'échec : le reste de la ligne a été perdu avec les dates';
      }
      if (c.parties.gsc.debut !== '2024-06-01') return 'échec : le début a sauté';
      if (c.parties.gsc.fin !== null) return `échec : fin avant début gardée (${c.parties.gsc.fin})`;
      // Et 9999 h reste le plafond, sans faire échouer l'envoi.
      await ecrireCarte(un, { carte: {}, parties: {
        rby: { etat: 'fini', equipe: [], note: '', heures: 999999 } } });
      const haut = await lireCarte(un);
      if (haut.parties.rby.heures !== 9999) return `échec : plafond ${haut.parties.rby.heures}`;
      return '31 février et « hier » écartés, fin avant début retirée, le reste intact';
    });

  await verifier(
    'La fiche publique porte la carte, les parties et la date d’inscription',
    async () => {
      // C'est ce que visiterDresseur() affiche : si l'un des trois manque ici,
      // la fiche se dessine sans lui et personne ne saura pourquoi.
      //
      // ON POSE CE QU'ON VERIFIE, plutot que de s'appuyer sur ce qu'une
      // verification precedente aurait laisse : l'ordre du banc changera
      // encore, et un controle qui depend du residu d'un autre tombe le jour
      // ou l'on intercale une ligne entre les deux.
      await ecrireCarte(un, {
        carte: { jeu: 'hgss', spinoff: '', favoris: ['pikachu'], phrase: '' },
        parties: { rby: { etat: 'fini', equipe: [], note: '', heures: 40 } },
      });
      const chez = await profilsPublics('BancUn');
      if (!chez) return 'échec : dresseur introuvable';
      if (!chez.dresseur.creeLe) return 'échec : pas de date d’inscription';
      if (!chez.carte) return 'échec : pas de carte';
      if (!chez.parties) return 'échec : pas de parties';
      if (chez.carte.jeu !== 'hgss') return `échec : jeu ${chez.carte.jeu}`;
      if (!chez.profils.length) return 'échec : aucune aventure publique';
      return `carte, ${Object.keys(chez.parties).length} partie(s), inscrit le ${chez.dresseur.creeLe.slice(0, 10)}`;
    });

  await verifier(
    'La carte part avec le dresseur qu’on supprime',
    async () => {
      // Par cascade sur la clé étrangère, comme le dex. Sans elle, deux tables
      // garderaient des lignes orphelines qu'aucun écran ne montrerait plus.
      // Un banc interrompu a pu le laisser : on efface avant de poser.
      await ecrire("DELETE FROM pa_dresseurs WHERE discord_id = '99100000000000009'");
      const quand = horodatage();
      const r = await ecrire(
        `INSERT INTO pa_dresseurs (discord_id, pseudo, pseudo_cle, avatar, cree_le, visible)
         VALUES ('99100000000000009', 'BancTrois', 'banctrois', NULL, ?, 1)`, [quand]);
      await ecrireCarte(r.insertId, { carte: { jeu: 'rby' },
        parties: { rby: { etat: 'fini', equipe: [], note: '' } } });
      await ecrire('DELETE FROM pa_dresseurs WHERE id = ?', [r.insertId]);
      const cartes = await une('SELECT COUNT(*) AS n FROM pa_cartes WHERE dresseur_id = ?',
        [r.insertId]);
      const parts = await une('SELECT COUNT(*) AS n FROM pa_parties WHERE dresseur_id = ?',
        [r.insertId]);
      if (cartes.n || parts.n) {
        return `échec : ${cartes.n} carte(s) et ${parts.n} partie(s) orphelines`;
      }
      return 'les deux tables suivent la suppression du compte';
    });
  console.log('\nLe partage d’un Pokédex');

  await verifier(
    'Un lien s’ouvre sur un jeu, et rend un code lisible',
    async () => {
      await ecrireDex(un, {
        version: 1, caught: [], shiny: [],
        dex: {
          frlg: { caught: ['bulbasaur', 'charmander'], shiny: ['squirtle'] },
          sv: { caught: ['sprigatito'], shiny: [] },
        },
      }, profilUn);
      const p = await creerPartage(un, profilUn, 'frlg');
      if (!p.code || p.code.length !== 8) return `échec : code « ${p.code} »`;
      if (!/^[A-Z0-9]{8}$/.test(p.code)) return `échec : alphabet inattendu (${p.code})`;
      if (/[OIL01]/.test(p.code)) return `échec : caractère ambigu dans ${p.code}`;
      const lisible = ecrireCodePartage(p.code);
      if (lisible !== `${p.code.slice(0, 4)}-${p.code.slice(4)}`) {
        return `échec : écriture « ${lisible} »`;
      }
      return `code ${lisible}, huit caractères sans O ni I ni L ni 0 ni 1`;
    });

  await verifier(
    'Le lien ne laisse sortir QUE le jeu partagé',
    async () => {
      // C'est la vérification qui compte. Le dex est un seul JSON qui porte
      // tous les jeux et les chasses ; partager son Rouge Feu ne doit rien
      // dire de son Écarlate. Une régression ici ne se verrait nulle part à
      // l'écran — elle ne se verrait que dans la réponse HTTP.
      const p = await creerPartage(un, profilUn, 'frlg');
      const vu = await lirePartage(p.code);
      if (!vu || vu.retire) return 'échec : le lien ne s’ouvre pas';
      if (vu.jeu !== 'frlg') return `échec : jeu rendu « ${vu.jeu} »`;
      if (vu.dex.caught.length !== 2) return `échec : ${vu.dex.caught.length} captures`;
      if (vu.dex.shiny.length !== 1) return `échec : ${vu.dex.shiny.length} chromatiques`;
      const brut = JSON.stringify(vu);
      if (brut.includes('sprigatito')) return 'échec : Écarlate / Violet a fui dans la réponse';
      if (brut.includes('"sv"')) return 'échec : la clé d’un autre jeu est dans la réponse';
      if (brut.includes('chasses')) return 'échec : les chasses sont parties avec';
      // L'identifiant Discord ne doit pas voyager non plus : le lien se colle
      // n'importe ou et se lit sans compte.
      if (brut.includes(vu.pseudo) === false) return 'échec : le pseudo manque';
      if (/"discordId"/.test(brut)) return 'échec : l’identifiant Discord est dans la réponse';
      return 'frlg seul : 2 captures, 1 chromatique, aucune trace de sv';
    });

  await verifier(
    'Repartager le même Pokédex rend le même code',
    async () => {
      // Sinon chaque clic sèmerait un lien de plus, et celui qu'on a déjà collé
      // dans un salon deviendrait introuvable au moment de le révoquer.
      const a = await creerPartage(un, profilUn, 'frlg');
      const b = await creerPartage(un, profilUn, 'frlg');
      if (a.code !== b.code) return `échec : ${a.code} puis ${b.code}`;
      if (b.neuf) return 'échec : le second passage se croit neuf';
      const autre = await creerPartage(un, profilUn, 'sv');
      if (autre.code === a.code) return 'échec : deux jeux, un seul code';
      return `un code par jeu — frlg ${a.code}, sv ${autre.code}`;
    });

  await verifier(
    'Le lien suit l’avancée, il ne la fige pas',
    async () => {
      const p = await creerPartage(un, profilUn, 'frlg');
      await ecrireDex(un, {
        version: 1, caught: [], shiny: [],
        dex: { frlg: { caught: ['bulbasaur', 'charmander', 'pikachu'], shiny: ['squirtle'] } },
      }, profilUn);
      const vu = await lirePartage(p.code);
      if (vu.dex.caught.length !== 3) {
        return `échec : ${vu.dex.caught.length} captures, le lien a figé`;
      }
      if (!vu.dex.caught.includes('pikachu')) return 'échec : la capture neuve manque';
      return '3 captures après ajout, sans toucher au lien';
    });

  await verifier(
    'Un lien révoqué se dit retiré, et non introuvable',
    async () => {
      // La nuance est celle qu'on doit à qui l'a reçu de bonne foi : « retiré »
      // se comprend, « introuvable » laisse croire qu'on a mal recopié.
      const p = await creerPartage(un, profilUn, 'frlg');
      await revoquerPartage(un, ecrireCodePartage(p.code));
      const vu = await lirePartage(p.code);
      if (!vu || !vu.retire) return 'échec : le lien répond encore';
      const inconnu = await lirePartage('ZZZZZZZZ');
      if (inconnu !== null) return 'échec : un code inventé ne rend pas null';
      return 'retiré ≠ inconnu, les deux se distinguent';
    });

  await verifier(
    'Rouvrir après révocation donne un code NEUF',
    async () => {
      // Révoquer doit vouloir dire quelque chose : le lien d'avant reste mort.
      const avant = await creerPartage(un, profilUn, 'frlg');
      await revoquerPartage(un, avant.code);
      const apres = await creerPartage(un, profilUn, 'frlg');
      if (apres.code === avant.code) return 'échec : le code révoqué ressuscite';
      const mort = await lirePartage(avant.code);
      if (!mort || !mort.retire) return 'échec : l’ancien code répond encore';
      return `${avant.code} reste mort, ${apres.code} prend la suite`;
    });

  await verifier(
    'On ne partage pas l’aventure d’un autre, ni ne révoque son lien',
    async () => {
      const p = await creerPartage(un, profilUn, 'frlg');
      let refusCreation = false;
      try { await creerPartage(deux, profilUn, 'frlg'); }
      catch (e) { refusCreation = true; }
      if (!refusCreation) return 'échec : BancDeux a partagé l’aventure de BancUn';
      let refusRevocation = false;
      try { await revoquerPartage(deux, p.code); }
      catch (e) { refusRevocation = true; }
      if (!refusRevocation) return 'échec : BancDeux a révoqué le lien de BancUn';
      const vu = await lirePartage(p.code);
      if (!vu || vu.retire) return 'échec : le lien a été éteint quand même';
      return 'les deux tentatives refusées, le lien intact';
    });

  await verifier(
    'Le code se retape avec des tirets, des espaces et des minuscules',
    async () => {
      // Il se recopie depuis un salon Discord, pas depuis un presse-papier
      // propre. Refuser « k7m2-qx4p » serait refuser le geste normal.
      const p = await creerPartage(un, profilUn, 'frlg');
      const formes = [
        ecrireCodePartage(p.code),
        p.code.toLowerCase(),
        ecrireCodePartage(p.code).toLowerCase(),
        ` ${p.code.slice(0, 4)} ${p.code.slice(4)} `,
      ];
      for (const f of formes) {
        const vu = await lirePartage(f);
        if (!vu || vu.retire || vu.jeu !== 'frlg') return `échec : « ${f} » refusé`;
      }
      if (await lirePartage('K7M2') !== null) return 'échec : un code trop court passe';
      return `${formes.length} écritures acceptées, un code tronqué refusé`;
    });

  await verifier(
    'La liste des liens dit lequel est éteint, et combien de vues',
    async () => {
      const liste = await partagesDe(un);
      if (!Array.isArray(liste) || !liste.length) return 'échec : aucune ligne';
      const actifs = liste.filter((x) => x.actif);
      const eteints = liste.filter((x) => !x.actif);
      if (!actifs.length) return 'échec : aucun lien actif';
      if (!eteints.length) return 'échec : les liens révoqués ont disparu de la liste';
      if (actifs.some((x) => !x.lisible.includes('-'))) return 'échec : code non mis en forme';
      if (!liste.every((x) => typeof x.vues === 'number')) return 'échec : vues manquantes';
      const vues = actifs.reduce((n, x) => n + x.vues, 0);
      return `${actifs.length} actif(s), ${eteints.length} éteint(s), ${vues} vue(s) comptée(s)`;
    });

  await verifier(
    'Le partage part avec l’aventure qu’on supprime',
    async () => {
      const nouveau = await creerProfil(un, 'Aventure jetable');
      const p = await creerPartage(un, nouveau.id, 'rby');
      if (!await lirePartage(p.code)) return 'échec : le lien n’existe pas';
      await supprimerProfil(un, nouveau.id);
      const vu = await lirePartage(p.code);
      if (vu !== null) return 'échec : le lien survit à son aventure';
      return 'aventure supprimée, lien évanoui avec elle';
    });
}

// --- Les noms refusés ---------------------------------------------------------
// Sans base : c'est de la logique pure, et elle se joue avant le décor.

async function nomsRefuses() {

  console.log('\nLes noms');

  await verifier(
    "Les injures écrites à l'oreille tombent, les prénoms réels passent",
    async () => {
      // LE SIGNALEMENT QUI L'A FAIT NAÎTRE : un joueur s'appelait
      // « sinjenkuleur ». C'est « singe en couleur » écrit comme il se
      // prononce, et le filtre ne comparait que des lettres — il n'y en a pas
      // une seule en commun sur la moitié du mot.
      //
      // LES DEUX MOITIÉS COMPTENT AUTANT. Un filtre qui refuse Cassandre,
      // Conrad ou Nikita est pire que pas de filtre : il insulte des gens qui
      // portent leur propre nom. C'est le problème dit de Scunthorpe, et la
      // liste d'innocents ci-dessous est le vrai garde-fou de ce fichier.
      const tombe = [
        'sinjenkuleur', 'singe en couleur', 'sinj en kouleur', 'Sinjenkouleur',
        'sale singe', 'sallesinje', 'chambre a gaz', 'chanbreagaz',
        'connard', 'c0nn4rd', 'xX_encule_Xx', 'xxxgamer', 'kkk',
      ];
      // « Team X » et « Sacha x Ondine » étaient refusés — mesure faite, pas
      // supposition. « xxx » se replie en « x », et l'exigence du mot entier,
      // qui protège « Dickens », ne protège rien quand la lettre EST le mot.
      const passe = [
        'Cassandre', 'Conrad', 'Constance', 'Nikita', 'Dominik', 'Analyse',
        'Culotte', 'Scunthorpe', 'Assange', 'Le Roi Singe', 'Singe Vert',
        'Colossinge', 'Ouisticram', 'Chambery', 'Cecile', 'Margaux',
        'Sacha x Ondine', 'Team X', 'Max', 'Alex', 'Dickens', 'Shitake',
      ];

      const manques = tombe.filter((n) => !motInterdit(n));
      const faux = passe.filter((n) => motInterdit(n));
      if (manques.length) {
        return `échec : passé alors qu'il devait tomber — ${manques.join(', ')}`;
      }
      if (faux.length) {
        const d = faux.map((n) => `${n} (${motInterdit(n)})`).join(', ');
        return `échec : refusé alors qu'il devait passer — ${d}`;
      }
      return `${tombe.length} refusés, ${passe.length} noms ordinaires acceptés`;
    });

  await verifier(
    "Le nom d'aventure passe par le même filtre, aux trois portes",
    async () => {
      // Création, renommage et import appellent tous nettoyerNomProfil, qui
      // interroge la liste. Le vérifier plutôt que de le croire : c'est la
      // seule chose qui empêche l'écran des amis d'afficher une injure à tout
      // le monde, et personne ne surveille la liste après coup.
      const fs = await import('node:fs/promises');
      const src = await fs.readFile(new URL('../src/comptes.js', import.meta.url), 'utf8');
      const appels = (src.match(/nettoyerNomProfil\(/g) || []).length - 1;
      if (appels < 3) {
        return `échec : ${appels} porte(s) seulement passent par le filtre`;
      }
      const declaration = src.slice(src.indexOf('function nettoyerNomProfil'));
      if (declaration.slice(0, 800).indexOf('estInterdit(') === -1) {
        return 'échec : nettoyerNomProfil n’interroge plus la liste des noms refusés';
      }
      return `${appels} portes — création, renommage, import — toutes filtrées`;
    });
}

// --- Entrée ------------------------------------------------------------------

console.log(`\nBanc de l'API — ${description()}`);
// Les noms d'abord : ils ne demandent pas la base, et un échec là-dessus se
// lit mieux en tête de rapport qu'entre deux requêtes SQL.
await nomsRefuses();

await creerSchema(() => {});

// On efface d'abord : un banc interrompu a pu laisser ses figurants.
await retirer();
let ids;
try {
  ids = await poser();
  await tout(ids);
} finally {
  // MÊME EN CAS D'ÉCHEC. Un banc qui laisse ses dresseurs derrière lui pollue
  // le classement de tout le monde, et le suivant démarre sur un décor sale.
  await retirer();
}

const total = reussites + echecs.length;
console.log(echecs.length
  ? `\n${echecs.length} échec(s) sur ${total}\n`
  : `\n${total} vérifications, aucun échec\n`);
process.exit(echecs.length ? 1 : 0);
