// Les photos : montrer son Pokémon, et pas seulement le nommer.
//
// CE QU'ELLES SONT. Une capture d'écran de la rencontre, attachée à une chasse.
// Le tableau de chasse alignait des chiffres — 2311 rencontres, 1/1365 — ce qui
// dit l'effort mais pas le moment. La photo dit le moment.
//
// ELLES SONT FAITES POUR ÊTRE VUES. C'est tout leur objet, et cela commande la
// règle d'accès : une photo suit la visibilité de l'AVENTURE à laquelle elle
// appartient, exactement comme le dex. Aventure publique, photo visible de qui
// peut déjà voir cette aventure ; aventure privée, photo privée. Aucune seconde
// règle à comprendre, aucun réglage de plus, et rien qui puisse se désaccorder
// de la première.
//
// SUR LE DISQUE, PAS EN BASE. Le fichier vit dans un dossier, la base n'en garde
// que la fiche. Un BLOB de deux mégaoctets par chasse ferait grossir chaque
// sauvegarde SQL de la même quantité — et la base d'un hébergement gratuit est
// bien plus étroite que son disque. Le revers est assumé et écrit plus bas :
// `outils/sauvegarder.js` ne les emporte pas.
//
// LE RÉENCODAGE EST FAIT PAR L'APPLICATION, pas ici. Elle redessine la photo
// dans un canvas avant de l'envoyer : redimensionnée, réencodée en JPEG, et
// donc débarrassée de ses métadonnées au passage. Le serveur ne refait pas ce
// travail — il n'a pas de bibliothèque d'images et n'en veut pas — mais il ne
// FAIT PAS CONFIANCE pour autant : il revérifie le type par les octets, relit
// les dimensions dans l'en-tête, et retire lui-même les segments EXIF. Une
// photo de téléphone porte sa position GPS ; envoyée telle quelle par un client
// modifié, elle serait publiée avec.

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lire, une, ecrire } from './base.js';
import { ErreurCompte, horodatage, normaliser } from './comptes.js';

// Le dossier des fichiers. Hors du dépôt, et créé au besoin.
//
// LE CHEMIN SE DÉDUIT DE CE FICHIER-CI, jamais du répertoire courant. Un service
// n'est pas lancé depuis le dossier où il vit : dans un conteneur, `process.cwd()`
// vaut le dossier personnel, et la première photo est partie dans
// `~/donnees/images` au lieu de `~/PokeArchive/api/donnees/images`.
//
// Le contournement évident — poser IMAGES_DOSSIER dans api/.env — ne servait à
// rien : le service ne lit pas ce fichier. `npm start` passe
// `--env-file-if-exists=.env`, un chemin RELATIF, donc cherché depuis ce même
// répertoire courant où il n'y a rien. Les identifiants MySQL, eux, viennent du
// panneau de l'hébergeur.
//
// import.meta.url, lui, ne dépend de personne : il dit où ce module se trouve
// sur le disque, et `../../donnees/images` en découle toujours au même endroit.
// La variable d'environnement reste acceptée, pour qui veut ranger les photos
// sur un autre volume — mais plus rien ne l'exige.
const ICI = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER = process.env.IMAGES_DOSSIER
  || path.join(ICI, '..', 'donnees', 'images');

// Ce qu'on accepte, et rien d'autre. Le SVG est exclu volontairement : c'est du
// balisage exécutable, pas une image, et le servir depuis notre domaine
// reviendrait à héberger le script de quelqu'un d'autre.
const TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Trois mégaoctets par photo. L'application en envoie dix fois moins après
// redimensionnement ; cette borne est là pour ce qui ne passe pas par elle.
export const OCTETS_MAX = 3 * 1024 * 1024;

// Le quota par dresseur. Généreux pour un joueur — c'est une photo par chasse
// aboutie, et personne n'en termine soixante — et assez bas pour qu'un compte
// ne puisse pas remplir le disque à lui seul.
const IMAGES_MAX = 60;
const OCTETS_TOTAL_MAX = 40 * 1024 * 1024;

// À quoi une photo peut être attachée. La colonne existait dès le premier jour
// pour cela, et le défi du jour s'y est greffé sans migration : même dépôt, même
// règle de visibilité, même quota.
//
// « MESSAGE » EST LE SEUL QUI SORTE DE CETTE RÈGLE, et il fallait le dire ici
// plutôt que de le découvrir plus bas. Une photo de chasse appartient à une
// aventure et suit sa visibilité ; une image envoyée dans une conversation
// n'appartient à aucune histoire — c'est la CONVERSATION qui dit qui la voit.
// Deux conséquences, écrites là où elles s'appliquent : `servir` lui demande un
// message plutôt qu'une aventure publique, et `menage` ne la balaie pas, car
// aucune chasse ne la réclamera jamais.
const SUJETS = ['chasse', 'defi', 'message'];

