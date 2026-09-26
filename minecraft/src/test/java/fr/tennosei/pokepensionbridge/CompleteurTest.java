package fr.tennosei.pokepensionbridge;

import fr.tennosei.pokepensionbridge.commande.Completeur;
import fr.tennosei.pokepensionbridge.commande.Completeur.Proposition;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Ce que Tab propose, à chaque étape d'une ligne `/ps`. Le texte est ce qui suit « /ps ». */
class CompleteurTest {

    private static Proposition p(String reste) {
        return Completeur.suggerer(reste, Donnees.catalogue());
    }

    private static List<String> tete(Proposition p, int n) {
        return p.textes.subList(0, Math.min(n, p.textes.size()));
    }

    @Test
    void sousCommandes() {
        assertEquals(Arrays.asList("pokemon", "zone", "dex", "aide"), p("").textes);
        Proposition z = p("zo");
        assertEquals(0, z.debut);
        assertEquals("zone", z.textes.get(0));
    }

    @Test
    void nomsDePokemon() {
        Proposition d = p("pokemon dra");
        assertEquals("pokemon ".length(), d.debut);
        assertTrue(d.textes.containsAll(Arrays.asList("Dracaufeu", "Draco", "Dracolosse", "Draby", "Drakkarmin")),
                d.textes.toString());
        assertTrue(d.textes.indexOf("Dracaufeu") < d.textes.indexOf("Dracaufeu (Méga X)"));
        // Minidraco ne commence par « dra » qu'en anglais (Dratini) : après les noms français.
        assertTrue(d.textes.indexOf("Draby") < d.textes.indexOf("Minidraco"), d.textes.toString());
        assertEquals("Flabébé", p("pokemon flabebe").textes.get(0));
        assertEquals("M. Mime", p("pokemon m. mi").textes.get(0));
        // Plusieurs mots, remplacés en entier.
        Proposition m = p("pokemon mega dracau");
        assertEquals("pokemon ".length(), m.debut);
        assertTrue(tete(m, 2).contains("Dracaufeu (Méga X)"), m.textes.toString());
        // L'alias court aussi.
        assertEquals("Pikachu", p("p pikac").textes.get(0));
        assertTrue(p("pokemon ").textes.isEmpty());
    }

    @Test
    void zones() {
        Proposition toutes = p("zone ");
        assertEquals("zone ".length(), toutes.debut);
        assertEquals("Zone 1", toutes.textes.get(0));
        assertFalse(toutes.textes.contains("Zone 1 Eau"), "les sous-zones attendent qu'on commence un nom");
        Proposition z1 = p("zone Zone 1");
        assertTrue(z1.textes.containsAll(Arrays.asList("Zone 1", "Zone 1 Eau", "Zone 10")), z1.textes.toString());
        assertTrue(p("zone oce").textes.contains("Océan"));
    }

    @Test
    void motsClesApresLaZone() {
        Proposition apres = p("zone Zone 1 ");
        assertEquals(Arrays.asList("rare", "type", "generation", "sous-zone"), apres.textes);
        assertEquals(Arrays.asList("rare", "type", "generation"), p("zone Océan ").textes);
        assertEquals(Arrays.asList("rare", "type", "generation", "zone"), p("dex ").textes);
    }

    @Test
    void valeursSelonLaSection() {
        Proposition r = p("zone Zone01 rare ");
        assertEquals(Arrays.asList("Commun", "Peu commun", "Rare", "Épique", "Légendaire", "type", "generation",
                "sous-zone"), r.textes);
        // Déjà choisie : pas reproposée.
        Proposition r2 = p("zone Zone01 rare Rare ");
        assertFalse(r2.textes.contains("Rare"));
        assertTrue(r2.textes.contains("Épique"));
        Proposition ep = p("zone Zone01 rare Rare Ep");
        assertEquals(Arrays.asList("Épique"), ep.textes);
        assertEquals("zone Zone01 rare Rare ".length(), ep.debut);
        Proposition t = p("zone Zone01 type ");
        assertEquals(18, t.textes.indexOf("generation") >= 0 ? t.textes.indexOf("rare") : -1);
        assertEquals(Arrays.asList("1", "2", "3", "4", "5", "6", "7", "8", "rare", "type", "sous-zone"),
                p("zone Zone01 generation ").textes);
        assertEquals(Arrays.asList("Colline", "Eau", "Forêt", "rare", "type", "generation"),
                p("zone Zone 1 sous-zone ").textes);
        assertEquals(Arrays.asList("Électrik"), p("zone Zone 1 type ele").textes);
    }

    @Test
    void valeurEnDeuxMots() {
        Proposition pc = p("zone Zone01 rare Peu c");
        assertEquals(Arrays.asList("Peu commun"), pc.textes);
        assertEquals("zone Zone01 rare ".length(), pc.debut);
    }

    @Test
    void sansCatalogue() {
        Proposition vide = Completeur.suggerer("pokemon dra", null);
        assertTrue(vide.textes.isEmpty());
        assertEquals(Arrays.asList("pokemon", "zone", "dex", "aide"), Completeur.suggerer("", null).textes);
    }
}
