# Releve pour le dossier de faux positif Microsoft.
#
#     powershell -ExecutionPolicy Bypass -File app\outils\faux-positif\releve.ps1
#
# CE QUE FAIT CE SCRIPT. Il ramasse les trois choses que le formulaire de
# Microsoft demande et que personne ne connait par coeur : le NOM EXACT de la
# detection, les versions du moteur au moment ou elle est tombee, et l'empreinte
# du fichier incrimine. Il n'envoie rien et ne modifie rien : il affiche.
#
# POURQUOI UN SCRIPT ET PAS UNE LISTE D'ETAPES. Le nom de la detection est le
# champ qui decide de tout, et c'est celui qu'on recopie de travers. Un
# « Trojan:Win32/Wacatac.B!ml » mal retranscrit, et l'analyste cherche autre
# chose que ce qu'on lui signale.

$ErrorActionPreference = 'Continue'

Write-Output ''
Write-Output '=== 1. Ce que Defender a detecte ============================='
Write-Output ''

# Get-MpThreatDetection rend les detections (le fichier, l'heure) et Get-MpThreat
# les menaces connues (le nom). On croise les deux par ThreatID.
$menaces = @{}
try { Get-MpThreat -ErrorAction Stop | ForEach-Object { $menaces[$_.ThreatID] = $_.ThreatName } } catch {}

# LES NOMBRES BRUTS NE DISENT RIEN, et l'un d'eux change la marche a suivre :
# « supprime » et « en quarantaine » ne se recuperent pas de la meme facon. On
# affiche donc le nombre ET sa lecture — si la table se trompait un jour, le
# nombre resterait juste.
$ACTIONS = @{ 0='inconnue'; 1='nettoye'; 2='mis en quarantaine'; 3='supprime';
              4='autorise'; 5='defini par l utilisateur'; 6='aucune action'; 7='bloque' }
$ETATS   = @{ 0='inconnu'; 1='detecte'; 2='nettoye'; 3='EN QUARANTAINE'; 4='SUPPRIME';
              5='autorise'; 6='bloque'; 102='nettoye, redemarrage requis';
              103='mise en quarantaine echouee'; 104='suppression echouee' }
function Lire($table, $id) {
  $mot = $table[[int]$id]
  if ($mot) { return "$id ($mot)" }
  return "$id"
}

$vues = 0
try {
  Get-MpThreatDetection -ErrorAction Stop | Sort-Object InitialDetectionTime -Descending | ForEach-Object {
    $ressources = ($_.Resources -join ' ; ')
    # On ne garde que ce qui parle de PokePension : le reste ne regarde personne.
    if ($ressources -match 'Poke|pokepension') {
      $vues = $vues + 1
      $nom = $menaces[$_.ThreatID]
      if (-not $nom) { $nom = '(introuvable — voir Historique de protection)' }
      Write-Output ("  Nom de la detection : " + $nom)
      Write-Output ("  Fichier             : " + $ressources)
      Write-Output ("  Detecte le          : " + $_.InitialDetectionTime)
      Write-Output ("  Action demandee     : " + (Lire $ACTIONS $_.CleaningActionID))
      Write-Output ("  Etat du fichier     : " + (Lire $ETATS $_.ThreatStatusID))
      Write-Output ''
    }
  }
} catch {
  Write-Output '  Impossible de lire l''historique (droits administrateur requis ?).'
  Write-Output '  Ouvre alors Securite Windows > Protection contre les virus et'
  Write-Output '  menaces > Historique de protection, et recopie le nom a la main.'
  Write-Output ''
}
if ($vues -eq 0) {
  Write-Output '  Aucune detection PokePension dans l''historique de CETTE machine.'
  Write-Output '  Si le blocage vient d''un autre poste, lance ce script la-bas :'
  Write-Output '  le nom de la detection appartient a la machine qui l''a vue.'
  Write-Output ''
}

Write-Output '=== 2. Versions du moteur (demandees par le formulaire) ======'
Write-Output ''
try {
  $s = Get-MpComputerStatus -ErrorAction Stop
  Write-Output ("  Version du produit     : " + $s.AMProductVersion)
  Write-Output ("  Version du moteur      : " + $s.AMEngineVersion)
  Write-Output ("  Signatures antivirus   : " + $s.AntivirusSignatureVersion)
  Write-Output ("  Signatures antimalware : " + $s.AntispywareSignatureVersion)
  Write-Output ("  Derniere mise a jour   : " + $s.AntivirusSignatureLastUpdated)
} catch {
  Write-Output '  Get-MpComputerStatus indisponible.'
}
Write-Output ''

Write-Output '=== 3. Empreinte du fichier =================================='
Write-Output ''
# On cherche l'installateur la ou il atterrit d'habitude, sans obliger a le dire.
$pistes = @(
  (Join-Path $env:USERPROFILE 'Downloads\PokePension-Windows-x64.exe'),
  (Join-Path $env:USERPROFILE 'Downloads\PokePension_0.43.0_x64-setup.exe'),
  (Join-Path $PSScriptRoot '..\..\..\site\telechargements\PokePension-Windows-x64.exe')
)
$trouve = $false
foreach ($p in $pistes) {
  if (Test-Path $p) {
    $f = Get-Item $p
    $h = Get-FileHash $p -Algorithm SHA256
    $sig = Get-AuthenticodeSignature $p
    Write-Output ("  Fichier   : " + $f.FullName)
    Write-Output ("  Taille    : " + $f.Length + " octets")
    Write-Output ("  SHA-256   : " + $h.Hash.ToLower())
    Write-Output ("  Signature : " + $sig.Status)
    Write-Output ''
    $trouve = $true
    break
  }
}
if (-not $trouve) {
  Write-Output '  Installateur introuvable en local. Celui qui est en ligne fait :'
  Write-Output '    SHA-256  a8fa01e531df9372693d3c9bab814af68f1d4b9cc54f1d02510aef38640216db'
  Write-Output '    9 412 186 octets  —  https://pokepension.fr/telecharger'
  Write-Output ''
}

Write-Output '============================================================='
Write-Output 'Recopie ce releve dans le formulaire. Le texte anglais a coller'
Write-Output 'est dans LISEZMOI.md, a cote de ce script.'
Write-Output ''