// --- Lire les octets ---------------------------------------------------------

/**
 * Le vrai type, lu dans les octets.
 *
 * L'en-tête Content-Type est déclaratif : il dit ce que l'envoyeur prétend.
 * Ces signatures-là, elles, sont dans le fichier.
 */
function typeReel(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/**
 * Les dimensions, lues dans l'en-tête.
 *
 * Sans bibliothèque : chaque format les écrit à un endroit connu. Elles servent
 * à refuser une image absurde — une bombe de décompression de 30000 × 30000
 * pixels pèse peu sur le disque et met à genoux le navigateur qui l'affiche.
 */
function dimensions(buf, mime) {
  try {
    if (mime === 'image/png') {
      return { largeur: buf.readUInt32BE(16), hauteur: buf.readUInt32BE(20) };
    }
    if (mime === 'image/webp') {
      // VP8X porte la taille sur 24 bits, moins un. Les autres variantes de
      // WebP ne sont pas lues ici : on rend zéro, et le contrôle passe.
      if (buf.toString('ascii', 12, 16) === 'VP8X') {
        return {
          largeur: (buf.readUIntLE(24, 3) & 0xffffff) + 1,
          hauteur: (buf.readUIntLE(27, 3) & 0xffffff) + 1,
        };
      }
      return { largeur: 0, hauteur: 0 };
    }
    // JPEG : on avance de marqueur en marqueur jusqu'au cadre (SOF).
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marqueur = buf[i + 1];
      // SOF0 à SOF15, sauf DHT (c4), JPGA (c8) et DAC (cc), qui n'en sont pas.
      if (marqueur >= 0xc0 && marqueur <= 0xcf
          && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc) {
        return { hauteur: buf.readUInt16BE(i + 5), largeur: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  } catch { /* en-tête illisible : on rend zéro, le contrôle laisse passer */ }
  return { largeur: 0, hauteur: 0 };
}

const PIXELS_MAX = 40_000_000;   // de quoi loger du 6000 × 6000

/**
 * Retire les métadonnées d'un JPEG.
 *
 * On recopie le fichier segment par segment en SAUTANT les blocs applicatifs
 * APP1 à APP15 : EXIF, XMP, profils divers. C'est là que vivent la position
 * GPS, le modèle de l'appareil et l'heure exacte — trois choses qu'on ne
 * publie pas parce qu'on a voulu montrer un chromatique.
 *
 * APP0 est conservé : c'est l'en-tête JFIF, qui décrit l'image elle-même.
 *
 * Le PNG a son propre nettoyage, juste en dessous : il porte lui aussi de quoi
 * en dire trop — `eXIf` depuis 2017, et les blocs de texte `tEXt`, `iTXt`,
 * `zTXt` où certains logiciels écrivent le nom de la machine ou du fichier
 * d'origine. Le WebP passe tel quel : l'application n'en produit pas.
 */
function sansMetadonnees(buf, mime) {
  if (mime === 'image/png') return pngSansMetadonnees(buf);
  if (mime !== 'image/jpeg') return buf;
  const morceaux = [buf.subarray(0, 2)];       // SOI
  let i = 2;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) break;
    const marqueur = buf[i + 1];
    // Début du balayage : tout ce qui suit est l'image compressée.
    if (marqueur === 0xda) { morceaux.push(buf.subarray(i)); return Buffer.concat(morceaux); }
    const taille = buf.readUInt16BE(i + 2);
    if (taille < 2 || i + 2 + taille > buf.length) break;
    const applicatif = marqueur >= 0xe1 && marqueur <= 0xef;
    if (!applicatif) morceaux.push(buf.subarray(i, i + 2 + taille));
    i += 2 + taille;
  }
  // En-tête inattendu : on rend l'original plutôt qu'un fichier tronqué.
  return Buffer.concat(morceaux).length > 4 && i >= buf.length ? Buffer.concat(morceaux) : buf;
}

/**
 * Retire les blocs facultatifs d'un PNG.
 *
 * UN PNG EST UNE SUITE DE BLOCS, chacun précédé de sa longueur et de son nom.
 * On recopie ceux dont l'image a besoin pour s'afficher et l'on saute tout le
 * reste — ce qui écarte `eXIf`, `tEXt`, `iTXt`, `zTXt` sans avoir à les
 * énumérer, et couvrira du même coup ceux qui n'existent pas encore.
 *
 * La liste blanche est courte parce qu'elle peut l'être : IHDR décrit l'image,
 * PLTE sa palette, tRNS sa transparence, IDAT ses pixels, IEND la fin. Une
 * image rendue sans les autres est identique à l'œil.
 */
const PNG_BLOCS_GARDES = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

function pngSansMetadonnees(buf) {
  // La signature, huit octets, puis les blocs.
  if (buf.length < 8) return buf;
  const morceaux = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= buf.length) {
    const taille = buf.readUInt32BE(i);
    const nom = buf.toString('ascii', i + 4, i + 8);
    const entier = 12 + taille;                  // longueur + nom + données + CRC
    if (taille > buf.length || i + entier > buf.length) return buf;   // fichier tronqué
    if (PNG_BLOCS_GARDES.has(nom)) morceaux.push(buf.subarray(i, i + entier));
    i += entier;
    if (nom === 'IEND') break;
  }
  const propre = Buffer.concat(morceaux);
  // Un PNG sans pixels n'en est plus un : au moindre doute, on rend l'original
  // plutôt qu'un fichier que personne ne saura ouvrir.
  return propre.length > 8 ? propre : buf;
}

