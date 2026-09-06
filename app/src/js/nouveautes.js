// Ce qui a changé, écrit pour quelqu'un qui joue.
//
// Script classique, chargé après confirmer.js dont il reprend le gabarit de
// modale.
//
// CE N'EST PAS LE JOURNAL DE GIT, et c'est tout l'intérêt. Les messages de
// commit disent pourquoi le code est ce qu'il est — utile pour qui l'écrit,
// illisible pour qui l'utilise. « efficaciteOffensive accepte une table en
// troisième argument » n'apprend rien à personne ; « la table des types
// s'adapte au jeu que tu lis » si.
//
// D'où une liste écrite à la main. Elle se tient à jour à chaque version, au
// même endroit que le numéro : c'est le prix d'un texte qui parle vraiment à
// celui qui le lit.
//
// Chaque entrée porte une date au format ISO — elle s'affiche en français, mais
// se compare et se trie sans ambiguïté sous cette forme.

const NOUVEAUTES_VUES_KEY = 'pokearchive-nouveautes-vues';

const NOUVEAUTES = [
  {
    version: '0.42.2', date: '2026-09-06',
    titre: 'PokéArchive devient PokéPension, et la connexion du site aboutit',
    points: [
      '**🏷️ Le projet change de nom.** PokéArchive devient **PokéPension**, et '
      + 'le site vit désormais sur **pokepension.fr** — avec une vraie page '
      + 'd’accueil, et le Pokédex sur /dex. Rien ne bouge dans ta collection : '
      + 'ni ton compte, ni tes aventures, ni tes sauvegardes.',
      '**🔌 Se connecter depuis le site ne marchait pas, et ce n’était pas ta '
      + 'faute.** La fenêtre Discord annonçait « connexion annulée » une '
      + 'demi-seconde après le clic, avant même d’avoir fini de s’afficher. Le '
      + 'serveur, lui, créait bien le compte : c’est le lien entre la fenêtre '
      + 'et la page qui était coupé dès le premier saut. Il est rétabli.',
      '**🚪 Une porte quand on a répondu « plus tard ».** Fermer la fenêtre de '
      + 'connexion laissait la barre du haut vide : plus aucun moyen de se '
      + 'connecter avant de relancer l’application. Un bouton **Se connecter** '
      + 'occupe maintenant cette place tant qu’on n’a pas de session.',
      '**🧾 Les messages d’erreur ne commencent plus par « Error: ».** Ce mot-là '
      + 'venait du langage, pas de nous. Et « connexion annulée » disait ce '
      + 'qu’on en concluait, pas ce qui s’était passé.',
      '**⬇️ L’application se télécharge depuis pokepension.fr**, sans passer par '
      + 'une forge ni par un compte ailleurs.',
    ]
  },
  {
    version: '0.42.1', date: '2026-09-04',
    titre: 'Le bouton qui propose un échange fonctionne',
    points: [
      '**🤝 « Proposer l’échange » ne faisait rien du tout.** Le bouton '
      + 's’allumait, changeait de mot selon que tu offrais, demandais ou '
      + 'échangeais — et le clic ne partait nulle part. Tout le reste était en '
      + 'place depuis le début : le serveur savait recevoir la proposition, la '
      + 'liste savait l’afficher. Il manquait le fil entre les deux.',
      '**Rien à refaire de ton côté.** Aucune proposition n’a été perdue : elles '
      + 'ne partaient pas, donc il n’y a rien à retrouver. Choisis un Pokémon '
      + 'chez un ami et le bouton part, cette fois.',
    ],
  },
  {
    version: '0.42.0', date: '2026-09-04',
    titre: 'Ta carte de dresseur se voit enfin chez les autres',
    points: [
      '**🧑 Ouvre la fiche de quelqu’un : tu vois maintenant qui il est, pas '
      + 'seulement ce qu’il a coché.** Son jeu préféré, son spin-off, ses trois '
      + 'Pokémon préférés, sa phrase, et les jeux auxquels il a joué avec '
      + 'l’équipe qu’il y avait. **Ta propre carte part au serveur** : elle te '
      + 'suit d’un ordinateur à l’autre, au lieu de rester sur une machine.',
      '**📅 Et depuis quand il est là.** La date d’inscription était enregistrée '
      + 'depuis le premier jour et n’apparaissait nulle part — alors que c’est '
      + 'la première chose qu’on regarde en arrivant chez quelqu’un.',
      '**🔎 La recherche d’équipe ne propose plus que les Pokémon DU jeu.** '
      + 'Taper « Arca » sur Rouge / Bleu proposait Arcanin de Hisui et '
      + 'Marcacrin — deux Pokémon qui n’existent pas sur Game Boy. On note ici '
      + 'une équipe qu’on a vraiment eue : une liste qui propose n’importe quoi '
      + 'invite à écrire un souvenir faux.',
      '**⏱️ Temps de jeu, date de début et date de fin**, sur chaque jeu. Tout '
      + 'est facultatif, et **laisser vide veut dire « je ne sais plus »** — pas '
      + 'zéro heure le 1er janvier. Un jeu sans rien de saisi n’affiche rien.',
      '**🎮 Le spin-off préféré devient un menu** de 54 jeux secondaires '
      + 'officiels, de Stadium à Pokémon Sleep. C’était un champ libre où '
      + '« donjon mystère », « PMD » et « Explorateurs du ciel » désignaient le '
      + 'même jeu. **Ce que tu avais déjà tapé reste dans la liste** et n’est '
      + 'pas perdu.',
      '**🔧 Trois commandes de la version web partaient sans leur contenu.** '
      + 'Enregistrer y remplaçait le Pokédex en ligne par un dex vide, importer '
      + 'un fichier ne faisait rien, et renommer une aventure ou la rendre '
      + 'publique non plus — le tout sans le moindre message. '
      + '**L’application de bureau n’a jamais été concernée**, et cette version '
      + 'web n’est hébergée nulle part : elle ne tourne que chez qui la lance '
      + 'depuis le dépôt. Le pont refuse désormais d’envoyer une requête vide, '
      + 'plutôt que de le faire en silence.',
    ],
  },
  {
    version: '0.41.0', date: '2026-09-03',
    titre: 'Les lieux te disent comment y attraper ce qui te manque',
    points: [
      '**📍 Ouvre un lieu : il te dit maintenant ce qu’il faut pour y '
      + 'pêcher, frapper un arbre ou faire sortir une horde.** Ces méthodes '
      + 'étaient déjà dans le relevé sans être expliquées : « Coup d’Boule », '
      + '« Pêche à la Super Canne », « Son Sinnoh » ne disaient rien à qui ne '
      + 'les connaissait pas.',
      '**⚡ Et le talent de ta tête d’équipe change ce qui sort.** Sur une '
      + 'route qui a de l’Électrik, l’application écrit désormais : *Statik — '
      + 'une rencontre sur deux sera Électrik : Loupio, Lanturn*. Elle ne le '
      + 'propose que là où ce type existe vraiment, et **te dit si tu possèdes '
      + 'déjà un Pokémon qui porte ce talent**.',
      '**Rien n’est affirmé au hasard.** Ces effets ont changé d’une génération '
      + 'à l’autre, et les jeux où tu vois le Pokémon avant de l’approcher — '
      + 'Let’s Go, Légendes Arceus, Écarlate/Violet — n’en ont aucun. Là, '
      + 'l’application se tait plutôt que de te faire perdre une soirée sur un '
      + 'conseil faux.',
      '**🧮 Le compteur du calculateur de taux était une case blanche du '
      + 'navigateur**, avec ses petites flèches qui avançaient d’un. Or on '
      + 'compte ici en milliers de rencontres. Il a le style de la fenêtre, et '
      + 'deux boutons dont le pas suit le nombre affiché — 10 sous cent, 500 '
      + 'sous dix mille, 1 000 au-delà.',
    ],
  },
  {
    version: '0.40.0', date: '2026-09-03',
    titre: 'Où est passé le menu des images',
    points: [
      '**🖼️ Le menu « Images » du Pokédex a été retiré.** La version 0.38.0 '
      + 'proposait quatre styles de vignette — rendu HOME, rendu HOME animé, '
      + 'sprite du jeu, sprite animé. Il n’en reste qu’un : **le rendu HOME**, '
      + 'que le survol de la souris anime. Si tu avais choisi un autre style, '
      + 'c’est pour ça qu’il n’est plus là.',
      '**Les sprites d’époque n’ont pas disparu de l’application**, seulement '
      + 'de la grille : **ouvre la fiche d’un Pokémon**, le bouton '
      + '« Sprite animé » y est toujours, à côté de « Rendu HOME ».',
    ],
  },
  {
    version: '0.39.0', date: '2026-09-02',
    titre: 'Passe la souris sur un Pokémon, il s’anime',
    points: [
      '**▶️ La carte que tu survoles s’anime.** Les vignettes montrent le rendu '
      + 'HOME, comme avant ; celle que ton curseur désigne passe au **rendu '
      + 'animé**, et revient au fixe quand tu la quittes. Au clavier aussi : la '
      + 'carte que tu atteins au Tab s’anime pareil.',
      '**Une seule à la fois, et c’est voulu.** Un rendu animé pèse de 700 Ko '
      + 'à 3,5 Mo, contre 77 Ko pour le fixe : un écran entier de Pokémon '
      + 'animés, ce sont des dizaines de mégaoctets et autant de décodages en '
      + 'boucle. On anime donc là où tu regardes.',
      '**📏 Et l’animé garde sa taille.** Ces rendus sont découpés au plus '
      + 'près du Pokémon : étirés à la même case, un Chenipan aurait paru aussi '
      + 'gros qu’un Dracaufeu. Chacun est rapporté au plus grand connu — un '
      + 'petit Pokémon reste petit.',
      '**⚙️ Si tu as demandé moins d’animations à ton système**, ou si tu es en '
      + 'mode économie de données, rien ne s’anime : la carte garde son rendu '
      + 'fixe.',
      '**⚡ Changer d’onglet dessinait la grille quarante-quatre fois.** Un '
      + 'réglage se prévenait lui-même à chaque dessin et se rappelait aussitôt. '
      + 'C’était invisible mais lourd dans l’application, et sur la version web '
      + 'ça plantait la page. Deux dessins suffisent.',
    ],
  },
  {
    version: '0.37.0', date: '2026-09-02',
    titre: 'L’application ne se fige plus au premier Pokémon ouvert',
    points: [
      '**⚡ Ouvrir la première fiche d’une session tirait 3,7 Mo d’un seul '
      + 'coup** — les notices, les capacités et Cobblemon, demandées au même '
      + 'instant par trois blocs de la même fiche. Sur un ordinateur modeste, '
      + 'c’est là que Windows affichait « l’application ne répond plus » : le '
      + 'gel tombait sur un clic. Ces réserves sont maintenant demandées **plus '
      + 'tôt et une à la fois**, pendant que rien ne se passe. Mesuré sur le '
      + 'même geste : 3 722 Ko avant, 60 Ko après.',
      '**Rien de plus n’est chargé au démarrage**, et rien n’est préchargé si '
      + 'ton navigateur est en mode économie de données ou sur une connexion '
      + 'lente : dans l’application les réserves sont sur ton disque, sur le '
      + 'site elles viennent du réseau.',
      '**🔑 Une mise à jour ne te déconnecte plus.** L’application confondait '
      + '« pas de compte » et « le serveur n’a pas répondu » : elle vidait ta '
      + 'collection affichée et n’ouvrait aucune aventure, alors que ta session '
      + 'était intacte. Or c’est juste après une mise à jour que le serveur a '
      + 'le plus de chances de se taire — la machine finit d’écrire. Hors '
      + 'ligne, on ne touche plus à rien.',
      '**📥 La mise à jour s’affiche dans une fenêtre**, avec les mégaoctets '
      + '(« 3,2 sur 9,1 Mo ») plutôt que deux chiffres dans un bouton d’en-tête. '
      + 'L’installation, elle, n’annonce aucun pourcentage : l’installeur '
      + 'Windows reprend la main et ne dit plus rien — inventer un chiffre '
      + 'serait mentir. Et si ça échoue, tu le lis là où tu regardais.',
    ],
  },
  {
    version: '0.36.4', date: '2026-09-01',
    titre: 'La connexion ne paraît plus figée, et la fiche de capture s’ouvre en grand',
    points: [
      '**🔑 La connexion Discord semblait bloquée si tu n’étais pas déjà '
      + 'connecté.** L’application n’attendait que cinq minutes le retour du '
      + 'navigateur — assez quand il suffit d’autoriser, pas quand Discord '
      + 'réclame ton mot de passe, une double authentification ou un '
      + 'changement de compte. Elle attend maintenant dix minutes, et te dit '
      + 'ce qu’elle attend au lieu de griser son bouton en silence.',
      '**Et « Annuler » coupe vraiment.** La tentative abandonnée revenait '
      + 'parfois dix minutes plus tard écrire « délai dépassé » par-dessus '
      + 'l’écran, ou te connecter alors que tu avais renoncé. Rouvrir la '
      + 'fenêtre repart de zéro, au lieu d’un bouton grisé sans issue.',
      '**📋 La fiche de capture s’ouvre en fenêtre.** Elle se dépliait dans la '
      + 'colonne du Pokémon, où ses dix champs tenaient à l’étroit et '
      + 'repoussaient tout le reste vers le bas. « Où il est » l’a rejointe : '
      + 'c’est la même question sur le même exemplaire.',
    ],
  },
  {
    version: '0.36.3', date: '2026-09-01',
    titre: 'La fiche se range, et la rareté cesse de dire n’importe quoi',
    points: [
      '**⚠️ La rareté annonçait « Personne d’autre ne l’a » sur des Pokémon '
      + 'que tout le monde possède.** Le serveur refuse de calculer une rareté '
      + 'tant qu’il y a moins de cinq collections publiques — « 1 sur 2 » n’est '
      + 'pas une rareté, c’est un hasard — et l’application prenait ce refus '
      + 'pour un « personne ne l’a ». Elle dit maintenant ce qu’il en est : '
      + '*trop peu de collections publiques pour en tirer une rareté*.',
      '**Tout ce qui parle de TON exemplaire est passé sous le portrait** : la '
      + 'rareté, « Je le cherche », « L’envoyer à quelqu’un », « Où il est » et '
      + 'la fiche de capture. La colonne de droite garde ce qui décrit '
      + 'l’espèce — nom, types, gabarit, numéros, boîte. Elle laissait sous le '
      + 'Pokémon une plage vide aussi grande que lui.',
      '**La fiche se lit alignée à gauche.** Le nom se centrait au-dessus de '
      + 'vingt blocs alignés à gauche : deux mises en page dans le même cadre.',
      '**Les derniers émojis de la fiche sont dessinés** — l’épingle d’« Où il '
      + 'est », la manette, la Banque, HOME, et la fiche de capture.',
    ],
  },
  {
    version: '0.36.2', date: '2026-09-01',
    titre: 'Ce que les autres en ont, et ce que tu peux en faire',
    points: [
      '**« Personne d’autre ne l’a », « Je le cherche » et « L’envoyer à '
      + 'quelqu’un » tiennent maintenant dans une seule carte**, sous celle '
      + 'qui dit la boîte et à la même largeur qu’elle. Les trois parlent de '
      + 'la même question — qui d’autre l’a, est-ce que je le cherche, à qui '
      + 'je le montre — et traînaient en trois morceaux de largeurs '
      + 'différentes.',
    ],
  },
  {
    version: '0.36.1', date: '2026-09-01',
    titre: 'Deux pages ne se superposent plus, et la fiche se resserre',
    points: [
      '**Correctif : deux écrans pouvaient s’afficher l’un sous l’autre.** '
      + 'En quittant les Messages pour un Pokédex, la grille se dessinait '
      + 'au-dessus de la conversation, qui restait là. L’application éteignait '
      + 'les pages une par une, avec trois listes écrites à la main — et neuf '
      + 'pages manquaient à deux d’entre elles. Elle les éteint désormais '
      + 'toutes, sans liste à tenir à jour.',
      '**Normal et Shiny remontent sous le nom**, juste à côté du portrait '
      + 'qu’ils changent. Ils vivaient six blocs plus bas, après le gabarit et '
      + 'le rangement.',
      '**« Je le cherche » et « L’envoyer à quelqu’un » tiennent dans une '
      + 'carte**, comme celle qui dit la boîte. Ils étaient posés nus l’un '
      + 'sous l’autre au milieu de la grande plage vide qui suit le portrait.',
    ],
  },
  {
    version: '0.36.0', date: '2026-09-01',
    titre: 'Des images dans les messages, une galerie, et des icônes dessinées',
    points: [
      '**📷 Tu peux envoyer une image dans un message.** Trois façons, au '
      + 'choix : le bouton **appareil photo** sous le champ, **Ctrl+V** pour '
      + 'coller une capture que tu viens de faire, ou simplement **glisser le '
      + 'fichier** dans la conversation. Le même tiroir propose aussi les '
      + 'photos déjà posées sur tes chasses.',
      '**Une photo de chasse suit la visibilité de son aventure.** Si ton '
      + 'aventure est privée, ton correspondant ne pourrait pas l’ouvrir : '
      + 'l’envoi est refusé et te le dit, plutôt que d’arriver chez lui en '
      + 'cadre vide. Une image prise sur ton ordinateur, elle, part toujours — '
      + 'elle n’appartient à aucune aventure.',
      '**🖼 Une galerie de tes chromatiques**, depuis l’écran Chasse. Tous '
      + 'ceux que tu as obtenus, avec ou sans photo — le compte reste juste, '
      + 'et le filtre « avec photo » ne le change pas.',
      '**📋 Un écran d’état du relevé** : pour chaque jeu, ce qui est '
      + 'renseigné et ce qui manque — lieux, taux, méthodes, sprites. Il '
      + 'distingue « pas relevé » de « sans objet » : Rouge et Bleu n’ont pas '
      + 'de chromatiques, et leur en réclamer un taux n’aurait aucun sens.',
      '**⏳ Les échanges qui attendent TA réponse** depuis plus d’une semaine '
      + 'apparaissent en tête de la page des amis, avec de quoi accepter ou '
      + 'refuser sur place. Un bandeau, pas une notification : un rappel qui '
      + 'sonne tout seul au bout d’une semaine devient du harcèlement à '
      + 'retardement. Et les échanges conclus se rangent à part, sans '
      + 'disparaître.',
      '**Toute l’interface change d’icônes.** Les boutons portaient des '
      + 'émojis, dont le dessin appartient à la police de ton système : une '
      + 'pastille brillante posée au milieu d’un boîtier mat, différente d’une '
      + 'machine à l’autre. Ce sont maintenant des dessins, à deux couleurs, '
      + 'qui suivent le thème.',
      '**Correctif : les onglets de jeux de la fiche** n’avaient plus aucun '
      + 'style — ni fond, ni bordure — depuis le 25 août. Un commentaire mal '
      + 'refermé dans la feuille de style les avalait en silence.',
    ],
  },
  {
    version: '0.35.0', date: '2026-08-31',
    titre: 'Demander, offrir, et le site qui rejoint ton compte',
    points: [
      '**🙏 Tu peux demander un Pokémon sans rien offrir en retour.** Le don '
      + 'existait déjà dans l’autre sens ; il manquait son miroir. Choisis '
      + 'seulement ce que tu veux, et le bouton devient *Demander ce Pokémon* — '
      + 'l’autre accepte ou refuse, exactement comme une proposition normale.',
      '**Les deux colonnes ont changé de côté** dans le panneau d’entraide : à '
      + 'gauche ce que **tu donnes**, à droite ce qu’**il te donne**. La phrase '
      + 'se lit maintenant de gauche à droite, comme la barre juste en dessous — '
      + 'les deux se contredisaient.',
      '**🌐 Le site web utilise ton compte.** Jusqu’ici il gardait tout dans ton '
      + 'navigateur, sans compte ni échanges. Il parle désormais au même serveur '
      + 'que l’application : mêmes aventures, mêmes amis, mêmes échanges, mêmes '
      + 'messages, d’un appareil à l’autre.',
      '**Si tu avais une collection dans la version web**, elle vivait dans ton '
      + 'navigateur et n’est pas rattachée à ton compte. Le bouton **Exporter '
      + 'mes données** du Profil reste le pont : exporte depuis l’ancien '
      + 'navigateur, importe une fois connecté. Seul l’overlay OBS manque à '
      + 'l’appel sur le web — il demande une écoute locale.',
      '**Les pastilles ne recouvrent plus le nom de l’onglet.** On lisait '
      + '« Am12 » au lieu d’« Amis ». Elles ont leur place à côté, et sont un '
      + 'peu plus grandes — celle de la cloche coupait ses chiffres.',
      '**Le compte de messages en attente s’affiche dès l’ouverture**, au lieu '
      + 'd’attendre jusqu’à deux minutes.',
    ],
  },
  {
    version: '0.34.0', date: '2026-08-31',
    titre: 'Les messages ont leur page',
    points: [
      '**🩹 Un mot envoyé avec une proposition d’échange arrive enfin.** Il '
      + 'déclenchait bien une notification, mais l’écran Messages restait vide : '
      + 'il était rangé à côté de la conversation, pas dedans. La première chose '
      + 'qu’on écrit était la seule à ne pas arriver. Les échanges déjà proposés '
      + 'sont rattrapés — tu retrouveras des conversations que tu croyais vides.',
      '**💬 Un onglet « Messages », et une vraie page.** Deux colonnes : à '
      + 'gauche à qui tu parles, à droite ce que vous vous dites. C’était une '
      + 'fenêtre par-dessus l’écran, trop étroite pour une conversation.',
      '**Plus aucune fenêtre par-dessus.** La discussion d’un échange en était '
      + 'une, ouverte depuis la cloche : tu avais deux boîtes pour la même '
      + 'personne. Cliquer une notification de message ouvre maintenant la page, '
      + 'à la bonne conversation.',
      '**🔍 Le champ « À qui veux-tu écrire ? » propose des noms.** Tes amis '
      + 'd’abord, dès l’ouverture et sans rien taper, puis les autres dresseurs '
      + 'quand tu tapes. Et si personne ne correspond, tu peux écrire au pseudo '
      + 'exact — quelqu’un qui s’est retiré du classement reste joignable.',
      '**🎴 Joindre un Pokémon**, par son nom ou en parcourant une génération. '
      + 'Chez l’autre, ça arrive comme une carte qui ouvre sa fiche.',
      '**Une conversation ne se fige plus au deux-centième message.**',
    ],
  },
  {
    version: '0.33.0', date: '2026-08-30',
    titre: 'Une personne, une conversation',
    points: [
      '**💬 « Messages » est dans le menu, sous ton pseudo**, avec une pastille '
      + 'qui dit combien t’attendent. Ce n’est pas la même chose que la cloche : '
      + 'elle annonce ce qui vient d’arriver et s’éteint dès qu’on l’ouvre, la '
      + 'pastille dit ce qui attend encore une lecture.',
      '**Les messages d’un échange et les messages tout court sont réunis.** Tu '
      + 'avais deux boîtes pour la même personne, dont l’une ne s’ouvrait qu’en '
      + 'passant par la fiche d’un troc — et rien ne disait qu’elle existait. '
      + 'Chaque message venu d’un échange indique de quel échange il parle.',
      '**🎴 Tu peux joindre un Pokémon à un message.** Le bouton ➕ ouvre une '
      + 'recherche par nom **et par génération** ; chez l’autre, ça arrive comme '
      + 'une carte cliquable qui ouvre la fiche de l’espèce. On l’écrivait à la '
      + 'main jusqu’ici — sans image, sans lien, et avec les fautes de frappe de '
      + 'chacun. Un Pokémon seul est un message : pas besoin d’écrire « tiens ».',
      '**Cliquer une notification ouvre la conversation**, au lieu de te déposer '
      + 'sur la page des amis en te laissant chercher qui t’a écrit.',
      '**Tes amis sont proposés dès l’ouverture**, sans rien taper. Et taper '
      + '« Ja » sort Jack **même s’il s’est retiré du classement** : la recherche '
      + 'de dresseurs ne voit que les comptes visibles, tes amis oui.',
      '**🤝 Un bouton « Proposer un échange » dans la conversation.** Il ouvre la '
      + 'comparaison de vos deux Pokédex, là où se compose une proposition.',
      '**Un échange refusé reste lisible.** On n’y écrit plus, on peut encore '
      + 'relire ce qui s’y est dit.',
      '**🩹 Une conversation ne se fige plus au deux-centième message.** Passé '
      + 'ce cap, elle affichait éternellement le début et les nouveaux messages '
      + 'n’apparaissaient jamais.',
    ],
  },
  {
    version: '0.32.0', date: '2026-08-30',
    titre: 'Écrire à quelqu’un, offrir un Pokémon, calculer ses chances',
    points: [
      '**✉️ Une vraie messagerie.** Bouton *Envoyer un message* sur la page des '
      + 'amis, et à côté de chaque comparaison. Jusqu’ici, pour demander « tu '
      + 'aurais un Abra ? », il fallait d’abord composer une proposition '
      + 'd’échange — donc décider quoi donner et quoi demander avant même '
      + 'd’avoir pu poser la question.',
      '**🎁 Offrir sans rien demander.** Choisis un Pokémon dans la colonne de '
      + 'droite et laisse celle de gauche vide : le bouton devient *Offrir ce '
      + 'Pokémon*. La colonne de droite liste justement ce qui manque à l’autre.',
      '**🧮 Un calculateur de taux chromatique**, dans l’écran de chasse. Choisis '
      + 'ton jeu, ta méthode, coche tes bonus : il donne le taux, **le calcul '
      + 'écrit terme à terme**, et le nombre de rencontres pour 50, 90 et 99 %. '
      + 'Une mégapparition avec Charme Chroma et page de Pokédex complète, dans '
      + 'Légendes Arceus : 1 + 25 + 3 + 3 = 32 tirages, soit 1 sur 128 — et une '
      + 'chance sur deux au bout de 89 rencontres, pas 64.',
      '**🔒 Tu choisis qui peut t’écrire** : tout le monde, seulement les '
      + 'dresseurs que tu suis, ou personne. Réglage séparé de celui des '
      + 'échanges — on peut vouloir rester joignable pour échanger tout en '
      + 'fermant la conversation aux inconnus.',
      '**🚪 Et qui peut te proposer un échange**, dans les réglages également. '
      + 'Fermer ta porte ne touche à rien de ce qui est en cours : les '
      + 'propositions reçues et les discussions continuent leur vie.',
      '**🔎 Une recherche dans les colonnes d’entraide.** Elles s’arrêtaient à '
      + '« et 40 de plus », et ce qu’on cherchait y était souvent.',
      '**Les insultes déguisées sont refusées** dans les noms d’aventure comme '
      + 'dans les messages, y compris écrites à l’oreille pour contourner le '
      + 'filtre. Au passage, deux pseudos parfaitement innocents étaient refusés '
      + 'à tort — « Team X » et « Sacha x Ondine » — et ne le sont plus.',
      '**Sans compte, l’application se lit et ne s’écrit pas.** Avant, on '
      + 'pouvait cocher des cases sans être connecté : rien n’était enregistré, '
      + 'et rien ne le disait. Tout disparaissait au rechargement suivant.',
      '**La discussion d’un échange s’ouvre dès la proposition**, sans attendre '
      + 'qu’il soit accepté. Et un échange refusé reste **lisible** — on n’y '
      + 'écrit plus, on peut encore le relire.',
    ],
  },
  {
    version: '0.31.0', date: '2026-08-30',
    titre: 'La fiche d’un Pokémon remarche',
    points: [
      '**🩹 À corriger d’urgence si tu es en 0.30.0.** Dans cette version, '
      + 'cliquer un Pokémon ouvrait une fiche vide — ni statistiques, ni lieux, ni '
      + 'attaques, ni œufs. Deux morceaux de code portaient le même nom, et le '
      + 'second annulait tout le fichier de la fiche. C’est réparé, et une '
      + 'vérification empêche désormais qu’un fichier meure en silence.',
      '**🎴 Chaque distribution a sa carte.** Clique une ligne du Cadeau '
      + 'Mystère : tu y trouves ce que tu recevais vraiment — Dresseur d’Origine et '
      + 'son numéro, niveau, Ball avec son image, nature, talent, objet tenu, '
      + 'ruban, et les quatre attaques sous la puce de leur type. Celles qui '
      + 'n’existaient que dans cet évènement ressortent en doré.',
      '**Le nom anglais de chaque évènement** est là aussi : « Mewtwo Printemps '
      + '2012 » s’appelait *February 2012 Mewtwo* outre-Atlantique, et c’est sous ce '
      + 'nom-là qu’on le retrouve dans la plupart des discussions.',
      '**🔍 Quatre cent trente-trois distributions sur 552 sont détaillées** '
      + '— contre deux cent soixante-trois avant. Les autres restent vides : la '
      + 'carte le dit plutôt que de te donner les valeurs d’un évènement voisin. '
      + 'Un Phanpy s’affichait d’ailleurs en type Plante avec les attaques d’un '
      + 'Germignon ; il est redevenu Sol.',
    ],
  },
  {
    version: '0.30.0', date: '2026-08-30',
    titre: 'Cinq cent cinquante-deux distributions',
    points: [
      '**🎁 L’onglet Cadeau Mystère est de retour**, et il ne ressemble '
      + 'pas à l’ancien. Cinq cent cinquante-deux distributions officielles, du '
      + 'concours CoroCoro de 1996 aux codes d’aujourd’hui, avec pour chacune '
      + 'l’évènement, la méthode, les jeux et la date.',
      '**🔍 Quatre filtres qui se cumulent** : une recherche par nom, '
      + 'numéro ou évènement — tape « Tanabata » ou « Yokohama » pour voir — puis '
      + 'la génération, le jeu, et la rareté : normal, légendaire, fabuleux, ou '
      + 'distribué en chromatique. Ils sont soixante-neuf dans ce dernier cas.',
      '**Chaque ligne dit où elle a eu lieu.** Le relevé est mondial, et beaucoup '
      + 'de ces distributions n’ont jamais touché l’Europe : la région est écrite '
      + 'en rouge sur chaque carte, pour que l’écran ne te promette pas un '
      + 'évènement auquel personne ici n’a eu accès.',
      '**Le Pokédex retrouve son filtre Shiny-lock**, et ses filtres s’adaptent au '
      + 'jeu ouvert : plus de « Gigamax » sur Jaune ni de « Formes de Hisui » sur '
      + 'Rubis. Les menus déroulants ont tous le même rendu, et l’ascenseur aussi '
      + '— il en existait six versions légèrement différentes.',
    ],
  },
  {
    version: '0.29.0', date: '2026-08-29',
    titre: 'Quinze filtres que tu ne pouvais pas trouver',
    points: [
      '**🔍 Un bouton « Plus de filtres » sur le Pokédex.** La recherche '
      + 'comprenait déjà trente mots — fossile, gigamax, légendaire, manquants, '
      + 'hisui, shiny-lock… — et chacun filtre aussi bien que les menus de la '
      + 'barre. Encore fallait-il les deviner. Ils sont maintenant là, en '
      + 'quinze pastilles à cliquer. Elles écrivent dans la recherche : c’est '
      + 'exactement comme taper le mot, en plus simple.',
      '**📍 Mew est encore obtenable, et on te le cachait.** Il s’obtient '
      + 'toujours, une fois par Poké Ball Plus neuve — mais le filtre « encore '
      + 'obtenables aujourd’hui » ne le montrait pas. Diancie non plus, alors '
      + 'qu’il se télécharge sur Légendes Z-A depuis novembre 2025, sans date de '
      + 'fin. Le filtre passe de six à huit.',
      '**Où ouvrir le Cadeau Mystère, jeu par jeu.** Le menu change à chaque '
      + 'génération et la plupart des jeux le gardent fermé jusqu’à un moment '
      + 'précis de l’aventure : carte Miracle en 2G, menu titre en 4G, Poké '
      + 'Portail sur Écarlate et Violet, mission principale 3 sur Z-A. Arriver '
      + 'avec un code et ne pas trouver le menu, c’est fini.',
    ],
  },
  {
    version: '0.28.0', date: '2026-08-29',
    titre: 'Les cadeaux mystères qui pouvaient briller',
    points: [
      '**🎁 Un cadeau mystère est verrouillé par défaut** — c’est la règle, et '
      + 'presque tous la suivent. Cent trente-trois distributions y échappaient : '
      + 'les œufs de la « Gotta catch ’em all! Station » de 2001, ceux des Pokémon '
      + 'Centers japonais, les Pikachu partenaires de 2017. L’écran Shiny-lock te '
      + 'les montre désormais.',
      'Elles n’encombrent pas la liste : elles apparaissent quand tu choisis un jeu '
      + 'ou tapes un nom. Cherche « ronflex » et tu verras les deux faces — celui '
      + 'qui bloque la Route 6, verrouillé sur X et Y, et l’œuf de 2003 qui, lui, '
      + 'pouvait éclore chromatique.',
      'Presque toutes exploitaient la même faille, vivante de Rubis et Saphir '
      + 'jusqu’à Ultra-Soleil : échanger l’œuf entre sauvegardes d’identifiants '
      + 'différents jusqu’à ce qu’il éclose chromatique. Aucune de ces distributions '
      + 'n’a plus cours — c’est de l’histoire, utile sur une vieille cartouche.',
    ],
  },
  {
    version: '0.27.0', date: '2026-08-29',
    titre: 'Trois Pokémon qu’on t’avait dit impossibles',
    points: [
      '**🎯 Solgaleo, Lunala et Necrozma sont chassables.** L’application '
      + 'affirmait le contraire, et elle avait tort. Ils ne profitent simplement '
      + 'jamais du taux amélioré — ni Charme Chroma, ni bonus de rencontre — mais '
      + 'un chromatique existe. Vémini et Mandrillon aussi, sauf sur Soleil et '
      + 'Lune. Si tu as renoncé à une chasse à cause de ça, elle était possible.',
      '**La liste Shiny-lock a doublé**, et elle te dit maintenant, jeu par jeu, '
      + 'ce qui va te bloquer : sur Épée et Bouclier, « tous les Pokémon offerts '
      + 'sauf les fossiles », par exemple. Dix-neuf espèces manquaient, dont les '
      + 'quatre Trésors Funestes. Relevé sur le Dossier Shasse de Pokébip.',
      '**🎡 Les menus tournent.** Dès six choix, un menu devient une '
      + 'molette qui défile et s’aimante au centre — plus agréable que de traquer '
      + 'une barre de défilement dans vingt-quatre jeux ou cent capacités. En '
      + 'dessous de six, la liste reste comme avant.',
    ],
  },
  {
    version: '0.26.0', date: '2026-08-29',
    titre: 'Ce qui ne peut pas briller',
    points: [
      '**🔒 Un bouton Shiny-lock à côté de Créer une chasse.** Certains '
      + 'Pokémon n’ont pas de forme chromatique — jamais, ou pas par la rencontre '
      + 'que tu vises. La liste te les montre, avec un filtre par nom, par '
      + 'génération et par jeu.',
      '**🧭 Elle te dit surtout où aller.** Ouistempo ne peut pas briller '
      + 'quand le professeur te l’offre, mais ses œufs, si : le bouton au bout de '
      + 'la ligne ouvre la création de chasse avec le bon jeu déjà choisi.',
      'Rien n’est bloqué. La liste est tenue à la main et reste incomplète : elle '
      + 't’avertit, elle ne t’interdit rien. Et Rouge, Bleu et Jaune n’y figurent '
      + 'pas — le chromatique apparaît en Or et Argent, ces trois jeux n’en ont '
      + 'aucun.',
    ],
  },
  {
    version: '0.25.0', date: '2026-08-29',
    titre: 'Le « ? » répond à ta question',
    points: [
      '**📖 La pastille ? ne montre plus que son terme.** Elle est posée à côté '
      + 'd’un réglage et répond à une question : ouvrir les vingt entrées et te '
      + 'faire chercher la bonne, c’était répondre à côté. Un bouton **Voir tout '
      + 'le lexique** reste dessous, et le 📖 de l’en-tête ouvre toujours tout.',
      'Les renvois « voir aussi » **basculent** désormais sur le terme lié, au lieu '
      + 'de faire défiler une liste qui n’est plus là.',
      '**Le bas de l’écran dit l’essentiel.** Trois lignes de coulisses — où va la '
      + 'sauvegarde, la taille de la réserve, la date du relevé — ont laissé la '
      + 'place à la mention qui doit y figurer : **PokéPension est un projet '
      + 'indépendant, sans lien avec Nintendo, Game Freak ou The Pokémon '
      + 'Company.** Les sources restent créditées.',
    ],
  },
  {
    version: '0.24.0', date: '2026-08-29',
    titre: 'Un PNG reste un PNG',
    points: [
      '**🖼️ Tes captures ne sont plus reconverties.** L’application '
      + 'transformait toutes les photos en JPEG avant de les envoyer, et une '
      + 'capture d’écran y perdait : le texte d’une boîte, le liseré d’un '
      + 'chromatique, les aplats d’une interface s’y couvraient d’artefacts. Le '
      + 'format que tu donnes est désormais conservé — un PNG reste un PNG, '
      + 'sans perte.',
      'Au-delà d’un mégaoctet, le JPEG reprend la main : un PNG de plusieurs '
      + 'mégaoctets mangerait ton quota pour une différence que personne ne voit '
      + 'sur une photographie.',
      '**Arrêter de comparer te ramène d’où tu viens.** Comparer bascule sur un '
      + 'Pokédex ; en sortir te laissait devant ce Pokédex — celui de personne, '
      + 'puisque la comparaison venait de s’éteindre. Le bouton te repose '
      + 'maintenant sur la fiche du dresseur que tu regardais.',
      '**Le serveur nettoie aussi les PNG.** Ils portent eux aussi de quoi en '
      + 'dire trop — la position GPS, et des blocs de texte où certains '
      + 'logiciels écrivent le nom de ta machine. Ils sont retirés à l’arrivée, '
      + 'comme c’était déjà le cas pour les JPEG.',
    ],
  },
  {
    version: '0.23.0', date: '2026-08-29',
    titre: 'Ajouter quelqu’un sans retenir son pseudo',
    points: [
      '**➕ Ajouter en ami, depuis sa fiche.** Tu arrivais chez quelqu’un par '
      + 'la recherche, et il fallait retenir son pseudo pour aller le retaper '
      + 'deux onglets plus loin. Le bouton est maintenant là, entre ses succès '
      + 'et ses photos — et il sait où tu en es : « ✓ Tu le suis » quand c’est '
      + 'déjà fait, et un clic retire.',
      '**🔍 Le champ propose des noms.** « Suivre un dresseur par son pseudo » '
      + 'supposait que tu le connaisses **au caractère près**. Tape « Ja », il te '
      + 'sort « Jack ». Un clic remplit et suit dans la foulée.',
      '**Seuls les dresseurs visibles sont proposés.** Qui s’est retiré de la '
      + 'liste ne reparaît pas par une complétion — mais reste joignable : le '
      + 'champ accepte toujours un pseudo tapé en entier.',
      '**Correction :** sur le serveur, les photos de chasse atterrissaient dans '
      + 'un dossier voisin du bon. Rien n’était perdu, mais elles ne '
      + 's’affichaient pas. Le chemin ne dépend plus de la façon dont le service '
      + 'est lancé.',
    ],
  },
  {
    version: '0.22.0', date: '2026-08-28',
    titre: 'Montrer son Pokémon',
    points: [
      '**⛔ Ce qui te bloquera.** Sur le Pokédex d’un jeu, un bouton dit '
      + 'ce que tu **ne pourras pas** attraper : les exclusivités de version, ce '
      + 'qui ne s’obtient que par échange, ce que le scénario ne donne qu’une '
      + 'fois. Sur Rouge/Bleu : neuf par échange, onze en exemplaire unique. '
      + 'Chaque nom s’ajoute d’un clic à ta liste d’envies.',
      '**📦 Où le ranger.** La fiche d’un Pokémon porte sa **boîte et sa '
      + 'case** — « Boîte 2, case 11 » — dans l’ordre du Pokédex. Elle ne bouge '
      + 'pas quand tu changes de tri : un plan qui se déplace n’est pas un plan. '
      + 'Un lien t’emmène à la boîte.',
      '**🔎 Je cherche.** Ouvre la fiche d’un Pokémon, clique « Je le '
      + 'cherche » : il rejoint ta liste sur la page 📣 Amis, qui te dit **chez '
      + 'qui il est**. Les échanges marchaient à condition de savoir déjà à qui '
      + 'demander — il fallait ouvrir chaque ami un par un. C’est l’inverse '
      + 'maintenant.',
      '**📷 Les photos des autres se voient enfin.** Un bouton « Ses '
      + 'photos » sur la fiche de chaque dresseur ouvre son mur : ses chasses et '
      + 'ses défis en images. La règle n’a pas changé — aventure publique, elles '
      + 'se montrent ; privée, elles ne sortent pas.',
      '**L’historique des défis.** « Voir les précédents », sous la carte du '
      + 'jour : tous ceux qui sont passés, relevés ou non, avec leurs photos. Un '
      + 'journal, pas un palmarès — savoir ce qu’on a laissé filer un mardi de '
      + 'septembre fait partie de l’histoire.',
      '**Une aventure naît privée.** Toi seul la vois tant que tu n’as pas '
      + 'cliqué son cadenas. C’était l’inverse : un Pokédex devenait lisible par '
      + 'qui connaissait ton pseudo, sans que personne l’ait demandé. **Tes '
      + 'aventures existantes ne bougent pas** — seules les nouvelles démarrent '
      + 'fermées.',
      '**Conséquence, et elle est voulue :** un compte neuf n’apparaît nulle '
      + 'part. Ni classement, ni comparaison, ni entraide, tant que tu n’as rien '
      + 'ouvert. C’est un interrupteur à lever, plus un réglage à subir.',
      '**La présence Discord est éteinte au départ.** Elle se lit par **toute** '
      + 'ta liste d’amis, y compris par des gens que tu ne connais pas : c’est '
      + 'une décision à prendre, pas un réglage à subir. Si tu l’avais déjà '
      + 'réglée, ton choix est gardé.',
      '**Tes photos, et la place qu’elles prennent**, dans ⚙️ Paramètres.',
      '**🎲 Le défi du jour.** Un Pokémon tiré au hasard, chaque jour, sur '
      + 'l’accueil. **Le même pour tout le monde**, et il change à minuit. Rien '
      + 'd’obligatoire : c’est un prétexte à sortir une photo, pas une tâche — '
      + 'et il n’y a pas de série à tenir, donc rien à perdre quand tu sautes '
      + 'un jour.',
      '**Aucun jeu imposé.** Le défi dit « celui-là », pas « celui-là dans '
      + 'Rouge/Bleu » : n’importe quel jeu fait l’affaire, y compris celui '
      + 'auquel tu joues ce soir.',
      '**Il pioche parmi toutes les espèces**, pas seulement dans ce qui te '
      + 'manque. Tomber sur un Pokémon que tu as déjà n’est pas un défaut : '
      + 'c’est l’occasion de le montrer. Et le défi ne s’éteint pas le jour où '
      + 'tu finis ton dex.',
      '**📷 Une photo sur chaque chasse aboutie.** Le tableau de chasse '
      + 'alignait des chiffres — 2311 rencontres, 1/1365, treize jours. Ça dit '
      + 'l’effort, pas le moment. Clique la case en bout de ligne et attache la '
      + 'capture de l’apparition.',
      '**Et les autres la voient.** Une photo suit la visibilité de son aventure, '
      + 'comme le reste : publique, elle se montre à qui va voir ton tableau ; '
      + 'privée, elle ne sort pas. Aucun réglage de plus à comprendre.',
      '**Ta position ne part pas avec.** Une photo de téléphone porte ses '
      + 'métadonnées — modèle de l’appareil, heure exacte, et les coordonnées '
      + 'GPS. L’application redessine l’image avant de l’envoyer, ce qui les '
      + 'efface, et le serveur retire lui-même ce qui resterait. Montrer un '
      + 'chromatique ne publie pas ton salon.',
      '**Elles ne s’accumulent pas dans ton dos.** Une capture de Switch part à '
      + '1600 pixels de côté au lieu de sa taille d’origine, et supprimer une '
      + 'chasse emporte sa photo. Soixante photos et quarante mégaoctets par '
      + 'compte : de quoi tenir des années de chasse.',
      '**Sur la version web, non.** Elle range tout dans ton navigateur, dont le '
      + 'budget entier serait mangé par deux captures. L’appareil photo le dit '
      + 'franchement plutôt que d’avaler une image qui disparaîtrait au '
      + 'rechargement.',
    ],
  },
  {
    version: '0.21.0', date: '2026-08-27',
    titre: 'Proposer un échange, en discuter, et un en-tête qui respire',
    points: [
      '**⇄ Proposer un échange.** Dans 🤝 Entraide, face à un dresseur, '
      + 'clique un nom dans chaque colonne : ce que tu veux, ce que tu donnes. La '
      + 'proposition part avec le jeu, et un mot si tu veux. **Rien ne bouge tout '
      + 'seul** : PokéPension note l’accord, vous vous retrouvez ensuite dans le '
      + 'jeu pour le faire.',
      '**Accepter, refuser, discuter.** Une proposition reçue s’accepte ou se '
      + 'refuse depuis la page 📣 Amis. Une fois **acceptée**, une discussion '
      + 's’ouvre entre vous deux, pour convenir d’une heure. Avant l’acceptation, '
      + 'personne ne peut t’écrire : suivre quelqu’un n’ouvre aucune porte.',
      '**🔔 Une cloche** dans l’en-tête. Ce qui s’adresse à toi et attend une '
      + 'réponse : une proposition, un accord, un message. À ne pas confondre avec '
      + 'les captures de tes amis, qui gardent leur pastille sur l’onglet.',
      '**L’en-tête s’est vidé.** Les cinq pastilles rondes — langue, lexique, '
      + 'nouveautés, mise à jour, thème — ont rejoint le menu de ton pseudo, où '
      + 'elles portent enfin un **nom**. Il ne reste que la cloche.',
      '**⚙️ Une page Paramètres.** La langue, les couleurs, ta présence, les '
      + 'notifications : tout ce qui règle l’application quitte le bas du Profil, '
      + 'où il fallait dépasser deux cents lignes de journal pour l’atteindre. Le '
      + 'Profil dit qui tu es, les Paramètres disent comment ça se tient.',
      '**Tu n’apparais plus au classement par défaut.** Un compte sert d’abord à '
      + 'garder ton Pokédex d’une machine à l’autre ; y figurer devant tout le '
      + 'monde est une seconde décision, et elle t’appartient. L’interrupteur est '
      + 'dans les Paramètres. Les comptes déjà visibles le restent.',
      '**Sur la fiche d’un dresseur**, le champ de recherche et le filtre '
      + 'disparaissent : ils appartenaient au classement, et toucher au filtre te '
      + 'rejetait dehors sans prévenir.',
    ],
  },
  {
    version: '0.20.0', date: '2026-08-27',
    titre: 'Relire une sauvegarde, ranger en boîtes, et s’entraider',
    points: [
      '**Importer une sauvegarde.** L’application exportait depuis toujours sans '
      + 'jamais savoir relire. Le bouton **⬆ Importer** de ton profil avale un '
      + 'fichier de l’application ou du site : les collections **se réunissent**, '
      + 'rien n’est écrasé, rien n’est décoché. Importer deux fois le même '
      + 'fichier ne change rien la seconde fois.',
      '**🤝 Entraide.** En comparant ton dex avec quelqu’un, un bouton donne la '
      + 'liste **nommée** de ce que vous pouvez vous apporter — pas seulement le '
      + 'nombre. Le même bouton figure sur chaque ami.',
      '**📦 Vue boîtes.** Trente par boîte, six par rangée, comme la console. En '
      + 'Living Dex, la question n’est pas « est-ce que je l’ai » mais « dans '
      + 'quelle boîte, quelle case ».',
      '**Le programme du soir**, sur l’accueil : trois à cinq Pokémon qui te '
      + 'manquent et que tu peux vraiment attraper ce soir, avec la route, '
      + 'l’heure, la météo et le taux. La liste change demain.',
      '**🎯 Objectifs sur mesure.** Tes filtres deviennent un but nommé, avec sa '
      + 'propre jauge sur l’accueil : « tous les Spectre chromatiques », « les '
      + '151 de Kanto dans Écarlate ».',
      '**🎴 Fiche de capture.** Sur un Pokémon déjà coché : la Ball, la nature, '
      + 'le surnom, le ruban, le dresseur d’origine. Repliée par défaut — c’est '
      + 'pour qui la cherche.',
      '**Une page Transferts**, dans le nouvel onglet 🧰 Outils : par quel chemin '
      + 'un Pokémon rejoint Pokémon HOME depuis chaque jeu, et **combien de temps '
      + 'il reste**. Les seize jeux 3DS passent tous par la Banque Pokémon, qui '
      + 's’arrête — la page compte les mois qui restent pour les faire remonter.',
      '**Stratégie, Reproduction et Transferts** tiennent désormais sous un seul '
      + 'onglet, **🧰 Outils** : la barre du haut débordait, elle tient de nouveau '
      + 'sur une rangée.',
      '**📍 Où il est**, sur la fiche d’un Pokémon coché : dans le jeu, dans la '
      + 'Banque, ou déjà dans HOME. Un clic — c’est ce qu’on met à jour à chaque '
      + 'transfert.',
      '**La recherche comprend plus qu’un nom** : un numéro, un type (« feu »), '
      + 'une génération (« gen3 »), un état (« manquants ») ou un mot-clé '
      + '(« légendaire », « starter », « méga »). Une ligne dit ce qui a été '
      + 'compris, et les accents ne comptent plus.',
      '**La grille se parcourt aux flèches**, se coche à l’espace, s’ouvre à '
      + 'Entrée. « / » saute à la recherche.',
      '**Un tableau de chasse.** Tes chromatiques trouvés ne disparaissent plus : '
      + 'la plus longue chasse, la plus courte, et si tu es au-dessus ou en '
      + 'dessous de la moyenne. **Espace**, **Retour arrière** et **Entrée** '
      + 'comptent au clavier — et **Ctrl+Alt+↑ / ↓** même pendant que tu joues, '
      + 'fenêtre en arrière-plan.',
      '**📺 Overlay OBS** : une adresse locale à coller en source navigateur. Le '
      + 'sprite, le compteur, le taux et la probabilité cumulée, sur fond '
      + 'transparent.',
      '**📖 Lexique**, en haut de la fenêtre : vingt mots de l’écran expliqués, '
      + 'et une pastille « ? » là où ils apparaissent.',
      '**Deux questions au premier lancement** plutôt que dix onglets et un '
      + 'compteur à zéro : à quoi tu joues, et ce que tu comptes.',
      '**🖼 Une image à partager** de ta collection, depuis ton profil.',
      '**La rareté** : la fiche dit combien de dresseurs possèdent cette entrée, '
      + 'et un tri met tes pièces rares en tête.',
      '**Le relevé dit son âge** en bas de fenêtre. Toute la matière vient d’un '
      + 'jour précis, et rien ne le disait.',
      '**Corrigé :** tes chasses ne quittaient jamais cet ordinateur — elles '
      + 'vivaient dans son stockage local et nulle part ailleurs. Elles partent '
      + 'maintenant avec le reste, et se retrouvent sur une autre machine.',
    ],
  },
  {
    version: '0.19.0', date: '2026-08-26', titre: 'Ta présence Discord, quand tu le veux',
    points: [
      'Un réglage **Ma présence Discord** dans ton profil, avec trois choix. '
      + 'Jusqu’ici c’était toujours actif, sans moyen de couper.',
      '**Discrète** est sans doute celui qu’il te faut : Discord montre l’écran '
      + 'que tu consultes, mais ni ton pseudo ni le nom de ton aventure. Une '
      + 'présence se lit par toute ta liste d’amis, y compris par des gens que tu '
      + 'ne connais pas.',
      'Couper l’**efface tout de suite** — la dernière présence envoyée ne reste '
      + 'pas affichée à ta liste d’amis.',
      'Le choix vaut **pour cette machine**, pas pour ton compte : tu peux '
      + 'l’afficher chez toi et pas ailleurs.',
    ],
  },
  {
    version: '0.18.0', date: '2026-08-25', titre: 'Le bon tri, et des scores qui se comparent',
    points: [
      'Dans un jeu, la liste se trie par **numéro du jeu** — l’ordre dans lequel '
      + 'la console présente son propre Pokédex. Si tu choisis un autre tri, il '
      + 'tient : rien ne le défait en changeant d’onglet.',
      'Au classement, chaque ligne dit **sur quelle base** elle compte : « Vus », '
      + '« Living dex », « Formes 4 ». Trois cents captures ne veulent pas dire la '
      + 'même chose d’une aventure à l’autre.',
      'Un **sélecteur** permet de ne comparer que les aventures du même type. '
      + 'Quand il est actif, une ligne dit combien de dresseurs il met de côté.',
      'Les succès par Pokédex d’un autre dresseur affichaient **zéro pour tout le '
      + 'monde**. Ils montrent désormais son vrai avancement, jeu par jeu.',
      'La fenêtre « Tu es à jour » s’affichait un mot par ligne. Réparée.',
      'Les barres de défilement se voient enfin, et ont perdu leurs deux petites '
      + 'flèches.',
    ],
  },
  {
    version: '0.17.0', date: '2026-08-25', titre: 'Un tableau de chasse, et les succès des autres',
    points: [
      'Un bouton **Voir mes succès** dans ton profil ouvre soixante succès : '
      + 'tes premiers pas, ta régularité, tes chromatiques, tes légendaires — '
      + 'et un par Pokédex.',
      'Rien à débloquer à la main : tout se déduit de ce que tu as déjà '
      + 'enregistré. Un succès ajouté plus tard s’acquiert **rétroactivement**, '
      + 'à sa vraie date.',
      '**L’exploration** : un lieu compte dès que tu y as pris un Pokémon. '
      + 'Trois mille trois cents lieux sur les vingt-trois jeux, et « Carte '
      + 'complète » pour un jeu arpenté de bout en bout.',
      'Les **dix-huit types**, le **temps long** — un an d’archive, ou reprendre '
      + 'après trente jours d’absence — et une **légende chromatique**.',
      'Les succès d’un autre dresseur se regardent depuis sa fiche, par '
      + '**Ses succès**. Son journal, lui, ne sort pas : seuls les totaux servent.',
    ],
  },
  {
    version: '0.16.0', date: '2026-08-25', titre: 'Ta présence Discord s’efface quand tu pars',
    points: [
      'En te déconnectant, ta présence Discord continuait d’afficher ton pseudo '
      + 'et ton aventure à toute ta liste d’amis. Elle s’efface désormais — que '
      + 'tu partes toi-même ou que ta session expire.',
      'Du ménage sous le capot : 123 lignes de styles qui ne servaient plus.',
    ],
  },
  {
    version: '0.15.0', date: '2026-08-25', titre: 'Chercher un lieu, ou un Pokémon',
    points: [
      'Une **barre de recherche** sur la page Lieux : tape le nom d’une route ou '
      + 'celui d’un Pokémon, c’est le même champ. Les accents ne comptent pas — '
      + '« foret » trouve la Forêt de Jade.',
      'Le premier lieu trouvé s’ouvre tout seul.',
      'Un **trait sépare** ce qu’il te reste à prendre de ce que tu as déjà.',
      'La fenêtre « à jour » dit désormais en quelle version tu es.',
    ],
  },
  {
    version: '0.14.0', date: '2026-08-25', titre: 'Où aller, et ce que tu as fait',
    points: [
      'Un onglet **Lieux** : choisis un jeu, et chaque route dit ce qu’il te reste '
      + 'à y prendre — avec le taux d’apparition, le niveau, l’heure et la météo.',
      'Les 23 jeux y sont, Cobblemon compris par ses biomes.',
      'Dans le Profil, **ta rétrospective** : tes captures de la semaine, ton '
      + 'meilleur jour, ta plus longue série, et les trente derniers jours en un '
      + 'coup d’œil.',
      'Un **carnet de bord** par aventure : ta règle de Nuzlocke, tes surnoms, où '
      + 'tu en es.',
    ],
  },
  {
    version: '0.13.0', date: '2026-08-25', titre: 'Le nom Discord, pas l’identifiant',
    points: [
      'C’est ton **nom affiché** sur Discord qui s’affiche — « Tennôsei » — et non '
      + 'le pseudo technique « tennosei5804 ».',
      'Il se met à jour à chaque connexion, donc si tu changes de nom sur Discord, '
      + 'il suivra.',
    ],
  },
  {
    version: '0.12.0', date: '2026-08-25', titre: 'Reconnaître quelqu’un sans cliquer',
    points: [
      'Le pseudo Discord apparaît aussi dans **le classement, la recherche et ta '
      + 'liste d’amis** — plus seulement sur la fiche d’un dresseur.',
      'Le pseudo choisi passe au-dessus, le pseudo Discord en dessous, et les deux '
      + 'à la même taille.',
      'Les changelogs se lisent à gauche au lieu d’être centrés.',
    ],
  },
  {
    version: '0.11.0', date: '2026-08-25', titre: 'Le pseudo Discord, en plus du tien',
    points: [
      'Le profil d’un dresseur montre maintenant **trois lignes** : son pseudo '
      + 'Discord, son pseudo PokéPension, puis son aventure.',
      'Ce nom ne se change pas depuis l’application — c’est ce qui permet de '
      + 'reconnaître quelqu’un qui s’est renommé ici.',
      'Il n’apparaît qu’après une reconnexion : on ne le gardait pas jusqu’ici.',
    ],
  },
  {
    version: '0.10.0', date: '2026-08-25', titre: 'L’aventure d’un dresseur, nommée',
    points: [
      'Quand tu ouvres le profil de quelqu’un, tu vois **le nom de son aventure** '
      + 'au lieu de « 1 aventure publique » — qui n’apprenait rien, puisque la '
      + 'liste juste en dessous les compte déjà.',
      'Un pseudo trop long ne déborde plus de la carte.',
    ],
  },
  {
    version: '0.9.0', date: '2026-08-25', titre: 'Les visages, et des pseudos plus courts',
    points: [
      'Les **photos de profil Discord** s’affichent enfin dans la liste d’amis et '
      + 'dans le fil — elles étaient cassées.',
      'Chaque ami montre **son aventure** à côté de son pseudo : « Tennosei — '
      + 'Chasse shiny ».',
      'Les pseudos passent à **douze caractères**. Les plus longs restent valides, '
      + 'mais l’affichage les raccourcit au lieu de déborder.',
      'Les époques de la table des types se lisent dans l’ordre : 1ʳᵉ génération, '
      + 'puis 2ᵉ à 5ᵉ, puis 6ᵉ à 9ᵉ.',
      'La case « apparaître dans la liste des dresseurs » devient un vrai '
      + 'interrupteur.',
    ],
  },
  {
    version: '0.8.0', date: '2026-08-25', titre: 'Les amis',
    points: [
      'Une page **Amis** : suis qui tu veux, et vois passer ce qu’ils attrapent. '
      + 'Une bulle apparaît quand un ami avance — une seule par synchronisation, '
      + 'jamais une par Pokémon.',
      'Les chromatiques de tes amis ont droit à leur propre annonce.',
      'Dans le Profil, tu peux **te retirer de la liste des dresseurs** : tu sors '
      + 'du classement et de la recherche.',
      'La table complète des types s’adapte à l’époque : trois boutons pour lire '
      + 'les règles de la 1ʳᵉ génération, de la 2ᵉ à la 5ᵉ, ou d’aujourd’hui.',
      'Ce bouton-ci, qui te dit ce qui a changé.',
    ],
  },
  {
    version: '0.7.0', date: '2026-08-25', titre: 'Le sélecteur garde ses couleurs',
    points: [
      'Le sélecteur de couleur ne prend plus la teinte qu’on est en train de '
      + 'choisir : on jugeait un vert vif dans une fenêtre elle-même verte.',
    ],
  },
  {
    version: '0.6.0', date: '2026-08-25', titre: 'Un vrai sélecteur de couleur',
    points: [
      'Le choix libre des couleurs n’ouvre plus la boîte de Windows mais un '
      + 'sélecteur maison : carré de teintes, ruban, code hexadécimal, canaux '
      + 'rouge/vert/bleu, et la pipette.',
      'Il affiche le contraste de la couleur choisie, pour dire si le résultat '
      + 'restera lisible.',
    ],
  },
  {
    version: '0.5.0', date: '2026-08-25', titre: 'Le volume, et tes couleurs',
    points: [
      'Le cri a un **volume réglable** — le curseur se déplie quand on approche '
      + 'du bouton. L’icône montre le niveau.',
      'Dans le Profil, **cinq couleurs à choisir** : le fond, le cadran rouge, '
      + 'l’écriture, le fond des cartes, les bordures. Le reste de la palette '
      + 'se déduit toute seule.',
      'Le choix appartient au thème : ce que tu poses en sombre ne suit pas en clair.',
    ],
  },
  {
    version: '0.4.0', date: '2026-08-25', titre: 'Le cri, et les faiblesses d’époque',
    points: [
      'Un bouton dans le coin du portrait **joue le cri du Pokémon**. Sur un '
      + 'Pokédex d’avant la 6ᵉ génération, c’est le cri de la Game Boy.',
      'Les faiblesses suivent la génération du jeu ouvert. Sur Rouge et Bleu, '
      + 'Abra n’est plus annoncé faible au Spectre — qui ne lui faisait aucun '
      + 'dégât — ni aux Ténèbres, qui n’existaient pas.',
    ],
  },
  {
    version: '0.3.0', date: '2026-08-25', titre: 'Discord, et ce qui t’appartient',
    points: [
      'Ta **présence Discord** montre le Pokédex ouvert, ton pseudo et ton aventure.',
      '**Emporter tes données** dans un fichier, depuis le Profil.',
      'Voir et fermer tes **connexions ouvertes** sur d’autres machines.',
      'Un **journal** qui réunit toutes tes aventures, pas seulement celle en cours.',
      'Un bouton pour chercher les mises à jour quand ça te chante.',
    ],
  },
  {
    version: '0.2.0', date: '2026-08-24', titre: 'Cobblemon et les pseudos',
    points: [
      '**Cobblemon** entre dans la Chasse aux chromatiques.',
      'Chaque apparition dit la part qu’elle prend dans son palier de rareté.',
      'Les pseudos et noms d’aventure insultants sont refusés — sans refuser '
      + 'Cassandre ni Scunthorpe.',
    ],
  },
  {
    version: '0.1.0', date: '2026-08-24', titre: 'Première version',
    points: [
      'PokéPension s’installe et se met à jour tout seul.',
    ],
  },
];

