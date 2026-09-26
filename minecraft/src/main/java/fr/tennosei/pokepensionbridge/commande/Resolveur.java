package fr.tennosei.pokepensionbridge.commande;

import fr.tennosei.pokepensionbridge.commande.Jetons.Jeton;
import fr.tennosei.pokepensionbridge.donnees.Catalogue;
import fr.tennosei.pokepensionbridge.donnees.Catalogue.Lieu;
import fr.tennosei.pokepensionbridge.donnees.Catalogue.Pokemon;
import fr.tennosei.pokepensionbridge.donnees.Catalogue.Valeur;
import fr.tennosei.pokepensionbridge.recherche.Chercheur;
import fr.tennosei.pokepensionbridge.recherche.Chercheur.Candidat;
import fr.tennosei.pokepensionbridge.recherche.Chercheur.Niveau;
import fr.tennosei.pokepensionbridge.recherche.Chercheur.Trouve;
import fr.tennosei.pokepensionbridge.recherche.Texte;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Une commande analysée, et le catalogue : ce qu'il faut ouvrir.
 *
 * <p>LA GRAMMAIRE DES FILTRES tient en une ligne :
 *
 * <pre>
 *   /ps zone &lt;zone&gt; [rare &lt;rareté&gt;…] [type &lt;type&gt;…] [generation &lt;n&gt;…] [sous-zone &lt;nom&gt;…]
 * </pre>
 *
 * <p>Un mot-clé ouvre une section, et tout ce qui suit lui appartient jusqu'au
 * mot-clé suivant : « rare Rare Epique type Feu Dragon » donne deux raretés et
 * deux types. Une valeur peut compter plusieurs mots (« Peu commun ») : on
 * prend toujours la plus longue qui existe. Et « rare » dans une section de
 * raretés est une valeur, pas un mot-clé — « rare Commun Rare » veut dire ce
 * qu'on croit.
 *
 * <p>LE NOM DE ZONE s'arrête là où le catalogue le reconnaît : on essaie
 * d'abord le plus long début de ligne qui soit exactement une zone, ce qui
 * laisse une zone porter un mot qui ressemble à un mot-clé.
 *
 * <p>SANS MOT-CLÉ, on devine quand c'est sans ambiguïté : « /ps zone Zone 1
 * Feu » — « Feu » n'est qu'un type. Une valeur qu'on ne sait pas ranger est
 * refusée, jamais ignorée : ouvrir une page qui ne montre pas ce qu'on a
 * demandé serait pire que ne rien ouvrir.
 */
public final class Resolveur {

    public enum Categorie {
        RARETE("rareté", "rare"),
        TYPE("type", "type"),
        GENERATION("génération", "generation"),
        SOUS_ZONE("sous-zone", "sous-zone"),
        LIEU("zone", "zone");

        public final String nom;
        /** Le mot-clé qu'on propose à la complétion. */
        public final String motCle;

        Categorie(String nom, String motCle) {
            this.nom = nom;
            this.motCle = motCle;
        }
    }

    static final Map<String, Categorie> MOTS_CLES = new HashMap<String, Categorie>();

    static {
        for (String s : new String[] {"rare", "rares", "rarete", "raretes", "r"}) {
            MOTS_CLES.put(s, Categorie.RARETE);
        }
        for (String s : new String[] {"type", "types", "t"}) {
            MOTS_CLES.put(s, Categorie.TYPE);
        }
        for (String s : new String[] {"generation", "generations", "gen", "gens", "g"}) {
            MOTS_CLES.put(s, Categorie.GENERATION);
        }
        for (String s : new String[] {"souszone", "souszones", "sous", "sz"}) {
            MOTS_CLES.put(s, Categorie.SOUS_ZONE);
        }
        for (String s : new String[] {"zone", "zones", "lieu", "lieux"}) {
            MOTS_CLES.put(s, Categorie.LIEU);
        }
    }

