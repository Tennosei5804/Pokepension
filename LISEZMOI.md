# PokéPension

Application de bureau de suivi de collection Pokémon, par **Tennosei_**.
Connexion par Discord, données en MySQL, partage de l'avancement entre amis.

## Comment c'est agencé

```
Application Tauri  ──── jeton de session ────►  API  ──── mot de passe ────►  MySQL
   (distribuée)                            (ton serveur)                  (jamais exposé)
                    └──── frontière de confiance ────┘
```

Le mot de passe MySQL vit **uniquement** dans `api/.env`, sur le serveur.
L'application distribuée à tes amis ne détient qu'un jeton de session, valable
pour un seul compte et révocable.

C'est toute la raison d'être de l'API. Sans elle, il faudrait embarquer les
identifiants MySQL dans le binaire — n'importe qui pourrait alors les extraire
(`strings appli.exe`), se connecter avec un client ordinaire et écraser le dex
des autres. La connexion Discord n'y changerait rien : elle vérifie l'identité
*dans l'interface*, et l'attaquant n'utilise pas l'interface.

## Le dossier

```
PokéPension/
├── api/                  → le service (Node) : Discord, sessions, MySQL
│   ├── .env              → les secrets. JAMAIS partagé ni versionné
│   ├── .env.exemple
│   └── src/
│       ├── serveur.js    → routes
│       ├── config.js     → lecture de l'environnement
│       ├── base.js       → pool MySQL, schéma
│       ├── comptes.js    → dresseurs, sessions, dex
│       └── discord.js    → OAuth2
└── app/                  → l'application Tauri
    ├── src/              → l'interface (HTML, CSS, JS)
    │   ├── types/        → les 18 logos de type, 200 × 44 chacun
    │   │                   combat.js → règles de combat · strategie.js → l'écran
    │   │                   reproduction.js → groupes d'œufs et co-parents
    │   │                   confirmer.js → les dialogues (confirmer, saisir, prévenir)
    │   ├── logos/        → les bannières de jeu, 698 × 156 environ. Le cadre
    │   │                   n'impose pas de hauteur : une bannière plus carrée
    │   │                   grandit sa carte et décale son compteur
    │   └── js/
    │       ├── donnees-embarquees.js → GÉNÉRÉ : espèces, formes, Pokédex, fiches
    │       ├── donnees-attaques.js   → GÉNÉRÉ : capacités apprises (chargé à la demande)
    │       ├── donnees-descriptions.js → RELEVÉ : les notices du Pokédex, par jeu
    │       ├── donnees-cobblemon.js  → RELEVÉ : les biomes d'apparition du mod
    │       ├── donnees-home.js       → RELEVÉ : ce que HOME accepte, pour le banc
    │       ├── donnees-pokedex.js    → RELEVÉ : les Pokédex de jeux, pour le banc
    │       └── evenements.js         → À LA MAIN : les distributions françaises
    ├── outils/           → la génération des réserves, les deux relevés, et les
    │                       trois vérifications : verifier.py (statique),
    │                       banc.py (le verdict) et verif.py (le rendu)
    └── src-tauri/        → le cœur Rust
        ├── src/lib.rs    → commandes, connexion Discord, appels à l'API
        └── tauri.conf.json
```

## Les réserves embarquées

L'application n'interroge PokeAPI à aucun moment : tout ce qui est identique
pour tous les dresseurs est calculé une fois, hors ligne, et embarqué. Il y en
a deux, volontairement séparées.

| Fichier | Contenu | Poids | Chargement |
|---|---|---|---|
| `donnees-embarquees.js` | espèces, formes, types, Pokédex, statistiques, talents, évolutions, lieux | ~1,4 Mo | au démarrage |
| `donnees-descriptions.js` | la notice du Pokédex, par espèce et par jeu | ~1,0 Mo | à l'ouverture de la première fiche |
| `donnees-attaques.js` | capacités apprises, par entrée et par jeu | ~1,9 Mo | à l'ouverture de la première fiche |
| `donnees-lieux.js` | où l'on croise chaque Pokémon, jeu par jeu | ~1,9 Mo | à l'ouverture de la première fiche |
| `donnees-cobblemon.js` | dans quels biomes le mod le fait apparaître | ~180 Ko | à l'ouverture d'une fiche Cobblemon |

Les notices viennent de **Poképédia**, et non de PokeAPI. La raison est
mesurée : `pokemon_species_flavor_text.csv` ne porte de français que pour
quatorze versions sur trente-cinq. Rouge, Bleu, Jaune, Or, Argent, Cristal,
Rubis, Saphir, Émeraude, Rouge Feu, Vert Feuille, Diamant, Perle, Platine,
HeartGold, SoulSilver, Noir 2, Blanc 2, Légendes Arceus, Écarlate et Violet
n'y existent qu'en anglais — alors que ces jeux ont bel et bien été traduits.
Poképédia les a tous, et une par jeu : le Pokédex de Rouge et Bleu peut donc
citer Rouge et Bleu.

Le relevé du 24 août 2026 donne **1 079 entrées pourvues** — les 1 025 espèces
plus les formes régionales, qui ont leur propre page — soit **10 393 couples
espèce/jeu** pour **7 149 textes distincts**. Aucune page relevée n'était
dépourvue de section « Descriptions du Pokédex ».

La couverture par onglet retombe exactement sur la taille des Pokédex, ce qui
est le meilleur contrôle qu'on ait que la lecture n'a rien perdu :

| onglet | espèces | onglet | espèces | onglet | espèces |
|---|---|---|---|---|---|
| Rouge/Bleu | 151 | Jaune | 151 | Or/Argent | 251 |
| Cristal | 251 | Rubis/Saphir | 386 | Émeraude | 386 |
| RF/VF | 384 | Diamant/Perle | 493 | Platine | 493 |
| HG/SS | 493 | Noir/Blanc | 649 | Noir 2/Blanc 2 | 491 |
| X/Y | 721 | RO/SA | 721 | Soleil/Lune | 820 |
| US/UL | 826 | Let's Go | 172 | Épée/Bouclier | 693 |
| DÉ/PS | 493 | Lég. Arceus | 245 | Écarlate/Violet | 744 |
| Lég. Z-A | 379 | | | | |

Les comptes de la septième génération dépassent les 809 espèces d'alors parce
que les formes d'Alola ont chez Poképédia leur page à elles.

Les attaques pèsent à elles seules plus que tout le reste : les embarquer dans
la réserve principale ralentirait chaque lancement pour un panneau qu'on
n'ouvre pas toujours. `fiche.js` va donc les chercher à la demande, une fois
par session.

Même brutes, elles ne tiendraient pas : `pokemon_moves.csv` fait 10,7 Mo pour
638 000 lignes. Trois compressions, cumulées, ramènent cela à 1,9 Mo :

- **les CT en drapeaux** — six lignes sur dix sont des « machine ». Chaque jeu
  a sa liste de CT ; « ce Pokémon apprend-il la n° *i* ? » est donc une
  question à un bit, et non à cinq caractères ;
- **le reste en base 36** — un identifiant de capacité tient en deux
  caractères, un niveau aussi ;
- **la mutualisation** — Florizarre apprend exactement la même chose dans X que
  dans Rubis Oméga. Douze mille couples (entrée, jeu) ne donnent que dix mille
  blocs distincts, écrits une seule fois.

### Regénérer

Après la sortie d'un jeu, ou d'un rééquilibrage :

```
cd app
py outils/fabriquer-page.py        → refabrique les pages depuis src/index.html
py outils/serveur-generation.py
```

Puis, selon ce qu'on rafraîchit :

- <http://127.0.0.1:8124/outils/generer-donnees.html> → la réserve principale ;
- <http://127.0.0.1:8124/outils/generer-attaques.html> → les attaques.

Les deux sont indépendantes : rafraîchir les attaques ne touche pas au reste,
et inversement. Recompile ensuite l'application pour embarquer le résultat.

Les notices du Pokédex ne passent pas par là : elles se relèvent sur Poképédia,
comme les lieux, et le script s'en charge seul.

```bash
cd app
py outils/relever-descriptions.py
```

Comptez une heure et demie au premier passage — près de quatre mille cinq cents
pages, avec la même pause de 0,15 s que `relever-lieux.py` : le wiki est
bénévole. Les pages sont mises en cache dans `outils/.pages/pokepedia`, donc un
second passage est immédiat.

## Où l'obtenir

Le bloc de la fiche répond à « celui-là, je le trouve où ? », et il puise à
**deux sources qui ne se recouvrent pas** :

- les **rencontres de PokeAPI**, embarquées dans la réserve principale : lieu,
  méthode, niveau et rareté, mais **rien au-delà de la septième génération** —
  Épée, Écarlate et Z-A n'y ont aucune ligne ;
- le **relevé**, dans `donnees-lieux.js` : **les vingt-deux jeux**, avec la
  sous-zone, le niveau, le taux, l'heure, la météo et la saison.

```
cd app
py outils/relever-lieux.py     → refait la réserve depuis Poképédia
```

### Cobblemon, qui n'a ni routes ni grottes

Le mod est le vingt-quatrième onglet, et le seul dont le relevé ne vienne pas
d'un wiki Pokémon : ses tables d'apparition vivent dans les fichiers JSON du
mod, une par espèce. La communauté en tient un **tableur**, et c'est la seule
lecture qui donne la ligne entière.

```
cd app
py outils/relever-cobblemon.py                → depuis le tableur en ligne
py outils/relever-cobblemon.py --fichier x.csv → depuis une copie locale
```

Le relevé tient en quelques secondes : 2 732 lignes du tableur, ramenées à
**2 638 apparitions sur 874 formes**, 178 Ko — 60 biomes de Minecraft,
22 familles hors-jeu et 24 structures.

On n'y cherche pas un lieu mais un **biome**, parce qu'il n'y a pas de carte :
le monde est engendré à chaque partie, et ce qui se répète d'un monde à
l'autre, c'est le biome.

### Les biomes sont résolus, pas traduits

Le tableur n'écrit pas des biomes mais des **étiquettes de Cobblemon** —
`is_arid`, `is_temperate`, `is_overworld` —, c'est-à-dire des familles. Les
traduire au sens donnait « Régions arides », ce qui ne dit à personne où aller.
Le script les **résout** en biomes de Minecraft, sous leur nom français du jeu :

> **Arid** → Badlands · Badlands boisées · Badlands érodées · Désert ·
> Plateau de savane · Savane · Savane venteuse

La résolution est mécanique, pas écrite à la main, et elle demande **quatre
sources** parce que le graphe des tags traverse trois projets :

| | |
|---|---|
| les tags du mod | GitLab, `cable-mc/cobblemon`, `data/cobblemon/tags/worldgen/biome` |
| les tags de Minecraft | `#minecraft:is_forest` et consorts, par le miroir `misode/mcmeta` |
| les tags conventionnels | `#c:is_*`, que ni l'un ni l'autre ne définit — NeoForge les génère et les versionne |
| les noms français | `fr.minecraft.wiki/w/Biome` |

Sans la troisième, la moitié des familles tombait à zéro biome : `is_jungle` ne
délègue qu'à des tags. Une étiquette que la table ne connaîtrait pas
**interrompt le relevé** plutôt que de passer en silence.

Trois conséquences que la fiche porte :

| | |
|---|---|
| une famille peut couvrir une **dimension entière** | « Overworld » vaut pour les 56 biomes de la surface : la fiche écrit « Partout en surface » plutôt que de les énumérer |
| **22 étiquettes ne recouvrent aucun biome du jeu de base** | île tropicale, zone volcanique, source chaude. **Vingt sur vingt-deux disent quand même quoi faire.** Onze nomment leurs biomes chez d'autres mods — « Îles tropicales » vaut pour Tropics (Biomes O' Plenty) et trois biomes de Wythers. Neuf autres ne sont pas des familles mais des noms de biomes que le tableur écrit en clair, et le mod qui les fournit est relevé dans les fichiers de spawn : Skyroot Forest chez **The Aether**, Howling Constructs chez **The Bumblezone**. Restent deux étiquettes muettes — « Nether gelé » est un tag que Cobblemon déclare et que rien ne remplit |
| au-delà de **six biomes**, la liste se replie | la plus fournie en compte trente-neuf, six cent cinquante-cinq caractères |

### Dans quel monde, avant où dans le monde

« Deltas de basalte » ne dit pas de lui-même qu'il faut bâtir un portail, ni
« Terres stériles de l'End » qu'il faut d'abord battre le dragon. Chaque ligne
porte donc sa **dimension**, deux fois : au liseré — vert l'Overworld, rouge le
Nether, violet l'End, gris tireté ce qui n'existe pas sans mod — et en pastille,
`🌍 Overworld`, `🔥 Nether`, `🌌 End`. Le liseré se voit de loin quand on
parcourt cinq lignes, la pastille se lit quand on n'en regarde qu'une.

L'Overworld n'avait d'abord que son liseré, au motif qu'il porte 2 268 lignes
sur 2 638 et que la couleur suffisait. Elle ne suffisait pas : une ligne lue
seule ne disait plus dans quel monde elle se trouvait, et rien n'explique le
code couleur. Les trois mondes se nomment.

Aucune ligne du relevé ne mélange deux mondes : 2 268 en surface, 93 dans le
Nether, 15 dans l'End, 262 nulle part sans mod.

Les apparitions sont **triées dans l'ordre où on atteint les mondes** — surface,
Nether, End, puis les moddées —, et à monde égal de la plus commune à la plus
rare. Sans cette règle, Métalosse ouvrait sur deux lignes de l'Aether avant
celle qu'on peut faire avec le jeu qu'on a.

Trois choses que le tableur sait et qu'on ne devine pas en jeu :

| | |
|---|---|
| la **rareté** | quatre paliers, de « Commun » à « Très rare » — la pastille de tête |
| le **biais régional** | un Pikachu des plages évoluera en Raichu d'Alola ; rien ne le montre |
| la **structure** | dans les arbres, dans un village, au fond d'un manoir — le seul « où » du tableur qui ressemble à une carte |
| le **sous-sol** | `canSeeSky = FALSE` : là où le ciel ne se voit pas. Aucun biome ne le dit, on creuse partout |
| les **biomes exclus** | « Partout en surface, sauf les Abîmes » |
| la **nature du sol** | « Muddy » n'est pas un biome mais `#cobblemon:has_block/mud` : une condition sur le sol, pas sur le monde. On creuse de la boue partout, et la ranger parmi les étiquettes qui demandent un mod était faux — c'est une pastille, « Sur la boue », et elle s'inverse en « sauf » quand le tableur l'exclut |