// ---- Ce qui est nouveau pour cette personne ---------------------------------

/** Compare deux « x.y.z ». Rend un nombre négatif, nul ou positif. */
function comparerVersions(a, b){
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for(let i = 0; i < 3; i++){
    const d = (x[i] || 0) - (y[i] || 0);
    if(d) return d;
  }
  return 0;
}

function nouveautesVues(){
  try{ return localStorage.getItem(NOUVEAUTES_VUES_KEY); }catch(e){ return null; }
}

function marquerNouveautesVues(){
  try{ localStorage.setItem(NOUVEAUTES_VUES_KEY, NOUVEAUTES[0].version); }
  catch(e){ /* stockage refusé */ }
}

/**
 * Les versions que cette personne n'a pas encore lues.
 *
 * Sur une installation neuve, rien n'est marqué : on ne va pas accueillir
 * quelqu'un par la liste de ce qu'il a manqué avant d'arriver. On note
 * simplement où il en est, et la pastille servira à la prochaine version.
 */
function nouveautesNonLues(){
  const vues = nouveautesVues();
  if(!vues){ marquerNouveautesVues(); return []; }
  return NOUVEAUTES.filter(function(n){ return comparerVersions(n.version, vues) > 0; });
}

function majPastilleNouveautes(){
  if(!nouveautesBtn) return;
  nouveautesBtn.classList.toggle('a-du-neuf', nouveautesNonLues().length > 0);
}

