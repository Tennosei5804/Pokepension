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
      Write-Output ("  Action              : " + $_.CleaningActionID + "   Etat : " + $_.ThreatStatusID)
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
  (Join-Path $env:USERPROFILE 'Downloads\PokePension_0.42.2_x64-setup.exe'),
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
  Write-Output '    SHA-256  b5d62f79cdbe26ea9de8c98dd7a8948f0b08f38479630dc43ff765a728f0f6d1'
  Write-Output '    9 377 773 octets  —  https://pokepension.fr/telecharger'
  Write-Output ''
}

Write-Output '============================================================='
Write-Output 'Recopie ce releve dans le formulaire. Le texte anglais a coller'
Write-Output 'est dans LISEZMOI.md, a cote de ce script.'
Write-Output ''
