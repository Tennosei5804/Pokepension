# -*- coding: utf-8 -*-
"""
Relevé des apparitions de Cobblemon, depuis le tableur communautaire.

    cd app && py outils/relever-cobblemon.py

Cobblemon est un mod : il n'a ni Poképédia ni Pokébip. Ses tables de spawn
vivent dans les fichiers JSON du mod, un par espèce, et personne ne les lit à
la main. La communauté en tient un tableur, tenu à jour version après version,
et c'est la seule source qui donne la ligne complète : biomes, niveaux,
rareté, moment de la journée, météo et manière de rencontrer.

    https://docs.google.com/spreadsheets/d/1DJT7Hd0ldgVUjJbN0kYQFAyNBP6JGG_Clkipax98x-g

Google Sheets l'exporte en CSV sans authentification tant que le partage reste
public. Si l'export tombe, la feuille a été fermée ou déplacée : il faudra en
retrouver l'adresse, pas contourner le refus.

Ce que le relevé produit, dans src/js/donnees-cobblemon.js :

    DONNEES_COBBLEMON = {
      genereLe, source,
      biomes:[...], raretes:[...], contextes:[...], temps:[...], meteos:[...],
      especes:{ "<id de forme>": [ ligne, ligne, ... ] }
    }

    ligne = [ [i biomes], [i biomes exclus], i rareté, niv. min, niv. max,
              i contexte, i temps, i météo, poids, i note ]

Les tables d'index sont là parce que les mêmes trente mots reviennent sur les
2 732 lignes : « Jungle » seul apparaît 240 fois. Sans elles, la réserve triple
de taille pour ne rien dire de plus.

--- Les deux choix de fond -------------------------------------------------

1. LA CLÉ EST LE NUMÉRO, PAS LE NOM. Le tableur écrit « Basculin », « Meowstic »,
   « Aegislash » quand l'application, qui suit PokeAPI, connaît
   basculin-red-striped, meowstic-male, aegislash-shield. Vingt-et-un noms sur
   874 tombaient à côté. La colonne « No. » est le numéro national : elle donne
   l'espèce sans ambiguïté, et les crochets — [Alolan], [Galarian], [Hisuian],
   [Paldean] — désignent la forme régionale par-dessus. Avec cette règle, les
   2 732 lignes trouvent leur forme, aucune perdue.

2. LES FORMES DE VALENCE REJOIGNENT L'ESPÈCE DE BASE. Cobblemon ajoute sept
   variantes [Valencian] — le Papilusion rose des Îles Orange du dessin animé —
   qui n'existent nulle part ailleurs et que l'application ne connaît donc pas.
   Les dix lignes ne sont pas jetées : elles rejoignent l'espèce de base avec
   une note qui dit ce qu'elles sont. Une ligne muette vaudrait mieux qu'un
   trou, une ligne étiquetée vaut mieux que les deux.

3. LES BIOMES SONT RÉSOLUS, PAS TRADUITS. Le tableur n'écrit pas des biomes
   mais des ÉTIQUETTES de Cobblemon — is_arid, is_temperate, is_overworld —,
   c'est-à-dire des familles. Les traduire au sens donnait « Régions arides »,
   ce qui ne dit à personne où aller. La table BIOMES plus bas les résout en
   biomes de Minecraft, sous leur nom français du jeu : « Désert, Savane,
   Badlands, Badlands boisées, Badlands érodées, Plateau de savane, Savane
   venteuse ». Voir le commentaire de la table pour les quatre sources et la
   cascade qui les relie.

   Trois conséquences que l'affichage doit porter :

     · une famille peut couvrir une dimension entière — « Overworld » vaut pour
       les 56 biomes de la surface. La portée le dit, et la fiche écrit
       « Partout en surface » plutôt que d'énumérer ;
     · vingt-quatre étiquettes ne recouvrent AUCUN biome du jeu de base : île
       tropicale, zone volcanique, source chaude, Aether, Bumblezone. Elles
       n'existent qu'avec un mod de biomes, et la fiche le dit — sans quoi on
       chercherait un lieu qui n'est pas dans la partie ;
     · une même ligne cite souvent deux familles qui se recouvrent. « Arid,
       Sandy » nomme deux familles mais un seul Désert : les biomes sont
       dédoublonnés.
"""

import csv
import io
import json
import os
import re
import sys
import unicodedata
import urllib.request
from collections import defaultdict

FEUILLE = ('https://docs.google.com/spreadsheets/d/'
           '1DJT7Hd0ldgVUjJbN0kYQFAyNBP6JGG_Clkipax98x-g/export?format=csv&gid=0')

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
SORTIE = os.path.join(RACINE, 'src', 'js', 'donnees-cobblemon.js')
EMBARQUEES = os.path.join(RACINE, 'src', 'js', 'donnees-embarquees.js')


