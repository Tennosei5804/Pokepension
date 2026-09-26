package fr.tennosei.pokepensionbridge;

import fr.tennosei.pokepensionbridge.recherche.Texte;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TexteTest {

    @Test
    void plieAccentsCasseEtPonctuation() {
        assertEquals("flabebe", Texte.plier("Flabébé"));
        assertEquals("m mime", Texte.plier("M. Mime"));
        assertEquals("mmime", Texte.compact("M.Mime"));
        assertEquals("dracaufeu mega x", Texte.plier("Dracaufeu (Méga X)"));
        assertEquals("epique", Texte.plier("ÉPIQUE"));
        assertEquals("foret de jade", Texte.plier("  Forêt   de-Jade "));
        assertEquals("coeur", Texte.plier("Cœur"));
    }

    @Test
    void zerosDeTeteRetires() {
        assertEquals("zone1", Texte.compact("Zone01"));
        assertEquals("zone1", Texte.compact("Zone 1"));
        assertEquals("zone1", Texte.compact("zone-001"));
        assertEquals("zone10", Texte.compact("Zone 10"));
        assertEquals("zone100", Texte.compact("Zone100"));
    }

    @Test
    void motsSansMotsVides() {
        assertEquals(Arrays.asList("rattata", "alola"), Texte.mots("Rattata d'Alola"));
        assertEquals(Arrays.asList("rattata", "alola"), Texte.mots("Rattata (Alola)"));
        assertEquals(Arrays.asList("mime", "jr"), Texte.mots("Mime Jr."));
    }

    @Test
    void distanceAvecTranspositions() {
        assertEquals(2, Texte.distance("dracofeu", "dracaufeu"));
        assertEquals(1, Texte.distance("pikahcu", "pikachu"));
        assertEquals(0, Texte.distance("abc", "abc"));
    }
}