La clé est le **numéro national**, pas le nom : le tableur écrit « Basculin »
là où l'application, qui suit PokeAPI, connaît `basculin-red-striped`. Les
motifs (`striped=blue`, `maushold_family=three`) choisissent ensuite la forme
quand l'application la distingue — sans quoi les vingt-huit lignes de Bascoeur
s'entassaient sur la seule forme rouge. Quand elle ne la distingue pas, les
lignes **fusionnent** au lieu de se répéter : les vingt-quatre livrées de
Magicarpe se lisent en quatre apparitions.

### Une seule source

Le relevé a d'abord été bâti sur **Pokékalos**, puis sur **Pokébip**. Les deux
ont été abandonnés le 23 août 2026, après une journée passée à arbitrer leurs
désaccords : Méanville, les fossiles de Rubis Ω, l'Ultra-Dimension, Bargantua,
les sept de Hisui, le Scanner QR — **chaque fois, c'est Poképédia qui avait
raison**. Quarante-cinq corrections écrites à la main tenaient le relevé
debout ; elles n'étaient pas un accomplissement mais le symptôme d'un socle
trop faible. Elles ont toutes disparu avec lui.

Ce que Poképédia donne et qu'aucun des deux n'avait :

| | |
|---|---|
| la **sous-zone** | « Pente Enneigée • Hautes herbes », et non « Pente Enneigée » |
| le **niveau** et le **taux** | « (39–43, 40 %) » |
| la **version** | Rubis et Saphir séparés d'Émeraude, que Pokébip fusionnait |
| la **forme** | page dédiée pour Rattata d'Alola, Qwilfish de Hisui |
| l'**heure** | matin, jour, soir, nuit |
| la **météo** | pluie, neige, blizzard, brouillard, tempête de sable |
| la **saison** | printemps, été, automne, hiver — la mécanique de Noir/Blanc |

Deux limites que je présentais comme irréductibles tombent d'elles-mêmes : la
fusion des versions de Hoenn et la séparation des formes sont **natives** ici.

### Comment on la lit

Par l'**API de MediaWiki**, jamais en aspirant les pages, et en ne demandant
que la section « Localisations » : **cinq kilo-octets au lieu de six cents**
pour la page entière. Une requête par espèce **et par génération** — la page
principale ne montre que les dernières —, soit mille soixante-dix-neuf pages
sur dix générations, près de quatorze mille appels, mis en cache dans
`app/outils/.pages/pokepedia`. Le délai entre deux requêtes est à 0,15 s :
Poképédia est un wiki bénévole.

La section a **deux niveaux**, et il faut les deux :

- le **résumé** — « Épée et Bouclier | Isolarmure : Plaine Salutation »,
  « Ultra-Soleil | Faire évoluer Pikachu dans l'Ultra-Dimension ». C'est lui
  qui porte les évolutions, les échanges et les absences. Sans lui, le relevé
  n'avait pas **une seule** catégorie « évolution » ;
- le **détail** — un tableau par jeu : lieu, sous-zone, niveau, taux, et selon
  les jeux l'heure et la météo. Il ne couvre que les rencontres sauvages.

La présentation change d'un jeu à l'autre, et il faut s'y plier : Épée/Bouclier
donne le taux **sous chaque météo**, Légendes Arceus se contente d'un ✓
récapitulatif, le détail vivant dans un tableau repliable que l'API ne rend
pas.

### Le texte est composé

C'est un changement de doctrine, et il vaut d'être dit. Les deux sites
précédents donnaient de la **prose** qu'on recopiait telle quelle ; Poképédia
donne un **tableau**. On rend donc ses colonnes mécaniquement :

```
Route 8 (Sentier des Sources) • Hautes herbes (39–43, 40 %)
Route 8 (Sentier des Sources) • Pokémon cachés (38–41, 40 %)
Route 10 (route principale) • Pokémon cachés (44–46, 10 %)
```

Rendre des champs est plus fidèle que reformuler une phrase. Et **toutes** les
rencontres y sont, sans plafond : Roucool en a quatorze dans Rouge et Bleu,
Magicarpe trente-quatre. C'est long, mais un lieu qu'on n'écrirait pas est un
lieu qu'on irait chercher ailleurs.

### Une ligne par forme

Une espèce peut avoir **deux réalités dans le même jeu** : en Alola, Rattata
d'Alola court les routes tandis que celui de Kanto n'y existe pas. Poképédia
est nativement par forme — « Pour les localisations du Raichu d'Alola,
consultez sa page dédiée » —, et la réserve embarquée donne à chaque forme son
propre identifiant, au-delà de 10 000 : Rattata est 19, Rattata d'Alola
10 091. La fiche et la grille lisent **la forme d'abord, l'espèce à défaut**.

### Capturable, ou seulement vu

Le relevé n'ajoute qu'une chose au texte, une **catégorie** : `sauvage`,
`evolution`, `offert`, `echange`, `oeuf`, `indisponible`. Elle répond à la
seule question qui change un dex.

La logique est **inversée** par rapport à ce qu'on ferait d'instinct : on ne
cherche pas à reconnaître ce qui est sauvage, on liste ce qui ne l'est **pas**.
Le vocabulaire des sous-zones a été relevé dans le cache — **mille soixante-dix
formes distinctes** — et cent trente-sept seulement désignent autre chose
qu'une rencontre. Décrire les neuf cent trente autres serait sans fin ; les
nommer par exception tient en huit motifs.

Et **une seule vraie rencontre suffit**. Prendre la première ligne ne marchait
pas : Poképédia met « Route 4 • À acheter (500 P) » en tête de Magicarpe, qui
se pêche pourtant à trente-trois autres endroits. Un lieu réel l'emporte sur un
comptoir, où qu'il figure dans la liste.

### Dans la grille

Le relevé ne vit pas que dans la fiche. Sur le Pokédex d'un jeu, chaque carte
porte une **pastille d'obtention** — 🌿 capturable, ⬆ par évolution, 🎁 offert,
⇄ par échange, ✖ indisponible — et un ✨ grisé s'ajoute pour un **shiny-lock**,
l'information qui fait renoncer à une chasse avant de la commencer. Le titre au
survol dit la même chose en toutes lettres.

La barre des filtres gagne le groupe « Obtention » : *Capturable dans ce jeu*,
*Offert*, *Par échange*, *Par évolution*, *Indisponible — à transférer*,
*Shiny-lock*.

Trois règles encadrent tout ça :

- **rien de tout cela sur Pokémon HOME.** « Capturable ici » n'a pas de réponse
  hors d'un jeu : le filtre ne retient alors rien, plutôt que de mentir ;
- **une espèce sans ligne se dit « ne se capture pas »** — mais seulement dans
  un jeu dont le Pokédex a été relevé, puisqu'il les liste toutes. Ailleurs —
  HeartGold, Noire 2, Ultra-Soleil, dont seules les pages annexes existent —
  une absence de ligne n'est qu'une absence de source, et l'affirmer serait
  inventer. La réserve porte donc `pokedexReleve`, la liste des jeux où
  l'inférence est permise, et le banc vérifie qu'elle n'est jamais outrepassée ;
- **la réserve se charge à la première grille d'un jeu**, pas au démarrage. Ses
  355 Ko ne pèsent donc sur aucun lancement, et la grille se redessine d'elle-
  même quand ils arrivent. Sans ce détour, choisir « Capturable » n'aurait rien
  montré et l'on aurait cru le relevé vide.

### Ce que le relevé a demandé de dénouer

Rapprocher les noms de Poképédia et les espèces de la réserve tient en peu de
choses, parce que le wiki est régulier : le nom de page **est** le nom français
d'affichage, et les formes régionales suivent une règle unique — « Rattata
(Alola) » chez nous devient « Rattata d'Alola » chez lui, « de Galar », « de
Hisui », « de Paldea » pour les autres.

Trois détails ont quand même demandé du soin :

- **les modèles non rendus.** L'API ne développe pas le modèle du Pokédollar
  dans une section isolée, et « À acheter (500 ) » s'écrivait avec ses
  doubles accolades en toutes lettres. Le symbole est remplacé, les autres
  modèles effacés ;
- **les valeurs empilées.** Deux niveaux dans une cellule, séparés par un saut
  de ligne, se collaient en « 357 » — un niveau qui n'existe pas. Le lecteur
  insère désormais une virgule ;
- **les trois sortes d'en-têtes.** Un tableau de détail en a trois, et aucune
  ne se reconnaît pareil : les noms de colonnes (« Lieu | Niveau | Taux »), la
  rangée d'icônes où chaque cellule répète le nom de sa propre colonne, et le
  nom d'aire seul (« Isolarmure ») qui coiffe un groupe. Les écarter en
  exigeant un « • » dans le lieu marchait — mais jetait aussi les vraies
  lignes : Légendes Arceus écrit « Contrefort Couronné » sans sous-zone, et le
  relevé y tombait de 235 entrées à 37.

## Le calculateur de combat

`app/src/js/combat.js` porte les règles : les vingt-cinq natures, la formule des
statistiques, celle des dégâts, et les tables d'objets et de talents. Il dessine
aussi la modale de configuration — c'est le seul écran qu'il contient, et il y
est parce que l'équipe et le calculateur posent la même question : « ce Pokémon,
avec quelles statistiques ? ».

`strategie.js`, lui, ne fait que dessiner la page. Rien ne s'y calcule.

### Ce qui est pris en compte

Niveau, nature, IV, EV, **changements de statistiques (−6 à +6)**, objet tenu,
talent, STAB, efficacité, coup critique, brûlure, **météo**, **terrain**,
**coups multiples** et **attaques à dégâts fixes** (Draco-Rage, Frappe Atlas,
les K.O. en un coup…). Quatre attaques par Pokémon, une carte de résultat par
attaque : c'est la comparaison qu'on cherche vraiment. La formule est celle des
générations 5 et suivantes, tronquée à chaque étape comme le jeu le fait, et la
fourchette affichée est celle des seize jets.

Les paliers appliquent une fraction, pas un nombre à virgule : (2+n)/2 vers le
haut, 2/(2−n) vers le bas. Un −1 vaut donc **×2/3**, et non ×0,5 comme on le lit
souvent. Un coup critique ignore les paliers qui arrangeraient le défenseur —
les baisses de l'attaquant et les hausses du défenseur — et l'interface le dit
au lieu de simplement changer le chiffre.

Les tables `OBJETS` et `TALENTS_COMBAT` sont volontairement courtes : elles ne
contiennent que ce qui change un résultat. Un talent absent de la table reste
sélectionnable — il n'a simplement aucun effet, et le libellé du menu le dit en
ne portant aucune mention d'effet.

Le nombre de coups se règle à la main : la réserve des capacités ne dit pas si
une attaque en donne deux ou cinq. Un terrain ne touche que ce qui est au sol —
un type Vol ou un Lévitation y échappent, et c'est la moitié de l'intérêt de la
mécanique.

### Ce qui n'est pas pris en compte

Les talents qui dépendent des PV restants au-delà de Multiécaille, les attaques
réactives (Riposte, Voile Miroir), et les objets consommables. Les ajouter
demande un état de combat, pas seulement deux fiches.

## La reproduction

`app/src/js/reproduction.js` répond à deux questions : « avec qui puis-je faire
pondre celui-là ? » et « qui est dans le groupe Amorphe ? ». Les groupes d'œufs
viennent de la réserve (`dico.oeufs`, régénérée depuis `pokemon_egg_groups.csv`)
et appartiennent à **l'espèce**, pas à la forme : un Raichu d'Alola pond comme
un Raichu.

La règle tient en quatre lignes : le groupe **Inconnu** ne se reproduit jamais,
**Métamorph** se reproduit avec tout le reste, sinon il faut un groupe en commun
**et** un mâle avec une femelle. Deux Leveinard, tous deux femelles, ne pondront
donc jamais ensemble malgré leur groupe partagé ; un asexué n'a que Métamorph.

Le taux de genre vient de `pokemon_species.csv` (`gender_rate`, en huitièmes de
femelles). Il s'affiche sur la fiche, et un filtre dit de quel sexe est le tien
pour ne proposer que ce qui va en face.

## Les points d'effort

Tirés de la quatrième colonne de `pokemon_stats.csv` : elle était là depuis le
début, ignorée. Ils s'affichent aux deux bouts, parce que la question se pose
dans les deux sens :

- sur **la fiche** d'un Pokémon — « celui-là, il rapporte quoi ? » ;
- dans **Stratégie › Entraînement EV** — « il me faut de la Vitesse, je bats
  quoi ? ». On choisit la statistique et le nombre de points, on obtient la
  liste triée du plus généreux au moins, et un clic ouvre la fiche dont le bloc
  « Où l'obtenir » dit où le croiser.

## Les dialogues

`app/src/js/confirmer.js` remplace `confirm()`, `prompt()` et `alert()`, qui
partagent trois défauts : la boîte est dessinée par Windows et ne ressemble à
rien du reste, elle ne sait afficher que du texte — donc jamais ce qui est en
jeu — et elle se valide d'un « Entrée » réflexe. Sur une suppression de dex, le
dernier point suffisait à la disqualifier.

Trois portes d'entrée, une seule fenêtre :

| Fonction | Rend | Pour |
| --- | --- | --- |
| `demanderConfirmation(o)` | `true` / `false` | une action à confirmer |
| `demanderSaisie(o)` | le texte, ou `null` | un nom à saisir |
| `prevenir(o)` | `true` | une nouvelle à annoncer |
| `prevenirErreur(titre, note)` | `true` | le raccourci : une opération ratée |

Toutes sont des promesses : `if(!await demanderConfirmation({…})) return;`.

