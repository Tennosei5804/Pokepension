package fr.tennosei.pokepensionbridge;

import com.google.gson.JsonObject;
import fr.tennosei.pokepensionbridge.commande.Analyse;
import fr.tennosei.pokepensionbridge.commande.Issue;
import fr.tennosei.pokepensionbridge.commande.Resolveur;
import fr.tennosei.pokepensionbridge.donnees.Catalogue;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Les commandes de la demande, une à une, contre le catalogue réel. */
class ResolveurTest {

    private static Issue resoudre(String ligne) {
        return Resolveur.resoudre(Analyse.analyser(ligne), Donnees.catalogue());
    }

    private static String ouvre(String ligne) {
        Issue i = resoudre(ligne);
        assertEquals(Issue.Genre.OUVRIR, i.genre, ligne + " → " + i.genre + " " + i.cherche + " " + i.detail);
        return i.demande.toString();
    }

    private static String pokemon(String cle) {
        return "{\"cible\":\"pokemon\",\"cle\":\"" + cle + "\"}";
    }

    private static String filtres(String lieux, String raretes, String types, String generations) {
        return "{\"cible\":\"filtres\",\"lieux\":[" + lieux + "],\"raretes\":[" + raretes + "],\"types\":["
                + types + "],\"generations\":[" + generations + "]}";
    }

    private static List<String> libelles(Issue i) {
        List<String> out = new ArrayList<String>();
        for (Issue.Choix c : i.choix) {
            out.add(c.libelle);
        }
        return out;
    }

    // --- La racine -------------------------------------------------------------

    @Test
    void seulementPs() {
        assertTrue(Analyse.estPourNous("/ps"));
        assertTrue(Analyse.estPourNous("/ps pokemon Pikachu"));
        assertTrue(Analyse.estPourNous("  /PS zone Zone 1 "));
        assertFalse(Analyse.estPourNous("/psychic"));
        assertFalse(Analyse.estPourNous("/spawn"));
        assertFalse(Analyse.estPourNous("/home"));
        assertFalse(Analyse.estPourNous("/msg Joueur /ps pokemon Pikachu"));
        assertFalse(Analyse.estPourNous("ps pokemon Pikachu"));
        assertFalse(Analyse.estPourNous("/p s"));
        assertFalse(Analyse.estPourNous("bonjour /ps"));
    }

    @Test
    void accueilEtAide() {
        assertEquals("{\"cible\":\"accueil\"}", ouvre("/ps"));
        assertEquals(Analyse.Genre.AIDE, Analyse.analyser("/ps aide").genre);
        assertEquals(Analyse.Genre.AIDE, Analyse.analyser("/ps help").genre);
        assertEquals(Analyse.Genre.AIDE, Analyse.analyser("/ps ?").genre);
    }

    // --- Pokémon ---------------------------------------------------------------

    @Test
    void pokemonParSonNomFrancais() {
        assertEquals(pokemon("pikachu"), ouvre("/ps pokemon Pikachu"));
        assertEquals(pokemon("charizard"), ouvre("/ps pokemon Dracaufeu"));
        assertEquals(pokemon("charizard"), ouvre("/ps pokemon dracaufeu"));
        assertEquals(pokemon("charizard"), ouvre("/ps pokemon DRACAUFEU"));
        assertEquals(pokemon("pikachu"), ouvre("/ps p pikachu"));
        assertEquals(pokemon("charizard"), ouvre("/ps pokemon Charizard"));
    }

    @Test
    void formes() {
        assertEquals(pokemon("charizard-mega-x"), ouvre("/ps pokemon Méga Dracaufeu X"));
        assertEquals(pokemon("charizard-mega-x"), ouvre("/ps pokemon mega dracaufeu x"));
        assertEquals(pokemon("charizard-mega-y"), ouvre("/ps pokemon Dracaufeu (Méga Y)"));
        assertEquals(pokemon("charizard-gmax"), ouvre("/ps pokemon Dracaufeu Gigamax"));
        assertEquals(pokemon("rattata-alola"), ouvre("/ps pokemon Rattata d'Alola"));
        assertEquals(pokemon("rattata-alola"), ouvre("/ps pokemon rattata alola"));
        assertEquals(pokemon("meowth-galar"), ouvre("/ps pokemon Miaouss de Galar"));
        assertEquals(pokemon("growlithe-hisui"), ouvre("/ps pokemon Caninos Hisui"));
    }