    /** Combien de propositions au plus dans un message. */
    static final int CHOIX_MAX = 8;
    /** Le plus long nom de zone qu'on essaie, en mots. */
    private static final int MOTS_MAX_LIEU = 6;

    private Resolveur() {
    }

    /** Le mot-clé que ce jeton désigne, ou null. Un texte entre guillemets n'en est jamais un. */
    static Categorie motCle(Jeton j) {
        return j.cite ? null : MOTS_CLES.get(Texte.compact(j.texte));
    }

    // --- Pokémon ----------------------------------------------------------------

    static Issue pokemon(Catalogue cat, String q) {
        if (Texte.compact(q).isEmpty()) {
            return Issue.invalide("Pokémon", q, "/ps pokemon <nom> — par exemple /ps pokemon Dracaufeu");
        }
        Chercheur.Choix<Pokemon> c = Chercheur.choisir(Chercheur.chercher(cat.pokemon, q));
        if (c.unique != null) {
            return Issue.ouvrir(Demande.pokemon(c.unique.cle, c.unique.nom));
        }
        if (!c.possibles.isEmpty()) {
            return Issue.ambigu("Pokémon", q, choixPokemon(c.possibles));
        }
        return Issue.introuvable("Pokémon", q, choixPokemon(Chercheur.proches(cat.pokemon, q, 3)));
    }

    private static List<Issue.Choix> choixPokemon(List<Pokemon> liste) {
        List<Issue.Choix> out = new ArrayList<Issue.Choix>();
        for (Pokemon p : liste) {
            out.add(new Issue.Choix(p.nom, Demande.pokemon(p.cle, p.nom)));
        }
        return out;
    }

    // --- Lieux ------------------------------------------------------------------

    /**
     * Le lieu dont un nom est exactement ce texte, à la ponctuation, aux
     * accents et aux espaces près : « Zone01 Eau » est « Zone 1 Eau ».
     */
    static Lieu lieuExact(Catalogue cat, String texte) {
        return exact(cat.lieux, texte);
    }

    /** Le plus long début de `jetons` qui soit exactement un lieu. */
    static int prefixeLieu(Catalogue cat, List<Jeton> jetons, Lieu[] trouve) {
        for (int n = Math.min(jetons.size(), MOTS_MAX_LIEU); n >= 1; n--) {
            Lieu l = lieuExact(cat, Jetons.joindre(jetons, 0, n));
            if (l != null) {
                trouve[0] = l;
                return n;
            }
        }
        return 0;
    }

    // --- Les filtres ------------------------------------------------------------

    /**
     * Un mot-clé de la section en cours qui commence une de ses valeurs est une
     * valeur : « rare Commun Rare », « zone Zone 3 ». Sans cette règle, le
     * second « Rare » rouvrirait la section au lieu d'y entrer.
     */
    static boolean commenceUneValeur(Catalogue cat, Categorie c, Jeton j) {
        List<? extends Candidat> possibles;
        switch (c) {
            case RARETE:
                possibles = cat.raretes;
                break;
            case LIEU:
                possibles = cat.lieux;
                break;
            case TYPE:
                possibles = cat.types;
                break;
            case GENERATION:
                possibles = cat.generations;
                break;
            default:
                return false;
        }
        String mot = Texte.plier(j.texte);
        for (Candidat v : possibles) {
            List<String> mots = v.noms().get(0).mots;
            if (!mots.isEmpty() && mots.get(0).equals(mot)) {
                return true;
            }
        }
        return false;
    }

    /** La ligne découpée en sections : ce qui suit chaque mot-clé, et ce qui n'en suit aucun. */
    static final class Sections {
        final List<Jeton> sansMotCle = new ArrayList<Jeton>();
        final Map<Categorie, List<Jeton>> parCategorie = new LinkedHashMap<Categorie, List<Jeton>>();
        /** La section où l'on se trouve à la fin de la ligne, ou null. */
        Categorie courante;
    }