// ---- L'affichage -------------------------------------------------------------

const NOUVEAUTES_MOIS = ['janvier','février','mars','avril','mai','juin','juillet',
                         'août','septembre','octobre','novembre','décembre'];

function dateNouveaute(iso){
  const p = String(iso).split('-');
  if(p.length !== 3) return iso;
  return Number(p[2]) + ' ' + NOUVEAUTES_MOIS[Number(p[1]) - 1] + ' ' + p[0];
}

/**
 * Le gras d'un point, sans innerHTML.
 *
 * Les textes sont écrits ici, donc sûrs — mais les passer par innerHTML
 * ouvrirait la porte au jour où l'un d'eux viendrait d'ailleurs. Deux
 * astérisques encadrent ce qui compte, et on découpe dessus.
 */
function texteAvecGras(texte){
  const frag = document.createDocumentFragment();
  String(texte).split('**').forEach(function(bout, i){
    if(!bout) return;
    if(i % 2){
      const b = document.createElement('strong');
      b.textContent = bout;
      frag.appendChild(b);
    } else {
      frag.appendChild(document.createTextNode(bout));
    }
  });
  return frag;
}

function blocVersion(n, estNouveau){
  const bloc = document.createElement('div');
  bloc.className = 'nouv-version' + (estNouveau ? ' neuve' : '');

  const tete = document.createElement('div');
  tete.className = 'nouv-tete';

  const num = document.createElement('span');
  num.className = 'nouv-num';
  num.textContent = n.version;

  const titre = document.createElement('span');
  titre.className = 'nouv-titre';
  titre.textContent = n.titre;

  const quand = document.createElement('span');
  quand.className = 'nouv-date';
  quand.textContent = dateNouveaute(n.date);

  tete.appendChild(num);
  tete.appendChild(titre);
  if(estNouveau){
    const marque = document.createElement('span');
    marque.className = 'nouv-marque';
    marque.textContent = 'Nouveau';
    tete.appendChild(marque);
  }
  tete.appendChild(quand);

  const liste = document.createElement('ul');
  liste.className = 'nouv-points';
  n.points.forEach(function(p){
    const li = document.createElement('li');
    li.appendChild(texteAvecGras(p));
    liste.appendChild(li);
  });

  bloc.appendChild(tete);
  bloc.appendChild(liste);
  return bloc;
}