    @Test
    void ponctuationEtAccents() {
        assertEquals(pokemon("mr-mime"), ouvre("/ps pokemon M. Mime"));
        assertEquals(pokemon("mr-mime"), ouvre("/ps pokemon M.Mime"));
        assertEquals(pokemon("mr-mime"), ouvre("/ps pokemon m mime"));
        assertEquals(pokemon("mr-mime"), ouvre("/ps pokemon Mr. Mime"));
        assertEquals(pokemon("flabebe"), ouvre("/ps pokemon Flabébé"));
        assertEquals(pokemon("flabebe"), ouvre("/ps pokemon Flabebe"));
        assertEquals(pokemon("mime-jr"), ouvre("/ps pokemon Mime Jr."));
        assertEquals(pokemon("farfetchd"), ouvre("/ps pokemon Canarticho"));
    }

    @Test
    void debutDeNomQuiNeLaissePasDeDoute() {
        // « dracau » : seul Dracaufeu se complète sans mot de plus.
        assertEquals(pokemon("charizard"), ouvre("/ps pokemon dracau"));
        assertEquals(pokemon("pikachu"), ouvre("/ps pokemon pikach"));
    }

    @Test
    void plusieursCorrespondancesProposeesJamaisOuvertes() {
        Issue i = resoudre("/ps pokemon drac");
        assertEquals(Issue.Genre.AMBIGU, i.genre);
        List<String> l = libelles(i);
        assertTrue(l.containsAll(java.util.Arrays.asList("Dracaufeu", "Draco", "Dracolosse")), l.toString());
        assertTrue(l.indexOf("Dracaufeu") < l.indexOf("Dracaufeu (Méga X)"), l.toString());
        // Les noms français avant ceux qui ne commencent par « drac » qu'en anglais (Galvagon = Dracozolt).
        assertTrue(l.indexOf("Dracolosse") < l.indexOf("Galvagon") || !l.contains("Galvagon"), l.toString());
        for (Issue.Choix c : i.choix) {
            assertEquals("pokemon", c.demande.cible);
        }
    }

    @Test
    void introuvableAvecProposition() {
        Issue i = resoudre("/ps pokemon Dracofeu");
        assertEquals(Issue.Genre.INTROUVABLE, i.genre);
        assertEquals("Dracofeu", i.cherche);
        assertEquals("Dracaufeu", i.choix.get(0).libelle);
        // Ses formes ne sont pas des fautes de frappe plausibles.
        for (Issue.Choix c : i.choix) {
            assertFalse(c.libelle.contains("Méga"), c.libelle);
        }
        assertEquals(Issue.Genre.INTROUVABLE, resoudre("/ps pokemon Xyzzyqwerty").genre);
        assertEquals(Issue.Genre.INVALIDE, resoudre("/ps pokemon").genre);
    }

    @Test
    void sansSousCommande() {
        assertEquals(pokemon("pikachu"), ouvre("/ps Pikachu"));
        assertEquals(filtres("\"zone-7\"", "", "", ""), ouvre("/ps Zone 7"));
        assertEquals(Issue.Genre.INVALIDE, resoudre("/ps azertyuiop").genre);
    }

    // --- Zones -----------------------------------------------------------------