# --- Les biomes -------------------------------------------------------------
#
# CE NE SONT PAS DES TRADUCTIONS AU SENS. Chaque etiquette du tableur est un
# TAG de Cobblemon — is_arid, is_temperate, is_overworld —, c'est-a-dire une
# famille de biomes, et non un lieu. « Regions arides » ne dit a personne ou
# aller ; « Desert, Savane, Badlands » si.
#
# La table donne donc, pour chaque etiquette : son libelle de famille, sa
# portee, et LA LISTE EXACTE DES BIOMES VANILLE qu'elle recouvre, sous leur nom
# francais officiel. Elle a ete resolue mecaniquement, pas ecrite a la main :
#
#   1. les tags de Cobblemon, depuis le depot du mod (GitLab, cable-mc/cobblemon,
#      common/src/main/resources/data/cobblemon/tags/worldgen/biome) ;
#   2. les tags de Minecraft qu'ils referencent — #minecraft:is_forest et
#      consorts —, depuis le miroir des donnees vanille (misode/mcmeta) ;
#   3. les tags conventionnels #c:is_*, que ni l'un ni l'autre ne definit,
#      depuis NeoForge, qui les genere et les versionne ;
#   4. les noms francais, sur fr.minecraft.wiki/w/Biome.
#
# Le graphe se resout en cascade : is_arid renvoie a is_badlands, is_desert et
# is_savanna, qui renvoient a #minecraft:is_badlands et #c:is_desert, qui
# nomment enfin des biomes. Sans la troisieme source, la moitie des familles
# tombaient a zero biome — is_jungle ne delegue qu'a des tags.
#
# La portee : 0 pour une famille ordinaire, 1 pour la surface entiere, 2 pour
# le Nether entier, 3 pour l'End. « Overworld » recouvre les 56 biomes de la
# surface : les enumerer serait exact et illisible, « partout » est aussi exact
# et se lit.
#
# UNE LISTE VIDE AVEC UNE PORTEE DE 0 N'EST PAS UN OUBLI. Vingt-quatre
# etiquettes ne recouvrent AUCUN biome vanille : les unes viennent d'autres
# mods (l'Aether, la Bumblezone), les autres sont des familles que Cobblemon
# prevoit sans que Minecraft ait de quoi les remplir — il n'y a ni volcan, ni
# ile tropicale, ni source chaude dans le jeu de base. Un Pokemon qui n'a que
# « Tropical Island » n'apparait donc nulle part sans mod de biomes, et la
# fiche doit le dire plutot que de laisser chercher.
#
#
# QUATRIEME ELEMENT : les biomes MODDES, groupes par mod, pour les etiquettes
# qui ne recouvrent rien de vanille. « Iles tropicales » n'est pas un cul-de-sac :
# le tag liste biomesoplenty:tropics et trois biomes de Wythers. Les nommer dit
# quoi installer ; s'arreter au nom de famille ne disait rien du tout.
#
# Douze des vingt-quatre familles hors-jeu se resolvent ainsi. Les douze autres
# ne sont pas des familles mais des NOMS DE BIOMES que le tableur ecrit en
# clair, venus de mods que Cobblemon ne balise pas : leur libelle EST le nom du
# biome, garde en anglais parce que c'est sous ce nom qu'on le trouve.
#
# CINQUIEME ET SIXIEME ELEMENTS : le mod requis, et la condition de bloc.
#
# Le mod requis est releve dans les fichiers de spawn de Cobblemon, pas devine —
# 0376_metagross.json cite #aether:is_aether et the_bumblezone:howling_constructs,
# 0010_caterpie.json cite aether:skyroot_forest et the_bumblezone:floral_meadow.
# La fiche ecrit alors « The Aether requis » plutot que « mod de biomes requis ».
# Trois etiquettes restent sans mod nommable et gardent la pastille generique.
#
# La condition de bloc ne concerne qu'une etiquette : « Muddy » n'est pas un
# biome mais #cobblemon:has_block/mud, une condition sur le SOL. On creuse de la
# boue partout, et la ranger parmi celles qui demandent un mod etait faux : ses
# dix lignes s'affichaient « nulle part sans mod » alors qu'elles couvrent la
# surface entiere. Elle devient une pastille, comme « Sous terre ».
#
# Pour refaire la table apres une mise a jour du mod : les quatre sources
# ci-dessus, resolues en cascade. Rien ici ne se devine.

