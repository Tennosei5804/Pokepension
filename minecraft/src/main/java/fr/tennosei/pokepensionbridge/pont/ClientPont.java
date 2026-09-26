package fr.tennosei.pokepensionbridge.pont;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Les appels HTTP vers le pont de PokéPension, sur la boucle locale.
 *
 * <p>JAVA 8 ET RIEN D'AUTRE : {@link HttpURLConnection}, sans bibliothèque.
 * Jamais de proxy — un proxy système configuré pour le navigateur n'a rien à
 * faire entre deux programmes de la même machine.
 *
 * <p>BLOQUANT, ET C'EST VOULU : ces appels ne tournent que sur le fil du pont
 * (voir {@link Acces}), jamais sur celui du jeu.
 */
public final class ClientPont {

    /** Un corps de réponse plus gros n'a rien de normal : le catalogue fait ~80 Ko. */
    private static final int REPONSE_MAX = 4 * 1024 * 1024;

    /** Ce que le pont a répondu. */
    public static final class Reponse {
        public final int statut;
        public final JsonObject corps;

        Reponse(int statut, JsonObject corps) {
            this.statut = statut;
            this.corps = corps;
        }

        public boolean ok() {
            return statut == 200;
        }

        public String erreur() {
            JsonElement e = corps.get("erreur");
            return e != null && e.isJsonPrimitive() ? e.getAsString() : "";
        }
    }

    private final int delaiConnexionMs;
    private final int delaiLectureMs;

    public ClientPont(int delaiConnexionMs, int delaiLectureMs) {
        this.delaiConnexionMs = delaiConnexionMs;
        this.delaiLectureMs = delaiLectureMs;
    }

    public Reponse get(Decouverte d, String chemin, int delaiLectureMs) throws IOException {
        return appeler(d, "GET", chemin, null, delaiLectureMs);
    }

    public Reponse post(Decouverte d, String chemin, JsonObject corps, int delaiLectureMs) throws IOException {
        return appeler(d, "POST", chemin, corps, delaiLectureMs);
    }

    public int delaiLecture() {
        return delaiLectureMs;
    }

    private Reponse appeler(Decouverte d, String methode, String chemin, JsonObject corps, int lecture)
            throws IOException {
        URL url = new URL("http", "127.0.0.1", d.port, chemin);
        HttpURLConnection c = (HttpURLConnection) url.openConnection(Proxy.NO_PROXY);
        try {
            c.setRequestMethod(methode);
            c.setConnectTimeout(delaiConnexionMs);
            c.setReadTimeout(lecture > 0 ? lecture : delaiLectureMs);
            c.setUseCaches(false);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("X-PokePension-Jeton", d.jeton);
            c.setRequestProperty("Accept", "application/json");
            if (corps != null) {
                byte[] octets = corps.toString().getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                c.setFixedLengthStreamingMode(octets.length);
                OutputStream sortie = c.getOutputStream();
                try {
                    sortie.write(octets);
                } finally {
                    sortie.close();
                }
            }
            int statut = c.getResponseCode();
            InputStream entree = statut >= 400 ? c.getErrorStream() : c.getInputStream();
            String texte = entree == null ? "" : lire(entree);
            JsonObject o = new JsonObject();
            if (!texte.isEmpty()) {
                try {
                    JsonElement e = new JsonParser().parse(texte);
                    if (e.isJsonObject()) {
                        o = e.getAsJsonObject();
                    }
                } catch (RuntimeException ex) {
                    // Pas du JSON : ce n'est pas le pont qui répond. Le statut suffit.
                }
            }
            return new Reponse(statut, o);
        } finally {
            c.disconnect();
        }
    }

    private static String lire(InputStream entree) throws IOException {
        try {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] tampon = new byte[8192];
            int n;
            while ((n = entree.read(tampon)) > 0) {
                b.write(tampon, 0, n);
                if (b.size() > REPONSE_MAX) {
                    throw new IOException("réponse trop longue");
                }
            }
            return new String(b.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            entree.close();
        }
    }
}
