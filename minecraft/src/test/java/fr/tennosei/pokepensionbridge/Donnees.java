package fr.tennosei.pokepensionbridge;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import fr.tennosei.pokepensionbridge.donnees.Catalogue;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * Le catalogue réel, tel que l'application le rend : tiré par
 * outils/catalogue-banc.js de la vraie interface et du vrai relevé.
 */
public final class Donnees {

    private static JsonObject brut;
    private static Catalogue catalogue;

    private Donnees() {
    }

    public static synchronized JsonObject brut() {
        if (brut == null) {
            InputStream in = Donnees.class.getResourceAsStream("/catalogue-banc.json");
            if (in == null) {
                throw new IllegalStateException("catalogue-banc.json absent des ressources d'essai");
            }
            brut = new JsonParser().parse(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
        }
        return brut;
    }

    public static synchronized Catalogue catalogue() {
        if (catalogue == null) {
            catalogue = Catalogue.lire(brut());
        }
        return catalogue;
    }
}