    @Test
    void zoneSeule() {
        String z1 = filtres("\"zone-1\"", "", "", "");
        assertEquals(z1, ouvre("/ps zone Zone01"));
        assertEquals(z1, ouvre("/ps zone Zone 1"));
        assertEquals(z1, ouvre("/ps zone zone-1"));
        assertEquals(z1, ouvre("/ps z zone 01"));
        assertEquals(filtres("\"zone-10\"", "", "", ""), ouvre("/ps zone Zone 10"));
        assertEquals(filtres("\"ocean\"", "", "", ""), ouvre("/ps zone Océan"));
        assertEquals(filtres("\"ocean\"", "", "", ""), ouvre("/ps zone ocean"));
        assertEquals(filtres("\"lac-rime\"", "", "", ""), ouvre("/ps zone Lac Rime"));
        assertEquals(filtres("\"bull-o\"", "", "", ""), ouvre("/ps zone Bull'o"));
    }

    @Test
    void sousZoneParSonNomComplet() {
        assertEquals(filtres("\"zone-1-eau\"", "", "", ""), ouvre("/ps zone Zone 1 Eau"));
        assertEquals(filtres("\"zone-1-eau\"", "", "", ""), ouvre("/ps zone Zone01 Eau"));
        assertEquals(filtres("\"bull-o-biome-cascade\"", "", "", ""), ouvre("/ps zone Bull'o Biome Cascade"));
    }

    @Test
    void raretes() {
        assertEquals(filtres("\"zone-1\"", "\"rare\"", "", ""), ouvre("/ps zone Zone01 rare Rare"));
        assertEquals(filtres("\"zone-1\"", "\"rare\",\"epique\"", "", ""), ouvre("/ps zone Zone01 rare Rare Epique"));
        assertEquals(filtres("\"zone-1\"", "\"commun\",\"rare\",\"epique\"", "", ""),
                ouvre("/ps zone Zone01 rare Commun Rare Epique"));
        assertEquals(filtres("\"zone-1\"", "\"peu-commun\",\"legendaire\"", "", ""),
                ouvre("/ps zone Zone01 rare Peu commun Légendaire"));
        // Dans l'ordre : « Commun Peu » n'est pas un « Peu commun » à l'envers.
        assertEquals(filtres("\"zone-1\"", "\"commun\",\"peu-commun\"", "", ""),
                ouvre("/ps zone Zone01 rare Commun Peu commun"));
        assertEquals(filtres("\"zone-1\"", "\"epique\"", "", ""), ouvre("/ps zone Zone01 rarete ÉPIQUE"));
        assertEquals(filtres("\"zone-1\"", "\"epique\"", "", ""), ouvre("/ps zone Zone01 rare epiq"));
        assertEquals(filtres("\"zone-1\"", "\"rare\"", "", ""), ouvre("/ps zone Zone01 rare 3"));
        // Une rareté en double ne compte qu'une fois.
        assertEquals(filtres("\"zone-1\"", "\"rare\"", "", ""), ouvre("/ps zone Zone01 rare Rare rare"));
    }

    @Test
    void typesEtGenerations() {
        assertEquals(filtres("\"zone-1\"", "", "\"Feu\",\"Dragon\"", ""), ouvre("/ps zone Zone01 type Feu Dragon"));
        assertEquals(filtres("\"zone-1\"", "", "\"Électrik\"", ""), ouvre("/ps zone Zone01 type electrique"));
        assertEquals(filtres("\"zone-1\"", "", "\"Ténèbres\",\"Fée\"", ""), ouvre("/ps zone Zone01 t tenebres fee"));
        assertEquals(filtres("\"zone-1\"", "", "", "1,2,4"), ouvre("/ps zone Zone01 generation 1 2 4"));
        assertEquals(filtres("\"zone-1\"", "", "", "1,2"), ouvre("/ps zone Zone01 gen 1,2"));
        assertEquals(filtres("\"zone-1\"", "", "", "3"), ouvre("/ps zone Zone01 g III"));
    }

