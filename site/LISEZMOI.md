# Le site PokéPension

La même application, dans un navigateur.

```
cd site && py outils/servir.py
```

Le site s'assemble, s'ouvre sur <http://127.0.0.1:8130>, et c'est tout.

---

## Ce que c'est, et ce que ce n'est pas

C'est **le frontend de l'application de bureau**, servi par un navigateur. Pas
une réécriture, pas un second client : les mêmes trente-sept scripts, les
mêmes feuilles de style, les mêmes réserves de données.

Ce qui a été écrit ici tient en deux fichiers.

| | |
|---|---|
| `source/pont-api.js` | remplace Tauri par le navigateur, et parle à l'API |
| `source/site.css` | ce qui ne vaut que sur le web |

**Même compte, mêmes données que l'application.** On se connecte avec Discord,
et l'on retrouve ses aventures, ses amis, ses échanges et ses messages. Rien ne
vit plus dans le seul `localStorage` du navigateur : le seul reliquat local est
le jeton de session.

Ce n'était pas vrai au début. Le site a d'abord simulé Tauri dans le
`localStorage`, avec un compte local et aucun réseau : c'est ce que fait
`source/pont.js`, qui rend des formes d'API sans jamais appeler personne.

**Il n'est plus livré, et il n'est pas mort pour autant.** L'assembleur ne copie
que `pont-api.js` ; `pont.js` reste dans `source/` pour le seul banc d'essai, qui
le sert sous `/outils/pont-simule.js` — voir `outils/banc.py`. Le banc a besoin
d'un monde clos : contre la vraie API il n'a pas de session au chargement, il
part chez Discord, et aucune vérification ne s'exécute.

Deux ponts, donc, et deux usages qu'il ne faut pas confondre : **une correction
apportée à `pont.js` ne change rien au site**. C'est une confusion qui a déjà
coûté une modification perdue.

## Pourquoi il n'y a qu'une source

Le frontend de PokéPension est déjà du web ordinaire. Sur ses trente-sept
scripts, **cinq seulement** nomment `window.__TAURI__`, et quatre d'entre eux
vérifient sa présence avant de s'en servir — ils se taisent proprement quand il manque.
Le seul vrai point de contact est `invoke()`, trente-huit commandes.

Recopier `app/src` dans `site/` en aurait fait un second client à maintenir, et
deux clients divergent toujours : le jour où l'un gagne un onglet, l'autre
l'ignore, et personne ne s'en aperçoit avant des semaines.

`outils/assembler.py` **assemble** donc à la demande :

```
site/public/     ←  app/src/  +  site/source/
```

`public/` est jetable, dans le `.gitignore`, et se refait en une commande. Ne
jamais y toucher à la main : l'assemblage suivant écrase tout. Il est effacé au
début plutôt que mis à jour, sans quoi un fichier retiré de `app/src` y
resterait pour toujours.

`servir.py` réassemble avant de servir, toujours. Un site servi depuis un
`public/` périmé montre du code qui n'est plus sur le disque, et l'on cherche
dix minutes pourquoi une correction « ne prend pas ».

## Le pont

`source/pont-api.js` pose `window.__TAURI__` avant tous les autres scripts —
`compte.js` le cherche dès son exécution et arrête l'application s'il manque.

Il n'expose que `core.invoke`. C'est voulu : `maj.js` et `presence.js`
vérifient `.updater`, `.app` et `.process` avant de s'en servir. Un site web n'a
ni mise à jour à installer ni processus à fermer, et ils se taisent d'eux-mêmes.

**Une table, pas une simulation.** `ROUTES` associe chaque commande à une
méthode, un chemin et un corps :

```js
ecrire_dex: ['POST', a => '/api/dex' + paramProfil(a.profil), a => a.donnees],
```

L'adresse de l'API est posée **à l'assemblage** par `POKEPENSION_API`, jamais
déduite de `window.location` : le site local tourne sur 8130 et l'API sur 8787,
la production sur deux domaines. Ni l'un ni l'autre ne se devine.

TROIS ROUTES ONT LU UN ARGUMENT QUE PERSONNE N'ENVOIE, et la leçon vaut d'être
gardée : la fonction de corps rendait `undefined`, la requête partait sans corps,
et `express.json()` livrait `{}` à l'API. `ecrire_dex` remplaçait ainsi le
Pokédex par un dex vide à chaque enregistrement, sans une erreur. Le pont **lève**
désormais quand une route déclare un corps et n'en produit pas, et le banc
inspecte le corps réellement envoyé pour les trois commandes.

Cinq commandes ne sont pas de simples appels : la connexion Discord (fenêtre
surgissante et PKCE), la déconnexion, l'état de session, et les deux qui portent
des octets d'image.

### Ce qui marche

Le Pokédex complet : parcourir, filtrer, cocher normal et chromatique, sur les
vingt-trois jeux. Les aventures, avec leur mode et leur niveau de formes. Les
lieux, la stratégie, la reproduction, les fiches — tout ce qui ne demande
personne d'autre.