    static Sections sections(Catalogue cat, List<Jeton> jetons) {
        Sections s = new Sections();
        List<Jeton> courants = s.sansMotCle;
        for (Jeton j : jetons) {
            Categorie k = motCle(j);
            if (k != null && !(k == s.courante && commenceUneValeur(cat, k, j))) {
                s.courante = k;
                if (!s.parCategorie.containsKey(k)) {
                    s.parCategorie.put(k, new ArrayList<Jeton>());
                }
                courants = s.parCategorie.get(k);
                continue;
            }
            courants.add(j);
        }
        return s;
    }

    /**
     * Où s'arrête le nom d'une zone qu'on n'a pas reconnu exactement : au
     * premier mot-clé de filtre. « zone » n'en est pas un ici — « Zone 99 »
     * est un nom de zone, pas une section.
     */
    static int finDuNom(List<Jeton> jetons) {
        int fin = 0;
        while (fin < jetons.size()) {
            Categorie k = motCle(jetons.get(fin));
            if (k != null && k != Categorie.LIEU) {
                break;
            }
            fin++;
        }
        return fin;
    }

    /** Des filtres lus, ou l'erreur qui les a arrêtés. */
    static final class Filtres {
        final LinkedHashSet<Lieu> lieux = new LinkedHashSet<Lieu>();
        final LinkedHashSet<Valeur> raretes = new LinkedHashSet<Valeur>();
        final LinkedHashSet<Valeur> types = new LinkedHashSet<Valeur>();
        final LinkedHashSet<Valeur> generations = new LinkedHashSet<Valeur>();
        final LinkedHashSet<Lieu> sousZones = new LinkedHashSet<Lieu>();
        Issue erreur;
    }

    /**
     * EXACT, ET DANS L'ORDRE. Les mots dans le désordre valent pour un Pokémon
     * (« Méga Dracaufeu X ») mais pas pour une suite de filtres : « rare Commun
     * Peu commun » doit lire Commun puis Peu commun, et non « Commun Peu »
     * comme un « Peu commun » à l'envers.
     */
    private static <T extends Candidat> T exact(List<T> possibles, String texte) {
        Chercheur.Nom q = new Chercheur.Nom(texte);
        if (q.compact.isEmpty()) {
            return null;
        }
        for (T t : possibles) {
            for (Chercheur.Nom n : t.noms()) {
                if (Chercheur.niveau(q, n) == Niveau.EXACT) {
                    return t;
                }
            }
        }
        return null;
    }

    /**
     * Le plus long groupe de jetons, à partir de `i`, qui nomme une valeur.
     * D'abord exactement ; sinon un début de nom qu'une seule valeur complète
     * (« Epiq », « Leg »). Rend le nombre de jetons pris, 0 si rien.
     */
    private static <T extends Candidat> int lireUne(List<Jeton> jetons, int i, List<T> possibles, int maxMots,
                                                   boolean exactSeulement, List<T> sortie) {
        int reste = Math.min(maxMots, jetons.size() - i);
        for (int m = reste; m >= 1; m--) {
            T t = exact(possibles, Jetons.joindre(jetons, i, i + m));
            if (t != null) {
                sortie.add(t);
                return m;
            }
        }
        if (exactSeulement) {
            return 0;
        }
        for (int m = reste; m >= 1; m--) {
            List<Trouve<T>> trouves = Chercheur.chercher(possibles, Jetons.joindre(jetons, i, i + m));
            Chercheur.Choix<T> c = Chercheur.choisir(trouves);
            if (c.unique != null && trouves.get(0).niveau != Niveau.DEDANS) {
                sortie.add(c.unique);
                return m;
            }
        }
        return 0;
    }

    private static String liste(List<? extends Candidat> valeurs) {
        StringBuilder b = new StringBuilder();
        for (Candidat v : valeurs) {
            if (b.length() > 0) {
                b.append(", ");
            }
            b.append(v.noms().get(0).brut);
        }
        return b.toString();
    }