BIOMES = {
    'Aether':              ('Toute la dimension', 0, [], [], 'The Aether', ''),
    'Arid':                ('Régions arides', 0,
     ['Badlands', 'Badlands boisées', 'Badlands érodées', 'Désert', 'Plateau de savane', 'Savane', 'Savane venteuse'], [], '', ''),
    'Badlands':            ('Badlands', 0,
     ['Badlands', 'Badlands boisées', 'Badlands érodées'], [], '', ''),
    'Bamboo':              ('Jungles de bambous', 0,
     ['Jungle de bambous'], [], '', ''),
    'Beach':               ('Plages', 0,
     ['Plage', 'Plage enneigée'], [], '', ''),
    'Bumblezone':          ('Toute la dimension', 0, [], [], 'The Bumblezone', ''),
    'Cherry Blossom':      ('Cerisaies', 0,
     ['Bosquet de cerisiers'], [], '', ''),
    'Coast':               ('Littoral', 0,
     ['Côte rocheuse', 'Plage', 'Plage enneigée'], [], '', ''),
    'Cold':                ('Régions froides', 0,
     ['Bosquet', 'Océan froid', 'Océan froid profond', 'Océan gelé', 'Océan gelé profond', 'Pentes enneigées', 'Pics dentelés', 'Pics gelés', 'Pics rocheux', 'Plage enneigée', 'Plaines enneigées', 'Rivière gelée', 'Stalagmites de glace', 'Taïga', 'Taïga ancienne de pins', 'Taïga ancienne de sapins', 'Taïga enneigée'], [], '', ''),
    'Cold Ocean':          ('Océans froids', 0,
     ['Océan froid', 'Océan froid profond'], [], '', ''),
    'Crystal Canyon':      ('Crystal Canyon', 0, [], [], 'The Bumblezone', ''),
    'Crystalline Chasm':   ('Crystalline Chasm', 0,
     [],
     [['Biomes O\' Plenty', ['Crystalline Chasm']]], '', ''),
    'Deep Dark':           ('Abîmes', 0,
     ['Abîmes'], [], '', ''),
    'Deep Ocean':          ('Océans profonds', 0,
     ['Océan froid profond', 'Océan gelé profond', 'Océan profond', 'Océan tiède profond'], [], '', ''),
    'Desert':              ('Déserts', 0,
     ['Désert'], [], '', ''),
    'Dripstone':           ('Grottes de concrétions', 0,
     ['Cavernes de spéléothèmes'], [], '', ''),
    'End':                 ('Partout dans l\'End', 3, [], [], '', ''),
    'Floral':              ('Zones fleuries', 0,
     ['Bosquet de cerisiers', 'Forêt fleurie', 'Plaines de tournesols', 'Prairie'], [], '', ''),
    'Floral Meadow':       ('Floral Meadow', 0, [], [], 'The Bumblezone', ''),
    'Forest':              ('Forêts', 0,
     ['Bosquet', 'Bosquet de cerisiers', 'Forêt', 'Forêt ambrée', 'Forêt ancienne de bouleaux', 'Forêt de bouleaux', 'Forêt fleurie', 'Forêt sombre', 'Jardin pâle'], [], '', ''),
    'Freezing':            ('Régions glaciales', 0,
     ['Bosquet', 'Océan gelé', 'Océan gelé profond', 'Pentes enneigées', 'Pics dentelés', 'Pics gelés', 'Plage enneigée', 'Plaines enneigées', 'Rivière gelée', 'Stalagmites de glace', 'Taïga enneigée'], [], '', ''),
    'Freshwater':          ('Eaux douces', 0,
     ['Marais', 'Marais à mangroves', 'Rivière', 'Rivière gelée'], [], '', ''),
    'Frozen Ocean':        ('Océans gelés', 0,
     ['Océan gelé', 'Océan gelé profond'], [], '', ''),
    'Frozen River':        ('Rivière gelée', 0,
     ['Rivière gelée'], [], '', ''),
    'Glacial':             ('Glaciers', 0,
     ['Pics gelés', 'Stalagmites de glace'], [], '', ''),
    'Grassland':           ('Prairies', 0,
     ['Plaines', 'Plaines de tournesols', 'Plateau de savane', 'Prairie', 'Savane', 'Savane venteuse'], [], '', ''),
    'Highlands':           ('Hautes terres', 0,
     ['Prairie'], [], '', ''),
    'Hills':               ('Collines', 0,
     ['Collines graveleuses venteuses', 'Collines venteuses', 'Forêt venteuse', 'Prairie', 'Savane venteuse'], [], '', ''),
    'Howling Constructs':  ('Howling Constructs', 0, [], [], 'The Bumblezone', ''),
    'Island':              ('Îles', 0,
     ['Champs de champignons'], [], '', ''),
    'Jungle':              ('Jungles', 0,
     ['Jungle', 'Jungle clairsemée', 'Jungle de bambous'], [], '', ''),
    'Lukewarm Ocean':      ('Océans tièdes', 0,
     ['Océan tiède', 'Océan tiède profond'], [], '', ''),
    'Lush':                ('Régions luxuriantes', 0,
     ['Cavernes luxuriantes'], [], '', ''),
    'Magical':             ('Biomes magiques', 0,
     ['Forêt sombre'], [], '', ''),
    'Mountain':            ('Montagnes', 0,
     ['Bosquet de cerisiers', 'Collines graveleuses venteuses', 'Collines venteuses', 'Forêt venteuse', 'Pentes enneigées', 'Pics dentelés', 'Pics gelés', 'Pics rocheux', 'Prairie', 'Savane venteuse'], [], '', ''),
    'Muddy':               ('Zones boueuses', 1, [], [], '', 'Sur la boue'),
    'Mushroom':            ('Biomes à champignons', 0,
     ['Champs de champignons', 'Forêt sombre'], [], '', ''),
    'Mushroom Fields':     ('Champs de champignons', 0,
     ['Champs de champignons'], [], '', ''),
    'Nether':              ('Partout dans le Nether', 2, [], [], '', ''),
    'Nether Basalt':       ('Deltas de basalte', 0,
     ['Deltas de basalte'], [], '', ''),
    'Nether Crimson':      ('Forêt carmin', 0,
     ['Forêt carmin'], [], '', ''),
    'Nether Desert':       ('Déserts du Nether', 0,
     ['Vallée des âmes'], [], '', ''),
    'Nether Forest':       ('Forêts du Nether', 0,
     [],
     [['Better Nether', ['Nether Jungle', 'Nether Swampland', 'Nether Swampland Terraces', 'Old Swampland', 'Upside Down Forest']]], '', ''),
    # AUCUN MOD, ET CE N'EST PAS UN OUBLI. La documentation de tags de
    # Cobblemon 1.6.1 ne connait pas de tag Nether « frozen » : ses tags de
    # Nether sont is_toxic, is_crimson, is_forest et is_overgrowth. Le
    # tableur porte donc une etiquette que le mod ne definit plus, et
    # aucun biome, moddé ou non, ne la remplit. Verifie le 7 septembre 2026.
    # La laisser vide est la reponse juste : lui inventer un mod ferait
    # installer quelque chose qui ne changerait rien.
    'Nether Frozen':       ('Nether gelé', 0, [], [], '', ''),
    'Nether Fungus':       ('Forêts fongiques du Nether', 0,
     ['Forêt biscornue', 'Forêt carmin'], [], '', ''),
    'Nether Mountain':     ('Montagnes du Nether', 0,
     ['Deltas de basalte'], [], '', ''),
    'Nether Overgrowth':   ('Nether luxuriant', 0,
     [],
     [['Better Nether', ['Bone Reef', 'Nether Grasslands', 'Soul Plain', 'Sulfuric Bone Reef', 'Upside Down Forest', 'Upside Down Forest Cleared']], ['Biomes O\' Plenty', ['Overgrowth']], ['Nether Descent', ['Sythian Torrids']]], '', ''),
    'Nether Quartz':       ('Filons de quartz du Nether', 0,
     [],
     [['Cinderscapes', ['Quartz Cavern']], ['Incendium', ['Quartz Flats']]], '', ''),
    'Nether Soul Fire':    ('Feu des âmes', 0,
     ['Vallée des âmes'], [], '', ''),
    'Nether Soul Sand':    ('Vallée des âmes', 0,
     ['Vallée des âmes'], [], '', ''),
    'Nether Toxic':        ('Nether toxique', 0,
     [],
     [['Biomes O\' Plenty', ['Erupting Inferno']], ['Incendium', ['Toxic Heap']], ['Nether Descent', ['Wailing Garth']]], '', ''),
    'Nether Warped':       ('Forêt biscornue', 0,
     ['Forêt biscornue'], [], '', ''),
    'Nether Wasteland':    ('Terres désolées du Nether', 0,
     ['Terres désolées du Nether'], [], '', ''),
    'Ocean':               ('Océans', 0,
     ['Océan', 'Océan chaud', 'Océan froid', 'Océan froid profond', 'Océan gelé', 'Océan gelé profond', 'Océan profond', 'Océan tiède', 'Océan tiède profond'], [], '', ''),
    'Overworld':           ('Partout en surface', 1, [], [], '', ''),
    'Peak':                ('Sommets', 0,
     ['Pentes enneigées', 'Pics dentelés', 'Pics gelés', 'Pics rocheux'], [], '', ''),
    'Plains':              ('Plaines', 0,
     ['Plaines', 'Plaines de tournesols', 'Prairie'], [], '', ''),
    'Plateau':             ('Plateaux', 0,
     ['Badlands boisées', 'Bosquet de cerisiers', 'Plateau de savane', 'Prairie'], [], '', ''),
    'Pollinated Fields':   ('Pollinated Fields', 0, [], [], 'The Bumblezone', ''),
    'River':               ('Rivières', 0,
     ['Rivière', 'Rivière gelée'], [], '', ''),
    'Sandy':               ('Zones sableuses', 0,
     ['Badlands', 'Badlands boisées', 'Badlands érodées', 'Désert', 'Plage'], [], '', ''),
    'Savanna':             ('Savanes', 0,
     ['Plateau de savane', 'Savane', 'Savane venteuse'], [], '', ''),
    'Shrubland':           ('Broussailles', 0,
     [],
     [['Biomes O\' Plenty', ['Bog', 'Dryland', 'Field', 'Fungal Jungle', 'Lush Desert', 'Mediterranean Forest', 'Pumpkin Patch', 'Rocky Shrubland', 'Scrubland', 'Shrubland']], ['Blooming Biosphere', ['Chaparral']], ['Clifftree', ['Shrubland']], ['Oh The Biomes We\'ve Gone', ['Firecracker Chaparral', 'Sierra Badlands']], ['Terralith', ['Alpine Highlands', 'Arid Highlands', 'Brushland', 'Cold Shrubland', 'Hot Shrubland', 'Rocky Shrubland', 'Shrubland']], ['Wythers', ['Berry Bog', 'Chaparral', 'Crimson Tundra', 'Dry Tropical Grassland', 'Eucalyptus Salubris Woodland', 'Forest Edge', 'Kwongan Heath', 'Mediterranean Island', 'Outback', 'Scrub Forest', 'Scrubland', 'Tropical Grassland', 'Tundra']]], '', ''),
    'Sky':                 ('En plein ciel', 0,
     [],
     [['Terralith', ['Skylands Autumn', 'Skylands Spring', 'Skylands Summer', 'Skylands Winter']]], '', ''),
    'Skyroot Forest':      ('Skyroot Forest', 0, [], [], 'The Aether', ''),
    'Skyroot Grove':       ('Skyroot Grove', 0, [], [], 'The Aether', ''),
    'Skyroot Meadow':      ('Skyroot Meadow', 0, [], [], 'The Aether', ''),
    'Skyroot Woodland':    ('Skyroot Woodland', 0, [], [], 'The Aether', ''),
    'Snowy':               ('Régions enneigées', 0,
     ['Bosquet', 'Pentes enneigées', 'Pics dentelés', 'Pics gelés', 'Plage enneigée', 'Plaines enneigées', 'Stalagmites de glace', 'Taïga enneigée'], [], '', ''),
    'Snowy Beach':         ('Plage enneigée', 0,
     ['Plage enneigée'], [], '', ''),
    'Snowy Forest':        ('Forêts enneigées', 0,
     [],
     [['Biomes O\' Plenty', ['Auroral Garden', 'Muskeg', 'Snowy Maple Woods']], ['Blooming Biosphere', ['Snowy Cherry Grove']], ['Terralith', ['Alpha Islands Winter', 'Ice Marsh', 'Siberian Grove', 'Snowy Cherry Grove', 'Snowy Maple Forest']], ['Wythers', ['Huangshan Highlands', 'Jade Highlands', 'Snowy Fen']]], '', ''),
    'Snowy Taiga':         ('Taïgas enneigées', 0,
     ['Bosquet', 'Taïga enneigée'], [], '', ''),
    'Spooky':              ('Biomes lugubres', 0,
     ['Abîmes', 'Forêt sombre', 'Jardin pâle'], [], '', ''),
    'Sunflower Plains':    ('Plaines de tournesols', 0,
     ['Plaines de tournesols'], [], '', ''),
    'Swamp':               ('Marais', 0,
     ['Marais', 'Marais à mangroves'], [], '', ''),
    'Taiga':               ('Taïgas', 0,
     ['Bosquet', 'Taïga', 'Taïga ancienne de pins', 'Taïga ancienne de sapins', 'Taïga enneigée'], [], '', ''),
    'Temperate':           ('Régions tempérées', 0,
     ['Bosquet', 'Bosquet de cerisiers', 'Forêt', 'Forêt ambrée', 'Forêt ancienne de bouleaux', 'Forêt de bouleaux', 'Forêt fleurie', 'Forêt sombre', 'Jardin pâle', 'Plaines', 'Plaines de tournesols', 'Prairie'], [], '', ''),
    'Temperate Ocean':     ('Océans tempérés', 0,
     ['Océan', 'Océan profond'], [], '', ''),
    'Thermal':             ('Zones thermales', 0,
     [],
     [['Biomes O\' Plenty', ['Hot Springs']], ['Clifftree', ['Inferno']], ['Terralith', ['Caldera', 'Thermal Caves', 'Yellowstone']], ['Wythers', ['Calcite Caverns', 'Danakil Desert', 'Mediterranean Island Thermal Springs', 'Snowy Thermal Taiga', 'Thermal Taiga', 'Thermal Taiga Crags', 'Tibesti Mountains']]], '', ''),
    'Tropical Island':     ('Îles tropicales', 0,
     [],
     [['Biomes O\' Plenty', ['Tropics']], ['Wythers', ['Tropical Beach', 'Tropical Island', 'Tropical Volcano']]], '', ''),
    'Tundra':              ('Toundras', 0,
     ['Plaines enneigées', 'Stalagmites de glace'], [], '', ''),
    'Volcanic':            ('Zones volcaniques', 0,
     [],
     [['Biomes O\' Plenty', ['Volcanic Plains', 'Volcano']], ['Terralith', ['Mantle Caves', 'Volcanic Crater', 'Volcanic Peaks']], ['The Darker Depths', ['Molten Cavern']], ['Wythers', ['Icy Volcano', 'Tropical Volcano', 'Volcanic Chamber', 'Volcanic Crater', 'Volcano']]], '', ''),
    'Warm Ocean':          ('Océans chauds', 0,
     ['Océan chaud'], [], '', ''),
    # byg:warped_desert, releve le 7 septembre 2026 dans
    # docs/cobblemon-tags/1.6.1/BiomeTags.md du depot Cobblemon : le biome
    # est cite sous #cobblemon:is_warped et sous nether/is_soul_fire.
    'Warped Desert':       ('Warped Desert', 0, [],
     [["Oh The Biomes We've Gone", ['Warped Desert']]], '', ''),
}

