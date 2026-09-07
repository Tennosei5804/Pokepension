# Dossier de faux positif — PokéPension

Quatre navigateurs et Windows bloquent l'installateur. Ce dossier sert à le
faire lever. Il tient en deux démarches **séparées**, chez deux acteurs qui ne
se parlent pas : Microsoft d'un côté, Google de l'autre.

> **À refaire à chaque version.** Une soumission vaut pour **une empreinte**.
> Le binaire de la version suivante est un fichier neuf, inconnu des deux
> systèmes, et le compteur repart de zéro. C'est la signature Authenticode,
> et elle seule, qui casserait ce cycle — voir « Ce que ça ne règle pas ».

---

## Ce qu'on sait (relevé du 7 septembre 2026)

| | |
|---|---|
| Fichier | `PokePension-Windows-x64.exe` |
| Version | 0.42.2 (tag `v0.42.2`, publié le 6 septembre 2026) |
| Taille | 9 377 773 octets |
| SHA-256 | `b5d62f79cdbe26ea9de8c98dd7a8948f0b08f38479630dc43ff765a728f0f6d1` |
| SHA-1 | `8f5b3a5a0edc4cf4731edf38d00b499ca1fcb8d7` |
| MD5 | `c7c671ec8f93f82f916eba2c86d27097` |
| Servi par | `https://pokepension.fr/telecharger` |
| Signature Authenticode | **aucune** |

Empreintes calculées sur le VPS, sur le fichier réellement servi. Il fait la
taille exacte de l'artefact de la release GitHub : c'est bien le binaire du CI,
pas une compilation locale.

### Les deux détections, et pourquoi la nuance compte

| Quand | Nom | Sort du fichier | Ce que ça veut dire |
|---|---|---|---|
| 7 sept. 19:50 et 19:54 | `Trojan:Win32/Cloxer` | **supprimé** | **définition**. Une règle des signatures Defender correspond à ce binaire. |
| 6 sept. 20:26 | `Trojan:Win32/Bearfoos.A!ml` | en quarantaine | `!ml` = *machine learning*, un pronostic sur des traits. |

C'est `Cloxer` qui bloque aujourd'hui, et **l'absence de `!ml` est une bonne
nouvelle** : un faux positif de définition se corrige d'ordinaire vite, et la
correction descend chez tout le monde à la mise à jour de signatures suivante.
Un verdict heuristique, lui, se rediscute à chaque compilation.

Moteur au moment de la détection — le formulaire les demande :

```
Version du produit     : 4.18.26080.3
Version du moteur      : 1.1.26080.3
Signatures             : 1.459.93.0   (mises à jour le 7 sept. 2026 06:27)
```

Pour refaire ce relevé — le nom de la détection appartient à la machine qui l'a
vue, pas au fichier :

```
powershell -ExecutionPolicy Bypass -File app\outils\faux-positif\releve.ps1
```

---

## 1. Microsoft — la démarche qui compte

### a. Récupérer une copie du fichier

**Defender l'a supprimé, et non mis en quarantaine** — il n'y a donc rien à
restaurer. Le relevé le dit noir sur blanc : les deux détections `Cloxer` du
7 septembre portent « action : supprimé, état : SUPPRIMÉ ». Seule la détection
`Bearfoos.A!ml` de la veille est en quarantaine, et ce n'est pas elle qui bloque.

Retélécharger sans rien faire le fera reprendre aussitôt. Le formulaire, lui,
demande le fichier.

Le moins mauvais chemin, **et rien de plus large** :

1. Sécurité Windows → Protection contre les virus et menaces → Gérer les
   paramètres → Exclusions → ajouter **un dossier vide créé pour l'occasion**,
   par exemple `Downloads\soumission`.
2. Y télécharger `https://pokepension.fr/telecharger`.
3. Faire la soumission ci-dessous.
4. **Retirer l'exclusion.** Elle ne doit pas survivre à la démarche.

Une exclusion de dossier, sur un dossier qui ne contient que ce fichier, le
temps d'un envoi. Pas de désactivation de la protection en temps réel, qui
laisserait la machine entière à découvert pendant ce temps-là.

### b. Le formulaire

