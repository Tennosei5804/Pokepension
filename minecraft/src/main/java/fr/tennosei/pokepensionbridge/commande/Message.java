package fr.tennosei.pokepensionbridge.commande;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Une ligne du chat, écrite par le mod — jamais envoyée au serveur.
 *
 * <p>Elle ne connaît pas Minecraft : c'est une suite de morceaux (texte,
 * couleur, clic éventuel), rendue en JSON de composant texte au dernier
 * moment. Les essais la lisent telle quelle.
 */
public final class Message {

    public static final String PREFIXE = "[PokéPension] ";

    public static final class Morceau {
        public final String texte;
        public final String couleur;
        public final Demande clic;
        public final String survol;

        Morceau(String texte, String couleur, Demande clic, String survol) {
            this.texte = texte;
            this.couleur = couleur;
            this.clic = clic;
            this.survol = survol;
        }
    }

    private final List<Morceau> morceaux = new ArrayList<Morceau>();

    /** Une ligne qui commence par « [PokéPension] ». */
    public static Message pp() {
        return new Message().ajouter(PREFIXE, "gold");
    }

    private Message ajouter(String texte, String couleur) {
        morceaux.add(new Morceau(texte, couleur, null, null));
        return this;
    }

    public Message texte(String t) {
        return ajouter(t, "gray");
    }

    /** Ce qu'on a tapé, ou ce qu'on nomme : mis en valeur. */
    public Message valeur(String t) {
        return ajouter(t, "white");
    }

    public Message lien(String libelle, Demande d) {
        morceaux.add(new Morceau(libelle, "aqua", d, "Ouvrir « " + libelle + " » dans PokéPension"));
        return this;
    }

    public List<Morceau> morceaux() {
        return Collections.unmodifiableList(morceaux);
    }

    /** Le texte seul, sans couleurs ni liens. */
    public String brut() {
        StringBuilder b = new StringBuilder();
        for (Morceau m : morceaux) {
            b.append(m.texte);
        }
        return b.toString();
    }

    /**
     * Le composant texte de Minecraft 1.16, en JSON. Chaque lien reçoit un
     * jeton neuf de {@link Liens} : c'est lui que le clic renverra.
     */
    public String json(Liens liens) {
        JsonObject racine = new JsonObject();
        racine.addProperty("text", "");
        JsonArray suite = new JsonArray();
        for (Morceau m : morceaux) {
            JsonObject o = new JsonObject();
            o.addProperty("text", m.texte);
            o.addProperty("color", m.couleur);
            if (m.clic != null) {
                JsonObject clic = new JsonObject();
                clic.addProperty("action", "run_command");
                clic.addProperty("value", liens.enregistrer(m.clic));
                o.add("clickEvent", clic);
                o.addProperty("underlined", true);
            }
            if (m.survol != null) {
                JsonObject survol = new JsonObject();
                survol.addProperty("action", "show_text");
                survol.addProperty("contents", m.survol);
                o.add("hoverEvent", survol);
            }
            suite.add(o);
        }
        racine.add("extra", suite);
        return racine.toString();
    }
}