Ce qu'on peut mettre dans une fenêtre : un `resume` chiffré (« 152 capturés »
arrête la main, « ton Pokédex » ne l'arrête pas), une liste de `pertes`, une
`note`, et un `genre` (`danger` ou `succes`) qui colore le titre et le bouton.

Deux garde-fous, à ne pas confondre :

- `motAEcrire` demande de recopier un nom, et garde le bouton fermé tant qu'il
  n'est pas exact — casse et espaces tolérés, c'est une confirmation, pas une
  dictée. Réservé à ce qui ne se récupère pas : supprimer une aventure, vider un
  dex, abandonner une chasse de plus de cinq cents rencontres.
- `valider(v)` est la règle d'une saisie, vérifiée **pendant la frappe** :
  découvrir un refus après avoir validé, c'est refaire la saisie pour rien.

Quand le serveur nettoie ce qu'on lui envoie, `apercu(v)` dit ce que la valeur
va devenir plutôt que de la refuser. Le pseudo en dépend : l'API rogne les
soulignés des extrémités avant de valider, donc `Tennosei_` lui convient — une
règle client plus stricte que la sienne bloquait le dresseur sur son propre nom,
sans lui dire pourquoi. La règle de `changerMonPseudo()` recopie donc
`nettoyerPseudo()` de `api/src/comptes.js` à la lettre : **les deux se
modifient ensemble.**

Trois demandes sont partagées, dans `compte.js`, parce qu'elles se déclenchent
chacune depuis deux écrans — la page « Profil » et la modale « Mes aventures » :
`confirmerSuppression()`, `confirmerVidage()` et `demanderNouveauNom()`. Un texte
en double aurait dérivé, et c'est exactement ce qui était arrivé : le refus de
supprimer la dernière aventure n'existait que sur la page Profil, si bien que par
la modale on faisait recopier le nom avant de se prendre le 409 du serveur. Le
garde-fou vit maintenant dans `confirmerSuppression()`, donc aux deux endroits.

Échap et le clic à côté renoncent — pour une suppression, le refus doit rester
le geste le plus facile. Sans la fenêtre dans le HTML (les pages de génération,
par exemple), les trois fonctions retombent sur les boîtes du système plutôt que
de ne rien demander du tout.

## Les allers-retours au serveur

L'API est distante : chaque appel coûte un aller-retour réel, et deux fonctions
qui se suivent en demandaient facilement deux fois la même chose. Trois règles
évitent ça, sans jamais mettre de données en cache — le dex et le journal
changent dès qu'on coche un Pokémon, et servir une copie périmée serait pire
qu'un appel de plus.

- **`chargerProfil(dejaAJour)`** saute sa lecture de la liste quand l'appelant
  vient de la faire pour son propre compte.
- **`agirSurProfil(promesse)`** accepte que l'action lui rende la liste qu'elle
  a déjà lue : si la promesse résout sur un tableau, il ne relit pas. La
  suppression s'en sert — elle doit de toute façon lire la liste pour savoir sur
  quelle aventure retomber.
- **`lireHistorique(id, avant)`** partage la requête *encore en vol*. L'accueil
  veut les six dernières captures, la page Profil le journal entier : c'est le
  même appel. Une fois la réponse rendue, la promesse est oubliée et la lecture
  suivante repart au serveur.

Il y a aussi un garde-fou plus ancien, dans `dex.js` : `updateHome()` n'est
appelé que si l'accueil est la page visible. Inutile de recalculer ses barres —
et de recharger son journal — pendant qu'on est ailleurs.

Une suppression d'aventure coûte aujourd'hui **quatre appels** — supprimer,
relire la liste, charger le dex de l'aventure suivante, charger son journal —
contre six avant, quel que soit l'écran d'où on la déclenche.

## Le périmètre de Pokémon HOME

La collection HOME ne montre que ce qui se range dans une boîte. Les **formes de
combat** en sont exclues — Méga-Évolutions, Primo-Résurgences et Eternamax, mais
aussi les Gigamax, les Totem et les états qui ne durent qu'un combat (Mode
Transe, Palafin Héros, Terapagos Terastal) : HOME range le Pokémon, pas ce qu'il
devient le temps d'un tour. Cela fait **206 entrées** écartées sur les 1351 de la
réserve, et 45 de plus parmi les formes supplémentaires.

Ce qui reste dépend ensuite du niveau de formes de l'aventure : **1 281 entrées**
au niveau 3, celui par défaut. Le tableau de la section suivante donne les
quatre.

Elles ne disparaissent pas de la réserve pour autant, et c'est voulu : le
Pokédex de **Légendes Z-A** les affiche. Il ne leur donne pas de numéro à
elles — une Méga garde celui de sa forme de base, et les 232 entrées d'Illumis
se comptent sans elles — mais elles occupent bien une ligne à l'écran. Les
retirer de `allEntries` creuserait donc des trous dans un Pokédex réel.

La coupure se fait donc au périmètre, pas à la source :

- `poolEntries()` — la réserve entière. Ce que lisent les scopes de jeu.
- `poolHome()` — la même, moins ce qui ne se range pas dans une boîte, et
  coupée au niveau de formes de l'aventure. Ce que lisent la collection HOME,
  ses totaux et ses barres par génération.

### Les quatre niveaux de formes

Le sélecteur 🧬 de la barre de filtres décide jusqu'où l'on compte les formes
d'une même espèce. Les niveaux sont emboîtés : chacun contient le précédent.

| Niveau | Entrées | Relevé | Ce que ça ajoute |
| --- | --- | --- | --- |
| 1 · Une forme par espèce | **1 025** | 1 025 | un seul Météno |
| 2 · Avec les régionales | **1 082** | 1 082 | Alola, Galar, Hisui, Paldea |
| 3 · Avec les alternatives | 1 281 | 1 280 | noyaux de Météno, lettres de Zarbi, motifs de Prismillon, parfums de Charmilly… |
| 4 · Avec mâle / femelle | 1 383 | 1 384 | les espèces dont la femelle se distingue à l'œil |

Les deux premiers niveaux tombent **exactement** sur le relevé. Les deux autres
s'en écartent d'une entrée : le Farfuret de Hisui ♀ manque, PokeAPI ne le
modélisant pas comme une forme distincte, et une variante féminine est classée
en « alternative » plutôt qu'en « genre ». Le banc tolère un écart d'une entrée
et échouerait s'il grandissait — c'est là que se verrait une règle qui bouge.

Le **niveau 1 tombe exactement sur les 1 025 espèces du relevé Pokékalos** — le
banc le vérifie à chaque passage, et c'est le meilleur signe que le classement
est juste.

Le **niveau 3 est le défaut**. Aucun niveau n'a besoin du réseau : les formes
supplémentaires viennent de la réserve embarquée, `cacheLire('formes')` tombant
sur `DONNEES_EMBARQUEES.formes`.

### Le niveau appartient à l'aventure

Il est enregistré dans `pa_profils.niveau_formes`, pas dans le navigateur. Ce
n'est pas un détail de rangement : **le total de la barre de comparaison se
calcule sur ton périmètre**. Quand le réglage vivait dans `localStorage`, passer
du niveau 3 au niveau 1 faisait chuter le score de ton copain sans que rien
n'ait bougé chez lui.

Trois conséquences :

- ouvrir une aventure applique **son** niveau, avant le premier dessin de la
  grille — c'est `appliquerNiveauFormes()`, appelée depuis `ouvrirProfil()` ;
- changer de niveau l'écrit sur l'aventure ouverte. L'enregistrement est
  silencieux à dessein : c'est un réglage d'affichage, et faire échouer
  bruyamment quelqu'un qui regarde sa collection autrement serait pénible. Il
  repartira au prochain changement ;
- quand deux dresseurs se comparent à des niveaux différents, la barre le dit :
  « Vous ne comptez pas les mêmes formes ». Le même avertissement existait déjà
  pour les modes de dex, à côté.

`localStorage` garde encore le dernier niveau connu de la machine, mais comme
simple pis-aller : il sert le temps que la session Discord s'ouvre, et dès
qu'une aventure est là, c'est elle qui décide.

`allFormsMode`, que lisent les Pokédex de jeux pour choisir entre une carte par
espèce et toutes les formes, vaut simplement « niveau ≥ 4 ». Les scopes de jeu
se comportent donc exactement comme avant ce réglage.

Le sélecteur ne rend pas stockable ce qui ne l'est pas : quel que soit le
niveau, les formes de combat restent hors de HOME.

Sa largeur est fixée à `15rem` plutôt que laissée au texte. Les quatre libellés
n'ont pas la même longueur — et le compte affiché varie — si bien qu'il sautait
d'une vingtaine de pixels à chaque changement de niveau. Il ne s'étire pas non
plus comme les menus de la barre des filtres : ceux-là sont quatre à se partager
une ligne, celui-ci est seul entre deux boutons.

Deux prédicats se ressemblent sans se recouvrir, et il ne faut pas les fusionner :
`estFormeDeCombat()` (donnees.js) décide du périmètre HOME ; `isMegaLike()`
(formes.js) sert aux scopes de jeu, range Arceus avec les Méga et ignore Primal
et Eternamax.

## Les sprites d'époque

Par défaut, les cartes portent les **rendus Pokémon HOME** : une seule facture
graphique pour les 1 351 entrées, chromatiques comprises. Sur le Pokédex d'un
jeu, le bouton **🕹️ Sprites du jeu** les remplace par ceux de la version — les
Pokémon de Rubis/Saphir avec leurs sprites de Game Boy Advance.

Les images viennent de **Pokémon Showdown**, qui héberge un jeu de sprites par
génération. C'est déjà le quatrième repli de la chaîne d'images : rien à
télécharger, rien à ajouter au CSP, et le nom de fichier se calcule avec
`toShowdownSlug()` comme le reste.

| Jeu | Normal | Chromatique |
| --- | --- | --- |
| Rouge / Bleu · Jaune | `gen1rb` · `gen1` | — |
| Or / Argent · Cristal | `gen2g` · `gen2` | `gen2-shiny` |
| Rubis / Saphir · Émeraude · RF/VF | `gen3rs` · `gen3` · `gen3frlg` | `gen3-shiny` |
| Diamant / Perle · Platine · HGSS | `gen4` | `gen4-shiny` |
| Noire / Blanche · Noire 2 / Blanche 2 | `gen5` | `gen5-shiny` |

Trois limites tiennent à la source, pas au code, et le banc les surveille :

- **la première génération n'a pas de chromatiques.** Sur Rouge/Bleu et Jaune,
  la vue shiny rend le sprite normal plutôt qu'une adresse qui n'existe pas ;
- **à partir de X/Y, il n'y a plus de sprite 2D.** Le bouton disparaît au lieu
  de proposer une bascule sans effet — comme il disparaît sur Pokémon HOME, qui
  n'est pas un jeu ;
- **une espèce peut manquer à sa génération.** Un Pokémon de la cinquième n'a
  pas de sprite Rubis/Saphir : l'erreur de chargement ramène à la chaîne
  habituelle — rendu HOME, artwork, Showdown — qui n'a pas changé d'un
  caractère.

## Ses propres sprites

`app/src/Sprites/` est vide, et c'est voulu : c'est un point d'extension. Un
`.png` déposé là est essayé **avant toutes les sources en ligne** —
`Sprites/<nom>.png` pour le sprite ordinaire, `Sprites/shiny/<nom>.png` pour le
chromatique. Le `<nom>` est celui que l'application emploie en interne
(`bulbasaur`, `mr-mime`, `deoxys-attack`), visible dans l'adresse du sprite
affiché.

Rien à déclarer, rien à recompiler : la chaîne de repli du navigateur essaie ce
fichier, et passe à la suite s'il n'existe pas. C'est ce qui permet d'utiliser
ses propres extractions — celles de spriters-resource.com, par exemple — sans
toucher au code.

Les deux `.gitkeep` ne servent qu'à garder les dossiers vides dans le dépôt.

L'ordre complet, essayé de haut en bas :

1. le fichier local dans `Sprites/` ;
2. les rendus Pokémon HOME de PokeOS ;
3. l'artwork officiel de PokeAPI ;
4. le jeu « home » de Pokémon Showdown ;
5. une icône générique, si rien n'a chargé.

## Les logos de type

`app/src/types/` contient une image par type, nommée d'après le type en
minuscules sans accent : `normal.png`, `electrik.png`, `tenebres.png`, `fee.png`…
Toutes font **200 × 44**, et l'application les affiche à la moitié — une seule
taille partout : fiche, faiblesses, tableau des attaques, page Stratégie.

Tout passe par `puceType()`, dans `fiche.js`. C'est la seule fabrique de puces :
changer la taille se fait à un endroit, dans la règle `.type-img` de `dex.css`.

Un logo manquant ne casse rien — l'image bascule sur la pastille colorée d'avant,
qui occupe exactement le même encombrement pour que la ligne ne saute pas. Pour
remplacer un logo, il suffit donc d'écraser le fichier ; pour en changer tous,
de vider le dossier et d'y remettre les dix-huit.

## Le Cadeau Mystère

Les fabuleux et les formes évènementielles ne s'obtiennent que par
distribution. `app/src/js/evenements.js` dit, pour chacun, **quand la France
l'a eu** : l'évènement, ses dates, les jeux concernés, la méthode.

Ce fichier s'écrit à la main, contrairement aux deux réserves générées. Il tient
en trente-quatre entrées et soixante-dix distributions — inutile d'outiller ça.

### La règle

La source est l'[Evendex de Pokébip](https://www.pokebip.com/page/jeux-video/evendex/accueil),
et plus précisément ses pages **« Distributions ayant eu lieu en France »**, une
par génération. Pas le catalogue mondial : un Zeraora distribué au Japon n'a
jamais aidé personne ici, et l'afficher ferait espérer une piste qui n'existe
pas.

Deux exclusions volontaires :

- **les Pokémon de tournoi** (Worlds, VGC). Réservés aux participants, ils
  noieraient les vraies distributions sous des Dracaufeu de compétition ;
- **les espèces ordinaires distribuées en évènement.** La page répond à « qu'est-ce
  qui NE s'obtient QUE par distribution ? ». Un Pikachu se capture partout ; sa
  casquette de Kalos, jamais.

