package fr.tennosei.pokepensionbridge.commande;

import fr.tennosei.pokepensionbridge.commande.Jetons.Jeton;
import fr.tennosei.pokepensionbridge.commande.Resolveur.Categorie;
import fr.tennosei.pokepensionbridge.donnees.Catalogue;
import fr.tennosei.pokepensionbridge.donnees.Catalogue.Lieu;
import fr.tennosei.pokepensionbridge.donnees.Catalogue.Pokemon;
import fr.tennosei.pokepensionbridge.donnees.Catalogue.Valeur;
import fr.tennosei.pokepensionbridge.recherche.Chercheur;
import fr.tennosei.pokepensionbridge.recherche.Chercheur.Trouve;
import fr.tennosei.pokepensionbridge.recherche.Texte;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Ce que Tab propose, selon l'endroit où l'on en est dans la ligne.
 *
 * <pre>
 *   /ps ▮                       pokemon, zone, dex, aide
 *   /ps pokemon dra▮            Dracaufeu, Draco, Dracolosse, Draby…
 *   /ps zone ▮                  les zones, dans l'ordre de la carte
 *   /ps zone Zone 1 ▮           rare, type, generation, sous-zone
 *   /ps zone Zone 1 rare ▮      Commun, Peu commun, Rare, Épique, Légendaire
 *   /ps zone Zone 1 rare Rare ▮ les raretés qui restent, puis les mots-clés
 * </pre>
 *
 * <p>Une valeur déjà choisie n'est pas reproposée. L'ordre est celui du
 * catalogue — la carte, le Pokédex, le commun avant le rare — et, pour les
 * noms, celui du {@link Chercheur} : ce qui s'ouvrirait vient en premier.
 */
public final class Completeur {

    /** Ce qu'on propose, et à partir d'où dans la ligne on remplace. */
    public static final class Proposition {
        public final int debut;
        public final List<String> textes;

        Proposition(int debut, List<String> textes) {
            this.debut = debut;
            this.textes = textes;
        }
    }

    static final String[] SOUS_COMMANDES = {"pokemon", "zone", "dex", "aide"};
    /** Au-delà, la liste ne se lit plus : on affine en tapant. */
    static final int MAX = 50;

    private Completeur() {
    }

    private static Proposition rien(int debut) {
        return new Proposition(debut, Collections.<String>emptyList());
    }

    private static boolean commencePar(String candidat, String tape) {
        String q = Texte.plier(tape);
        if (q.isEmpty()) {
            return true;
        }
        String c = Texte.plier(candidat);
        return c.startsWith(q) || Texte.compact(candidat).startsWith(Texte.compact(tape));
    }

    /**
     * @param reste ce qui suit « /ps », jusqu'au curseur
     * @param cat   le catalogue, ou null s'il n'est pas encore arrivé
     */
    public static Proposition suggerer(String reste, Catalogue cat) {
        if (cat == null) {
            cat = Catalogue.vide();
        }
        List<Jeton> jetons = Jetons.decouper(reste);
        boolean fin = Jetons.finiParSeparateur(reste);

        if (jetons.isEmpty()) {
            List<String> tous = new ArrayList<String>();
            Collections.addAll(tous, SOUS_COMMANDES);
            return new Proposition(reste.length(), tous);
        }
        Jeton premier = jetons.get(0);
        if (jetons.size() == 1 && !fin) {
            List<String> out = new ArrayList<String>();
            for (String s : SOUS_COMMANDES) {
                if (commencePar(s, premier.texte)) {
                    out.add(s);
                }
            }
            // « /ps Pika » : un nom directement, sans sous-commande.
            if (Analyse.sousCommande(premier.texte) == null) {
                out.addAll(noms(cat, premier.texte));
            }
            return new Proposition(premier.debut, plafond(out));
        }
        Analyse.Genre g = premier.cite ? null : Analyse.sousCommande(premier.texte);
        List<Jeton> suite = jetons.subList(1, jetons.size());
        if (g == Analyse.Genre.POKEMON) {
            if (suite.isEmpty()) {
                return rien(reste.length());
            }
            int debut = suite.get(0).debut;
            return new Proposition(debut, noms(cat, reste.substring(debut)));
        }
        if (g == Analyse.Genre.ZONE) {
            return filtres(reste, suite, fin, cat, true);
        }
        if (g == Analyse.Genre.DEX) {
            return filtres(reste, suite, fin, cat, false);
        }
        return rien(reste.length());
    }

    private static List<String> noms(Catalogue cat, String q) {
        List<String> out = new ArrayList<String>();
        if (Texte.compact(q).isEmpty()) {
            return out;
        }
        for (Trouve<Pokemon> t : Chercheur.chercher(cat.pokemon, q)) {
            out.add(t.candidat.nom);
            if (out.size() >= MAX) {
                break;
            }
        }
        return out;
    }

    private static List<String> plafond(List<String> l) {
        List<String> sans = new ArrayList<String>(new LinkedHashSet<String>(l));
        return sans.size() > MAX ? sans.subList(0, MAX) : sans;
    }

