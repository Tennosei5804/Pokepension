# PokéPension Bridge

Le mod Minecraft de PokéPension : `/ps` dans le chat de PixelmonWorld ouvre
PokéPension sur la bonne page.

- Minecraft **1.16.5**, Forge **36.2.x** (compilé contre 36.2.42), Java **8** ;
- **100 % côté client** : le serveur ne reçoit jamais `/ps`, les autres joueurs
  n'ont besoin de rien, PixelmonWorld n'a rien à installer ;
- aucune API de Pixelmon, aucune dépendance à Pixelmon : il marche à côté de
  n'importe quelle version.

Il n'y a **rien à installer à la main** : PokéPension embarque ce mod et le pose
elle-même dans l'instance PixelmonWorld de Prism Launcher (voir
`app/src-tauri/src/minecraft_installation.rs`).

## Les commandes

| Commande | Ce qui s'ouvre |
|---|---|
| `/ps` | PokéPension, sur le Pokédex de PixelmonWorld tel qu'on l'avait laissé |
| `/ps pokemon Dracaufeu` | la fiche de Dracaufeu, avec ses apparitions sur le serveur |
| `/ps pokemon Méga Dracaufeu X` | la fiche de la forme — Méga, Gigamax, Alola, Galar, Hisui… |
| `/ps zone Zone 1` | le Pokédex du serveur filtré sur la zone (sous-zones comprises) |
| `/ps zone Zone 1 Eau` | … sur une sous-zone |
| `/ps zone Zone 1 rare Rare Épique type Feu Dragon generation 1 3` | la zone, avec ces filtres cochés |
| `/ps zone Zone 1 sous-zone Eau Forêt` | deux sous-zones de la zone |
| `/ps dex type Dragon rare Légendaire` | le Pokédex du serveur filtré, toutes zones |
| `/ps aide` | quatre lignes d'aide |

Alias : `p` pour `pokemon`, `z` pour `zone`, `d` pour `dex` ; `rarete`/`r`,
`types`/`t`, `gen`/`g`, `sz`. Sans sous-commande, `/ps Pikachu` et
`/ps Zone 7` marchent aussi.

**La recherche est tolérante** : casse, accents, espaces, tirets, points et
apostrophes ne comptent pas (`flabebe` → Flabébé, `m mime` → M. Mime,
`Zone01` → Zone 1), les mots d'un nom de forme se tapent dans n'importe quel
ordre, et le nom anglais marche aussi. **Rien n'est ouvert au hasard** :
`/ps pokemon drac` propose Dracaufeu, Draco, Dracolosse… en liens cliquables ;
`/ps pokemon Dracofeu` répond « tu voulais dire Dracaufeu ? ».

**Tab complète tout**, avec les données de PokéPension : les sous-commandes,
les noms de Pokémon (ceux du serveur d'abord), les zones dans l'ordre de la
carte, puis selon la section en cours les raretés, types, générations ou
sous-zones — sans reproposer ce qui est déjà choisi.

## Comment il marche

```
chat ──► ClientChatEvent ──► annulé : le serveur ne reçoit rien
                │
                ▼ (fil « PokéPension Bridge », jamais celui du jeu)
   Analyse ─► Acces ─► Cache ─► Resolveur ─► POST /minecraft/ouvrir
  (syntaxe)  (la lancer  (catalogue) (noms → clés)   (127.0.0.1, jeton)
             si fermée)
```

- **Forge 36 n'a pas de commandes client** (`RegisterClientCommandsEvent`
  n'arrive qu'en 1.18). Le mod écoute `ClientChatEvent`, que
  `Screen.sendMessage` lève avant l'envoi, et l'annule : c'est tout ce qu'il
  faut pour que le serveur ne voie rien.
- **L'autocomplétion** greffe une branche `ps` dans le répartiteur Brigadier que
  le client garde de l'arbre du serveur. Le chat, l'assistant de suggestions et
  les autres commandes restent ceux de Minecraft ; la greffe est refaite quand
  le serveur renvoie son arbre. Aucune suggestion de `/ps` ne part au réseau.
- **Minecraft est appelé par réflexion**, sous ses noms d'exécution (SRG),
  depuis une seule classe : `client/Jeu.java`. Une version inattendue du jeu
  met le mod en veille au lieu de faire planter quoi que ce soit.
- **Un texte cliquable venu d'ailleurs** (serveur, joueur, livre) qui enverrait
  `/ps …` est ignoré : seuls comptent ce qu'on tape et les liens que le mod a
  lui-même écrits, marqués d'un jeton tiré au sort.
- **Trouver PokéPension** : elle écrit à chaque lancement
  `%APPDATA%\fr.tennosei.pokearchive\pont-minecraft.json` — port, jeton,
  chemin de son exécutable. Aucun port à choisir, aucun chemin à renseigner.
  Fermée, elle est lancée depuis ce chemin, et le mod attend qu'elle soit prête.

## Réglages

`config/pokepensionbridge.properties` s'écrit seul au premier lancement. Rien
n'y est à remplir : `debug` (raconte chaque commande dans `logs/latest.log`),
`delaiReseauMs`, `dureeCacheMinutes`.

## Construire

```
cd minecraft
py construire.py              → compile (Java 8), teste, empaquette, range dans l'application
py construire.py --verifier   → et recoupe chaque nom de Minecraft et de Forge avec leurs sources
```

Le script n'utilise pas ForgeGradle : il compile contre le vrai Brigadier 1.0.17
(compilé depuis ses sources), Gson 2.8.0, log4j-api et commons-lang3 — ceux de
Minecraft 1.16.5 — et contre `compilation/src`, la forme exacte des quelques
classes de Forge 36.2.42 que le mod touche, recopiée de ses sources et jamais
incluse dans le `.jar`. Il vérifie que chaque classe produite est en
version 52 (Java 8) et qu'aucune ne référence Minecraft directement.

`outils/catalogue-banc.js` régénère `src/test/resources/catalogue-banc.json`, le
catalogue réel que les essais utilisent, depuis le banc de l'application.

## Ce qui est vérifié, et comment

| | |
|---|---|
| 45 essais JUnit | la syntaxe, la recherche, la complétion et l'orchestration, sur le catalogue réel (1 351 Pokémon, 20 zones) et contre un pont qui parle le protocole — lancement quand PokéPension est fermée, pas encore prête, jeton périmé, autre protocole, délai dépassé, liens cliquables |
| `--verifier` | les 14 membres de Minecraft appelés : nom SRG, classe et descripteur recoupés entre MCPConfig 1.16.5, intermediary et yarn ; les 18 références à Forge trouvées dans les sources de 36.2.42 |
| bout en bout | le code du mod, sans Minecraft, contre la vraie PokéPension (Rust + interface) et l'API locale : lancement automatique, fiches, formes, zones et filtres combinés, hors ligne puis réseau revenu, pose et mise à jour du mod dans une instance Prism |

**Ce qui ne l'a pas été** : le mod n'a pas tourné dans un vrai Minecraft
1.16.5, ni sous Windows — l'environnement de construction n'a accès ni aux
serveurs de Mojang et de Forge, ni à un bureau Windows. C'est ce que
`--verifier` et les essais compensent, sans le remplacer tout à fait : la
première partie sur PixelmonWorld est le vrai essai.
