package fr.tennosei.pokepensionbridge.recherche;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * Trouver un Pokémon ou une zone à partir de ce qu'on a tapé.
 *
 * <p>UNE SEULE RÈGLE POUR SUGGÉRER ET POUR OUVRIR. Ce que la liste de Tab
 * propose et ce que la commande ouvre sortent du même classement : ce qu'on
 * voit en premier est ce qui s'ouvre.
 *
 * <p>Cinq niveaux, du plus sûr au plus lâche :
 * <ol>
 * <li>EXACT — « dracaufeu » pour « Dracaufeu », « flabebe » pour « Flabébé » ;</li>
 * <li>ENSEMBLE — les mêmes mots dans un autre ordre : « Méga Dracaufeu X »
 *     pour « Dracaufeu (Méga X) » ;</li>
 * <li>DÉBUT — le nom commence par ce qu'on a tapé : « dracau » ;</li>
 * <li>MOTS — chaque mot tapé commence un mot du nom : « rat alo » ;</li>
 * <li>DEDANS — le nom contient ce qu'on a tapé.</li>
 * </ol>
 */
public final class Chercheur {

    public enum Niveau { EXACT, ENSEMBLE, DEBUT, MOTS, DEDANS }

    /** Un nom, sous les formes qu'on compare. */
    public static final class Nom {
        public final String brut;
        public final String compact;
        public final List<String> mots;

        public Nom(String brut) {
            this.brut = brut == null ? "" : brut;
            this.compact = Texte.compact(this.brut);
            this.mots = Texte.mots(this.brut);
        }
    }

    /** Ce qu'on peut chercher : un Pokémon, un lieu, une valeur de filtre. */
    public interface Candidat {
        /** Le premier est celui qu'on affiche ; les suivants sont des alias. */
        List<Nom> noms();

        /** Présent sur le serveur (un Pokémon), vrai lieu de la carte (une zone). */
        boolean prioritaire();

        /** Une forme (Méga, Gigamax, régionale…) ou une sous-zone : après la base. */
        boolean variante();

        /** L'ordre du catalogue : le Pokédex national, l'ordre de la carte. */
        int ordre();
    }

    /** Un candidat retenu, et à quel point il correspond. */
    public static final class Trouve<T extends Candidat> {
        public final T candidat;
        public final Niveau niveau;
        /** Combien de mots le nom a de plus que la recherche. */
        public final int motsEnPlus;
        /** Trouvé par un alias (le nom anglais), et non par le nom affiché. */
        public final boolean parAlias;

        Trouve(T candidat, Niveau niveau, int motsEnPlus, boolean parAlias) {
            this.candidat = candidat;
            this.niveau = niveau;
            this.motsEnPlus = motsEnPlus;
            this.parAlias = parAlias;
        }
    }

    /** Ce qu'une commande peut faire d'une recherche. */
    public static final class Choix<T extends Candidat> {
        /** Le seul qui convienne, ou null. */
        public final T unique;
        /** Les candidats, dans l'ordre, quand il n'y en a pas un seul. */
        public final List<T> possibles;

        Choix(T unique, List<T> possibles) {
            this.unique = unique;
            this.possibles = possibles;
        }

        public boolean aucun() {
            return unique == null && possibles.isEmpty();
        }
    }

    private Chercheur() {
    }

    /** Le niveau de correspondance d'un nom, ou null s'il ne correspond pas. */
    public static Niveau niveau(Nom q, Nom n) {
        if (q.compact.isEmpty() || n.compact.isEmpty()) {
            return null;
        }
        if (n.compact.equals(q.compact)) {
            return Niveau.EXACT;
        }
        if (!q.mots.isEmpty() && memesMots(q.mots, n.mots)) {
            return Niveau.ENSEMBLE;
        }
        if (n.compact.startsWith(q.compact)) {
            return Niveau.DEBUT;
        }
        if (!q.mots.isEmpty() && motsPrefixes(q.mots, n.mots)) {
            return Niveau.MOTS;
        }
        if (n.compact.contains(q.compact)) {
            return Niveau.DEDANS;
        }
        return null;
    }