**https://www.microsoft.com/en-us/wdsi/filesubmission** — connexion avec un
compte Microsoft, puis choisir **« Software developer »** (le troisième profil :
*Software providers wanting to validate detection of their products*). C'est ce
profil qui ouvre la voie « je conteste une détection » ; les deux autres servent
à signaler un fichier suspect, ce qui est l'inverse de ce qu'on veut.

| Champ | Quoi mettre |
|---|---|
| Product | Microsoft Defender Antivirus |
| File | l'installateur récupéré à l'étape a |
| Detection name | `Trojan:Win32/Cloxer` |
| Do you believe this file is malware ? | **No** |
| Definition version | 1.459.93.0 |
| Additional information | le texte ci-dessous |

### c. Le texte à coller

En **anglais** : les analystes travaillent dans cette langue, et un dossier
qu'il faut d'abord traduire attend plus longtemps.

```
PokéPension is an open-source Pokémon collection tracker for Windows, built
with Tauri 2 (Rust + WebView2). The installer is an NSIS bundle produced by
`tauri build`. We are the developers and we believe this detection is a false
positive.

  File     : PokePension-Windows-x64.exe
  Version  : 0.42.2
  Size     : 9,377,773 bytes
  SHA-256  : b5d62f79cdbe26ea9de8c98dd7a8948f0b08f38479630dc43ff765a728f0f6d1
  Detected : Trojan:Win32/Cloxer  (definitions 1.459.93.0, engine 1.1.26080.3)
             Trojan:Win32/Bearfoos.A!ml was reported on the same build earlier.

Supporting facts:

1. The binary is built end to end by a public GitHub Actions workflow, never
   on a developer machine. Source, workflow and release are public, and the
   artifact can be rebuilt from the tagged commit:
     https://github.com/Tennosei5804/Pokepension
     .github/workflows/publier.yml
     https://github.com/Tennosei5804/Pokepension/releases/tag/v0.42.2

2. The application contacts exactly one endpoint, https://api.pokepension.fr,
   which is our own service, over HTTPS, and only to synchronise the user's own
   collection after an explicit Discord OAuth sign-in. It does not collect or
   transmit anything else.

3. It writes only under %LOCALAPPDATA% and the uninstall entry created by NSIS.
   It installs no service and no driver, modifies no system or security
   setting, and adds no persistence outside the standard install location.

4. It ships the standard Tauri updater plugin. Updates are downloaded from
   https://api.pokepension.fr and verified against a minisign public key
   embedded at compile time before being applied. We suspect this
   download-and-execute behaviour, combined with NSIS packaging and the absence
   of an Authenticode signature, is what the detection keys on.

5. The installer is currently unsigned. We know this is the root cause of the
   reputation problem and are looking into a code-signing certificate. In the
   meantime we are asking for a review of this specific build.

Please review and, if you agree, remove the detection for this file.
```

Compter quelques jours. La réponse arrive par courriel, et la correction descend
ensuite par les mises à jour de signatures — chez tout le monde, pas seulement
sur ta machine.

---

## 2. Google — sans quoi Chrome, Firefox et Opera continueront

**La soumission Microsoft ne touche pas à ces trois-là.** Chrome, Firefox et
Opera s'appuient tous sur **Google Safe Browsing** : Firefox en achète le
service à Google, Opera est bâti sur Chromium. Un seul verdict, trois fenêtres.

Avant d'écrire, il faut savoir **lequel des deux messages** s'affiche, parce
qu'ils n'appellent pas la même réponse :

| Message | Ce que c'est | Recours |
|---|---|---|
| « n'est pas fréquemment téléchargé », « peut être dangereux » | absence de réputation | **aucun**. Ni appel ni formulaire : seuls le volume et une signature Authenticode le lèvent. |
| « contient un virus », « fichier malveillant bloqué » | verdict de malveillance | **oui** : formulaire ci-dessous. |

Formulaire de contestation :
**https://safebrowsing.google.com/safebrowsing/report_error/**

Y donner l'URL exacte,
`https://pokepension.fr/telechargements/PokePension-Windows-x64.exe`,
et le même argumentaire qu'au 1.c.