function ouvrirNouveautes(){
  if(!nouveautesOverlay) return;
  const vues = nouveautesVues();
  nouveautesListe.innerHTML = '';
  NOUVEAUTES.forEach(function(n){
    const neuf = !!vues && comparerVersions(n.version, vues) > 0;
    nouveautesListe.appendChild(blocVersion(n, neuf));
  });

  nouveautesOverlay.style.display = 'flex';
  // Lire vaut lecture : la pastille retombe, mais seulement une fois la liste
  // réellement affichée.
  marquerNouveautesVues();
  majPastilleNouveautes();
  setTimeout(function(){ nouveautesFermer.focus(); }, 10);
}

function fermerNouveautes(){
  if(nouveautesOverlay) nouveautesOverlay.style.display = 'none';
}

// ---- Branchements -----------------------------------------------------------

document.addEventListener('DOMContentLoaded', function(){
  if(nouveautesBtn) nouveautesBtn.addEventListener('click', ouvrirNouveautes);
  if(nouveautesFermer) nouveautesFermer.addEventListener('click', fermerNouveautes);
  if(nouveautesOverlay){
    nouveautesOverlay.addEventListener('click', function(e){
      if(e.target === nouveautesOverlay) fermerNouveautes();
    });
  }
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && nouveautesOverlay
       && nouveautesOverlay.style.display === 'flex') fermerNouveautes();
  });
  majPastilleNouveautes();
});
