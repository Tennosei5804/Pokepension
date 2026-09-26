package fr.tennosei.pokepensionbridge.commande;

import java.util.Collections;
import java.util.List;

/** Ce que la résolution d'une commande a donné : quoi ouvrir, ou quoi dire. */
public final class Issue {

    public enum Genre {
        /** Une seule chose correspond : on l'ouvre. */
        OUVRIR,
        /** Plusieurs correspondent : on les propose, on n'en choisit aucune. */
        AMBIGU,
        /** Rien ne correspond. `choix` porte les noms proches, s'il y en a. */
        INTROUVABLE,
        /** La commande est mal formée, ou une valeur de filtre est inconnue. */
        INVALIDE,
        /** Le Pokédex de PixelmonWorld n'est pas ouvert à ce compte PokéPension. */
        INACCESSIBLE
    }

    /** Une proposition cliquable. */
    public static final class Choix {
        public final String libelle;
        public final Demande demande;

        public Choix(String libelle, Demande demande) {
            this.libelle = libelle;
            this.demande = demande;
        }
    }

    public final Genre genre;
    public final Demande demande;
    /** « Pokémon », « zone »… : de quoi on parle dans le message. */
    public final String sujet;
    /** Ce qui a été tapé, tel quel. */
    public final String cherche;
    public final List<Choix> choix;
    /** Une précision : les valeurs possibles, la syntaxe attendue. */
    public final String detail;

    private Issue(Genre genre, Demande demande, String sujet, String cherche, List<Choix> choix, String detail) {
        this.genre = genre;
        this.demande = demande;
        this.sujet = sujet;
        this.cherche = cherche;
        this.choix = choix == null ? Collections.<Choix>emptyList() : choix;
        this.detail = detail == null ? "" : detail;
    }

    public static Issue ouvrir(Demande d) {
        return new Issue(Genre.OUVRIR, d, "", "", null, null);
    }

    public static Issue ambigu(String sujet, String cherche, List<Choix> choix) {
        return new Issue(Genre.AMBIGU, null, sujet, cherche, choix, null);
    }

    public static Issue introuvable(String sujet, String cherche, List<Choix> proches) {
        return new Issue(Genre.INTROUVABLE, null, sujet, cherche, proches, null);
    }

    public static Issue invalide(String sujet, String cherche, String detail) {
        return new Issue(Genre.INVALIDE, null, sujet, cherche, null, detail);
    }

    public static Issue inaccessible() {
        return new Issue(Genre.INACCESSIBLE, null, "", "", null, null);
    }
}