Au 7 septembre 2026, la page publique d'état de Safe Browsing ne rapporte rien
sur `pokepension.fr` — le **domaine** ne semble donc pas listé, ce qui oriente
vers un verdict portant sur le **fichier** et non sur le site. À revérifier :
https://transparencyreport.google.com/safe-browsing/search

---

## Ce que ça ne règle pas

**L'écran SmartScreen « Éditeur inconnu ».** Il ne dépend d'aucune de ces deux
démarches : c'est de la réputation d'éditeur, indexée sur la signature
Authenticode. Sans certificat, elle s'accumule sur l'empreinte du fichier et
retombe à zéro à chaque version. Aucun formulaire ne le lève.

Un certificat de signature de code est la seule sortie durable :

| | Effet |
|---|---|
| **OV** | la réputation s'accumule sur le **certificat** et survit aux versions ; il faut quelques semaines de chauffe |
| **EV** | jeton matériel, confiance SmartScreen quasi immédiate |

---

## Le CI est déjà câblé pour signer

`publier.yml` sait signer depuis le 7 septembre 2026. Il ne le fait pas, faute
de certificat, et **ne casse rien en attendant** : sans configuration il compile
comme avant et laisse un avertissement dans le journal.

Le jour où le certificat existe, il n'y a **rien à recompiler ni à modifier** —
une variable de dépôt suffit.

### La contrainte qui décide de tout

Depuis juin 2023, les autorités de certification exigent que la clé privée d'un
certificat de signature de code vive sur du **matériel** (jeton ou HSM). On ne
peut donc **pas** déposer un `.pfx` dans un secret GitHub pour un certificat
neuf : il faut un service de signature **dans le nuage**, que le CI appelle.

| Voie | Remarque |
|---|---|
| **Azure Trusted Signing** | le moins cher, et c'est Microsoft qui le rend — donc le meilleur effet sur SmartScreen. Demande un abonnement Azure et une validation d'identité. |
| DigiCert KeyLocker, SSL.com eSigner, Certum | même principe, outillage propre à chaque fournisseur |
| un `.pfx` déjà en main | ne marche que pour un certificat antérieur à 2023 — et un tel certificat ne rassurera plus SmartScreen |

### Ce qu'il faudra poser

Settings → Secrets and variables → Actions.

| | Où | Quoi |
|---|---|---|
| `WINDOWS_SIGN_COMMAND` | **Variables** | la commande de signature. `%1` est remplacé par le chemin du fichier. **Sa seule présence active la signature.** |
| `WINDOWS_SIGN_INSTALL` | **Variables**, facultatif | commande lancée avant la compilation pour installer l'outil |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | **Secrets** | lues par l'outil dans son environnement |

Pour un autre fournisseur, ajouter ses variables dans le bloc `env:` de l'étape
« Compiler, signer et publier » — un processus fils hérite de l'environnement,
l'outil les y trouvera.

> **La commande exacte dépend du fournisseur.** Prendre celle de sa
> documentation, et vérifier qu'elle se termine par `%1`. C'est Tauri qui y
> substitue le chemin du fichier à signer.

### Le garde-fou

Une signature qui échoue **ne fait pas échouer la compilation** : le bundler
signe après avoir bâti l'installeur, et selon l'outil un jeton expiré ressort en
simple avertissement. On publierait un binaire non signé en croyant l'avoir
signé — exactement le vert trompeur que ce workflow combat déjà pour les
fichiers de la release.

L'étape « Vérifier que l'installeur porte bien une signature » regarde donc le
**fichier**, pas le journal de l'outil, et **refuse de publier** si la signature
était demandée et qu'elle n'est pas valide.

### Ce qui n'est pas la signature du code

`TAURI_SIGNING_PRIVATE_KEY`, déjà dans les secrets, est une clé **minisign** :
elle permet à l'application de vérifier que la mise à jour qu'elle télécharge
vient bien de nous. Windows et Chrome ne la voient jamais et ne sauraient pas
quoi en faire. C'est une signature interne, pas une identité d'éditeur — la
confusion est facile, et elle coûte du temps à qui la fait. Les deux cohabitent
dans le même workflow, et c'est écrit en tête de l'étape.
