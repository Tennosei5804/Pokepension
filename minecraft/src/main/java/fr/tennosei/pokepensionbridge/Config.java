package fr.tennosei.pokepensionbridge;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.Properties;

/**
 * Trois réglages, et aucun n'est à toucher.
 *
 * <p>Le fichier `config/pokepensionbridge.properties` s'écrit tout seul au
 * premier lancement, avec les valeurs par défaut — pour qu'on sache qu'il
 * existe, pas pour qu'on le remplisse. Ni port, ni chemin, ni adresse : le mod
 * les trouve seul (voir {@code Decouverte}).
 */
public final class Config {

    public final boolean debug;
    /** Combien attendre une réponse de PokéPension déjà ouverte. */
    public final int delaiReseauMs;
    /** Combien de temps le catalogue reste frais en mémoire. */
    public final int dureeCacheMinutes;

    private Config(boolean debug, int delaiReseauMs, int dureeCacheMinutes) {
        this.debug = debug;
        this.delaiReseauMs = delaiReseauMs;
        this.dureeCacheMinutes = dureeCacheMinutes;
    }

    private static int entier(Properties p, String cle, int defaut, int min, int max) {
        try {
            int v = Integer.parseInt(p.getProperty(cle, String.valueOf(defaut)).trim());
            return Math.max(min, Math.min(max, v));
        } catch (NumberFormatException e) {
            return defaut;
        }
    }

    public static Config charger(File fichier) {
        Properties p = new Properties();
        if (fichier.isFile()) {
            try (Reader r = new InputStreamReader(new FileInputStream(fichier), StandardCharsets.UTF_8)) {
                p.load(r);
            } catch (IOException e) {
                // Illisible : les valeurs par défaut valent mieux qu'un mod muet.
            }
        }
        Config c = new Config(
                Boolean.parseBoolean(p.getProperty("debug", "false").trim()),
                entier(p, "delaiReseauMs", 4000, 500, 60000),
                entier(p, "dureeCacheMinutes", 10, 1, 1440));
        if (!fichier.isFile()) {
            ecrire(fichier, c);
        }
        return c;
    }

    private static void ecrire(File fichier, Config c) {
        File dossier = fichier.getParentFile();
        if (dossier != null && !dossier.isDirectory() && !dossier.mkdirs()) {
            return;
        }
        try (Writer w = new OutputStreamWriter(new FileOutputStream(fichier), StandardCharsets.UTF_8)) {
            w.write("# PokéPension Bridge — réglages facultatifs.\n"
                    + "# Les valeurs par défaut conviennent : rien n'est à remplir ici.\n"
                    + "# Le port et le chemin de PokéPension se trouvent tout seuls.\n\n"
                    + "# Raconte chaque commande dans logs/latest.log.\n"
                    + "debug=" + c.debug + "\n\n"
                    + "# Attente d'une réponse de PokéPension déjà ouverte, en millisecondes.\n"
                    + "delaiReseauMs=" + c.delaiReseauMs + "\n\n"
                    + "# Durée de vie des noms gardés pour l'autocomplétion, en minutes.\n"
                    + "dureeCacheMinutes=" + c.dureeCacheMinutes + "\n");
        } catch (IOException e) {
            // Pas de fichier : les valeurs par défaut s'appliquent quand même.
        }
    }
}
