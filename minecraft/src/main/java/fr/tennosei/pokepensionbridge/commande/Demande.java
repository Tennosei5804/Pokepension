package fr.tennosei.pokepensionbridge.commande;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Ce qu'on demande à PokéPension d'ouvrir, en clés qu'elle connaît.
 *
 * <p>Trois cibles, et pas une de plus — c'est aussi tout ce que le pont
 * accepte (voir minecraft.rs, valider_ouverture) : l'accueil, une fiche, le
 * Pokédex du serveur sur un état de filtres.
 */
public final class Demande {

    public final String cible;
    public final String cle;
    public final List<String> lieux;
    public final List<String> raretes;
    public final List<String> types;
    public final List<Integer> generations;
    /** Ce qu'on dit dans le chat en attendant la réponse : « Dracaufeu ». */
    public final String libelle;

    private Demande(String cible, String cle, List<String> lieux, List<String> raretes, List<String> types,
                    List<Integer> generations, String libelle) {
        this.cible = cible;
        this.cle = cle;
        this.lieux = Collections.unmodifiableList(new ArrayList<String>(lieux));
        this.raretes = Collections.unmodifiableList(new ArrayList<String>(raretes));
        this.types = Collections.unmodifiableList(new ArrayList<String>(types));
        this.generations = Collections.unmodifiableList(new ArrayList<Integer>(generations));
        this.libelle = libelle;
    }

    public static Demande accueil() {
        List<String> r = Collections.emptyList();
        return new Demande("accueil", "", r, r, r, Collections.<Integer>emptyList(), "PokéPension");
    }

    public static Demande pokemon(String cle, String nom) {
        List<String> r = Collections.emptyList();
        return new Demande("pokemon", cle, r, r, r, Collections.<Integer>emptyList(), nom);
    }

    public static Demande filtres(List<String> lieux, List<String> raretes, List<String> types,
                                  List<Integer> generations, String libelle) {
        return new Demande("filtres", "", lieux, raretes, types, generations, libelle);
    }

    private static JsonArray tableau(List<?> valeurs) {
        JsonArray a = new JsonArray();
        for (Object v : valeurs) {
            if (v instanceof Integer) {
                a.add((Integer) v);
            } else {
                a.add(String.valueOf(v));
            }
        }
        return a;
    }

    public JsonObject json() {
        JsonObject o = new JsonObject();
        o.addProperty("cible", cible);
        if ("pokemon".equals(cible)) {
            o.addProperty("cle", cle);
        } else if ("filtres".equals(cible)) {
            o.add("lieux", tableau(lieux));
            o.add("raretes", tableau(raretes));
            o.add("types", tableau(types));
            o.add("generations", tableau(generations));
        }
        return o;
    }

    @Override
    public String toString() {
        return json().toString();
    }
}