Une entrée sans distribution française n'a **aucune ligne** dans le fichier, et
l'application l'écrit noir sur blanc : « aucune distribution française
recensée ». C'est le cas de Marshadow. Ne jamais combler ce vide par un
évènement étranger — l'absence est elle-même l'information que le dresseur
cherche.

### Ajouter une distribution

Une ligne dans `DISTRIBUTIONS_FR`, sous le numéro national du fabuleux ou
l'identifiant PokeAPI de la forme :

```js
  719: [
    { ev:"Diancie Automne 2014", quand:"23 octobre 2014 – 25 février 2015",
      annee:2014, jeux:"X · Y", voie:"code" }
  ],
```

`voie` doit exister dans `VOIES` — c'est elle qui alimente le filtre par
méthode. `permanent:true` pour ce qui est encore ouvert aujourd'hui (le QR Code
de Magearna), `jamais:true` pour ce qui n'a jamais été distribué (la Flûte Azur
d'Arceus), `chromatique:true` pour un shiny.

Les libellés de `FORMES_EVENEMENT`, dans `cadeaux.js`, disent ce qu'**est** une
forme et jamais quand elle est passée : les dates vivent ici, et les écrire aux
deux endroits les fait diverger. C'est déjà arrivé — la casquette partenaire y
était datée de 2019, alors que la France l'a eue en 2017 puis en 2020.

## Relire une sauvegarde

C'était la pièce qui manquait. `pokepension-1` est défini par `exporter()`,
versionné, complet, et **produit des deux côtés** — l'application et le site.
Il n'était lu par personne : le site et l'application ne pouvaient pas se
rejoindre, un vidage de navigateur effaçait tout sans recours, et quiconque
venait d'ailleurs devait recocher neuf cents cases à la main.

`POST /api/import` verse un fichier dans le compte. La fusion se fait **côté
serveur** — c'est lui qui tient le dex et le journal, et une union calculée
dans l'application puis renvoyée écraserait tout ce qui aurait bougé entre la
lecture et l'écriture.

Trois règles, celles que `site/LISEZMOI.md` spécifiait déjà :

- **le dex se réunit**, il ne se remplace pas. Cocher est monotone : on ajoute
  des captures, on n'en retire pratiquement jamais. Un décochage volontaire est
  donc perdu par cette règle — choix assumé, perdre une correction se répare en
  deux clics, perdre trois mois de cochage non ;
- **l'historique se dédoublonne** sur `(pokemon, dex, chromatique, ajoute_le)`.
  C'est ce qui rend l'import **rejouable** : le même fichier deux fois ne
  double pas le journal, et le banc le vérifie ;
- **`maj_le` départage** ce qui ne se réunit pas — le nom, le mode, le niveau
  de formes.

L'import n'écrit **pas** par `ecrireDex()` : celle-ci journalise la différence
à la date du jour, et un import porte ses propres dates. Les faire toutes
tomber aujourd'hui effacerait justement ce que le fichier avait gardé.

Le site fait la même chose dans `pont.js`, avec la même règle. **Les deux se
modifient ensemble** : une union qui diffère d'un côté ferait diverger les deux
collections dès le premier aller-retour, et c'est cet aller-retour que l'import
existe pour permettre.

## La vue boîtes

En Living Dex, la question n'est pas « est-ce que je l'ai » mais **« dans
quelle boîte, quelle case »**. Le mode existait — `pa_profils.mode` vaut
`living` —, le rangement non.

Trente par boîte, six par rangée, comme la console. Ce n'est pas une
coquetterie : c'est la rangée de six qui permet de compter les cases à l'œil et
de retrouver la même place dans le jeu.

**Les filtres ne s'appliquent pas dans cette vue**, et c'est le point délicat.
Une boîte se lit par la *place* d'un Pokémon ; masquer les manquants décalerait
tout le monde d'un cran et la vue ne servirait plus à rien. Un manquant occupe
donc sa case, simplement décoché — exactement comme la case vide qu'il laisse
dans le jeu. La barre le dit, plutôt que de laisser croire à un filtre en panne.

Les cartes sont celles de la grille : `renderCard()` sait déjà cocher, dessiner
la pastille d'obtention et le verrou des shiny-lockés. Une carte de boîte à part
aurait fait deux rendus à tenir d'accord, et ils auraient divergé.

## Le programme du soir

« À portée » répond à *quel jeu est près de finir*. Ce n'est pas la même
question que *je fais quoi maintenant*, et c'est la seconde qu'on se pose en
rallumant la console.

Le bloc ne demande **aucune donnée nouvelle** : le relevé des lieux couvre les
vingt-deux jeux avec la sous-zone, l'heure, la météo et la saison. Il suffit de
croiser ce qu'il dit de capturable avec ce qui manque à l'aventure.

Le tirage est **stable dans la journée** — une graine tirée de la date et de la
clé du jeu, jamais `Math.random()`. Une liste qui change à chaque
rafraîchissement ferait perdre celui qu'on était en train de chercher.

Deux filtres tiennent à la source, pas au code : seule la catégorie `sauvage`
est retenue, et les lignes dont le texte commence par « À transférer » sont
écartées — le relevé range parfois sous `sauvage` un Zamazenta qui ne se trouve
nulle part dans Écarlate.

## Les transferts, et l'onglet « Outils »

« Où l'obtenir » dit où le Pokémon vit. Il ne disait jamais par quel chemin il
arrive jusqu'à la boîte d'aujourd'hui — et pour un dex national, c'est là qu'est
la vraie difficulté.

**C'est une page, pas un bloc de fiche.** Ces règles dépendent du JEU et jamais
de l'espèce : le chemin de Rubis est le même pour Nidoran que pour Rayquaza. Les
répéter sur mille deux cent quatre-vingt-une fiches, c'était faire relire
vingt-deux fois la même chose à quelqu'un qui cherchait autre chose. La première
version les mettait dans la fiche ; c'était le mauvais endroit.

**Un seul onglet pour trois écrans.** Stratégie, Reproduction et Transferts
répondent à la même question — « avant d'y aller, qu'est-ce que je dois
savoir » — et partagent donc l'onglet 🧰 Outils et une sous-barre. À dix
entrées la nav débordait sur deux rangées, ce qui avait déjà fait sortir les
jeux de la barre ; elle tient de nouveau sur une seule.

La table `TRANSFERTS` de `transferts.js` est **écrite à la main**, comme les
distributions du Cadeau Mystère : ce sont des règles de service, pas des données
de jeu. Une quinzaine d'arêtes, et elles ne bougent qu'à l'ouverture ou à la
fermeture d'un service. `routeVersHome()` en tire le chemin par un parcours en
largeur, et la page groupe les jeux qui empruntent le même.

Sur la fiche, il reste **📍 Où il est** — dans le jeu, dans la Banque, ou déjà
dans HOME. Celui-là appartient bien à l'exemplaire, et c'est la seule chose que
l'application ne pouvait pas deviner : sans elle, le chemin part toujours du
jeu, même quand le Pokémon dort dans la Banque depuis 2019.

Ce qu'elle dit de plus qu'une flèche : **un service peut avoir une date de
fin**. La Banque Pokémon est le seul pont entre les seize jeux 3DS et Pokémon
HOME, et elle s'arrête.

**Trois états, et non deux.** « Ouvert » et « fermé » ne suffisaient pas : entre
les deux il y a le *sursis*, qui est le seul moment où l'information sert encore
à quelque chose. Un chemin qu'on annonce fermé alors qu'il fonctionne fait
renoncer pour rien ; un chemin qu'on annonce ouvert sans dire qu'il s'arrête
laisse rater la fenêtre. La page compte donc les mois qui restent, et range
l'urgent en tête.

La date vit dans `BANQUE_FERME_LE`, en haut de `transferts.js`, et **nulle part
ailleurs** : elle se corrige d'une ligne. À ne pas confondre avec le 27 mars
2023, qui est la fermeture de l'eShop 3DS — le jour où la Banque est devenue
*gratuite*, pas celui où elle s'arrête. La première version de ce code prenait
l'une pour l'autre et annonçait fermé un service qui tournait encore.

## Les objectifs sur mesure

Les vingt-quatre collections sont données d'avance. Rien ne permettait de suivre
« le living dex de Johto en balls d'Apricorne » ou « les 151 de Kanto, mais dans
Écarlate ».

Presque rien à écrire : la barre de filtres produit **déjà** l'ensemble. Il
manquait un bouton pour figer le résultat.

**L'ensemble est figé à la création**, pas recalculé. On garde la liste des noms
plutôt que les filtres, pour deux raisons : un objectif ne doit pas bouger sous
les pieds de celui qui se l'est fixé — le jour où le relevé gagne une ligne,
« les 151 de Kanto » restent cent cinquante-et-un — et le calcul devient une
intersection d'ensembles, instantanée et hors ligne.

Douze objectifs par aventure, deux mille entrées chacun. Au-delà, ce n'est plus
un objectif mais une seconde collection, et les Pokédex la comptent mieux.

## La fiche de capture

Un collectionneur ne possède pas « un Ronflex ». Il possède *un Ronflex en Honor
Ball, attrapé dans Cristal en 2001, avec son ruban*. La progression ne gardait
que le nom et le chromatique.

Huit champs facultatifs — Ball, nature, surnom, jeu d'origine, date, ruban,
dresseur d'origine, note — rangés par Pokédex puis par nom dans
`donnees.detailsCapture`. **Aucune table de plus** : ils voyagent dans la
sauvegarde du dex, l'API les range verbatim, `compterEspeces()` les ignore, et
`pokepension-1` les emporte gratuitement.

**Repliée par défaut, et absente tant que l'entrée n'est pas cochée.** C'est la
condition pour que ça n'abîme rien : quelqu'un qui découvre l'application ne
doit pas se voir demander une Ball au troisième clic.

## La rareté

Le classement compte le **nombre**. Il ne disait rien de la rareté : avoir un
Mew et avoir un Roucool y pesaient pareil.

`GET /api/rarete` compte, entrée par entrée, combien de dresseurs la possèdent —
sur les collections **déjà publiques**, et une par dresseur : son aventure
principale. C'est exactement la règle du classement, et la reprendre évite deux
vérités différentes sur la même page.

Le dex est un bloc JSON et non des lignes : compter demande de relire chaque
collection. D'où un cache de douze heures — une rareté ne bouge pas dans la
journée.

**Rien ne s'affiche sous cinq collections.** « Un dresseur sur deux » n'est pas
une rareté, c'est un hasard, et l'API renvoie alors une table vide.

## Les échanges

**Un accord, pas un transfert.** PokéPension ne déplace aucun Pokémon et n'en
vérifie aucun : c'est un carnet, pas une console. Ce qui est enregistré est une
intention — deux joueurs se mettent d'accord, puis se retrouvent dans leur jeu
pour le faire vraiment. D'où l'état **« fait »**, posé à la main par l'un des
deux : personne ne peut le constater à leur place, et le deviner serait mentir.

**Ça se propose depuis l'entraide, et de nulle part ailleurs.** Le panneau 🤝
savait déjà répondre à « qu'est-ce que vous pouvez vous apporter ? » : deux
colonnes, ce qu'il a et que tu n'as pas, ce que tu as et qu'il n'a pas. Un clic
dans chacune compose la proposition. Un formulaire séparé aurait redemandé à la
main ce que ces colonnes savent déjà.

### Le sens, et où il est tranché

En base, `offert` et `demande` sont écrits **du point de vue du demandeur**, une
fois pour toutes. Les rendre tels quels au receveur lui ferait lire « tu offres »
sous le Pokémon qu'il reçoit.

C'est donc la **lecture** qui les retourne, dans `vueEchange()` : l'API renvoie
`jeDonne` et `jeRecois`, qui veulent dire la même chose pour les deux. Aucun
écran n'a alors à savoir de quel côté il se trouve pour écrire la bonne phrase —
et cette question, tranchée une fois côté serveur, ne peut plus l'être de travers
dans le quatrième écran qui affichera un échange.

Le banc surveille précisément cette inversion : elle ne casse rien, ne lève rien,
et propose exactement le contraire de ce qui a été cliqué.

### La discussion n'ouvre qu'après un oui

L'abonnement aux amis est à sens unique et sans acceptation — c'est justifié
ailleurs dans ce fichier : rien de neuf n'y est révélé. Mais **écrire à
quelqu'un, si**. Une messagerie ouverte à qui veut suivre serait une porte que
l'abonnement n'a jamais eu à demander.

La règle est donc : on ne peut écrire qu'à quelqu'un **qui a accepté un échange
avec soi**. Un échange conclu reste lisible — on relit ce qu'on s'est dit — un
refus ferme la porte. Il n'y a pas de messagerie dans PokéPension, seulement la
discussion d'un accord.

## Ce qui te bloquera

« Est-ce que je peux boucler ce Pokédex tout seul ? » — la question qu'on se pose
en ouvrant un jeu. L'application connaissait déjà la réponse et ne la disait à
personne.

Le relevé des lieux range chaque entrée par mode d'obtention, et `ciblesDuJeu()`
s'en sert depuis toujours pour **écarter** ce qui n'est pas capturable. Il
suffisait d'inverser le filtre.

### Trois familles, et elles ne se valent pas

| | |
|---|---|
| **Absents de cette version** | à faire venir d'ailleurs — voir Transferts |
| **Par échange seulement** | il faut quelqu'un en face — c'est « Je cherche » |
| **Un seul exemplaire** | le scénario le donne une fois, et jamais deux |

La troisième ne bloque pas un Pokédex ordinaire ; elle bloque un **Living Dex**,
qui exige un exemplaire de chacun en même temps. Elle est donc montrée à part
plutôt que mêlée aux deux autres.

Sur Rouge/Bleu, l'écran rend neuf entrées par échange — les exclusivités de
version — et onze en exemplaire unique : les starters et le choix du dojo.

### L'ordre des tests compte

Une entrée peut porter plusieurs marques. Les huit échangeables de
Diamant/Perle sont catégorisés « sauvage » et ne portent l'échange qu'en mention,
comme le note déjà `dex.js`. On regarde donc du plus bloquant au moins bloquant :
absent l'emporte sur l'échange, qui l'emporte sur l'exemplaire unique.

