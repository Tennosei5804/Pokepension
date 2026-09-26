package fr.tennosei.pokepensionbridge.pont;

import fr.tennosei.pokepensionbridge.recherche.Texte;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Lancer PokéPension quand elle est fermée.
 *
 * <p>CE QUI EST LANCÉ, ET SEULEMENT ÇA : l'exécutable que PokéPension a
 * elle-même écrit dans son fichier de découverte, s'il existe et s'appelle
 * bien PokéPension. Pas d'interpréteur de commandes, pas d'argument, rien qui
 * vienne du chat ou du serveur : le texte tapé en jeu ne devient jamais une
 * commande du système. Le serveur Minecraft, lui, ne peut rien déclencher du
 * tout — `/ps` est lu et consommé avant de partir.
 */
public final class Lanceur {

    private Lanceur() {
    }

    private static boolean windows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }

    /** Un fichier qu'on accepte de lancer : absolu, présent, et nommé PokéPension. */
    static boolean acceptable(File f) {
        if (f == null || !f.isAbsolute() || !f.isFile()) {
            return false;
        }
        String nom = Texte.compact(f.getName());
        if (!nom.contains("pokepension") || nom.contains("uninstall")) {
            return false;
        }
        return !windows() || f.getName().toLowerCase(Locale.ROOT).endsWith(".exe");
    }

    /**
     * L'exécutable : celui du fichier de découverte d'abord ; à défaut, le
     * dossier où l'installeur de PokéPension le pose (NSIS, « pour l'utilisateur
     * courant » : %LOCALAPPDATA%\PokéPension).
     */
    public static File chercher(Decouverte d) {
        if (d != null && !d.exe.isEmpty()) {
            File f = new File(d.exe);
            if (acceptable(f)) {
                return f;
            }
        }
        if (!windows()) {
            return null;
        }
        List<File> dossiers = new ArrayList<File>();
        String local = System.getenv("LOCALAPPDATA");
        if (local != null && !local.isEmpty()) {
            for (File racine : new File[] {new File(local), new File(local, "Programs")}) {
                File[] enfants = racine.listFiles();
                if (enfants == null) {
                    continue;
                }
                for (File e : enfants) {
                    if (e.isDirectory() && Texte.compact(e.getName()).equals("pokepension")) {
                        dossiers.add(e);
                    }
                }
            }
        }
        for (File dossier : dossiers) {
            File[] fichiers = dossier.listFiles();
            if (fichiers == null) {
                continue;
            }
            for (File f : fichiers) {
                if (acceptable(f)) {
                    return f;
                }
            }
        }
        return null;
    }

    /**
     * Lance l'exécutable, détaché : ses sorties partent au néant. Laissées en
     * tuyau sans personne pour les lire, elles finiraient par bloquer
     * l'application au premier message un peu long.
     */
    public static void lancer(File exe) throws IOException {
        if (!acceptable(exe)) {
            throw new IOException("exécutable refusé : " + exe);
        }
        File neant = new File(windows() ? "NUL" : "/dev/null");
        new ProcessBuilder(exe.getAbsolutePath())
                .directory(exe.getParentFile())
                .redirectInput(ProcessBuilder.Redirect.from(neant))
                .redirectOutput(ProcessBuilder.Redirect.to(neant))
                .redirectError(ProcessBuilder.Redirect.to(neant))
                .start();
    }
}