# Le reste du vocabulaire. Les valeurs vides du tableur veulent dire « aucune
# condition » : elles rejoignent « any », qui ne s'affiche pas.
RARETES_FR = {
    'common':     'Commun',
    'uncommon':   'Peu commun',
    'rare':       'Rare',
    'ultra-rare': 'Très rare',
}

CONTEXTES_FR = {
    'grounded':  'Au sol',
    'fishing':   'À la canne',
    'submerged': 'Sous l\'eau',
    'surface':   'À la surface de l\'eau',
    'seafloor':  'Au fond de l\'eau',
}

TEMPS_FR = {
    'day':   'Le jour',
    'night': 'La nuit',
    'dusk':  'Au crépuscule',
}

METEOS_FR = {
    'clear': 'Par temps clair',
    'rain':  'Sous la pluie',
}

# La colonne « Presets » mêle deux choses. Trois valeurs sur vingt-sept ne
# disent rien d'un lieu — Natural (1 518 lignes), Water (415) et Wild (267)
# nomment la façon dont le mod compose la table, pas où l'on se trouve ; la
# colonne « Context » le dit déjà mieux. Les vingt-quatre autres, elles,
# nomment une STRUCTURE, et c'est le seul endroit du tableur qui réponde à
# « où » comme le ferait une carte : dans les arbres, dans un village, au fond
# d'un manoir. C'est ce qui se rapproche le plus d'une Route 8.
STRUCTURES_FR = {
    'Treetop':            'Dans les arbres',
    'Foliage':            'Dans le feuillage',
    'Urban':              'Dans les villages',
    'Mansion':            'Dans les manoirs',
    'Mansion_Dining':     'Salle à manger des manoirs',
    'Mansion_Bedrooms':   'Chambres des manoirs',
    'Derelict':           'Dans les ruines',
    'Jungle_Pyramid':     'Temple de la jungle',
    'Desert_Pyramid':     'Temple du désert',
    'Trail_Ruins':        'Ruines du sentier',
    'Ocean_Ruins':        'Ruines englouties',
    'Ocean_Monument':     'Monument sous-marin',
    'Ruined_Portal':      'Portail en ruine',
    'Stronghold':         'Forteresse',
    'Ancient_City':       'Cité antique',
    'End_City':           "Cité de l'End",
    'Pillager_Outpost':   'Avant-poste de pillards',
    'Illager_Structures': 'Repaires d\'illageois',
    'Nether_Structures':  'Structures du Nether',
    'Nether_Fossil':      'Fossiles du Nether',
    'Redstone':           'Près de la redstone',
    'Webs':               'Dans les toiles',
    'Lava':               'Près de la lave',
    'Salt':               'Dans le sel',
}