Et « offert » ne fait un exemplaire unique que s'il est **seul** : là où le
Pokémon se croise aussi dans l'herbe, le cadeau n'est qu'un second chemin et ne
limite rien.

### On ne dit rien là où l'on ne sait pas

Un jeu dont le Pokédex n'a pas été relevé n'a pas « aucun blocage » : il a une
absence de source. Le bouton ne s'affiche donc que sur les vingt-deux Pokédex
relevés — même contrôle que la fiche, sur `pokedexReleve`. Promettre qu'on peut
tout attraper là où l'on ne sait pas serait le pire des deux mensonges.

## Où le ranger

La fiche d'un Pokémon porte sa **boîte et sa case**.

La vue boîtes existait déjà, et sa navigation dit « Boîte 3 · 22 / 30 » : de quoi
voir où en est la collection. Ce qu'elle ne disait pas, c'est la coordonnée
**d'une espèce** — et c'est justement ce qu'on cherche quand on a la console en
main et un Pokémon à ranger.

### Le plan ne suit pas le tri

C'est tout le point, et le banc le surveille. La vue boîtes obéit au tri
affiché : trier par type y fait des boîtes par type, ce qui est un usage
légitime. Mais une coordonnée qui se déplace parce qu'on a cliqué
« alphabétique » n'est pas un plan — on ne réarrange pas trente boîtes à chaque
changement d'écran.

L'ordre du plan est donc celui du Pokédex, toujours : « N° du jeu » sur un jeu,
le national sur la collection HOME. C'est l'ordre dans lequel un Living Dex se
range depuis toujours, et il ne dépend de rien de ce qu'on fait à l'écran.

## « Je cherche »

Dire ce qu'on veut, et voir chez qui c'est.

**La question que les échanges ne savaient pas poser.** Ils marchaient à
condition de savoir déjà à qui demander : il fallait ouvrir chaque ami, un par
un, pour voir ce qu'il pouvait donner. Une liste d'envies renverse le sens — on
dit ce qu'on cherche, l'application dit chez qui c'est, il ne reste qu'à
proposer.

**Ce n'est pas la liste des manquants**, et c'est toute la différence. Le Pokédex
sait déjà, et mieux que quiconque, ce qui manque : mille deux cents lignes. Ceci
dit ce qu'on veut *vraiment* — les cinq ou dix qu'on demanderait à quelqu'un. Une
intention, pas un inventaire. D'où le plafond de cinquante : au-delà, ce n'est
plus une envie, c'est de nouveau l'inventaire.

La liste vit dans la sauvegarde, comme les chasses et les objectifs. Seule la
question « chez qui ? » passe par le serveur.

### On relit les sauvegardes, faute de mieux

Un dex est un bloc JSON, pas des lignes : « qui a Mew » ne s'écrit pas en SQL.
`quiA()` relit donc les collections des amis. Le coût est borné par le nombre
d'amis — cent au maximum, une aventure chacun — et la réponse ne voyage qu'une
fois par ouverture de la page. C'est le raisonnement de `rarete()`, qui relit
déjà toutes les collections publiques.

Les aventures **privées** d'un ami n'entrent pas dans le compte : suivre
quelqu'un n'ouvre rien de plus que ce qu'il a rendu public.

### Nommer, pas compter

L'écran écrit « Ondine, Blue » et non « 2 amis l'ont ». Un compte oblige à ouvrir
pour savoir qui ; le nom permet d'aller lui parler tout de suite.

## Le mur d'un dresseur

Ses photos, celles qu'on a le droit de voir — bouton « 📷 Ses photos » sur sa
fiche.

**C'était la pièce manquante.** Les photos étaient déposées, protégées, servies
— et invisibles : la règle d'accès autorisait un ami à les voir, mais aucun écran
ne les montrait. Un mécanisme sans vitrine ne montre rien, ce qui était
exactement le contraire du but.

`mur()` relit les sauvegardes en plus de `pa_images`, et il le faut : la table
sait quelles photos existent, elle ignore **à quoi** elles sont attachées — le
lien vit dans le blob, du côté de la chasse ou du défi qui porte le champ
`image`. Sans cette relecture on rendrait une planche de vignettes anonymes.

Une photo citée par une sauvegarde mais absente de la table est écartée : une
vignette morte est pire que rien.

## Le défi du jour

Un Pokémon tiré au hasard, chaque jour, sur l'accueil. **Le même pour tout le
monde**, et il change à minuit.

**Aucun jeu n'est nommé.** Le défi dit « celui-là », pas « celui-là dans
Rouge/Bleu » : n'importe quel jeu fait l'affaire, y compris celui auquel on joue
ce soir. Nommer un jeu écartait d'office ceux qui ne l'ont pas, pour un défi qui
n'a rien d'obligatoire — le coût était réel, le gain nul. Et cela a rendu le
tirage **synchrone** : plus de Pokédex à charger, plus de branche « liste
indisponible », le défi paraît du premier coup.

### Rien d'obligatoire, et ce n'est pas une nuance

Ce n'est pas une tâche, pas une série à tenir, pas un compteur qui rougit quand
on saute un jour. C'est un prétexte — « tiens, celui-là, aujourd'hui » — et son
vrai objet est la photo qu'on en sort.

D'où l'**absence de série consécutive**, qui est une décision et non un oubli :
on compte combien de défis ont été relevés, jamais combien de jours d'affilée.
Le second chiffre punit ceux qui ne jouent pas tous les soirs, et ils sont la
majorité. Un carnet de collection n'a pas à se comporter comme une application
d'habitudes.

### Le tirage n'appelle aucun serveur

Il se déduit de la date, par le même générateur amorcé que le programme du soir.
Deux machines, deux pays, la même journée donnent le même Pokémon. Rien à
synchroniser, rien à stocker, et **cela marche hors ligne** — ce qui est la
moitié de l'intérêt.

Il puise dans `allEntries` et non dans `poolHome()`, et la nuance est tout sauf
cosmétique : le second dépend de `niveauFormes`, qui appartient à l'aventure.
Deux joueurs réglés différemment n'auraient alors pas le même tirage, et le
« même pour tout le monde » serait faux **sans que rien ne le signale**. Le banc
surveille précisément ce point, en tirant la même date aux niveaux 1 et 4.

La clé du jour est la **date locale**, jamais l'UTC : le défi doit changer à
minuit chez soi. En UTC il basculerait à deux heures du matin en France, en
pleine session.

Les espèces sont **triées** avant qu'on y puise : l'ordre naturel de la réserve
n'est garanti par rien, et il suffirait qu'il bouge d'une version à l'autre pour
que deux machines tombent sur deux Pokémon différents le même jour.

### Il pioche parmi toutes les espèces

Pas seulement dans les manquants. Un défi qui ne piocherait que là deviendrait
une corvée déguisée, et s'éteindrait le jour où l'on finit son dex. Tomber sur
un Pokémon qu'on possède déjà n'est pas un défaut : c'est l'occasion de le
montrer.

Et puisque aucun jeu n'est imposé, **l'avoir coché dans un seul Pokédex suffit à
l'avoir** : la carte regarde tous les Pokédex, la collection HOME comprise.

### L'historique

« Voir les précédents », sous la carte : une modale, et non une section de plus —
l'accueil est déjà long, et cette liste se consulte de temps en temps.

Elle montre **tout ce qui est gardé, relevé ou non**. Ne lister que les réussites
ferait un palmarès ; c'est un journal qu'on veut, et savoir ce qu'on a laissé
filer un mardi de septembre en fait partie.

### Ce qui s'écrit, et ce qui ne s'écrit pas

Le défi **du jour** ne s'écrit nulle part : il se recalcule. Seul le **passé**
est gardé, dans un tableau `defis` de la sauvegarde — aux côtés de `chasses` et
`objectifs`, pour la même raison qu'eux — parce qu'il n'est plus reproductible :
le tirage d'il y a trois semaines dépendait de listes qui ont pu changer depuis.

La photo est facultative, et réutilise `pa_images` sous le sujet `defi`. La
colonne `sujet` existait dès le premier jour pour cela : même dépôt, même règle
de visibilité, même quota, même ménage — aucune migration.

## Les photos de chasse

Le tableau de chasse alignait des chiffres : 2311 rencontres, 1/1365, treize
jours. Cela dit l'effort, pas le moment. La capture d'écran de l'apparition, si
— et **c'est elle qu'on montre**. Ce n'est pas un album privé : c'est le but de
la chose.

### La règle d'accès est celle qui existait déjà

Une photo suit la visibilité de **l'aventure** à laquelle elle appartient,
exactement comme le dex. Aventure publique, la photo se voit de qui peut déjà
voir cette aventure ; aventure privée, elle ne sort pas.

Aucune seconde règle à comprendre, aucun réglage de plus, et surtout rien qui
puisse se désaccorder de la première. Une photo introuvable rend **404 et non
403** : dire « elle existe, mais pas pour toi » renseignerait sur le contenu
d'une aventure privée.

### Sur le disque, pas en base

### Le dossier ne se déduit pas du répertoire courant

`process.cwd()` a été une erreur, et elle s'est vue en production : un service
n'est pas lancé depuis le dossier où il vit. Chez alwaysdata le répertoire
courant est le dossier personnel, et la première photo est partie dans
`~/donnees/images` au lieu de `~/PokePension/api/donnees/images`.

Le contournement évident — poser `IMAGES_DOSSIER` dans `api/.env` — ne servait à
rien non plus : **le service ne lit pas ce fichier**. `npm start` passe
`--env-file-if-exists=.env`, un chemin relatif, cherché depuis ce même répertoire
courant où il n'y a rien. Les identifiants MySQL viennent du panneau de
l'hébergeur, ce qui masquait le problème.

Le chemin se déduit donc de `import.meta.url` : l'endroit où le module se trouve
sur le disque, qui ne dépend de personne. `IMAGES_DOSSIER` reste accepté, pour
qui veut ranger les photos sur un autre volume, mais plus rien ne l'exige.

`pa_images` ne garde que la fiche — propriétaire, aventure, type, taille,
dimensions. Le fichier vit dans `api/donnees/images`, hors du dépôt.

Un BLOB de deux mégaoctets par chasse ferait grossir chaque sauvegarde SQL
d'autant, et la base d'un hébergement gratuit est bien plus étroite que son
disque. **Le revers est assumé : `outils/sauvegarder.js` n'emporte pas les
fichiers.** Une restauration retrouve les fiches sans les images ; le tableau
affiche alors une case vide plutôt qu'un carré cassé.

### Le redessin, et pourquoi il a lieu deux fois

**L'application redessine d'abord.** Une capture de Switch fait 1280 × 720 et
200 Ko ; une photo de téléphone fait 4000 × 3000 et huit mégaoctets. Le canvas
les ramène à 1600 pixels de côté et les réencode en JPEG.

**Cela efface les métadonnées, et c'est la vraie raison de le faire au plus
tôt.** Une photo de téléphone porte sa position GPS : publier un chromatique ne
doit pas publier son salon. Le canvas ne recopie que les pixels.

**Le serveur revérifie quand même.** Il ne fait pas confiance à un client qu'il
ne contrôle pas : il relit le type dans les octets — jamais dans l'en-tête
`Content-Type`, qui est déclaratif — relit les dimensions dans le SOF, et retire
lui-même les segments APP1 à APP15 du JPEG. Il n'a pas de bibliothèque d'images
et n'en veut pas : ces trois contrôles se font à la main, sur les octets.

Le SVG est refusé à la porte. C'est du balisage exécutable, pas une image, et le
servir depuis notre domaine reviendrait à héberger le script de quelqu'un
d'autre.

### Le ménage, et l'endroit où il est possible

Les chasses vivent **dans la sauvegarde**, pas dans une table. Supprimer une
chasse n'est donc pas une requête que le serveur voit passer : c'est un tableau
qui revient plus court. Le seul moment où l'on apprend qu'une chasse a disparu
est **l'enregistrement du dex** — c'est là que le ménage a lieu, en comparant
les photos de l'aventure à celles que les chasses réclament encore.

Une prudence est écrite dans ce ménage : **si la sauvegarde ne parle pas de
chasses du tout, on ne touche à rien.** Un import partiel, ou un client plus
ancien, ne doit pas emporter les photos au passage. L'absence d'une clé n'est
pas la preuve qu'elle est vide.

### Le passage par le pont

La fenêtre ne va pas chercher l'image elle-même : l'adresse exige le jeton de
session, et celui-ci vit dans le processus Rust et ne descend jamais dans la
page. `image_charger` la rapporte donc en adresse `data:`, ce qui coûte un tiers
de volume en plus — le prix d'un jeton qui reste où il est.

### Quotas

Trois mégaoctets par photo à l'entrée du serveur ; l'application en envoie dix
fois moins. Soixante photos et quarante mégaoctets par compte : c'est une photo
par chasse aboutie, et personne n'en termine soixante.

## Les notifications

Deux sources, et une seule cloche 🔔.

**Ce qui se déduit ne s'écrit pas.** Les captures des amis se lisent dans
`pa_historique`, qui porte déjà une ligne par Pokémon ajouté avec son jeu, sa
date et s'il est chromatique. Une seconde table qu'il faudrait tenir d'accord
avec la première n'apporterait rien.

**Ce qui s'adresse s'écrit.** Une proposition d'échange s'adresse à quelqu'un,
attend une réponse, et a un état : non lue, lue, répondue. Rien de cela ne se
recalcule à partir d'ailleurs — d'où `pa_notifications`.

La différence se voit à l'écran, et c'est pour ça qu'elle compte : une capture
d'ami est une nouvelle qu'on lit ou pas, une proposition est une question à
laquelle il faut répondre. Les mélanger ferait perdre les secondes dans les
premières. La cloche porte les secondes ; l'onglet 📣 Amis garde sa pastille
pour les premières.

**Le titre ne nomme jamais les Pokémon.** En base on n'a que des identifiants
d'espèce (`mr-mime`), et la langue d'affichage est un réglage de l'appareil :
une phrase figée à l'écriture serait fausse pour qui lit dans l'autre langue, ou
après avoir changé de réglage. L'API joint donc l'échange, et l'application
écrit « Tadmorv contre Machoc » elle-même.