Le **journal se date tout seul**. À chaque enregistrement, le pont compare
l'ancien dex au nouveau et date les ajouts — mot pour mot ce que fait `nouveautes()`
côté serveur. C'est ce qui fait marcher la rétrospective et les succès ici
aussi. Décocher n'est pas journalisé : c'est une correction, pas un événement.

### Le site s'installe et s'ouvre hors ligne

`assembler.py` écrit un manifeste, quatre icônes et un service worker. La
coquille — `index.html`, les feuilles, les scripts du premier chargement, les
polices, les bannières — est mise en cache à l'installation ; les quatre
réserves à la demande y entrent à leur premier usage. La liste se **lit** dans
la page qu'on vient d'écrire : un script ajouté à `index.html` y entre sans que
personne n'ait à y penser.

La version du cache est celle des fichiers, jamais un numéro tenu à la main.

### Ce qui ne marche pas

**L'overlay OBS**, et lui seul. Il demande une écoute locale sur un port, ce
qu'un navigateur ne sait pas faire. Le bandeau en haut de page le dit.

Tout le reste est là : le classement, les amis, la visite d'un dresseur, les
échanges, les messages, les photos. C'est la même API que celle de
l'application, avec le même compte.

### La connexion, dans une fenêtre surgissante

Rediriger la page entière ferait tout perdre — le Pokédex en cours, les filtres,
la position. La fenêtre s'ouvre sur Discord, renvoie un code par `postMessage`,
et se ferme ; l'écran principal n'a pas bougé.

**L'origine du message est vérifiée**, sans quoi n'importe quelle page ouverte
ailleurs pourrait se faire passer pour le retour de Discord. Et le code seul
n'ouvre rien : l'API exige aussi le vérifieur PKCE, qui n'a jamais quitté la
mémoire de la page.

Côté serveur, `SITE_ORIGINES` nomme les origines admises — pas d'étoile : le
jeton reste nécessaire, mais une étoile laisserait une page tierce faire agir le
navigateur d'un joueur connecté.

## La synchro site ↔ application

**Elle est faite, et par le compte.** Les deux clients parlent à la même API :
ce qu'on coche ici se retrouve là-bas au rechargement, sans fichier à promener.
Il n'y a plus de conflit à arbitrer — une seule collection, un seul serveur.

Reste l'import par fichier, décrit ci-dessous. Il n'a pas perdu son utilité :
reprendre une vieille sauvegarde, ou récupérer ce qu'une autre installation
avait gardé.

### Le format existe, et il est versionné

`pokepension-1` est défini par l'API dans `exporter()`. Il porte **tout** ce
qu'il faut pour reconstruire un compte :

```
{ exporteLe, format: 'pokearchive-1',
  dresseur: { pseudo, avatar, creeLe },
  aventures: [ { nom, mode, niveau_formes, public, par_defaut,
                 cree_le, maj_le, dex, historique } ] }
```

Les deux côtés le produisent désormais : l'application par « Exporter mes
données », le site par le même bouton. Aucun identifiant de base n'en sort — il
n'aurait aucun sens ailleurs.

### L'import existe désormais, des deux côtés

C'était la seule pièce absente pour une synchro par fichier, et c'était un
manque du projet et non du site : l'application exportait depuis toujours sans
jamais savoir relire.

Le bouton **⬆ Importer une sauvegarde**, dans le Profil, avale un fichier
`pokepension-1` d'où qu'il vienne. Côté application il part à
`POST /api/import` ; côté site il est traité par la commande `importer` du
pont, **avec la même règle de fusion**, recopiée à la lettre — une union qui
différerait d'un côté ferait diverger les deux collections dès le premier
aller-retour, et c'est cet aller-retour que l'import existe pour permettre.

L'opération est **rejouable** : le même fichier deux fois ne double ni le dex
ni le journal. Le banc de l'application le vérifie.

### La question qui décide de tout : que fait-on d'un conflit ?

C'est là qu'une synchro se gagne ou se perd. Si les deux côtés ont bougé,
écraser l'un par l'autre perd du travail — et personne ne s'en aperçoit avant
d'aller chercher un Pokémon qui n'y est plus.

Le format permet de faire mieux qu'écraser :

- **le dex se réunit**, il ne se remplace pas. Cocher est monotone : on ajoute
  des captures, on n'en retire pratiquement jamais. L'union des deux côtés est
  presque toujours la bonne réponse ;
- **l'historique se dédoublonne** sur `(pokemon, dex, chromatique, ajoute_le)`.
  Deux fois la même capture le même jour dans le même jeu est la même capture ;
- **`maj_le` départage** ce qui ne se réunit pas — le nom d'une aventure, son
  mode, son niveau de formes. Là, le plus récent gagne.

Un décochage volontaire serait perdu par cette règle. C'est un choix assumé :
perdre une correction est réparable en deux clics, perdre trois mois de
cochage ne l'est pas.

## S'adapter à la fenêtre

L'application de bureau vit dans une fenêtre dont on choisit la taille ; un
site est ouvert sur ce qu'on a sous la main.