# Ce que le mod appelle « Natural », « Water » et « Wild » : la manière de
# composer la table, pas un lieu. Écartées sans bruit.
PRESETS_SANS_LIEU = {'Natural', 'Water', 'Wild'}

# Les trois mondes. « Deltas de basalte » ne dit pas de lui-même qu'il faut
# construire un portail, et « Terres stériles de l'End » encore moins qu'il faut
# d'abord battre le dragon. C'est pourtant la première chose à savoir : le biome
# répond à « où dans le monde », la dimension à « dans quel monde ».
#
# Aucune ligne du relevé n'en mélange deux — vérifié sur les 2 640 : 2 258 en
# surface, 93 dans le Nether, 15 dans l'End, et 274 qui ne tiennent qu'avec un
# mod. Une seule dimension par ligne, donc, et pas une liste.
BIOMES_NETHER = {'Deltas de basalte', 'Forêt carmin', 'Forêt biscornue',
                 'Terres désolées du Nether', 'Vallée des âmes'}
BIOMES_END = {"L'End", "Petites îles de l'End", "Terres moyennes de l'End",
              "Hautes terres de l'End", "Terres stériles de l'End"}

SURFACE, NETHER, END, AILLEURS = 0, 1, 2, -1


def dimension_de(noms_biomes, portee):
    if portee == 2 or (noms_biomes & BIOMES_NETHER):
        return NETHER
    if portee == 3 or (noms_biomes & BIOMES_END):
        return END
    if portee == 1 or noms_biomes:
        return SURFACE
    return AILLEURS

REGIONS = {'Alolan': 'alola', 'Galarian': 'galar',
           'Hisuian': 'hisui', 'Paldean': 'paldea'}

NOTE_VALENCE = 'Forme de Valence, propre à Cobblemon'