    /** Les sous-zones qu'on peut nommer : celles des zones déjà choisies. */
    private static List<Lieu> sousZonesPossibles(Set<Lieu> lieux) {
        List<Lieu> out = new ArrayList<Lieu>();
        for (Lieu l : lieux) {
            Lieu zone = l.zone == null ? l : l.zone;
            for (Lieu s : zone.sous) {
                if (!out.contains(s)) {
                    out.add(s);
                }
            }
        }
        return out;
    }

    /** Une sous-zone se nomme par son nom court : « Eau », pas « Zone 1 Eau ». */
    private static List<Valeur> commeValeurs(List<Lieu> sous) {
        List<Valeur> out = new ArrayList<Valeur>();
        int i = 0;
        for (Lieu s : sous) {
            out.add(new Valeur(s.nomCourt, s.cle, i++, s.nom, s.cle));
        }
        return out;
    }

    static Filtres filtres(Catalogue cat, List<Jeton> jetons, Lieu zone) {
        return filtres(cat, jetons, zone, false);
    }

    /**
     * @param tolerant pour la complétion : seules les valeurs exactes comptent,
     *                 et un mot inconnu (celui qu'on tape) est ignoré au lieu
     *                 d'arrêter la lecture.
     */
    static Filtres filtres(Catalogue cat, List<Jeton> jetons, Lieu zone, boolean tolerant) {
        Filtres f = new Filtres();
        if (zone != null) {
            f.lieux.add(zone);
        }
        Sections decoupe = sections(cat, jetons);
        Map<Categorie, List<Jeton>> sections = decoupe.parCategorie;
        List<Jeton> sansMotCle = decoupe.sansMotCle;

        // Sans mot-clé : une zone de plus, ou une valeur qu'une seule catégorie connaît.
        for (int i = 0; i < sansMotCle.size(); ) {
            List<Lieu> l = new ArrayList<Lieu>();
            List<Valeur> v = new ArrayList<Valeur>();
            int pris;
            if ((pris = lireUne(sansMotCle, i, cat.lieux, MOTS_MAX_LIEU, true, l)) > 0) {
                f.lieux.addAll(l);
            } else if ((pris = lireUne(sansMotCle, i, cat.raretes, 3, true, v)) > 0) {
                f.raretes.addAll(v);
            } else if ((pris = lireUne(sansMotCle, i, cat.types, 1, true, v)) > 0) {
                f.types.addAll(v);
            } else if ((pris = lireUne(sansMotCle, i, cat.generations, 1, true, v)) > 0) {
                f.generations.addAll(v);
            } else if (tolerant) {
                pris = 1;
            } else {
                String mot = sansMotCle.get(i).texte;
                f.erreur = Issue.invalide("valeur", mot, "« " + mot + " » n'est ni une zone, ni une rareté, "
                        + "ni un type, ni une génération. Précise-le : rare …, type …, generation …");
                return f;
            }
            i += pris;
        }

        // Les zones nommées d'abord : les sous-zones en dépendent.
        if (sections.containsKey(Categorie.LIEU)) {
            if (!lireSection(f, Categorie.LIEU, sections.get(Categorie.LIEU), cat.lieux, MOTS_MAX_LIEU, f.lieux,
                    tolerant)) {
                return f;
            }
        }
        for (Map.Entry<Categorie, List<Jeton>> s : sections.entrySet()) {
            boolean ok = true;
            switch (s.getKey()) {
                case RARETE:
                    ok = lireSection(f, Categorie.RARETE, s.getValue(), cat.raretes, 3, f.raretes, tolerant);
                    break;
                case TYPE:
                    ok = lireSection(f, Categorie.TYPE, s.getValue(), cat.types, 1, f.types, tolerant);
                    break;
                case GENERATION:
                    ok = lireSection(f, Categorie.GENERATION, s.getValue(), cat.generations, 1, f.generations,
                            tolerant);
                    break;
                case SOUS_ZONE:
                    List<Lieu> possibles = sousZonesPossibles(f.lieux);
                    if (possibles.isEmpty()) {
                        if (tolerant) {
                            break;
                        }
                        f.erreur = Issue.invalide("sous-zone", "", f.lieux.isEmpty()
                                ? "Nomme d'abord la zone : /ps zone <zone> sous-zone <nom>"
                                : "Cette zone n'a pas de sous-zone.");
                        return f;
                    }
                    List<Valeur> commeV = commeValeurs(possibles);
                    LinkedHashSet<Valeur> choisies = new LinkedHashSet<Valeur>();
                    ok = lireSection(f, Categorie.SOUS_ZONE, s.getValue(), commeV, 3, choisies, tolerant);
                    for (Valeur v : choisies) {
                        f.sousZones.add(possibles.get(commeV.indexOf(v)));
                    }
                    break;
                default:
                    break;
            }
            if (!ok) {
                return f;
            }
        }

        // Une zone couvre ses sous-zones : choisir « Eau » dans Zone 1, c'est
        // remplacer Zone 1 par Zone 1 Eau, pas l'y ajouter.
        for (Lieu s : f.sousZones) {
            f.lieux.remove(s.zone);
            f.lieux.add(s);
        }
        return f;
    }

