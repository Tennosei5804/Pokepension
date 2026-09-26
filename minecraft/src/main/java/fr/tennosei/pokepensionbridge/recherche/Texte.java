package fr.tennosei.pokepensionbridge.recherche;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Ce qu'on compare quand on compare deux noms.
 *
 * <p>« Flabebe » doit trouver « Flabébé », « dracaufeu » « Dracaufeu »,
 * « M. Mime » « M.Mime », « Zone01 » « Zone 1 ». On ramène donc chaque nom à
 * une forme pliée : minuscules, sans accents, la ponctuation remplacée par des
 * espaces, et les zéros de tête des nombres retirés. Le nom réel, lui, n'est
 * jamais modifié : c'est lui qu'on affiche.
 */
public final class Texte {

    private static final Pattern MARQUES = Pattern.compile("\\p{M}+");
    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");
    /** « zone 01 » → « zone 1 », « 007 » → « 7 », mais « 10 » reste « 10 ». */
    private static final Pattern ZEROS_DE_TETE = Pattern.compile("(?<![0-9])0+(?=[0-9])");

    /**
     * Les mots qui ne distinguent rien : « Rattata d'Alola » et « Rattata
     * (Alola) » sont le même Pokémon. Ils ne comptent pas quand on compare des
     * ensembles de mots — ils restent dans la forme compacte.
     */
    private static final Set<String> MOTS_VIDES = new HashSet<String>(Arrays.asList(
            "d", "de", "du", "des", "l", "la", "le", "les", "of", "the"));

    private Texte() {
    }

    /** « Méga-Dracaufeu (X) » → « mega dracaufeu x ». */
    public static String plier(String s) {
        if (s == null || s.isEmpty()) {
            return "";
        }
        String t = s.toLowerCase(Locale.ROOT)
                .replace("œ", "oe").replace("æ", "ae").replace("ß", "ss");
        t = Normalizer.normalize(t, Normalizer.Form.NFD);
        t = MARQUES.matcher(t).replaceAll("");
        t = NON_ALNUM.matcher(t).replaceAll(" ").trim();
        return ZEROS_DE_TETE.matcher(t).replaceAll("");
    }

    /** « Zone 01 » → « zone1 » : la forme qu'on compare lettre à lettre. */
    public static String compact(String s) {
        return plier(s).replace(" ", "");
    }

    /** Les mots qui distinguent, dans l'ordre. */
    public static List<String> mots(String s) {
        String p = plier(s);
        if (p.isEmpty()) {
            return Collections.emptyList();
        }
        List<String> out = new ArrayList<String>();
        for (String m : p.split(" ")) {
            if (!m.isEmpty() && !MOTS_VIDES.contains(m)) {
                out.add(m);
            }
        }
        return out;
    }

    /**
     * La distance d'édition, transpositions comprises (« Dracofeu » est à deux
     * pas de « Dracaufeu »). Sert à proposer, jamais à ouvrir.
     */
    public static int distance(String a, String b) {
        int n = a.length();
        int m = b.length();
        int[][] d = new int[n + 1][m + 1];
        for (int i = 0; i <= n; i++) {
            d[i][0] = i;
        }
        for (int j = 0; j <= m; j++) {
            d[0][j] = j;
        }
        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= m; j++) {
                int cout = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                int v = Math.min(Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + cout);
                if (i > 1 && j > 1 && a.charAt(i - 1) == b.charAt(j - 2) && a.charAt(i - 2) == b.charAt(j - 1)) {
                    v = Math.min(v, d[i - 2][j - 2] + 1);
                }
                d[i][j] = v;
            }
        }
        return d[n][m];
    }
}