# La colonne « Patternkey=Value » porte ce qui distingue deux lignes d'une même
# espèce. Soixante-treize valeurs, de trois natures :
#
#   · celles qui désignent une forme que l'application connaît — quatre
#     familles. Sans elles, les vingt-huit lignes de Bascoeur s'entassent
#     toutes sur la forme rouge, et les motifs bleu et blanc n'existent plus ;
#   · region_bias, qui ne dit rien de la forme apparue mais de celle en
#     laquelle elle évoluera : un Sorbébé de Hisui donne un Muplodocus de
#     Hisui. Personne ne peut le deviner en jeu, c'est donc une note ;
#   · tout le reste — les motifs de Magicarpe, les taches de Spinda, les
#     lettres de Zarbi, les ailes de Prismillon. Cobblemon les distingue,
#     l'application non : les lignes fusionnent au lieu de se répéter.
FORMES_PAR_PATRON = {
    'striped=red':                'basculin-red-striped',
    'striped=blue':               'basculin-blue-striped',
    'striped=white':              'basculin-white-striped',
    'maushold_family=three':      'maushold-family-of-three',
    'maushold_family=four':       'maushold-family-of-four',
    'landsnake_form=two-segment':   'dudunsparce-two-segment',
    'landsnake_form=three-segment': 'dudunsparce-three-segment',
    'paldean bull_breed=combat':  'tauros-paldea-combat-breed',
    'paldean bull_breed=blaze':   'tauros-paldea-blaze-breed',
    'paldean bull_breed=aqua':    'tauros-paldea-aqua-breed',
}

BIAIS_REGIONAL = {
    'region_bias=alola': "Évoluera en forme d'Alola",
    'region_bias=galar': 'Évoluera en forme de Galar',
    'region_bias=hisui': 'Évoluera en forme de Hisui',
    'region_bias=paldea': 'Évoluera en forme de Paldea',
}


def sans_accent(texte):
    plat = unicodedata.normalize('NFKD', texte).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]', '', plat.lower())


def lire_entrees():
    """Les formes de l'application, telles que la réserve embarquée les tient."""
    with io.open(EMBARQUEES, encoding='utf-8') as f:
        texte = f.read()
    depart = texte.find('{', texte.find('DONNEES_EMBARQUEES'))
    return json.loads(texte[depart:].rstrip().rstrip(';'))['entrees']


def table_des_formes(entrees):
    par_nom = {}
    par_espece = defaultdict(list)
    for e in entrees:
        par_nom.setdefault(sans_accent(e['name']), e)
        par_espece[e['speciesId']].append(e)
    return par_nom, par_espece


def forme_de(no, nom, patron, par_nom, par_espece):
    """La forme visée par une ligne du tableur, ou None.

    Le numéro donne l'espèce ; les crochets choisissent la forme régionale, et
    la colonne des motifs la forme interne quand l'application la distingue.
    Renvoie aussi la note à porter sur la ligne — ce que le mod sait et que
    l'application ne peut pas ranger ailleurs.
    """
    espece = int(no)
    crochet = re.match(r'^(.*?)\s*\[(.+)\]$', nom)
    liste = par_espece.get(espece, [])
    patron = (patron or '').strip()

    if patron in FORMES_PAR_PATRON:
        exact = par_nom.get(sans_accent(FORMES_PAR_PATRON[patron]))
        if exact:
            return exact, None
    note = BIAIS_REGIONAL.get(patron)

    if crochet:
        base, forme = crochet.group(1), crochet.group(2)
        if forme in REGIONS:
            suffixe = '-' + REGIONS[forme]
            for e in liste:
                if e['name'].endswith(suffixe):
                    return e, note
            # Forme régionale annoncée par le mod, absente de l'application :
            # on la rattache à l'espèce en le disant.
            return (liste[0] if liste else None), 'Forme de ' + forme
        if forme == 'Valencian':
            return (liste[0] if liste else None), NOTE_VALENCE
        exact = par_nom.get(sans_accent(base + forme))
        if exact:
            return exact, note
    return (liste[0] if liste else None), note


class Table(object):
    """Une table d'index qui garde l'ordre d'arrivée."""

    def __init__(self):
        self.valeurs = []
        self.rang = {}

    def index(self, valeur):
        if valeur not in self.rang:
            self.rang[valeur] = len(self.valeurs)
            self.valeurs.append(valeur)
        return self.rang[valeur]


def nombre(texte, defaut=0):
    try:
        return round(float(texte.strip()), 3)
    except (ValueError, AttributeError):
        return defaut


def telecharger():
    print('Téléchargement de la feuille…')
    requete = urllib.request.Request(FEUILLE, headers={'User-Agent': 'PokeArchive/1.0'})
    with urllib.request.urlopen(requete, timeout=60) as reponse:
        brut = reponse.read()
    print('  %d octets reçus.' % len(brut))
    return brut.decode('utf-8')