L'application était déjà à moitié adaptée — ses feuilles portent des ruptures à
820, 720, 640, 600 et 560 px. Ce qui n'avait jamais été traité, c'est le
**décor du boîtier**. Mesuré sur un écran de 375 px : l'écran utile n'en
recevait que 253. Les 122 autres partaient en marges empilées, soit un tiers de
l'écran pour de la coque.

Le décor rétrécit donc avec la fenêtre, par `clamp()` plutôt que par une
rupture : la demande est de suivre la taille, pas de sauter d'un état à
l'autre. Une rupture à 720 px laisse un écran de 721 avec le décor du grand et
un de 719 avec celui du petit ; `clamp()` rend le passage continu, et une
fenêtre qu'on redimensionne à la souris suit sans à-coup.

| largeur | utile | décor | colonnes |
|---:|---:|---:|---:|
| 375 px | 302 px | 73 px | 2 |
| 414 px | 335 px | 79 px | 2 |
| 768 px | 645 px | 123 px | 4 |
| 1280 px | 1154 px | 126 px | 7 |

À 1280 px, toutes les valeurs retrouvent **exactement** celles d'origine —
14 / 20 / 8 / 16 et un rayon de 26. Les maxima des `clamp()` sont les valeurs
historiques : le bureau n'a pas bougé d'un pixel.

Les cibles tactiles passent à 44 px sous `pointer: coarse`, **et non sous une
largeur**. Les deux ne disent pas la même chose : une fenêtre de bureau
rétrécie à 400 px se pilote toujours à la souris, tandis qu'une tablette de
1024 px se touche. C'est le moyen de pointage qui décide.

## Le poids, et la compression

Mesuré : le premier chargement demande **41 fichiers**, dont `donnees-embarquees.js`
à lui seul pour 1 642 Ko. Ce sont du JSON dans du JS, et cela se compresse très
bien.

| | sans compression | avec gzip |
|---|---:|---:|
| premier chargement | 2 653 Ko | **642 Ko** |
| en 4G | 1,7 s | 0,4 s |
| en 3G | 6,6 s | 1,6 s |

Soit **4,1 fois plus léger**. `servir.py` compresse donc en local, alors que le
serveur de la bibliothèque standard ne le fait pas : sans cela on met au point
sur une page qui pèse quatre fois ce qu'elle pèsera, et l'on ne sait pas ce
qu'on livre.

**Le jour où le site sera hébergé, la compression doit être active.** C'est le
réglage qui change le plus la première visite sur un téléphone, et il ne coûte
rien — tout hébergeur sérieux la propose.

Les `.png` et `.woff2` sont exclus : ils sont déjà compressés dans leur format,
et les repasser au gzip coûterait du temps pour quelques octets.

Ce qui pèse mais n'est **pas** chargé d'emblée : `donnees-lieux.js` (1,9 Mo),
`donnees-attaques.js` (1,9 Mo) et `donnees-descriptions.js` (1,5 Mo). Ils
descendent à la demande, quand on ouvre la page ou la fiche qui les réclame.

## Le banc d'essai

```
cd site && py outils/banc.py
```

Dix-sept vérifications, jouées dans une vraie fenêtre. Le rapport s'affiche
par-dessus la page.

**La règle, la même que pour le banc de l'application** : un bug est passé, on
écrit la vérification qui l'aurait arrêté. Pas de tests écrits « au cas où » —
ils vieillissent mal et personne ne les relit. La plupart des entrées portent
donc le nom d'un défaut réellement rencontré en bâtissant ce site : le bandeau
écrasé par le flex de `body`, la bascule d'époque que `flex-wrap` seul
n'enroulait pas, la pagination par décalage là où l'API veut un curseur.

**Deux familles.** Le pont se vérifie en appelant ses commandes. La mise en page
demande une largeur : elle se mesure dans une **iframe dimensionnée**, parce que
les requêtes de média répondent à la taille de la fenêtre qui les contient —
c'est le seul moyen d'éprouver le 375 px sans redimensionner la vraie fenêtre.

**Il a des dents, et c'est vérifié.** En réintroduisant volontairement deux
défauts déjà corrigés — le `max-width` de la bascule et la pagination par
décalage — le banc les attrape tous les deux et nomme précisément le symptôme
(« 1 bouton coupé, dont *6e à 9e génération* », « 8 lignes après la dernière »),
sans un seul faux positif ailleurs.

Le banc écrase la réserve du site pendant qu'il joue — il coche, efface,
recharge. Il la range avant de commencer et la remet à la fin, mais on évite
quand même de le lancer sur le navigateur où l'on tient sa vraie collection.

`window.__bancEchecs` porte le nombre d'échecs une fois fini, pour qui voudrait
le lire autrement qu'à l'œil.

## Les commandes

```
py outils/servir.py                  ouvre le site (assemble d'abord)
py outils/servir.py --port 9000      ailleurs, si 8130 est pris
py outils/servir.py --sans-navigateur   sans ouvrir de fenêtre
py outils/assembler.py               assembler seulement
py outils/banc.py                    jouer les dix-sept verifications
py outils/banc.py --port 9001        ailleurs, si 8131 est pris
```
