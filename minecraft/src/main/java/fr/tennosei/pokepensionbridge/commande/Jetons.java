package fr.tennosei.pokepensionbridge.commande;

import java.util.ArrayList;
import java.util.List;

/**
 * La ligne tapée, découpée en mots qui savent où ils sont.
 *
 * <p>LA POSITION COMPTE autant que le mot : l'autocomplétion remplace un
 * morceau précis de la ligne, et un nom de Pokémon se reprend tel qu'il a été
 * tapé, espaces compris (« Méga Dracaufeu X »).
 *
 * <p>Les espaces et les virgules séparent ; des guillemets gardent ensemble ce
 * qu'ils entourent (« "Forêt de Jade" »), pour le cas où un nom contiendrait
 * un mot-clé.
 */
public final class Jetons {

    public static final class Jeton {
        public final String texte;
        /** Position du premier caractère dans la ligne (guillemet ouvrant compris). */
        public final int debut;
        /** Position juste après le dernier caractère. */
        public final int fin;
        public final boolean cite;

        Jeton(String texte, int debut, int fin, boolean cite) {
            this.texte = texte;
            this.debut = debut;
            this.fin = fin;
            this.cite = cite;
        }

        @Override
        public String toString() {
            return texte;
        }
    }

    private Jetons() {
    }

    private static boolean separe(char c) {
        return Character.isWhitespace(c) || c == ',';
    }

    public static List<Jeton> decouper(String s) {
        List<Jeton> out = new ArrayList<Jeton>();
        int i = 0;
        int n = s.length();
        while (i < n) {
            char c = s.charAt(i);
            if (separe(c)) {
                i++;
                continue;
            }
            if (c == '"') {
                int fin = s.indexOf('"', i + 1);
                int bout = fin < 0 ? n : fin;
                out.add(new Jeton(s.substring(i + 1, bout), i, fin < 0 ? n : fin + 1, true));
                i = fin < 0 ? n : fin + 1;
                continue;
            }
            int debut = i;
            while (i < n && !separe(s.charAt(i))) {
                i++;
            }
            out.add(new Jeton(s.substring(debut, i), debut, i, false));
        }
        return out;
    }

    /** La ligne se termine-t-elle par un séparateur, hors guillemets ouverts ? */
    public static boolean finiParSeparateur(String s) {
        if (s.isEmpty()) {
            return true;
        }
        int guillemets = 0;
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) == '"') {
                guillemets++;
            }
        }
        return guillemets % 2 == 0 && separe(s.charAt(s.length() - 1));
    }

    /** Les textes de jetons[de..a[, rejoints par une espace. */
    public static String joindre(List<Jeton> jetons, int de, int a) {
        StringBuilder b = new StringBuilder();
        for (int i = de; i < a; i++) {
            if (b.length() > 0) {
                b.append(' ');
            }
            b.append(jetons.get(i).texte);
        }
        return b.toString();
    }
}