def relever(csv_texte):
    entrees = lire_entrees()
    par_nom, par_espece = table_des_formes(entrees)

    biomes = Table()
    familles_t = Table()
    familles_mod = {}
    familles_requis = {}
    raretes = Table()
    contextes = Table()
    temps = Table()
    meteos = Table()
    notes = Table()
    structures = Table()
    especes = defaultdict(list)

    # Les quatre petites tables sont semées d'avance, dans leur ordre naturel :
    # la fiche trie les apparitions par indice de rareté, du plus commun au plus
    # rare. Semées au fil des lignes, l'ordre aurait été celui du tableur —
    # Bulbizarre ouvre le bal en « ultra-rare », qui serait devenu l'indice 0.
    # Deux relevés d'affilée donnent aussi le même fichier, ce qui rend visible
    # tout vrai changement de la feuille.
    for valeur in ['common', 'uncommon', 'rare', 'ultra-rare']:
        raretes.index(RARETES_FR[valeur])
    for valeur in ['grounded', 'surface', 'submerged', 'seafloor', 'fishing']:
        contextes.index(CONTEXTES_FR[valeur])
    for valeur in ['day', 'dusk', 'night']:
        temps.index(TEMPS_FR[valeur])
    for valeur in ['clear', 'rain']:
        meteos.index(METEOS_FR[valeur])

    inconnus = set()
    presets_inconnus = set()
    sans_forme = []
    lignes = list(csv.DictReader(io.StringIO(csv_texte)))

    for ligne in lignes:
        cible, note = forme_de(ligne['No.'], ligne['Pokémon'].strip(),
                               ligne.get('Patternkey=Value'), par_nom, par_espece)
        if not cible:
            sans_forme.append(ligne['Pokémon'])
            continue

        def indices_biomes(colonne):
            """Les biomes exacts d'une colonne, ses familles hors-jeu, sa portée.

            Une ligne cite des familles ; on rend les BIOMES qu'elles
            recouvrent, dédoublonnés — « Arid, Sandy » nomme deux familles mais
            un seul Désert.

            Ne restent en familles que celles qui ne recouvrent AUCUN biome du
            jeu de base. Ce n'est pas un reliquat : c'est la seule information
            que la liste exacte ne peut pas porter. Le Pikachu des plages
            apparaît aussi sur les îles tropicales et dans les forêts de
            l'Aether — Minecraft n'a ni l'une ni l'autre, et sans cette liste
            la fiche laisserait croire qu'il n'y a que la plage.
            """
            exacts, hors_jeu, portee, conditions = [], [], 0, []
            for brut in ligne[colonne].split(','):
                brut = brut.strip()
                if not brut:
                    continue
                if brut not in BIOMES:
                    inconnus.add(brut)
                    continue
                libelle, sa_portee, ses_biomes, ses_mods, requis, bloc = BIOMES[brut]
                portee = max(portee, sa_portee)
                # Une condition sur le sol, pas sur le monde : elle rejoint les
                # pastilles plutôt que les lieux. Voir « Muddy » dans la table.
                # Rendue par colonne : dans « Biomes » elle devient « Sur la
                # boue », dans « Excluded Biomes » elle rejoint le « sauf ».
                # Sur les vingt-quatre lignes de Barloche, dix la posent et
                # quatorze l'excluent — les confondre inversait la moitié.
                if bloc and bloc not in conditions:
                    conditions.append(bloc)
                if not ses_biomes and not sa_portee:
                    hors_jeu.append(familles_t.index(libelle))
                    familles_mod[libelle] = ses_mods
                    familles_requis[libelle] = requis
                for b in ses_biomes:
                    i = biomes.index(b)
                    if i not in exacts:
                        exacts.append(i)
            return sorted(exacts), sorted(set(hors_jeu)), portee, conditions

        rarete = ligne['Bucket'].strip()
        contexte = ligne['Context'].strip()
        moment = ligne['Time'].strip()
        meteo = ligne['Weather'].strip()

        lieux_batis = []
        for brut in ligne['Presets'].split(','):
            brut = brut.strip()
            if not brut or brut in PRESETS_SANS_LIEU:
                continue
            if brut not in STRUCTURES_FR:
                presets_inconnus.add(brut)
                continue
            lieux_batis.append(structures.index(STRUCTURES_FR[brut]))

        # « canSeeSky = FALSE » : le mod ne le fait apparaître que là où le ciel
        # ne se voit pas — sous terre, en grotte, à couvert. C'est une réponse à
        # « où », et la seule que la colonne des biomes ne peut pas donner : on
        # creuse dans tous les biomes. « TRUE » est l'inverse, mais c'est le cas
        # ordinaire, et le dire à 346 lignes n'apprendrait rien.
        souterrain = 1 if ligne['canSeeSky'].strip().upper() == 'FALSE' else 0

        ou, hors_jeu, portee, conditions = indices_biomes('Biomes')
        sauf, hors_jeu_exclus, _, conditions_exclues = indices_biomes('Excluded Biomes')
        for mot in conditions:
            i = structures.index(mot)
            if i not in lieux_batis:
                lieux_batis.append(i)
        for mot in conditions_exclues:
            i = familles_t.index(mot)
            familles_mod.setdefault(mot, [])
            familles_requis.setdefault(mot, '')
            if i not in hors_jeu_exclus:
                hors_jeu_exclus.append(i)

        especes[str(cible['id'])].append([
            ou,
            sauf,
            raretes.index(RARETES_FR[rarete]) if rarete in RARETES_FR else -1,
            int(nombre(ligne['Lv. Min'])),
            int(nombre(ligne['Lv. Max'])),
            contextes.index(CONTEXTES_FR[contexte]) if contexte in CONTEXTES_FR else -1,
            temps.index(TEMPS_FR[moment]) if moment in TEMPS_FR else -1,
            meteos.index(METEOS_FR[meteo]) if meteo in METEOS_FR else -1,
            nombre(ligne['Weight']),
            notes.index(note) if note else -1,
            lieux_batis,
            souterrain,
            hors_jeu,
            hors_jeu_exclus,
            portee,
            dimension_de({biomes.valeurs[i] for i in ou}, portee),
        ])

    # Un biome que la table ne connaît pas, c'est une ligne muette dans la
    # fiche : le mod en a ajouté un, ou le tableur l'a renommé. On refuse
    # d'écrire plutôt que de livrer un relevé troué en silence.
    if inconnus:
        print('\nÉtiquettes inconnues — à résoudre et à ajouter dans BIOMES :')
        for nom in sorted(inconnus):
            print('   ', nom)
        raise SystemExit('Relevé interrompu : %d biome(s) inconnu(s).' % len(inconnus))

    if presets_inconnus:
        print('\nStructures sans traduction — à ajouter dans STRUCTURES_FR, ou')
        print('à écarter dans PRESETS_SANS_LIEU si ce n\'est pas un lieu :')
        for nom in sorted(presets_inconnus):
            print('   ', nom)
        raise SystemExit('Relevé interrompu : %d structure(s) inconnue(s).'
                         % len(presets_inconnus))

    if sans_forme:
        print('\n%d ligne(s) sans forme correspondante :' % len(sans_forme))
        for nom in sorted(set(sans_forme)):
            print('   ', nom)

    # Deux lignes que rien ne distingue plus une fois le motif retiré disent la
    # même chose : mêmes biomes, même rareté, mêmes niveaux, même moment. Le
    # tableur en tient une par motif — vingt-quatre pour Magicarpe, une par
    # livrée. Les garder, c'est écrire vingt-quatre fois « Eaux douces » dans la
    # fiche. On n'en garde qu'une, en additionnant les poids : la chance de
    # croiser l'espèce est bien la somme de celles de ses livrées.
    doublons = 0
    for cle_forme, brut in especes.items():
        gardees = []
        vues = {}
        for ligne in brut:
            # Tout sauf le poids, qu'on additionne : deux lignes qui mènent aux
            # mêmes biomes, aux mêmes conditions, disent la même chose.
            signature = json.dumps(ligne[:8] + ligne[9:], sort_keys=True)
            if signature in vues:
                vues[signature][8] = round(vues[signature][8] + ligne[8], 3)
                doublons += 1
            else:
                vues[signature] = ligne
                gardees.append(ligne)
        especes[cle_forme] = gardees
    print('%d ligne(s) fusionnée(s) : même apparition, motif différent.' % doublons)

    return {
        'lignes': lignes,
        'reserve': {
            'genereLe': __import__('datetime').date.today().isoformat(),
            'source': 'Tableur communautaire des spawns de Cobblemon',
            'biomes': biomes.valeurs,
            'familles': familles_t.valeurs,
            # Aligné sur « familles » : pour chacune, les biomes que d'autres
            # mods lui donnent, groupés par mod. Une liste vide veut dire que le
            # libellé EST le nom du biome — le tableur l'écrit en clair, faute
            # de tag chez Cobblemon.
            'famillesMod': [familles_mod.get(nom, []) for nom in familles_t.valeurs],
            # Le mod à installer pour que l'étiquette existe, quand on a pu le
            # nommer : relevé dans les fichiers de spawn du mod. Vide sinon —
            # la fiche écrit alors « mod de biomes requis » sans en désigner un.
            'famillesRequis': [familles_requis.get(nom, '') for nom in familles_t.valeurs],
            'raretes': raretes.valeurs,
            'contextes': contextes.valeurs,
            'temps': temps.valeurs,
            'meteos': meteos.valeurs,
            'notes': notes.valeurs,
            'structures': structures.valeurs,
            'especes': dict(especes),
        },
    }


