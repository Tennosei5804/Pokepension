package fr.tennosei.pokepensionbridge.donnees;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import fr.tennosei.pokepensionbridge.recherche.Chercheur;
import fr.tennosei.pokepensionbridge.recherche.Chercheur.Nom;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Ce que PokéPension sait, tel qu'elle le rend au mod.
 *
 * <p>RIEN N'EST ÉCRIT ICI À LA MAIN. Pokémon, zones, raretés, types et
 * générations arrivent de l'application (voir js/minecraft.js, mcCatalogue) :
 * le mod n'en embarque aucune liste, et ne peut donc pas se désaccorder
 * d'elle. Ce catalogue ne sert qu'à compléter et à reconnaître ce qu'on tape.
 */
public final class Catalogue {

    /** Un Pokémon de la réserve de l'application, formes comprises. */
    public static final class Pokemon implements Chercheur.Candidat {
        public final String nom;
        public final String cle;
        public final boolean surServeur;
        private final List<Nom> noms;
        private final int ordre;

        Pokemon(String nom, String cle, boolean surServeur, List<String> alias, int ordre) {
            this.nom = nom;
            this.cle = cle;
            this.surServeur = surServeur;
            this.ordre = ordre;
            List<Nom> n = new ArrayList<Nom>();
            n.add(new Nom(nom));
            for (String a : alias) {
                n.add(new Nom(a));
            }
            this.noms = Collections.unmodifiableList(n);
        }

        @Override
        public List<Nom> noms() {
            return noms;
        }

        @Override
        public boolean prioritaire() {
            return surServeur;
        }

        @Override
        public boolean variante() {
            return nom.indexOf('(') >= 0;
        }

        @Override
        public int ordre() {
            return ordre;
        }
    }

    /**
     * Un lieu du Pokédex du serveur : une zone, ou une sous-zone. Les deux se
     * filtrent pareil (une clé dans « lieux »), et une zone couvre ses
     * sous-zones.
     */
    public static final class Lieu implements Chercheur.Candidat {
        /** « Zone 1 », ou « Zone 1 Eau » pour une sous-zone. */
        public final String nom;
        public final String cle;
        public final boolean horsCarte;
        /** Null pour une zone ; la zone parente pour une sous-zone. */
        public final Lieu zone;
        /** Le nom seul d'une sous-zone : « Eau ». */
        public final String nomCourt;
        public final List<Lieu> sous = new ArrayList<Lieu>();
        private final List<Nom> noms;
        private final int ordre;

        Lieu(String nom, String cle, boolean horsCarte, Lieu zone, String nomCourt, int ordre) {
            this.nom = nom;
            this.cle = cle;
            this.horsCarte = horsCarte;
            this.zone = zone;
            this.nomCourt = nomCourt;
            this.ordre = ordre;
            // La clé aussi : « zone-1-eau » se tape et se colle.
            List<Nom> n = new ArrayList<Nom>();
            n.add(new Nom(nom));
            n.add(new Nom(cle));
            this.noms = Collections.unmodifiableList(n);
        }

        @Override
        public List<Nom> noms() {
            return noms;
        }

        @Override
        public boolean prioritaire() {
            return !horsCarte;
        }

        @Override
        public boolean variante() {
            return zone != null;
        }

        @Override
        public int ordre() {
            return ordre;
        }
    }

    /** Une valeur de filtre : une rareté, un type, une génération, une sous-zone. */
    public static final class Valeur implements Chercheur.Candidat {
        /** Ce qu'on affiche et ce qu'on propose : « Peu commun », « Électrik », « 3 ». */
        public final String libelle;
        /** Ce que l'application reçoit. */
        public final String code;
        private final List<Nom> noms;
        private final int ordre;

        public Valeur(String libelle, String code, int ordre, String... alias) {
            this.libelle = libelle;
            this.code = code;
            this.ordre = ordre;
            List<Nom> n = new ArrayList<Nom>();
            n.add(new Nom(libelle));
            for (String a : alias) {
                if (a != null && !a.isEmpty()) {
                    n.add(new Nom(a));
                }
            }
            this.noms = Collections.unmodifiableList(n);
        }

        @Override
        public List<Nom> noms() {
            return noms;
        }

        @Override
        public boolean prioritaire() {
            return true;
        }

        @Override
        public boolean variante() {
            return false;
        }

        @Override
        public int ordre() {
            return ordre;
        }
    }

    public final boolean connecte;
    public final boolean pixelmonworld;
    /** Pourquoi le Pokédex du serveur manque : « sans-compte », « refuse », « hors-ligne » — ou « ok ». */
    public final String etatPixelmonworld;
    public final List<Pokemon> pokemon;
    /** Zones puis, derrière chacune, ses sous-zones : l'ordre de la carte. */
    public final List<Lieu> lieux;
    public final List<Valeur> raretes;
    public final List<Valeur> types;
    public final List<Valeur> generations;

    private Catalogue(boolean connecte, boolean pixelmonworld, String etatPixelmonworld, List<Pokemon> pokemon,
                      List<Lieu> lieux, List<Valeur> raretes, List<Valeur> types, List<Valeur> generations) {
        this.connecte = connecte;
        this.pixelmonworld = pixelmonworld;
        this.etatPixelmonworld = etatPixelmonworld;
        this.pokemon = Collections.unmodifiableList(pokemon);
        this.lieux = Collections.unmodifiableList(lieux);
        this.raretes = Collections.unmodifiableList(raretes);
        this.types = Collections.unmodifiableList(types);
        this.generations = Collections.unmodifiableList(generations);
    }