    private static boolean memesMots(List<String> a, List<String> b) {
        if (a.size() != b.size()) {
            return false;
        }
        List<String> x = new ArrayList<String>(a);
        List<String> y = new ArrayList<String>(b);
        Collections.sort(x);
        Collections.sort(y);
        return x.equals(y);
    }

    /** Chaque mot tapé commence un mot DIFFÉRENT du nom. Les plus longs d'abord. */
    private static boolean motsPrefixes(List<String> requete, List<String> nom) {
        if (requete.size() > nom.size()) {
            return false;
        }
        List<String> q = new ArrayList<String>(requete);
        Collections.sort(q, new Comparator<String>() {
            @Override
            public int compare(String a, String b) {
                return b.length() - a.length();
            }
        });
        boolean[] pris = new boolean[nom.size()];
        for (String m : q) {
            boolean trouve = false;
            for (int i = 0; i < nom.size(); i++) {
                if (!pris[i] && nom.get(i).startsWith(m)) {
                    pris[i] = true;
                    trouve = true;
                    break;
                }
            }
            if (!trouve) {
                return false;
            }
        }
        return true;
    }

    /** Tous les candidats qui correspondent, les meilleurs d'abord. */
    public static <T extends Candidat> List<Trouve<T>> chercher(Collection<T> tous, String requete) {
        Nom q = new Nom(requete);
        List<Trouve<T>> out = new ArrayList<Trouve<T>>();
        if (q.compact.isEmpty()) {
            return out;
        }
        for (T c : tous) {
            Niveau meilleur = null;
            int enPlus = Integer.MAX_VALUE;
            boolean alias = false;
            List<Nom> noms = c.noms();
            for (int i = 0; i < noms.size(); i++) {
                Nom n = noms.get(i);
                Niveau v = niveau(q, n);
                if (v == null) {
                    continue;
                }
                int plus = Math.max(0, n.mots.size() - q.mots.size());
                if (meilleur == null || v.ordinal() < meilleur.ordinal()
                        || (v == meilleur && plus < enPlus)) {
                    meilleur = v;
                    enPlus = plus;
                    alias = i > 0;
                }
            }
            if (meilleur != null) {
                out.add(new Trouve<T>(c, meilleur, enPlus, alias));
            }
        }
        Collections.sort(out, new Comparator<Trouve<T>>() {
            @Override
            public int compare(Trouve<T> a, Trouve<T> b) {
                if (a.niveau != b.niveau) {
                    return a.niveau.ordinal() - b.niveau.ordinal();
                }
                // Le nom qu'on lit avant l'alias : « drac » propose Dracaufeu
                // avant Galvagon, qui ne commence par « drac » qu'en anglais.
                if (a.parAlias != b.parAlias) {
                    return a.parAlias ? 1 : -1;
                }
                if (a.candidat.prioritaire() != b.candidat.prioritaire()) {
                    return a.candidat.prioritaire() ? -1 : 1;
                }
                if (a.candidat.variante() != b.candidat.variante()) {
                    return a.candidat.variante() ? 1 : -1;
                }
                if (a.motsEnPlus != b.motsEnPlus) {
                    return a.motsEnPlus - b.motsEnPlus;
                }
                return a.candidat.ordre() - b.candidat.ordre();
            }
        });
        return out;
    }

