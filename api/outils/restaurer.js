// Restauration d'une sauvegarde.
//
//   node outils/restaurer.js sauvegardes/pokepension-2026-08-24T21-00-00.json
//   node outils/restaurer.js <fichier> --vraiment
//
// Sans « --vraiment », le script ne fait que dire ce qu'il ferait. C'est le
// réglage par défaut délibérément : on ne restaure pas une base par accident,
// et la commande se tape souvent dans l'urgence, quand on réfléchit mal.
//
// La restauration REMPLACE : elle vide les tables avant de réinsérer. C'est ce
// qu'on veut d'une restauration — sinon on obtient un mélange des deux états,
// qui n'est ni l'ancien ni le nouveau.

import fs from 'node:fs/promises';
import { base, lire, ecrire, description } from '../src/base.js';

// L'ordre d'insertion : les dresseurs d'abord, ce qui les référence ensuite.
// Pour le vidage, l'inverse — on ne supprime pas une ligne dont une autre dépend.
const TABLES = ['pa_dresseurs', 'pa_profils', 'pa_dex', 'pa_historique', 'pa_amis'];

async function main() {
  const fichier = process.argv[2];
  const vraiment = process.argv.includes('--vraiment');

  if (!fichier) {
    console.error('Usage : node outils/restaurer.js <fichier.json> [--vraiment]');
    process.exit(1);
  }

  const contenu = JSON.parse(await fs.readFile(fichier, 'utf8'));
  console.log(`Sauvegarde du ${contenu.faiteLe}, prise sur ${contenu.base}`);
  console.log(`Base visée      ${description()}`);
  console.log('');

  for (const table of TABLES) {
    const aVenir = (contenu.tables[table] || []).length;
    const [{ n }] = await lire(`SELECT COUNT(*) AS n FROM ${table}`);
    console.log(`  ${table.padEnd(16)} ${String(n).padStart(6)} → ${String(aVenir).padStart(6)}`);
  }

  if (!vraiment) {
    console.log('\nRien n\'a été touché. Ajoute --vraiment pour restaurer pour de bon.');
    return;
  }

  console.log('\nRestauration…');
  const co = await base().getConnection();
  try {
    // Une transaction, parce qu'une restauration à moitié faite est pire que
    // pas de restauration du tout : on ne saurait plus dans quel état on est.
    await co.beginTransaction();
    await co.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const table of [...TABLES].reverse()) {
      await co.query(`DELETE FROM ${table}`);
    }

    for (const table of TABLES) {
      const lignes = contenu.tables[table] || [];
      if (!lignes.length) continue;

      // Les noms de colonnes viennent du FICHIER, et se retrouvent interpolés
      // dans la requête — les paramètres de MySQL ne portent que des valeurs,
      // jamais des identifiants. C'est le seul endroit de tout le service où un
      // identifiant SQL n'est pas écrit en dur, et il faut donc le vérifier
      // contre quelque chose d'autre que lui-même.
      //
      // On demande à la base quelles colonnes elle a, et on n'accepte que
      // celles-là. Une liste écrite ici vieillirait à chaque migration ; le
      // schéma, lui, est toujours à jour par construction.
      //
      // Le contrôle attrape deux choses d'un coup : un fichier trafiqué, et un
      // fichier honnête mais périmé — sauvegardé avant une colonne ajoutée
      // depuis, ou après une colonne retirée. Le second cas est de loin le plus
      // probable, et il échouait jusqu'ici avec un message de MySQL.
      const [colonnesDeLaBase] = await co.query(
        `SELECT column_name AS c FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name = ?`, [table]);
      const connues = new Set(colonnesDeLaBase.map((r) => r.c));

      const colonnes = Object.keys(lignes[0]);
      const inconnues = colonnes.filter((c) => !connues.has(c));
      if (inconnues.length) {
        throw new Error(
          `${table} : colonne(s) inconnue(s) dans la sauvegarde — ${inconnues.join(', ')}. `
          + `La base connaît : ${[...connues].join(', ')}.`);
      }

      const valeurs = lignes.map((l) => colonnes.map((c) => l[c]));
      await co.query(
        `INSERT INTO ${table} (${colonnes.map((c) => `\`${c}\``).join(',')}) VALUES ?`,
        [valeurs],
      );
      console.log(`  ${table.padEnd(16)} ${lignes.length} ligne(s)`);
    }

    await co.query('SET FOREIGN_KEY_CHECKS = 1');
    await co.commit();
    console.log('\nRestauré.');
  } catch (e) {
    await co.rollback();
    throw e;
  } finally {
    co.release();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`Échec : ${e.message}`);
    console.error('Rien n\'a été modifié — la transaction a été annulée.');
    process.exit(1);
  });