    private static <T extends Candidat> boolean lireSection(Filtres f, Categorie c, List<Jeton> jetons,
                                                            List<T> possibles, int maxMots, Set<T> sortie,
                                                            boolean tolerant) {
        if (jetons.isEmpty() && !tolerant) {
            f.erreur = Issue.invalide(c.nom, "", "Après « " + c.motCle + " », nomme au moins une "
                    + c.nom + (possibles.isEmpty() ? "." : " : " + liste(possibles)));
            return false;
        }
        for (int i = 0; i < jetons.size(); ) {
            List<T> lu = new ArrayList<T>();
            int pris = lireUne(jetons, i, possibles, maxMots, tolerant, lu);
            if (pris == 0 && tolerant) {
                i++;
                continue;
            }
            if (pris == 0) {
                String mot = jetons.get(i).texte;
                f.erreur = Issue.invalide(c.nom, mot, possibles.isEmpty() ? ""
                        : "Possibles : " + liste(possibles.size() > 24 ? possibles.subList(0, 24) : possibles)
                        + (possibles.size() > 24 ? "…" : ""));
                return false;
            }
            sortie.addAll(lu);
            i += pris;
        }
        return true;
    }

    private static Demande demandeFiltres(Filtres f) {
        List<String> lieux = new ArrayList<String>();
        StringBuilder libelle = new StringBuilder();
        for (Lieu l : f.lieux) {
            lieux.add(l.cle);
            libelle.append(libelle.length() > 0 ? ", " : "").append(l.nom);
        }
        List<String> raretes = new ArrayList<String>();
        for (Valeur v : f.raretes) {
            raretes.add(v.code);
        }
        List<String> types = new ArrayList<String>();
        for (Valeur v : f.types) {
            types.add(v.code);
        }
        List<Integer> generations = new ArrayList<Integer>();
        for (Valeur v : f.generations) {
            generations.add(Integer.valueOf(v.code));
        }
        return Demande.filtres(lieux, raretes, types, generations,
                libelle.length() > 0 ? libelle.toString() : "Pokédex PixelmonWorld");
    }