// --- Le quota ----------------------------------------------------------------

async function verifierQuota(dresseurId, ajout) {
  const r = await une(
    'SELECT COUNT(*) AS n, COALESCE(SUM(octets), 0) AS total FROM pa_images WHERE dresseur_id = ?',
    [dresseurId]);
  if (Number(r.n) >= IMAGES_MAX) {
    throw new ErreurCompte(
      `Soixante photos, c’est le maximum. Retires-en une avant d’en ajouter.`, 400);
  }
  if (Number(r.total) + ajout > OCTETS_TOTAL_MAX) {
    throw new ErreurCompte('Tes photos occupent déjà quarante mégaoctets.', 400);
  }
}

// --- Déposer -----------------------------------------------------------------

export async function deposer(dresseurId, profilId, sujet, octets) {
  if (!SUJETS.includes(sujet)) throw new ErreurCompte('Sujet inconnu.', 400);
  if (!octets || !octets.length) throw new ErreurCompte('Image vide.', 400);
  if (octets.length > OCTETS_MAX) throw new ErreurCompte('Image trop lourde.', 413);

  // L'aventure doit être la sienne. Sans ce contrôle, on attacherait une photo
  // à l'aventure de quelqu'un d'autre et elle s'afficherait chez lui.
  const p = await une('SELECT id FROM pa_profils WHERE id = ? AND dresseur_id = ?',
    [Number(profilId) || 0, dresseurId]);
  if (!p) throw new ErreurCompte('Aventure introuvable.', 404);

  const mime = typeReel(octets);
  if (!mime) throw new ErreurCompte('Ce fichier n’est pas une image reconnue.', 400);

  const { largeur, hauteur } = dimensions(octets, mime);
  if (largeur * hauteur > PIXELS_MAX) {
    throw new ErreurCompte('Image trop grande en pixels.', 400);
  }

  const propre = sansMetadonnees(octets, mime);
  await verifierQuota(dresseurId, propre.length);

  // Le nom du fichier ne vient JAMAIS de l'envoyeur : c'est un condensé du
  // contenu, plus la date. Un nom choisi par le client est une traversée de
  // dossier qui attend son heure.
  const nom = createHash('sha256').update(propre).digest('hex').slice(0, 32)
    + '-' + Date.now().toString(36) + TYPES[mime];

  await fs.mkdir(DOSSIER, { recursive: true });
  await fs.writeFile(path.join(DOSSIER, nom), propre);

  const r = await ecrire(
    `INSERT INTO pa_images
       (dresseur_id, profil_id, sujet, fichier, mime, octets, largeur, hauteur, cree_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [dresseurId, p.id, sujet, nom, mime, propre.length, largeur, hauteur, horodatage()]);

  return { id: r.insertId, octets: propre.length, largeur, hauteur };
}

// --- Servir ------------------------------------------------------------------

/**
 * Une photo, et le droit de la voir.
 *
 * `lecteurId` est celui qui demande. La règle tient en une ligne : c'est la
 * sienne, ou l'aventure est publique. Rien d'autre — voir l'en-tête du fichier.
 */
export async function servir(lecteurId, id) {
  const l = await une(
    `SELECT i.fichier, i.mime, i.octets, i.dresseur_id, i.sujet, p.public
       FROM pa_images i JOIN pa_profils p ON p.id = i.profil_id
      WHERE i.id = ?`, [Number(id) || 0]);
  if (!l) throw new ErreurCompte('Photo introuvable.', 404);

  // L'IMAGE D'UN MESSAGE SE LIT DANS SA CONVERSATION, pas dans une aventure.
  // La rattacher à la visibilité d'un profil aurait deux défauts symétriques :
  // privée, personne ne verrait ce qu'on vient tout juste d'envoyer ; publique,
  // n'importe qui pourrait lire une image adressée à une seule personne.
  if (l.sujet === 'message' && l.dresseur_id !== lecteurId) {
    const vu = await une(
      `SELECT 1 AS oui FROM pa_messages m
         LEFT JOIN pa_echanges e ON e.id = m.echange_id
        WHERE m.image_id = ?
          AND (m.destinataire_id = ? OR m.auteur_id = ?
            OR e.demandeur_id = ? OR e.receveur_id = ?)
        LIMIT 1`,
      [Number(id) || 0, lecteurId, lecteurId, lecteurId, lecteurId]);
    if (!vu) throw new ErreurCompte('Photo introuvable.', 404);
    return lireFichier(l);
  }

  if (l.sujet !== 'message' && l.dresseur_id !== lecteurId && l.public !== 1) {
    // 404 et non 403 : dire « elle existe mais pas pour toi » renseignerait sur
    // le contenu d'une aventure privée, ce que personne n'a à savoir.
    throw new ErreurCompte('Photo introuvable.', 404);
  }
  return lireFichier(l);
}

async function lireFichier(l) {
  try {
    return { octets: await fs.readFile(path.join(DOSSIER, l.fichier)), mime: l.mime };
  } catch {
    // La fiche existe, le fichier non. Voir la note sur les sauvegardes en tête
    // de ce fichier : c'est le cas qu'une restauration produit.
    throw new ErreurCompte('Photo introuvable.', 404);
  }
}

export async function retirer(dresseurId, id) {
  const l = await une('SELECT id, fichier FROM pa_images WHERE id = ? AND dresseur_id = ?',
    [Number(id) || 0, dresseurId]);
  if (!l) throw new ErreurCompte('Photo introuvable.', 404);
  await ecrire('DELETE FROM pa_images WHERE id = ?', [l.id]);
  await effacerFichier(l.fichier);
  return { id: l.id };
}

async function effacerFichier(nom) {
  // Le fichier peut déjà être parti ; la fiche, elle, ne doit pas rester.
  try { await fs.unlink(path.join(DOSSIER, nom)); } catch { /* déjà absent */ }
}

// --- Le ménage ---------------------------------------------------------------

/**
 * Efface les photos qu'aucune chasse ne réclame plus.
 *
 * APPELÉ APRÈS CHAQUE ENREGISTREMENT DU DEX, parce que c'est le seul moment où
 * l'on apprend qu'une chasse a disparu. Les chasses vivent DANS la sauvegarde,
 * pas dans une table : supprimer une chasse n'est pas une requête que le
 * serveur voit passer, c'est un tableau qui revient plus court. Sans ce
 * rattrapage, chaque chasse effacée laisserait son fichier pour toujours.
 *
 * PRUDENCE VOULUE : si la sauvegarde ne parle pas de chasses du tout, on ne
 * touche à rien. Un import partiel ou un client plus ancien ne doit pas
 * emporter les photos au passage — l'absence d'une clé n'est pas la preuve
 * qu'elle est vide.
 */
const PORTEURS = ['chasses', 'chassesFinies', 'defis'];

// CE QU'ON A CHOISI PUIS ABANDONNÉ. Une image déposée pour un message part
// avant que le message existe : entre les deux, elle n'est réclamée par rien.
// Si l'on ferme la fenêtre sans envoyer, elle resterait pour toujours, comptée
// au quota de quelqu'un qui ne l'a jamais envoyée. Une heure laisse tout le
// temps d'écrire, et ne balaie que ce qui n'a servi à rien.
const ABANDON_MS = 60 * 60 * 1000;

export async function menage(profilId, donnees) {
  if (!donnees || !PORTEURS.some((c) => c in donnees)) return 0;

  const gardees = new Set();
  for (const champ of PORTEURS) {
    for (const c of donnees[champ] || []) {
      if (c && Number.isInteger(c.image)) gardees.add(c.image);
    }
  }

  // TOUS LES SUJETS, et non le seul 'chasse'. Le défi du jour porte lui aussi
  // une photo, et la balayer à part reviendrait à tenir deux ménages d'accord.
  //
  // SAUF CELLES DES MESSAGES, et c'est la seule exception. Aucune chasse ne les
  // réclame — c'est un message qui les porte, et les messages ne sont pas dans
  // la sauvegarde. Sans cette clause, envoyer une image dans une conversation
  // puis cocher une capture l'aurait effacée : la photo disparaissait du fil
  // quelques secondes après y être apparue.
  const toutes = await lire(
    `SELECT id, fichier FROM pa_images
      WHERE profil_id = ? AND (sujet <> 'message' OR (
              NOT EXISTS (SELECT 1 FROM pa_messages m WHERE m.image_id = pa_images.id)
              AND cree_le < ?))`,
    [profilId, horodatage(new Date(Date.now() - ABANDON_MS))]);
  const orphelines = toutes.filter((i) => !gardees.has(i.id));
  if (!orphelines.length) return 0;

  await ecrire(
    `DELETE FROM pa_images WHERE id IN (${orphelines.map(() => '?').join(',')})`,
    orphelines.map((i) => i.id));
  for (const i of orphelines) await effacerFichier(i.fichier);
  return orphelines.length;
}


/**
 * Toutes les photos d'un dresseur, celles qu'on a le droit de voir.
 *
 * POURQUOI CETTE ROUTE EXISTE. Les photos étaient déposées, servies, protégées
 * — et invisibles. La règle d'accès autorisait un ami à les voir, mais aucun
 * écran ne les montrait : le mécanisme existait, la vitrine non. C'est elle.
 *
 * ON RELIT LES SAUVEGARDES, et pas seulement `pa_images`. La table sait quelles
 * photos existent ; elle ignore À QUOI elles sont attachées, car le lien vit
 * dans le blob, du côté de la chasse ou du défi qui porte le champ `image`.
 * Sans cette relecture on rendrait une planche de vignettes anonymes.
 *
 * Chez soi, tout ; chez les autres, les aventures publiques. Même règle que
 * partout ailleurs.
 */
export async function mur(lecteurId, pseudo) {
  const d = await une('SELECT id, pseudo FROM pa_dresseurs WHERE pseudo_cle = ?',
    [normaliser(pseudo)]);
  if (!d) throw new ErreurCompte('Ce dresseur n’existe pas.', 404);

  const chezMoi = d.id === lecteurId;
  const profils = await lire(
    `SELECT p.id, p.nom, x.donnees
       FROM pa_profils p LEFT JOIN pa_dex x ON x.profil_id = p.id
      WHERE p.dresseur_id = ?${chezMoi ? '' : ' AND p.public = 1'}
      ORDER BY p.par_defaut DESC, p.id`, [d.id]);

  // Les photos réellement présentes : une sauvegarde peut citer une photo
  // effacée depuis, et afficher une vignette morte serait pire que rien.
  const vivantes = new Set((await lire(
    'SELECT id FROM pa_images WHERE dresseur_id = ?', [d.id])).map((i) => i.id));

  const photos = [];
  for (const p of profils) {
    let sauvegarde = null;
    try { sauvegarde = p.donnees ? JSON.parse(p.donnees) : null; } catch { continue; }
    if (!sauvegarde) continue;

    for (const c of sauvegarde.chassesFinies || []) {
      if (!vivantes.has(c && c.image)) continue;
      photos.push({ id: c.image, pokemon: c.pokemon, genre: 'chasse',
        quand: c.fin || null, compteur: c.compteur || 0, aventure: p.nom });
    }
    for (const c of sauvegarde.defis || []) {
      if (!vivantes.has(c && c.image)) continue;
      photos.push({ id: c.image, pokemon: c.pokemon, genre: 'defi',
        quand: c.jour || null, compteur: 0, aventure: p.nom });
    }
  }

  // La plus récente d'abord. Une photo sans date passe en dernier plutôt que
  // de s'intercaler au hasard.
  photos.sort((a, b) => String(b.quand || '').localeCompare(String(a.quand || '')));
  return { pseudo: d.pseudo, photos: photos.slice(0, 120) };
}

/** Ce que le dresseur occupe, pour le lui dire dans ses Paramètres. */
export async function place(dresseurId) {
  const r = await une(
    'SELECT COUNT(*) AS n, COALESCE(SUM(octets), 0) AS total FROM pa_images WHERE dresseur_id = ?',
    [dresseurId]);
  return {
    combien: Number(r.n) || 0,
    octets: Number(r.total) || 0,
    combienMax: IMAGES_MAX,
    octetsMax: OCTETS_TOTAL_MAX,
  };
}

export const typesAcceptes = Object.keys(TYPES);
export const dossier = () => DOSSIER;
