package fr.tennosei.pokepensionbridge.pont;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Locale;

/**
 * Où trouver PokéPension : le fichier qu'elle écrit à chaque lancement.
 *
 * <p>AUCUN PORT N'EST CHOISI ICI. L'application prend le premier port libre de
 * sa plage et l'écrit, avec un jeton tiré au sort et le chemin de son
 * exécutable, dans son dossier de configuration — à côté de `session.json` :
 * {@code %APPDATA%\fr.tennosei.pokearchive\pont-minecraft.json} sous Windows.
 * Le mod le relit à chaque besoin : un port qui change d'un lancement à
 * l'autre ne demande rien à personne.
 */
public final class Decouverte {

    /** L'identifiant de l'application (tauri.conf.json), qui nomme son dossier. */
    public static final String IDENTIFIANT = "fr.tennosei.pokearchive";
    public static final String FICHIER = "pont-minecraft.json";
    /** Le protocole que ce mod parle. Voir minecraft.rs, PROTOCOLE. */
    public static final int PROTOCOLE = 1;

    public final int protocole;
    public final int port;
    public final String jeton;
    public final String exe;

    private Decouverte(int protocole, int port, String jeton, String exe) {
        this.protocole = protocole;
        this.port = port;
        this.jeton = jeton;
        this.exe = exe;
    }

    /**
     * Le chemin du fichier : le dossier de configuration du système, puis
     * l'identifiant — le même calcul que Tauri. La propriété système
     * {@code pokepension.decouverte} le remplace (pour les essais).
     */
    public static File chemin() {
        String force = System.getProperty("pokepension.decouverte");
        if (force != null && !force.isEmpty()) {
            return new File(force);
        }
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String maison = System.getProperty("user.home", "");
        File base;
        if (os.contains("win")) {
            String appdata = System.getenv("APPDATA");
            base = appdata != null && !appdata.isEmpty()
                    ? new File(appdata) : new File(maison, "AppData" + File.separator + "Roaming");
        } else if (os.contains("mac")) {
            base = new File(maison, "Library/Application Support");
        } else {
            String xdg = System.getenv("XDG_CONFIG_HOME");
            base = xdg != null && xdg.startsWith("/") ? new File(xdg) : new File(maison, ".config");
        }
        return new File(new File(base, IDENTIFIANT), FICHIER);
    }

    /** Le fichier, lu et vérifié ; null s'il manque ou ne se lit pas. */
    public static Decouverte lire() {
        File f = chemin();
        if (!f.isFile() || f.length() > 64 * 1024) {
            return null;
        }
        try {
            String texte = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
            return depuis(new JsonParser().parse(texte));
        } catch (Exception e) {
            return null;
        }
    }

    static Decouverte depuis(JsonElement e) {
        if (e == null || !e.isJsonObject()) {
            return null;
        }
        JsonObject o = e.getAsJsonObject();
        try {
            int protocole = o.has("protocole") ? o.get("protocole").getAsInt() : 0;
            int port = o.has("port") ? o.get("port").getAsInt() : 0;
            String jeton = o.has("jeton") ? o.get("jeton").getAsString() : "";
            String exe = o.has("exe") ? o.get("exe").getAsString() : "";
            if (port < 1024 || port > 65535 || jeton.isEmpty()) {
                return null;
            }
            return new Decouverte(protocole, port, jeton, exe);
        } catch (RuntimeException ex) {
            return null;
        }
    }
}