    /**
     * Ce qu'une commande ouvre.
     *
     * <p>UN SEUL, OU LA LISTE. On n'ouvre jamais « le premier » d'une liste :
     * « drac » propose Dracaufeu, Draco et Dracolosse plutôt que d'en choisir
     * un. Seules exceptions, qui ne sont pas des paris : le nom exact, et un
     * début de nom qu'un seul candidat complète avec le moins de mots en plus
     * — « dracau » ouvre Dracaufeu, pas Dracaufeu (Méga X).
     */
    public static <T extends Candidat> Choix<T> choisir(List<Trouve<T>> trouves) {
        List<T> tous = new ArrayList<T>();
        for (Trouve<T> t : trouves) {
            tous.add(t.candidat);
        }
        if (trouves.isEmpty()) {
            return new Choix<T>(null, tous);
        }
        if (trouves.size() == 1) {
            return new Choix<T>(trouves.get(0).candidat, tous);
        }
        Niveau meilleur = trouves.get(0).niveau;
        List<Trouve<T>> tete = new ArrayList<Trouve<T>>();
        for (Trouve<T> t : trouves) {
            if (t.niveau == meilleur) {
                tete.add(t);
            }
        }
        if (tete.size() == 1 && meilleur != Niveau.DEDANS) {
            return new Choix<T>(tete.get(0).candidat, tous);
        }
        if (meilleur == Niveau.EXACT || meilleur == Niveau.ENSEMBLE) {
            // Deux fois le même nom : celui du serveur, s'il est seul à l'être.
            T seul = null;
            int n = 0;
            for (Trouve<T> t : tete) {
                if (t.candidat.prioritaire()) {
                    seul = t.candidat;
                    n++;
                }
            }
            if (n == 1) {
                return new Choix<T>(seul, tous);
            }
        } else if (meilleur != Niveau.DEDANS) {
            // Celui qui a le moins de mots en plus, s'il est seul dans ce cas :
            // « dracau » → Dracaufeu et non Dracaufeu (Méga X) ; « zone 7 » →
            // Zone 7 et non Zone 7 Eau.
            int moins = Integer.MAX_VALUE;
            for (Trouve<T> t : tete) {
                moins = Math.min(moins, t.motsEnPlus);
            }
            T seul = null;
            int n = 0;
            for (Trouve<T> t : tete) {
                if (t.motsEnPlus == moins) {
                    seul = t.candidat;
                    n++;
                }
            }
            if (n == 1) {
                return new Choix<T>(seul, tous);
            }
        }
        return new Choix<T>(null, tous);
    }

    /**
     * Les noms proches d'une faute de frappe : « Dracofeu » → Dracaufeu.
     * Pour le message « tu voulais dire », jamais pour ouvrir.
     */
    public static <T extends Candidat> List<T> proches(Collection<T> tous, String requete, int max) {
        final String q = Texte.compact(requete);
        List<T> out = new ArrayList<T>();
        if (q.length() < 3) {
            return out;
        }
        final int seuil = Math.max(1, Math.min(3, q.length() / 3));
        final List<int[]> scores = new ArrayList<int[]>();
        final List<T> retenus = new ArrayList<T>();
        for (T c : tous) {
            int meilleur = Integer.MAX_VALUE;
            for (Nom n : c.noms()) {
                meilleur = Math.min(meilleur, Texte.distance(q, n.compact));
                // Le premier mot seul pour une base (« Canarticho de Galar » → Canarticho),
                // jamais pour une forme : « Dracofeu » propose Dracaufeu, pas ses trois Méga.
                if (!n.mots.isEmpty() && !c.variante()) {
                    meilleur = Math.min(meilleur, Texte.distance(q, n.mots.get(0)));
                }
            }
            if (meilleur <= seuil) {
                retenus.add(c);
                scores.add(new int[] {meilleur, retenus.size() - 1});
            }
        }
        Collections.sort(scores, new Comparator<int[]>() {
            @Override
            public int compare(int[] a, int[] b) {
                if (a[0] != b[0]) {
                    return a[0] - b[0];
                }
                T x = retenus.get(a[1]);
                T y = retenus.get(b[1]);
                if (x.prioritaire() != y.prioritaire()) {
                    return x.prioritaire() ? -1 : 1;
                }
                if (x.variante() != y.variante()) {
                    return x.variante() ? 1 : -1;
                }
                return x.ordre() - y.ordre();
            }
        });
        for (int[] s : scores) {
            if (out.size() >= max) {
                break;
            }
            out.add(retenus.get(s[1]));
        }
        return out;
    }
}