    /** Les zones seules, sans leurs sous-zones. */
    public List<Lieu> zones() {
        List<Lieu> out = new ArrayList<Lieu>();
        for (Lieu l : lieux) {
            if (l.zone == null) {
                out.add(l);
            }
        }
        return out;
    }

    private static String texte(JsonObject o, String cle) {
        JsonElement e = o.get(cle);
        return e != null && e.isJsonPrimitive() ? e.getAsString() : "";
    }

    private static boolean vrai(JsonObject o, String cle) {
        JsonElement e = o.get(cle);
        return e != null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isBoolean() && e.getAsBoolean();
    }

    private static JsonArray liste(JsonObject o, String cle) {
        JsonElement e = o.get(cle);
        return e != null && e.isJsonArray() ? e.getAsJsonArray() : new JsonArray();
    }

    /**
     * Lit la réponse de `/minecraft/catalogue`. Une entrée mal formée est
     * ignorée plutôt que de faire échouer tout le catalogue.
     */
    public static Catalogue lire(JsonObject o) {
        List<Pokemon> pokemon = new ArrayList<Pokemon>();
        int i = 0;
        for (JsonElement e : liste(o, "pokemon")) {
            if (!e.isJsonArray()) {
                continue;
            }
            JsonArray a = e.getAsJsonArray();
            if (a.size() < 2 || !a.get(0).isJsonPrimitive() || !a.get(1).isJsonPrimitive()) {
                continue;
            }
            boolean serveur = a.size() > 2 && a.get(2).isJsonPrimitive() && a.get(2).getAsInt() == 1;
            List<String> alias = new ArrayList<String>();
            for (int k = 3; k < a.size(); k++) {
                if (a.get(k).isJsonPrimitive()) {
                    alias.add(a.get(k).getAsString());
                }
            }
            pokemon.add(new Pokemon(a.get(0).getAsString(), a.get(1).getAsString(), serveur, alias, i++));
        }

        List<Lieu> lieux = new ArrayList<Lieu>();
        int ordre = 0;
        for (JsonElement e : liste(o, "zones")) {
            if (!e.isJsonObject()) {
                continue;
            }
            JsonObject z = e.getAsJsonObject();
            String cle = texte(z, "cle");
            if (cle.isEmpty()) {
                continue;
            }
            Lieu zone = new Lieu(texte(z, "nom"), cle, vrai(z, "horsCarte"), null, "", ordre++);
            lieux.add(zone);
            for (JsonElement se : liste(z, "sous")) {
                if (!se.isJsonObject()) {
                    continue;
                }
                JsonObject s = se.getAsJsonObject();
                String sc = texte(s, "cle");
                String sn = texte(s, "nom");
                if (sc.isEmpty()) {
                    continue;
                }
                Lieu sous = new Lieu(zone.nom + " " + sn, sc, zone.horsCarte, zone, sn, ordre++);
                zone.sous.add(sous);
                lieux.add(sous);
            }
        }

        List<Valeur> raretes = new ArrayList<Valeur>();
        int r = 0;
        for (JsonElement e : liste(o, "raretes")) {
            if (!e.isJsonObject()) {
                continue;
            }
            JsonObject v = e.getAsJsonObject();
            String slug = texte(v, "slug");
            if (slug.isEmpty()) {
                continue;
            }
            // « 3 » vaut trois étoiles : c'est ainsi que la page les affiche.
            JsonElement et = v.get("etoiles");
            String etoiles = et != null && et.isJsonPrimitive() && et.getAsInt() > 0 ? et.getAsString() : "";
            raretes.add(new Valeur(texte(v, "libelle"), slug, r++, texte(v, "cle"), slug, etoiles));
        }

        List<Valeur> types = new ArrayList<Valeur>();
        int t = 0;
        for (JsonElement e : liste(o, "types")) {
            if (e.isJsonPrimitive()) {
                String nom = e.getAsString();
                // Les deux écritures que l'application reconnaît déjà (TYPES_PAR_NOM).
                String alias = "Électrik".equals(nom) ? "Électrique" : "Ténèbres".equals(nom) ? "Ténèbre" : "";
                types.add(new Valeur(nom, nom, t++, alias));
            }
        }

        List<Valeur> generations = new ArrayList<Valeur>();
        int g = 0;
        for (JsonElement e : liste(o, "generations")) {
            if (e.isJsonPrimitive() && e.getAsJsonPrimitive().isNumber()) {
                int n = e.getAsInt();
                generations.add(new Valeur(String.valueOf(n), String.valueOf(n), g++,
                        "gen" + n, "g" + n, romain(n)));
            }
        }

        String etat = texte(o, "etatPixelmonworld");
        if (etat.isEmpty()) {
            etat = vrai(o, "pixelmonworld") ? "ok" : vrai(o, "connecte") ? "refuse" : "sans-compte";
        }
        return new Catalogue(vrai(o, "connecte"), vrai(o, "pixelmonworld"), etat,
                pokemon, lieux, raretes, types, generations);
    }

    private static final String[] ROMAINS = {"", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX",
        "X", "XI", "XII"};

    private static String romain(int n) {
        return n > 0 && n < ROMAINS.length ? ROMAINS[n] : "";
    }

    /** Le catalogue d'un PokéPension qui n'a encore rien dit. */
    public static Catalogue vide() {
        return lire(new JsonObject());
    }
}