    @Test
    void combinaisonComplete() {
        assertEquals(filtres("\"zone-1\"", "\"rare\",\"epique\"", "\"Feu\",\"Dragon\"", "1,3"),
                ouvre("/ps zone Zone01 rare Rare Epique type Feu Dragon generation 1 3"));
        assertEquals(filtres("\"zone-1\"", "\"rare\",\"epique\"", "\"Feu\"", "1,2"),
                ouvre("/ps zone Zone01 rare Rare Epique type Feu generation 1 2"));
        // Dans n'importe quel ordre.
        assertEquals(filtres("\"zone-1\"", "\"rare\"", "\"Feu\"", "2"),
                ouvre("/ps zone Zone 1 generation 2 type Feu rare Rare"));
    }

    @Test
    void sousZonesEnFiltre() {
        assertEquals(filtres("\"zone-1-eau\",\"zone-1-foret\"", "", "", ""),
                ouvre("/ps zone Zone01 sous-zone Eau Forêt"));
        assertEquals(filtres("\"zone-1-foret\"", "\"rare\"", "", ""),
                ouvre("/ps zone Zone01 sz foret rare Rare"));
        Issue i = resoudre("/ps zone Océan sous-zone Eau");
        assertEquals(Issue.Genre.INVALIDE, i.genre);
    }

    @Test
    void sansMotCleQuandCEstSansAmbiguite() {
        assertEquals(filtres("\"zone-1\"", "", "\"Feu\"", ""), ouvre("/ps zone Zone01 Feu"));
        assertEquals(filtres("\"zone-1\",\"zone-2\"", "", "", ""), ouvre("/ps zone Zone01 Zone02"));
        Issue i = resoudre("/ps zone Zone01 Bidule");
        assertEquals(Issue.Genre.INVALIDE, i.genre);
        assertTrue(i.detail.contains("Bidule"), i.detail);
    }

    @Test
    void erreursDeZone() {
        Issue inconnue = resoudre("/ps zone Zone99");
        assertEquals(Issue.Genre.INTROUVABLE, inconnue.genre);
        Issue ambigue = resoudre("/ps zone Zon rare Rare");
        assertEquals(Issue.Genre.AMBIGU, ambigue.genre);
        // Les filtres voyagent avec chaque proposition.
        assertEquals("[\"rare\"]", ambigue.choix.get(0).demande.json().get("raretes").toString());
        Issue rarete = resoudre("/ps zone Zone01 rare Epiqeu");
        assertEquals(Issue.Genre.INVALIDE, rarete.genre);
        assertEquals("rareté", rarete.sujet);
        assertTrue(rarete.detail.contains("Épique"), rarete.detail);
        assertEquals(Issue.Genre.INVALIDE, resoudre("/ps zone").genre);
        assertEquals(Issue.Genre.INVALIDE, resoudre("/ps zone Zone01 rare").genre);
        assertEquals(Issue.Genre.INVALIDE, resoudre("/ps zone rare Rare").genre);
        assertEquals(Issue.Genre.INVALIDE, resoudre("/ps zone Zone01 generation 9").genre);
    }

    @Test
    void pokedexFiltreSansZone() {
        assertEquals(filtres("", "\"legendaire\"", "\"Feu\"", ""), ouvre("/ps dex type Feu rare Légendaire"));
        assertEquals(filtres("\"zone-3\"", "", "\"Eau\"", ""), ouvre("/ps dex type Eau zone Zone 3"));
    }

    @Test
    void sansAccesAuPokedexDuServeur() {
        // Gson 2.8.0, celui de Minecraft 1.16.5, n'a pas encore deepCopy() public.
        JsonObject o = new com.google.gson.JsonParser().parse(Donnees.brut().toString()).getAsJsonObject();
        o.addProperty("pixelmonworld", false);
        Catalogue sans = Catalogue.lire(o);
        assertEquals(Issue.Genre.INACCESSIBLE, Resolveur.resoudre(Analyse.analyser("/ps zone Zone 1"), sans).genre);
        // Les fiches, elles, restent ouvertes à tous.
        assertEquals(Issue.Genre.OUVRIR, Resolveur.resoudre(Analyse.analyser("/ps pokemon Pikachu"), sans).genre);
    }
}