**Un sondage, pas une connexion ouverte.** Deux minutes. Maintenir une socket
par joueur coûterait bien plus que trois requêtes à l'heure sur un hébergement
gratuit, et deux minutes de retard sur une proposition d'échange ne gênent
personne : on n'échange pas à la seconde.

## Le site installable

C'est sur le téléphone posé à côté de la Switch qu'on coche. Le site s'adaptait
déjà à la fenêtre ; il ne s'installait pas, ne s'ouvrait pas hors ligne, et
vivait dans un onglet qu'on perd.

`assembler.py` écrit maintenant un manifeste, quatre icônes reprises de celles
de Tauri, et un service worker. Tout est côté `site/` : une application de
bureau n'a ni manifeste ni service worker, et lui en poser un ne ferait que du
bruit dans sa console.

Deux stratégies :

- **la coquille** — `index.html`, les feuilles, les scripts du premier
  chargement, les polices, les bannières — est mise en cache à l'installation.
  La liste se **lit** dans la page qu'on vient d'écrire, elle ne se tient pas à
  la main : un script ajouté à `index.html` y entre sans que personne n'ait à y
  penser ;
- **les réserves à la demande** — les lieux, les attaques, les notices,
  Cobblemon, 5,3 Mo à elles seules — entrent en cache au premier usage. Les
  précharger triplerait l'installation pour des panneaux qu'on n'ouvre pas
  toujours : c'est le raisonnement qui les avait déjà sorties du démarrage.

La version du cache est celle des **fichiers**, pas un numéro tenu à la main.
Un numéro s'oublie, et un cache qu'on oublie de purger sert du code mort en
croyant bien faire.

## L'overlay de chasse

Une page servie sur `127.0.0.1`, à coller en source navigateur dans OBS : le
sprite, le compteur, le taux et la probabilité cumulée, sur fond transparent.

Aucune dépendance de plus : `tiny_http` était déjà là pour recevoir le retour de
connexion Discord. La plage d'écoute est distincte (8760-8779) — les deux
peuvent tourner en même temps, et un port partagé ferait échouer l'un des deux
sans qu'on sache lequel.

Rien ne démarre tout seul, l'écoute n'est ouverte qu'après un clic, et seulement
sur la boucle locale. Ce qui y passe, ce sont les chiffres d'une chasse : c'est
destiné à être diffusé en direct.

## Les raccourcis globaux

`Ctrl+Alt+↑` et `Ctrl+Alt+↓` comptent une rencontre, **fenêtre en
arrière-plan**. C'est le point : pendant qu'on chasse, la fenêtre de PokéPension
n'est pas au premier plan — le jeu l'est. Un raccourci de fenêtre ne servirait
que pendant les pauses.

Des flèches et non des lettres : un code de touche est physique, et une lettre
ne tombe pas au même endroit sur AZERTY, QWERTY ou QWERTZ.

Un échec ne fait pas tomber l'application : une autre application peut déjà
tenir la combinaison, on le note dans la console et on continue. Les raccourcis
de la page Chasse — Espace, Retour arrière, Entrée — marchent de toute façon.

`tauri-plugin-global-shortcut` est déclaré en **dépendance ordinaire** et non
sous `cfg(desktop)` : c'est ainsi que le script de compilation de Tauri trouve
ses fichiers de permission. Sous une table de cible, `global-shortcut:default`
reste introuvable et la compilation s'arrête.

## Le cache local

`cache.js` garde les listes de référence dans `localStorage` pour que
l'application démarre sans réseau. Un seul mécanisme décide quand les jeter :
la réserve embarquée porte sa date de génération (`genereLe`), et
`purgerSiReserveePlusRecente()` la compare à ce que le stockage a déjà vu. Si
elles diffèrent, tout part.

Une regénération se propage donc **d'elle-même** : `py outils/generer.js` change
la date, la date déclenche la purge, et personne n'a rien à penser.

La clé portait autrefois un numéro de version à incrémenter à la main. Il
faisait double emploi et a été retiré. Ce qu'il couvrait en propre — changer la
**forme** des données sans toucher à la réserve — se règle en regénérant celle-ci,
ce qui remet la date à jour. Le cas est rare : forme et contenu bougent ensemble
en pratique.

## Se relire, et se vérifier

Quatre outils, aucune dépendance, rien à installer.

```
cd app
py outils/verifier.py     # relecture statique, deux secondes
py outils/banc.py         # l'application tourne et se vérifie
py outils/verif.py        # l'application tourne et SE MONTRE
```

```
cd api
npm run banc              # le serveur se vérifie, sur la vraie base
```

### Le banc de l'API

Il a longtemps manqué, et l'absence se voyait : trente-sept vérifications côté
application, dix-huit côté site, **zéro côté serveur** — alors que c'est lui qui
porte le plus délicat. L'inversion du sens dans un échange, la règle de
visibilité des photos, le ménage déclenché par une sauvegarde, le retrait de
l'EXIF, « qui a ce Pokémon ». Tout cela avait été éprouvé une fois, à la main,
au curl. Rien n'était rejouable.

**Il tourne sur la vraie base**, et c'est délibéré : ce qu'on veut éprouver, ce
sont les requêtes SQL, les clés étrangères et les contraintes. Les simuler
reviendrait à valider une imitation. Les modules sont appelés directement, sans
passer par HTTP : on vérifie la règle, pas le routage.

**Il ne touche à aucun compte réel.** Ses dresseurs portent des identifiants
Discord d'une plage réservée — `991…`, voisine de celle de `peupler.js` et
distincte d'elle — et il les efface en partant, y compris quand une vérification
échoue, par un `try/finally`. Un banc qui laisse ses figurants derrière lui
pollue le classement de tout le monde.

**Chaque vérification part d'une ardoise propre** quand elle compte quelque
chose. La première version du contrôle de ménage attendait « une photo effacée »
et en trouvait trois : les vérifications précédentes avaient laissé les leurs.
C'était un défaut du test, pas du code — mais il aurait tout aussi bien pu
masquer l'inverse.

Les deux premiers répondent à « est-ce que ça marche » et rendent un verdict.
**`verif.py`** répond à « qu'est-ce que ça donne » et rend la main : il sert
l'application sur le port 8126 avec un panneau à droite, une ligne par
nouveauté — ce qu'il faut regarder, un témoin vert ou rouge pour ce qui se
vérifie tout seul, et un bouton qui amène l'écran à l'endroit exact.

Il sert un **compte déjà commencé** — trois Pokédex entamés, deux chasses en
cours, trois abouties, deux objectifs, deux fiches de capture, une amie et une
table de rareté. Sans collection, la moitié des écrans n'affichent que leur état
vide : le programme du soir n'a rien à proposer, le tableau de chasse est
absent, la rareté se tait. On ne vérifierait alors que des messages
d'indisponibilité.

Comme le banc, il remplace le pont Tauri par des réponses en mémoire : aucune
connexion Discord, aucune écriture en base, et l'état meurt avec la page.

**`verifier.py`** lit les fichiers sans rien lancer. Il attrape trois choses :
un `getElementById` qui vise un identifiant absent du HTML, un appel à une
fonction qui n'existe nulle part, et du code mort. Il sort en erreur sur les
deux premières — celles-là cassent vraiment ; le code mort n'est qu'un rapport.

Il relit **quatre groupes**, parce qu'un fichier ne se juge que dans la page qui
le charge :

| Groupe | Ce qu'il relit | Ce qui s'y vérifie |
| --- | --- | --- |
| l'interface | `index.html` et ses vingt scripts | tout |
| l'API | `api/src/*.js` | les appels, le code mort |
| les pages de génération | `generer-donnees.html`, `generer-attaques.html` | les identifiants, les appels |
| le banc | `banc-verifications.js`, sur la page que sert `banc.py` | les identifiants, les appels |

L'API n'a pas de page : ni identifiant ni élément du DOM à y relire. Restent les
appels — et les noms qu'un module importe d'un autre y comptent comme déclarés,
sans quoi `creerSchema()` passerait pour introuvable dans `serveur.js`.

Les pages de génération, elles, portent tout le HTML de l'application mais ne
chargent ni `compte.js` ni `app.js`. Les six appels qui visent ces deux-là
sortent dans une liste à part — « appels à une fonction que la page ne charge
pas », qui dit pour chacun où la fonction vit. Ils ne cassent que si la page
emprunte ce chemin, et ne font donc pas échouer la relecture ; une faute de
frappe, elle, reste dans les introuvables et fait sortir en erreur.

Le banc se relit sur la page que `banc.py` sert vraiment, injections comprises :
`banc-verifications.js` n'appelle que des fonctions de l'application, et le lire
seul ferait passer chacun de ses appels pour manquant.

Il neutralise les commentaires et les chaînes avant de chercher, sans quoi « la
purification (voir plus bas) » d'un commentaire français passe pour un appel à
`purification()`. Il connaît aussi les paramètres de fonction : sans eux, le
`tenir`/`rejeter` d'une promesse ressemblait à deux fonctions manquantes.

**`banc.py`** sert `app/src` sur le port 8125 avec le pont Tauri remplacé par
des réponses en dur. Aucune connexion Discord, aucune écriture en base : on peut
supprimer, vider et renommer sans qu'une seule requête parte. Le rapport
s'affiche en haut de la page.

Pourquoi un banc plutôt que des tests unitaires : l'interface est faite de
scripts classiques qui se parlent par des variables globales, sans modules ni
exports. Il n'y a rien à importer isolément — le seul endroit où le câblage
existe vraiment, c'est la page chargée.

Les vérifications sont dans `outils/banc-verifications.js`, et la règle pour en
ajouter une est simple : **un bug est passé, on écrit ce qui l'aurait arrêté.**
Pas de tests écrits au cas où — ils vieillissent mal et personne ne les relit.
Chaque entrée porte donc le nom du problème réel qu'elle surveille.

### Ce que les deux dernières entrées surveillent

La première tient à une seule cause : **une fonction appelée depuis une page qui
ne la charge pas.** Les pages de génération rejouent l'interface sans `compte.js`
ni `app.js` — ni session à tenir, ni pont Tauri à nourrir. Six appels visent
pourtant ces deux fichiers ; `verifier.py` les liste, et le banc les retire tous
les six avant de rejouer les chemins qui y mènent. Deux cassaient vraiment :

- `gotoDex()` appelait `setShinyView()` à nu, alors qu'il vit dans `app.js`.
  Le garde tient maintenant dans `vueShiny()`, posé une fois pour trois appels ;
- `dessinerChasses()` appelait `depuisQuand()`, resté dans `compte.js` par
  accident d'écriture alors qu'il ne calcule qu'une date. Il a déménagé dans
  `noyau.js`, que tout le monde charge : le trou est supprimé plutôt
  qu'emballé dans un garde, et une chasse datée ne casse plus la liste.

Deux chemins doivent être forcés pour être vus, et c'est le genre de détail qui
décide si une vérification sert : la chasse est **datée**, sans quoi la ligne
« commencée … » n'appelle rien ; et le sélecteur 🧬 est le seul chemin
asynchrone, donc ce qu'il casse part en rejet non capturé — le banc écoute
`unhandledrejection` le temps du passage, un `try` ne suffirait pas.

La seconde entrée est née de la première. En vérifiant que `vueShiny()` ne
changeait rien au comportement, on a découvert que **les trois raccourcis de
l'accueil ne faisaient rien** : `gotoDex()` posait le filtre, puis appelait
`showPage()`, qui remet les filtres à zéro dès qu'on change de Pokédex — et on
en change à tous les coups, puisqu'on arrive de l'accueil. « ✨ Ma chasse
shiny » ouvrait le Dex entier, en vue normale, sans un mot. L'ouverture passe
donc avant le préréglage, et la grille se redessine après lui.

### La contre-épreuve des Pokédex de jeux

`src/js/donnees-pokedex.js` porte **onze relevés Pokékalos**, un par Pokédex de
jeu récent, et joue pour les Pokédex ce que `donnees-home.js` joue pour le
périmètre HOME : une source indépendante de PokeAPI, contre laquelle le banc
mesure la réserve embarquée. Une régénération qui perdrait des entrées — ou en
inventerait — se verrait au passage suivant.

```
cd app
py outils/relever-pokedex.py     → refait le relevé depuis les onze pages
```

L'outil compare ce qu'il obtient au compte attendu et **sort en erreur** si une
page ne le rend plus : une page remaniée se signale ainsi tout de suite, au lieu
d'écrire un faux relevé sans rien dire.

Le relevé retient les **noms français**, pas les numéros, parce que les pages ne
numérotent pas de la même façon : la plupart donnent le numéro propre au Pokédex
(#001 Germignon pour Illumis), le Disque Indigo donne le numéro national (#0084
Doduo). Le banc ramène ensuite chaque nom à son espèce, et c'est là que se
cachent trois pièges — tous rencontrés en l'écrivant :

- **♀ et ♂ portent l'espèce.** Les effacer confond les deux Nidoran, et le
  relevé national retombait alors sur 492 espèces pour 493 noms ;
- **la forme de base porte parfois un qualificatif**, des deux côtés :
  « Mistigrix (Mâle) » dans la réserve, « Lougaroc forme Nocturne » au relevé ;
- **l'exclusivité de version est collée au nom** : « Capumain Violet ».

Sur les dix Pokédex comparés, **huit tombent au Pokémon près**. Les deux écarts
sont connus, et le banc échouerait si un troisième apparaissait :

| Pokédex | Écart | Pourquoi |
| --- | --- | --- |
| Disque Indigo | +17 | le relevé ne donne pas de ligne aux formes régionales — « Ramoloss de Galar » n'y figure que dans les quêtes, et « Alola » pas une seule fois. PokeAPI les compte |
| Sinnoh (BDSP) | +1 | Manaphy, qui ne s'obtient pas dans le jeu, n'a pas de ligne au relevé. Le Pokédex du jeu, lui, le compte |

L'écart va toujours dans le même sens — l'application en a plus, jamais moins —
et c'est le bon sens pour un outil de suivi : mieux vaut une case à cocher de
trop qu'une case absente.