    static Issue zone(Catalogue cat, List<Jeton> jetons) {
        if (!cat.pixelmonworld) {
            return Issue.inaccessible();
        }
        if (jetons.isEmpty()) {
            return Issue.invalide("zone", "", "/ps zone <zone> — par exemple /ps zone Zone 1 rare Rare Épique");
        }
        Lieu[] trouve = new Lieu[1];
        int pris = prefixeLieu(cat, jetons, trouve);
        List<Lieu> ambigues = Collections.emptyList();
        if (pris == 0) {
            int fin = finDuNom(jetons);
            if (fin == 0) {
                return Issue.invalide("zone", "", "Nomme la zone avant les filtres : /ps zone <zone> rare …");
            }
            String nom = Jetons.joindre(jetons, 0, fin);
            Chercheur.Choix<Lieu> c = Chercheur.choisir(Chercheur.chercher(cat.lieux, nom));
            if (c.unique != null) {
                trouve[0] = c.unique;
            } else if (!c.possibles.isEmpty()) {
                ambigues = c.possibles.size() > CHOIX_MAX ? c.possibles.subList(0, CHOIX_MAX) : c.possibles;
            } else {
                List<Issue.Choix> proches = new ArrayList<Issue.Choix>();
                for (Lieu l : Chercheur.proches(cat.lieux, nom, 3)) {
                    proches.add(new Issue.Choix(l.nom, demandeFiltres(filtresPour(l))));
                }
                return Issue.introuvable("zone", nom, proches);
            }
            pris = fin;
        }

        List<Jeton> reste = jetons.subList(pris, jetons.size());
        if (!ambigues.isEmpty()) {
            // Les filtres valent pour chaque zone proposée : cliquer l'une d'elles
            // doit ouvrir ce qu'on avait demandé, pas la zone nue.
            List<Issue.Choix> choix = new ArrayList<Issue.Choix>();
            for (Lieu l : ambigues) {
                Filtres f = filtres(cat, reste, l);
                if (f.erreur != null) {
                    return f.erreur;
                }
                choix.add(new Issue.Choix(l.nom, demandeFiltres(f)));
            }
            return Issue.ambigu("zone", Jetons.joindre(jetons, 0, pris), choix);
        }
        Filtres f = filtres(cat, reste, trouve[0]);
        return f.erreur != null ? f.erreur : Issue.ouvrir(demandeFiltres(f));
    }

    private static Filtres filtresPour(Lieu l) {
        Filtres f = new Filtres();
        f.lieux.add(l);
        return f;
    }

    static Issue dex(Catalogue cat, List<Jeton> jetons) {
        if (!cat.pixelmonworld) {
            return Issue.inaccessible();
        }
        Filtres f = filtres(cat, jetons, null);
        return f.erreur != null ? f.erreur : Issue.ouvrir(demandeFiltres(f));
    }

    /**
     * Ni sous-commande ni mot-clé : « /ps Pikachu », « /ps Zone 1 ». Un Pokémon
     * qui répond seul d'abord, une zone exacte ensuite ; sinon la liste des
     * Pokémon approchants, ou l'aide.
     */
    static Issue libre(Catalogue cat, Analyse a) {
        Issue p = pokemon(cat, a.texte);
        if (p.genre == Issue.Genre.OUVRIR) {
            return p;
        }
        if (cat.pixelmonworld) {
            Lieu[] trouve = new Lieu[1];
            if (prefixeLieu(cat, a.jetons, trouve) > 0) {
                Issue z = zone(cat, a.jetons);
                if (z.genre == Issue.Genre.OUVRIR) {
                    return z;
                }
            }
        }
        if (p.genre == Issue.Genre.AMBIGU) {
            return p;
        }
        return Issue.invalide("commande", a.texte, "");
    }

    public static Issue resoudre(Analyse a, Catalogue cat) {
        switch (a.genre) {
            case ACCUEIL:
                return Issue.ouvrir(Demande.accueil());
            case POKEMON:
                return pokemon(cat, a.texte);
            case ZONE:
                return zone(cat, a.jetons);
            case DEX:
                return dex(cat, a.jetons);
            case LIBRE:
                return libre(cat, a);
            default:
                return Issue.invalide("commande", a.texte, "");
        }
    }
}