ENTETE = '''// Où l'on croise chaque Pokémon dans Cobblemon — GÉNÉRÉ, ne pas éditer à la main.
//
//   cd app && py outils/relever-cobblemon.py
//
// Source : le tableur communautaire des tables de spawn du mod, exporté en CSV.
// Cobblemon n'a ni Poképédia ni Pokébip — ses tables vivent dans les JSON du
// mod, une par espèce. Le tableur est la seule lecture qui donne la ligne
// entière : biomes, niveaux, rareté, moment de la journée, météo et manière.
//
// La réserve se charge à la demande, comme les attaques et les descriptions :
// elle ne pèse sur l'ouverture de l'application que si l'on ouvre une fiche
// depuis l'onglet Cobblemon.
//
//   ligne = [ [i biomes], [i biomes exclus], i rareté, niv. min, niv. max,
//             i contexte, i temps, i météo, poids, i note,
//             [i structures], sous terre (0/1),
//             [i familles], [i familles exclues], portée, dimension ]
//
// Les biomes sont EXACTS et portent leur nom français du jeu : le tableur cite
// des familles de Cobblemon, le relevé les a résolues en biomes de Minecraft.
// Les familles restent à côté pour l'infobulle, et pour les vingt-quatre
// étiquettes qui ne recouvrent aucun biome du jeu de base — celles-là ne
// s'obtiennent qu'avec un mod de biomes, et la liste exacte est vide.
//
// Portée : 0 biomes précis · 1 toute la surface · 2 tout le Nether · 3 tout l'End.
// Dimension : 0 surface · 1 Nether · 2 End · -1 nulle part sans mod de biomes.
//
// Un indice à -1 veut dire « aucune condition » : le mod écrit « any », et une
// condition qui n'en est pas une ne s'affiche pas.
//
// Généré le %s — %d lignes, %d formes.
'''


def ecrire(reserve, nb_lignes):
    blob = json.dumps(reserve, ensure_ascii=False, separators=(',', ':'))
    entete = ENTETE % (reserve['genereLe'], nb_lignes, len(reserve['especes']))
    with io.open(SORTIE, 'w', encoding='utf-8', newline='\r\n') as f:
        f.write(entete)
        f.write('const DONNEES_COBBLEMON = ' + blob + ';\r\n')
    return os.path.getsize(SORTIE)


def main():
    if '--fichier' in sys.argv:
        chemin = sys.argv[sys.argv.index('--fichier') + 1]
        print('Lecture de %s' % chemin)
        with io.open(chemin, encoding='utf-8', newline='') as f:
            csv_texte = f.read()
    else:
        csv_texte = telecharger()

    resultat = relever(csv_texte)
    reserve = resultat['reserve']
    nb_lignes = sum(len(v) for v in reserve['especes'].values())
    taille = ecrire(reserve, nb_lignes)

    print()
    print('%d lignes de spawn, %d formes.' % (nb_lignes, len(reserve['especes'])))
    print('%d biomes, %d raretés, %d contextes, %d moments, %d météos.'
          % (len(reserve['biomes']), len(reserve['raretes']), len(reserve['contextes']),
             len(reserve['temps']), len(reserve['meteos'])))
    print('Écrit dans %s — %.0f Ko.' % (os.path.relpath(SORTIE, RACINE), taille / 1024.0))


if __name__ == '__main__':
    main()