Un Pokédex reste sans contre-épreuve : le « Pokédex régional d'Alola »
d'Ultra-Soleil / Ultra-Lune, dont la page ne contient qu'un tableau de 37 lignes
finissant par « #??? » — un article de pré-sortie jamais complété. `updated-alola`
et ses 403 entrées ne sont donc vérifiés par rien.

Deux détails qui ont failli le rendre inutile, et qui sont réglés :

- il sert chaque script avec une empreinte différente (`?v=…`). Les en-têtes
  `no-store` ne suffisent pas — le navigateur garde les scripts en mémoire de
  page. Sans ça le banc validait un code qui n'était plus sur le disque, ce qui
  est pire que pas de banc du tout ;
- `outils/verifier.py` force sa sortie en UTF-8 : la console Windows est en
  cp1252 et plantait sur une flèche.

Les deux ont été éprouvés en leur plantant de vraies fautes : le vérificateur
retrouve un appel inventé dans l'API, un autre dans un outil de génération et un
identifiant inventé dans le banc — trois groupes, trois prises, une sortie en
erreur ; le banc, lui, retrouve les 251 entrées indéposables si l'on désarme
`poolHome()`.

La dernière entrée a été éprouvée de la même façon, en lui remettant l'ancien
ordre le temps d'un passage : elle échoue sur « Mes manquants » et « Ma chasse
shiny », et pas sur « Ouvrir le Pokédex » — dont le filtre est justement celui
que la remise à zéro produit. Il n'y avait rien à y voir : les deux boutons qui
promettaient quelque chose sont les deux qui échouaient.

## Lancer en développement

```
cd api
npm install
npm start          → http://127.0.0.1:8787
```

```
cd app
cargo tauri dev
```

## Construire l'installeur

```
cd app
cargo tauri build
```

Le résultat sort dans
`app/src-tauri/target/release/bundle/nsis/PokéPension_0.1.0_x64-setup.exe`.

> **Avant de distribuer**, l'application doit pointer vers une API publique et
> non vers `127.0.0.1`. L'adresse est fixée à la compilation :
>
> ```
> set POKEPENSION_API=https://api.ton-domaine.fr
> cargo tauri build
> ```
>
> Sans cela, l'application de tes amis cherchera l'API sur *leur* machine.

## Héberger l'API

Tant que l'API vit sur `127.0.0.1`, l'application ne fonctionne que sur la
machine qui la développe. Distribuer l'installeur sans hébergement, c'est
livrer un programme qui s'ouvre et où rien ne marche : ni connexion, ni
Pokédex, ni comparaison entre dresseurs.

L'hébergement retenu est **alwaysdata**, plan gratuit : Node, MySQL, HTTPS et
un sous-domaine, sans carte bancaire. L'empreinte tient large — 5,7 Mo de
dépendances et 13,4 Mo de dépôt, pour 100 Mo alloués.

### Ce que le service attend de son hôte

Trois variables décident de tout, et deux d'entre elles ne viennent pas de nous :

| | |
|---|---|
| `PORT` et `IP` | **fournis par alwaysdata**. Le service écoute exactement dessus ; `config.js` les lit sans qu'on ait à les poser |
| `API_URL` | l'adresse publique. Elle construit l'adresse de retour Discord, qui doit correspondre **au caractère près** |
| `DB_*` | la base, avec `DB_SSL=oui` — elle est sur une autre machine que le service |

> Écouter sur la mauvaise adresse est le piège de l'hébergement : le service
> démarre, les journaux disent que tout va bien, et il reste injoignable.
> `config.js` essaie `HOTE`, puis `IP` (alwaysdata), puis `HOST` (les autres),
> et ne retombe sur `127.0.0.1` qu'en dernier recours.

### La marche à suivre

1. **Un compte** sur <https://www.alwaysdata.com>, plan gratuit 100 Mo. Le nom
   du compte devient le sous-domaine : `pokepension.alwaysdata.net`.

2. **La base**, dans *Bases de données → MySQL → Ajouter*. Notez le serveur,
   l'utilisateur, le mot de passe et le nom — ils vont dans les variables.
   Le service crée ses tables tout seul au premier démarrage.

3. **Le code**, en SSH (les identifiants sont dans *Accès distant → SSH*) :

   ```
   git clone https://github.com/Tennosei5804/PokePension.git
   cd PokePension/api
   npm install --omit=dev
   ```

4. **Le site**, dans *Web → Sites → Ajouter*, en type Node.js :

   | | |
   |---|---|
   | Commande | `node /home/<compte>/PokePension/api/src/serveur.js` |
   | Adresse | `pokepension.alwaysdata.net` |

   > **Le chemin doit être absolu.** Le champ « répertoire de travail » n'a
   > pas d'effet sur un site Node : alwaysdata lance la commande depuis la
   > racine du compte, quoi qu'on y mette. Avec un chemin relatif, le
   > journal affiche `Cannot find module '/home/<compte>/src/serveur.js'`
   > et le site reste en 502 — le fichier existe, il est cherché ailleurs.

   Pas de `--env-file` : il n'y a pas de `.env` sur le serveur, les variables
   viennent du panneau.

   Les variables d'environnement se posent dans la configuration du site —
   surtout pas dans un `.env` versionné.

5. **Discord**, sur <https://discord.com/developers/applications>, onglet
   *OAuth2 → Redirects*. Ajoutez l'adresse de retour **exactement** :

   ```
   https://pokepension.alwaysdata.net/auth/discord/retour
   ```

   Discord compare caractère par caractère : un `http` au lieu de `https`, une
   barre oblique en trop, et la connexion échoue avec un message qui ne dit pas
   pourquoi.

6. **Le dépôt**, enfin : dans *Settings → Secrets and variables → Actions →
   Variables*, posez `POKEPENSION_API` à `https://pokepension.alwaysdata.net`.
   Le workflow refuse de publier sans elle — un installeur compilé sans cette
   adresse chercherait l'API sur la machine de chaque personne l'installant.

### Vérifier que ça tourne

```
curl https://pokepension.alwaysdata.net/api/etat
```

Doit répondre quelque chose comme :

```json
{"service":"pokepension","discord":true,
 "commit":"1ae51c3","demarreLe":"2026-08-25T18:04:11.882Z","deboutDepuis":93}
```

Un `discord:false` signifie que `DISCORD_CLIENT_ID` ou `DISCORD_SECRET` manque
à l'appel.

`commit` est la révision **réellement en cours d'exécution**, lue dans `.git` au
démarrage du processus et figée là — un `git pull` pendant le service ne la fait
donc pas mentir. `deboutDepuis` est en secondes.

### Mettre l'API à jour

```
ssh <compte>@ssh-<compte>.alwaysdata.net
cd PokePension && git pull && cd api && npm install --omit=dev
```

Puis *redémarrer* le site depuis le panneau. Le service ne se recharge pas
tout seul : sans redémarrage, il continue de servir l'ancien code.

### Vérifier qu'une mise à jour est bien passée

```
curl -s https://pokepension.alwaysdata.net/api/etat
```

Le `commit` doit être celui qu'on vient de pousser, et `deboutDepuis` doit être
petit — quelques secondes ou minutes, pas plusieurs jours.

**C'est le seul contrôle qui marche à tous les coups.** On a longtemps guetté
qu'une route neuve passe de `404` à `401`, ce qui est vrai mais ne sert que
lorsqu'une route est ajoutée. Un lot qui ne change que le *contenu* des réponses
ne modifie aucun code de statut : de l'extérieur, avant et après sont
identiques. C'est arrivé le 25 août 2026 sur un correctif qui rendait
vingt-quatre succès à zéro — il a fallu ouvrir l'application pour savoir.

Un `commit` à `null` signifie que le dossier n'est pas un dépôt git : c'est le
cas si le code a été déposé par transfert de fichiers plutôt que par `git pull`.
Tout le reste continue de fonctionner.

## Les pseudos et les noms d'aventure

Les deux s'affichent chez les autres — dans le classement, dans la recherche de
dresseurs, à côté du Pokédex de gens qui n'ont rien demandé — et **personne ne
surveille la liste après coup**. Le refus se fait donc à la saisie, dans
`api/src/pseudos-interdits.js`, **côté serveur** : l'application est distribuée
et son code public, un filtre côté client se contourne en deux minutes.

### Pourquoi deux listes

Chercher bêtement une sous-chaîne refuse des prénoms réels :

| Refusé à tort | à cause de |
|---|---|
| Constance, Conrad, Consuelo | `con` |
| Cassandre, Assassin, Bass | `ass` |
| Calculette, Culotte | `cul` |
| Analyse | `anal` |

C'est le **problème de Scunthorpe** — du nom de la ville anglaise qu'un filtre a
empêchée entière de créer des comptes en 1996 — et il rend le filtre pire que
rien : refuser son prénom à quelqu'un est une insulte en soi.

D'où deux listes :

| | |
|---|---|
| **fortes** | sans hôte innocent. Cherchées **partout**, même collées : « xXenculéXx » tombe |
| **faibles** | courtes, logeant dans des mots ordinaires. Cherchées **en mot entier** : « con » tombe, « Conrad » passe |

### Ce que la normalisation rattrape

Les contournements sont mécaniques, donc rattrapables :

| | |
|---|---|
| accents | `ènculé` |
| chiffres | `c0nnard` |
| séparateurs | `c.o.n.n.a.r.d` |
| répétitions | `connnnnard` |

**L'ordre compte** : on ôte les séparateurs *avant* de replier les répétitions.
L'inverse laisse `c.o.n.n.a.r.d` avec ses deux n — ils ne sont pas adjacents —
et la racine n'est jamais rencontrée.

Et une racine peut **disparaître au repli** : `kkk` devient `k`, une lettre
unique qui bloquait *Shitake* et *Dickens*. Toute racine tombée sous quatre
caractères rejoint donc les faibles.

### Deux choix de comportement

- **Le refus ne nomme jamais le mot déclencheur.** Le dire apprendrait quoi
  contourner.
- **Un nom Discord grossier n'empêche pas d'entrer.** Il est remplacé en
  silence par le nom neutre ; la personne pourra en choisir un autre, qui
  passera par le filtre.

### Ce que ça n'attrape pas

Aucune liste n'arrête quelqu'un de déterminé : restent les fautes volontaires,
les langues non listées, et l'insulte qui n'en est une que pour celui qui la
reçoit. Ce filtre écarte le gros et l'évident. **Il ne remplace pas la
possibilité de renommer quelqu'un à la main, qui n'existe pas encore.**

## Ce qui protège l'API en ligne

Tant que le service vivait sur `127.0.0.1`, le seul client possible était sur
la même machine. Publié, il est atteignable par n'importe qui — et deux
défenses manquaient.

### La limitation de débit

`src/debit.js`, sans dépendance comme le reste du service : une fenêtre
glissante par adresse, en mémoire du processus.

| Routes | Budget | Pourquoi |
|---|---|---|
| `/auth/*` | 30 / 10 min | un départ de connexion appelle Discord et écrit en base ; on en ouvre un par session, pas trente par minute |
| `/api/*` | 600 / 5 min | suit l'application, qui lit son dex à l'ouverture et l'écrit à chaque coche. Large pour ne jamais gêner quelqu'un de réel |

Au-delà : `429`, un `Retry-After`, et un message en français.

> **`app.set('trust proxy', 1)` conditionne tout.** Chez l'hébergeur, une
> requête passe par son proxy avant d'arriver au service : sans cette ligne,
> `req.ip` rend l'adresse du proxy — la même pour tout le monde — et la
> limitation bloquerait **tous les visiteurs à la fois** plutôt que le seul qui
> abuse. Et surtout pas `true`, qui ferait confiance à ce que le client écrit
> lui-même dans `X-Forwarded-For` : il suffirait d'annoncer une adresse
> différente à chaque requête pour passer à travers. On n'en croit qu'un.

Le risque n'est pas seulement le service : l'hébergement gratuit interdit
explicitement de trop consommer de CPU. Ce n'est pas le service qui tomberait
en premier, c'est le compte qui serait suspendu.

### Les sauvegardes

Les collections des dresseurs vivent sur un serveur, et un serveur n'est pas un
endroit sûr.

```
node outils/sauvegarder.js                  → ../sauvegardes/, quatorze gardées
node outils/restaurer.js <fichier>          → dit ce qu'il ferait
node outils/restaurer.js <fichier> --vraiment → le fait
```

Quatre tables sont sauvegardées ; `pa_sessions` **délibérément pas** — ce sont
des jetons de connexion, ils expirent seuls, et les restaurer reconnecterait
des gens à leur insu.

La restauration **remplace** et tient dans une transaction : à moitié faite,
elle serait pire que rien, puisqu'on ne saurait plus dans quel état on est.
Sans `--vraiment`, elle ne fait que dire ce qu'elle ferait — la commande se
tape souvent dans l'urgence, quand on réfléchit mal.

Le format est du JSON et non du SQL : il se relit sans MySQL, se compare d'une
sauvegarde à l'autre, et se restaure par le script d'à côté. Une sauvegarde
qu'on ne sait pas relire n'en est pas une.

**À planifier chez l'hébergeur.** Le SSH interdit les processus qui durent ;
les tâches planifiées sont faites pour ça. Chez alwaysdata, *Avancé → Tâches
planifiées*, une fois par jour :

```
node /home/<compte>/PokePension/api/outils/sauvegarder.js
```

Les variables d'environnement de la tâche doivent porter les `DB_*` — une tâche
n'hérite pas de celles du site. Sans elles le script échoue avec un code de
sortie non nul, ce qui est voulu : une sauvegarde qui échoue en silence laisse
croire qu'on est protégé alors qu'on ne l'est plus.

**Une session SSH n'en hérite pas davantage.** Pour sauvegarder à la main —
avant une opération risquée, ou simplement pour vérifier que ça marche — le plus
court est un fichier `.env` à côté de `.env.exemple`, qu'on remplit une fois :

```
cd ~/PokePension/api && node --env-file=.env outils/sauvegarder.js
```

Le chemin est donné depuis `api/` exprès : `--env-file` cherche le fichier
relativement au dossier courant, et lancer la même commande depuis ailleurs ne
trouverait rien. Ce `.env` porte le mot de passe de la base — il est dans le
`.gitignore` et n'a aucune raison de quitter le serveur.