    private static Proposition filtres(String reste, List<Jeton> suite, boolean fin, Catalogue cat,
                                       boolean avecZone) {
        Lieu zone = null;
        int i = 0;
        if (avecZone) {
            Lieu[] trouve = new Lieu[1];
            int pris = cat.pixelmonworld ? Resolveur.prefixeLieu(cat, suite, trouve) : 0;
            // Le premier mot-clé : au-delà, on n'est plus dans le nom de la zone.
            int motCle = Resolveur.finDuNom(suite);
            boolean enCours = pris == 0 ? motCle == suite.size() : (pris == suite.size() && !fin);
            if (enCours) {
                return lieux(reste, suite, cat);
            }
            if (pris > 0) {
                zone = trouve[0];
                i = pris;
            } else {
                i = motCle;
            }
        }

        // Ce qui est déjà écrit, sans le mot en cours de frappe.
        int complets = fin ? suite.size() : suite.size() - 1;
        List<Jeton> ecrits = new ArrayList<Jeton>(suite.subList(i, Math.max(i, complets)));
        Jeton partiel = fin || complets < i ? null : suite.get(suite.size() - 1);

        Resolveur.Sections sections = Resolveur.sections(cat, ecrits);
        Categorie courante = sections.courante;
        Set<Categorie> ouvertes = sections.parCategorie.keySet();
        // Les valeurs déjà choisies, lues comme la commande les lirait.
        Resolveur.Filtres f = Resolveur.filtres(cat, ecrits, zone, true);
        Set<Lieu> lieux = f.lieux;

        List<String> valeurs = new ArrayList<String>();
        if (courante != null) {
            switch (courante) {
                case RARETE:
                    valeurs = libelles(cat.raretes, f.raretes);
                    break;
                case TYPE:
                    valeurs = libelles(cat.types, f.types);
                    break;
                case GENERATION:
                    valeurs = libelles(cat.generations, f.generations);
                    break;
                case SOUS_ZONE:
                    for (Lieu l : lieux) {
                        Lieu z = l.zone == null ? l : l.zone;
                        for (Lieu s : z.sous) {
                            if (!f.sousZones.contains(s) && !valeurs.contains(s.nomCourt)) {
                                valeurs.add(s.nomCourt);
                            }
                        }
                    }
                    break;
                case LIEU:
                    for (Lieu l : cat.lieux) {
                        if (!lieux.contains(l)) {
                            valeurs.add(l.nom);
                        }
                    }
                    break;
                default:
                    break;
            }
        }

        List<String> motsCles = new ArrayList<String>();
        boolean aDesSous = false;
        for (Lieu l : lieux) {
            aDesSous |= !(l.zone == null ? l : l.zone).sous.isEmpty();
        }
        for (Categorie c : Categorie.values()) {
            if (ouvertes.contains(c)) {
                continue;
            }
            if (c == Categorie.SOUS_ZONE && !(avecZone && aDesSous)) {
                continue;
            }
            if (c == Categorie.LIEU && avecZone) {
                continue;
            }
            motsCles.add(c.motCle);
        }

        if (partiel == null) {
            List<String> out = new ArrayList<String>(valeurs);
            out.addAll(motsCles);
            return new Proposition(reste.length(), plafond(out));
        }

        // Une valeur en deux mots se tape en deux fois : « Peu c▮ ».
        int debut = partiel.debut;
        String tape = partiel.texte;
        if (!ecrits.isEmpty() && courante != null && Resolveur.motCle(ecrits.get(ecrits.size() - 1)) == null) {
            Jeton avant = ecrits.get(ecrits.size() - 1);
            String deux = avant.texte + " " + partiel.texte;
            for (String v : valeurs) {
                if (Texte.mots(v).size() > 1 && commencePar(v, deux)) {
                    debut = avant.debut;
                    tape = deux;
                    break;
                }
            }
        }
        List<String> out = new ArrayList<String>();
        for (String v : valeurs) {
            if (commencePar(v, tape)) {
                out.add(v);
            }
        }
        if (debut == partiel.debut) {
            for (String m : motsCles) {
                if (commencePar(m, tape)) {
                    out.add(m);
                }
            }
        }
        return new Proposition(debut, plafond(out));
    }

    /** Les zones qu'on est en train de nommer. */
    private static Proposition lieux(String reste, List<Jeton> suite, Catalogue cat) {
        int debut = suite.isEmpty() ? reste.length() : suite.get(0).debut;
        String q = reste.substring(debut);
        List<String> out = new ArrayList<String>();
        if (Texte.compact(q).isEmpty()) {
            for (Lieu l : cat.zones()) {
                out.add(l.nom);
            }
        } else {
            for (Trouve<Lieu> t : Chercheur.chercher(cat.lieux, q)) {
                out.add(t.candidat.nom);
            }
        }
        return new Proposition(debut, plafond(out));
    }

    private static List<String> libelles(List<Valeur> toutes, Set<Valeur> choisies) {
        List<String> out = new ArrayList<String>();
        for (Valeur v : toutes) {
            if (!choisies.contains(v)) {
                out.add(v.libelle);
            }
        }
        return out;
    }
}
