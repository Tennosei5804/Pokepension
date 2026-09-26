package fr.tennosei.pokepensionbridge.commande;

import fr.tennosei.pokepensionbridge.commande.Jetons.Jeton;
import fr.tennosei.pokepensionbridge.recherche.Texte;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Ce que dit une ligne `/ps …`, avant de savoir si ce qu'elle nomme existe.
 *
 * <p>La syntaxe seule : quelle sous-commande, et ce qui la suit. Reconnaître
 * « Dracaufeu » ou « Zone 1 » demande le catalogue, et c'est le travail du
 * {@link Resolveur}.
 */
public final class Analyse {

    public enum Genre {
        /** `/ps` seul : ouvrir PokéPension. */
        ACCUEIL,
        AIDE,
        POKEMON,
        ZONE,
        /** Le Pokédex du serveur filtré, sans zone. */
        DEX,
        /** Un lien cliqué dans le chat, que le mod a lui-même écrit. */
        LIEN,
        /** Ni sous-commande ni mot-clé : un nom de Pokémon ou de zone, peut-être. */
        LIBRE
    }

    /** `/ps` suivi de rien, d'une espace, ou d'un mot. Jamais `/psychic`. */
    private static final Pattern RACINE = Pattern.compile("^/ps(\\s.*)?$", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    /** Les sous-commandes, sous leur forme compacte, alias compris. */
    static final Map<String, Genre> SOUS_COMMANDES = new HashMap<String, Genre>();

    static {
        for (String s : new String[] {"pokemon", "pokemons", "poke", "pkmn", "pk", "p"}) {
            SOUS_COMMANDES.put(s, Genre.POKEMON);
        }
        for (String s : new String[] {"zone", "zones", "z", "lieu"}) {
            SOUS_COMMANDES.put(s, Genre.ZONE);
        }
        for (String s : new String[] {"dex", "pokedex", "d", "filtre", "filtres"}) {
            SOUS_COMMANDES.put(s, Genre.DEX);
        }
        for (String s : new String[] {"aide", "help", "h"}) {
            SOUS_COMMANDES.put(s, Genre.AIDE);
        }
    }

    public final Genre genre;
    /** POKEMON et LIBRE : ce qu'on cherche, tel que tapé. LIEN : le jeton. */
    public final String texte;
    /** ZONE et DEX : ce qui suit la sous-commande. */
    public final List<Jeton> jetons;

    private Analyse(Genre genre, String texte, List<Jeton> jetons) {
        this.genre = genre;
        this.texte = texte;
        this.jetons = jetons;
    }

    /** Cette ligne est-elle pour le mod ? `/ps`, `/ps …` — rien d'autre. */
    public static boolean estPourNous(String ligne) {
        return ligne != null && RACINE.matcher(ligne.trim()).matches();
    }

    /** Une sous-commande reconnue, ou null. */
    static Genre sousCommande(String mot) {
        if ("?".equals(mot)) {
            return Genre.AIDE;
        }
        return SOUS_COMMANDES.get(Texte.compact(mot));
    }

    public static Analyse analyser(String ligne) {
        String reste = ligne.trim().substring(3);
        List<Jeton> jetons = Jetons.decouper(reste);
        if (jetons.isEmpty()) {
            return new Analyse(Genre.ACCUEIL, "", Collections.<Jeton>emptyList());
        }
        Jeton premier = jetons.get(0);
        if (!premier.cite && premier.texte.startsWith("#")) {
            return new Analyse(Genre.LIEN, premier.texte.substring(1).toLowerCase(Locale.ROOT),
                    Collections.<Jeton>emptyList());
        }
        Genre g = premier.cite ? null : sousCommande(premier.texte);
        if (g == null) {
            return new Analyse(Genre.LIBRE, reste.trim(), jetons);
        }
        List<Jeton> suite = jetons.subList(1, jetons.size());
        String texte = suite.isEmpty() ? "" : reste.substring(suite.get(0).debut).trim();
        return new Analyse(g, texte, suite);
    }
}