> Les sauvegardes contiennent les Pokédex, les pseudos et les identifiants
> Discord de tout le monde. `sauvegardes/` est dans le `.gitignore` — elles
> restent sur le serveur.

## Publier une version

Le dépôt est <https://github.com/Tennosei5804/PokePension>. Livrer une version
tient en trois gestes, et le dernier est le seul qui compte :

```
# 1. monter le numéro AUX TROIS ENDROITS — ils doivent rester d'accord
#    app/src-tauri/tauri.conf.json   "version": "0.2.0"
#    app/src-tauri/Cargo.toml        version = "0.2.0"
#    app/src-tauri/Cargo.lock        version = "0.2.0"  (sous name = "pokepension")
#
#    Le troisième s'oublie : cargo le remonte tout seul à la compilation
#    suivante, ce qui salit le commit d'après plutôt que de casser celui-ci.

# 2. commiter
git commit -am "Version 0.2.0"

# 3. poser le tag : c'est lui qui déclenche tout
git tag v0.2.0
git push origin main --tags
```

`.github/workflows/publier.yml` prend le relais : un runner Windows compile,
signe l'installeur, et crée la Release **en brouillon** avec l'installeur et le
`latest.json`. Le brouillon est délibéré — on relit les notes et on vérifie que
l'installeur se lance avant de publier. **Les mises à jour ne partent qu'une
fois la Release publiée.**

Les numéros de version doivent monter ensemble. S'ils divergent,
l'application compare le mauvais au numéro de la Release et se croit à jour :
la mise à jour ne part jamais, et rien ne le signale.

### La clé de signature

L'application n'installe **que** ce qui est signé avec notre clé privée. Sans
cela, quiconque peut intercepter le téléchargement peut livrer son propre
programme — et il serait installé sans un mot.

| | |
|---|---|
| clé publique | dans `tauri.conf.json`, `plugins.updater.pubkey`. Elle se versionne, c'est son rôle |
| clé privée | `~/.tauri/pokepension.key`, **hors du dépôt**, plus une copie dans les secrets GitHub |

Le dépôt a besoin d'**un seul secret**, dans *Settings → Secrets and
variables → Actions* :

| Nom du secret | Valeur |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | le contenu entier de `~/.tauri/pokepension.key` |

Le workflow lit aussi `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, mais **il ne faut
pas le créer** : un secret absent se résout en chaîne vide, et la clé a été
générée sans mot de passe. C'est exactement ce qu'attend le signataire.

> **Perdre la clé privée coûte cher.** Sans elle, aucune version future ne peut
> être signée, donc plus aucune mise à jour n'atteint les gens déjà installés :
> il faudrait leur faire réinstaller à la main. Elle n'est nulle part ailleurs
> que dans `~/.tauri/` et dans les secrets du dépôt — gardez-en une copie.

### Ce que voit l'utilisateur

`app/src/js/maj.js` interroge GitHub quatre secondes après le lancement, en
silence. S'il n'y a rien, ou si la machine est hors ligne, rien ne se passe et
rien ne s'affiche — une vérification que personne n'a demandée n'a pas à
produire un message d'erreur.

Quand une version existe, un bouton doré apparaît dans l'en-tête. Il ouvre un
dialogue qui montre les deux numéros et les notes de version ; l'installation ne
commence qu'après un oui, et le bouton affiche la progression réelle du
téléchargement. Rien ne s'installe dans le dos de qui que ce soit : une
application qui se met à jour toute seule redémarre au mauvais moment, et il n'y
a aucune urgence à corriger un Pokédex.

## La connexion Discord

Sur <https://discord.com/developers/applications>, onglet **OAuth2 > Redirects**,
déclare l'adresse de retour **au caractère près** :

- en développement : `http://127.0.0.1:8787/auth/discord/retour`
- en ligne : `https://api.ton-domaine.fr/auth/discord/retour`

Discord accepte plusieurs redirections : garde les deux.

Le parcours suit ce qui est prévu pour les applications de bureau : l'app ouvre
une écoute éphémère sur un port entre 8730 et 8749, envoie le navigateur chez
l'API, et celle-ci lui renvoie le jeton une fois Discord passé.

Trois détails qui coûtent cher si on les défait :

- **L'API exige un `User-Agent`.** L'API Discord est derrière Cloudflare, qui
  rejette les clients sans en-tête identifiable par un `403` au corps vide
  (« error code: 1010 ») — une réponse qui ne ressemble en rien à une erreur
  d'authentification, et qui fait chercher au mauvais endroit pendant une heure.
- **Le `state` est vérifié au retour.** Sans cette comparaison, un site tiers
  pourrait déclencher une connexion à l'insu du joueur.
- **Le port de retour est validé** contre la plage 8730–8749. Sans cette borne,
  un lien forgé ferait rediriger un jeton vers n'importe quel service tournant
  sur la machine du joueur.

## La base

L'utilisateur MySQL actuel n'a de droits que sur `s4_tenno_test`, une base qui
héberge déjà autre chose. Les tables de PokéPension sont donc **préfixées
`pa_`** pour cohabiter sans se marcher dessus :

| Table | Contenu |
|---|---|
| `pa_dresseurs` | identité Discord, pseudo, avatar, présence au classement |
| `pa_sessions` | les connexions ouvertes |
| `pa_profils` | les aventures, et **ce que chacune compte** |
| `pa_dex` | la progression de chacune |
| `pa_historique` | une ligne par Pokémon ajouté — le journal, et le fil des amis |
| `pa_amis` | qui suit qui, et jusqu'où il a déjà été prévenu |
| `pa_echanges` | les accords proposés, acceptés, refusés |
| `pa_messages` | la discussion d'un échange accepté |
| `pa_notifications` | ce qui s'adresse à quelqu'un et attend une réponse |
| `pa_images` | la **fiche** d'une photo de chasse — le fichier, lui, est sur le disque |

Le schéma se crée et se complète tout seul au démarrage du service : chaque
table est en `CREATE TABLE IF NOT EXISTS`, chaque colonne ajoutée après coup a
sa fonction de migration. Relancer le service ne touche à rien.

### Privée en naissant

`pa_profils.public` vaut **0** aux trois endroits où une aventure se crée : la
première, posée d'office à la connexion ; celles qu'on ajoute à la main ; celles
qui arrivent par un import — cette dernière l'était déjà.

On publie ce qu'on veut publier ; on ne dépublie pas ce qu'on n'a pas choisi de
montrer. La première aventure mérite ce traitement plus que les autres : personne
ne l'a demandée, elle est créée toute seule à la première connexion, et la rendre
publique exposerait un Pokédex au nom de son propriétaire avant même qu'il ait vu
l'application.

**La conséquence est assumée, et c'est le prix du réglage :** un compte neuf
n'apparaît nulle part — ni au classement, ni dans une comparaison, ni dans
l'entraide, ni dans « je cherche ». Rien ne fonctionne socialement tant qu'un
cadenas n'a pas été levé.

Ce silence doit donc être **dit**, sinon il ressemble à une panne : la page des
aventures porte la phrase, et c'est elle qui empêche « pourquoi personne ne me
voit ? ». Un défaut protecteur qu'on n'explique pas est un bogue avec de bonnes
intentions.

**Les aventures existantes ne bougent pas.** Elles ont été rendues publiques par
quelqu'un, ou l'étaient par le défaut d'alors ; les refermer d'autorité ferait
disparaître du classement des gens qui n'ont rien demandé — le symétrique exact
du tort qu'on répare. Trois réglages ont basculé de la même façon :
`pa_dresseurs.visible`, la présence Discord, et celui-ci. Chaque fois : le
nouveau démarre fermé, l'ancien garde son état.

### Ce que compte une aventure

Deux colonnes le déterminent, et **les deux appartiennent à l'aventure** :
`mode` dit ce qu'on coche, `niveau_formes` dit combien de cases il y a.

`pa_profils.mode` vaut `capture`, `vu` ou `living`, et se choisit à la création :

- **Pokédex** — capturer chaque Pokémon. Faire évoluer un Bulbizarre enregistre
  les trois stades : une capture en remplit trois cases ;
- **Pokémon vus** — les avoir croisés, rien de plus ;
- **Living Dex** — les posséder tous *en même temps*. Faire évoluer son
  Bulbizarre ne laisse plus de Bulbizarre.

`pa_profils.niveau_formes` vaut 1 à 4 et se règle depuis la barre du Pokédex,
pas à la création : on ne fait pas choisir avant d'avoir vu. Voir « Le niveau
appartient à l'aventure » plus haut.

Le mode ne change pas ce qu'on enregistre — c'est la même liste de noms — mais
il change ce que cocher **veut dire**, et le vocabulaire suit : la case d'une
carte affiche « Capturé », « Vu » ou « En boîte », et le filtre du Pokédex avec
elle. Écrire « Capturé » à quelqu'un qui tient un dex de rencontres est faux ;
« En boîte » à quelqu'un qui a fait évoluer son Bulbizarre l'est tout autant.

Le vocabulaire vit dans `MODES_DEX`, au même endroit que les types et les
statistiques (`donnees.js`) : la grille en a besoin, et `compte.js` n'est pas
chargé par les pages de génération. Le pluriel s'y déclare au lieu de s'ajouter
— « en boîtes » ne se dit pas.

Il change aussi ce que le total signifie. L'accueil chiffre l'écart : **1025 espèces
pour 541 lignées**, donc 484 entrées qu'un Pokédex ordinaire obtient sans
capture supplémentaire, et qu'un Living Dex réclame une par une. Et la barre de
comparaison prévient quand deux dresseurs ne comptent pas la même chose.

La colonne s'ajoute au démarrage (`migrerModeProfil`) : `CREATE TABLE IF NOT
EXISTS` ne touche pas une table existante, et les aventures déjà créées
deviennent des Pokédex de capture, ce qu'elles étaient de fait.

Le jour où tu obtiens une base dédiée, le préfixe peut sauter.

Aucun mot de passe n'est stocké. Les jetons de session non plus : la base n'en
garde qu'un condensé SHA-256, le jeton en clair n'existe que dans
`session.json`, dans le dossier de configuration de l'application.

## Ce qui reste à faire

Rien de tout cela n'est du code : les trois se règlent ailleurs que dans le
dépôt.

- [ ] déclarer `http://127.0.0.1:8787/auth/discord/retour` dans le portail Discord ;
- [ ] renommer l'application Discord en « PokéPension » (elle s'appelle encore
      « LivingDex », et c'est ce nom que voient tes amis) ;
- [ ] héberger l'API quelque part de joignable en permanence.

### Fait depuis

- [x] **l'import de `pokepension-1`**, des deux côtés. C'était la seule pièce
      absente pour une synchro par fichier : le format était produit par
      l'application ET par le site, et relu par personne. Le dex se réunit,
      l'historique se dédoublonne, `maj_le` départage — et l'opération est
      rejouable, ce que le banc vérifie ;
- [x] **la vue boîtes**, trente par boîte et six par rangée ; **le programme du
      soir**, tiré du relevé des lieux ; **les objectifs sur mesure**, qui
      figent la barre de filtres en but nommé ; **la fiche de capture** — Ball,
      nature, ruban — repliée derrière une entrée déjà cochée ;
- [x] **« comment le faire remonter »** sur la fiche, qui dit par quel chemin un
      Pokémon rejoint HOME depuis chaque jeu, et **quand ce chemin est fermé** ;
- [x] **l'entraide** : la barre de comparaison disait « il a 47 que tu n'as
      pas », elle dit maintenant *lesquels* ;
- [x] **la rareté**, comptée sur les collections publiques et mise en cache
      douze heures ; **le lexique** ; **les deux questions du premier
      lancement** ; **la carte à partager** ;
- [x] **le clavier** : les flèches dans la grille, l'espace sur le compteur de
      chasse, et `Ctrl+Alt+↑ / ↓` même fenêtre en arrière-plan ;
- [x] **le site installable et hors ligne** — manifeste, service worker, et une
      coquille lue dans la page plutôt que tenue à la main ;
- [x] **l'overlay OBS**, servi en local sur la boucle, sans dépendance de plus ;
- [x] **corrigé** : `construireDex()` ne transmettait pas les chasses. Elles
      vivaient dans le `localStorage` de la machine et nulle part ailleurs —
      changer d'aventure les effaçait, changer d'ordinateur aussi. Le LISEZMOI
      promettait le contraire depuis le premier jour, et rien ne le
      contredisait. Le banc s'en charge désormais ;

- [x] **le relevé des lieux refait sur Poképédia**, source unique, après deux
      migrations dans la même journée — Pokékalos, puis Pokébip, puis
      Poképédia. Les deux premiers ont été abandonnés parce que chacun de leurs
      désaccords s'est tranché en faveur du troisième. L'outil passe de 2 618
      lignes à 430, la table de 45 corrections manuelles disparaît, et le
      relevé gagne la sous-zone, le niveau, le taux, la version séparée, la
      forme, l'heure, la météo et la saison ;
- [x] **les dialogues de l'application**, à la place des boîtes de Windows : les
      dix-sept `confirm()`, `prompt()` et `alert()` passent par `confirmer.js`. Les
      suppressions montrent ce qu'elles emportent et demandent qu'on recopie le
      nom ; les saisies vérifient leur règle pendant la frappe ; et les trois
      demandes qui servaient à deux écrans sont partagées, ce qui a rattrapé un
      garde-fou manquant sur la modale des aventures ;
- [x] **la grille du dex**, reprise de l'ancien projet. La modale de pseudo est
      tombée avec elle : l'identité vient de Discord, il n'y a plus de profil à
      choisir au lancement ;
- [x] **la comparaison entre dresseurs**, à deux entrées — la page
      « Dresseurs », qui mène chez quelqu'un puis dans l'une de ses aventures
      publiques, et le bouton « 👥 Comparer » du Pokédex, qui prend l'aventure
      principale. Les deux passent par `GET /api/dex/:pseudo` et rendent la main
      à `partage.js`, qui pose le témoin des cartes, les deux filtres
      supplémentaires et la barre de résumé.
