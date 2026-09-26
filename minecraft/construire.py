#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Construit PokéPension Bridge, le mod Minecraft, et le range dans l'application.

    py minecraft/construire.py              compile, teste, empaquette, copie
    py minecraft/construire.py --verifier   et revérifie chaque nom de Minecraft
                                            et de Forge contre leurs sources

Le .jar produit est copié dans app/src-tauri/minecraft/ : l'application
l'embarque, et le pose dans l'instance PixelmonWorld de Prism Launcher quand le
joueur clique « Installer dans Minecraft » dans ses Paramètres (voir
app/src-tauri/src/minecraft_installation.rs). Il n'y a rien à copier à la main.

POURQUOI PAS FORGEGRADLE. La chaîne habituelle (ForgeGradle 5) télécharge
Minecraft et ses correspondances de noms depuis les serveurs de Mojang et de
Forge, puis décompile et recompile le jeu : plusieurs minutes et un gigaoctet
pour un mod qui n'appelle que trois API. Ce script compile contre :

  · Brigadier 1.0.17 — le vrai, compilé depuis ses sources publiques
    (github.com/Mojang/brigadier, étiquette 1.0.17, celle de Minecraft 1.16.5) ;
  · Gson 2.8.0, log4j-api, commons-lang3 3.5 — ceux que Minecraft 1.16.5
    embarque, depuis Maven Central, empreinte SHA-1 vérifiée ;
  · compilation/src — la forme exacte des quelques classes de Forge 36.2.42
    que le mod référence, recopiée de ses sources. Jamais incluse dans le .jar.

Minecraft lui-même n'est jamais référencé directement : le mod l'appelle par
réflexion, sous ses noms d'exécution (client/Jeu.java). `--verifier` recoupe
chacun de ces noms avec MCPConfig 1.16.5 et la table intermediary de Fabric.

Java 8 obligatoire à l'arrivée : on compile avec `--release 8`, et le script
vérifie la version de chaque .class produit (52).
"""

import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

VERSION = "1.0.0"

ICI = Path(__file__).resolve().parent
RACINE = ICI.parent
CACHE = ICI / ".cache"
SORTIE = ICI / "build"
DESTINATION = RACINE / "app" / "src-tauri" / "minecraft"

MAVEN = "https://repo.maven.apache.org/maven2/"
DEPENDANCES = {
    # Ceux de Minecraft 1.16.5 / Forge 36.2.42 (version.json, build.gradle de Forge).
    "gson": "com/google/code/gson/gson/2.8.0/gson-2.8.0.jar",
    "log4j-api": "org/apache/logging/log4j/log4j-api/2.15.0/log4j-api-2.15.0.jar",
    "commons-lang3": "org/apache/commons/commons-lang3/3.5/commons-lang3-3.5.jar",
}
ESSAIS = "org/junit/platform/junit-platform-console-standalone/1.10.2/junit-platform-console-standalone-1.10.2.jar"

BRIGADIER_DEPOT = "https://github.com/Mojang/brigadier"
BRIGADIER_ETIQUETTE = "1.0.17"
BRIGADIER_COMMIT = "559d8f39727e98d374b0726ad88aed9832beee4e"

# Des horodatages fixes : le même code donne le même .jar, octet pour octet.
DATE_ZIP = (2026, 1, 1, 0, 0, 0)

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def dire(msg):
    print(msg, flush=True)


def lancer(cmd, **kw):
    r = subprocess.run(cmd, **kw)
    if r.returncode != 0:
        raise SystemExit("échec : " + " ".join(str(c) for c in cmd[:6]) + " …")
    return r


def telecharger(chemin_maven):
    cible = CACHE / "maven" / chemin_maven.split("/")[-1]
    if cible.exists():
        return cible
    cible.parent.mkdir(parents=True, exist_ok=True)
    dire("  téléchargement " + chemin_maven.split("/")[-1])
    octets = urllib.request.urlopen(MAVEN + chemin_maven, timeout=120).read()
    attendu = urllib.request.urlopen(MAVEN + chemin_maven + ".sha1", timeout=60).read().decode().split()[0]
    if hashlib.sha1(octets).hexdigest() != attendu:
        raise SystemExit("empreinte SHA-1 fausse pour " + chemin_maven)
    cible.write_bytes(octets)
    return cible


def javac(sources, classes, chemin=(), extra=(), release="8"):
    fichiers = [str(p) for d in sources for p in sorted(Path(d).rglob("*.java"))]
    if classes.exists():
        shutil.rmtree(classes)
    classes.mkdir(parents=True)
    cp = os.pathsep.join(str(c) for c in chemin)
    cmd = ["javac", "-encoding", "UTF-8", "-d", str(classes)] + (["--release", release] if release else [])
    if cp:
        cmd += ["-cp", cp]
    lancer(cmd + list(extra) + fichiers)


def brigadier():
    classes = CACHE / "brigadier-classes"
    if (classes / "com" / "mojang" / "brigadier" / "CommandDispatcher.class").exists():
        return classes
    src = CACHE / "brigadier-src"
    if src.exists():
        shutil.rmtree(src)
    dire("  Brigadier " + BRIGADIER_ETIQUETTE + " depuis ses sources")
    lancer(["git", "clone", "-q", "--depth", "1", "--branch", BRIGADIER_ETIQUETTE, BRIGADIER_DEPOT, str(src)],
           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    tete = subprocess.run(["git", "-C", str(src), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    if tete != BRIGADIER_COMMIT:
        raise SystemExit("Brigadier : commit inattendu " + tete)
    javac([src / "src" / "main" / "java"], classes, extra=["-nowarn", "-Xlint:-options"])
    return classes


def version_des_classes(classes):
    """Toutes les classes en Java 8 (version 52) : Minecraft 1.16.5 tourne sous Java 8."""
    versions = {}
    for f in classes.rglob("*.class"):
        tete = f.read_bytes()[:8]
        versions.setdefault(int.from_bytes(tete[6:8], "big"), []).append(f.name)
    if set(versions) != {52}:
        raise SystemExit("bytecode hors Java 8 : " + ", ".join("%d×%d" % (v, len(n)) for v, n in versions.items()))
    return sum(len(n) for n in versions.values())


def references(classes):
    """Chaque membre de Forge ou de Minecraft que le bytecode appelle ou lit."""
    fichiers = [str(f) for f in classes.rglob("*.class")]
    sortie = subprocess.run(["javap", "-v", "-p"] + fichiers, capture_output=True, text=True).stdout
    refs = set()
    for m in re.finditer(r"= (Methodref|InterfaceMethodref|Fieldref)\s+\S+\s+// (\S+)", sortie):
        genre, cible = m.groups()
        if cible.startswith(("net/minecraft/", "net/minecraftforge/")):
            refs.add((genre, cible))
    return sorted(refs)


def empaqueter(classes):
    SORTIE.mkdir(parents=True, exist_ok=True)
    jar = SORTIE / ("pokepensionbridge-%s.jar" % VERSION)
    manifeste = ("Manifest-Version: 1.0\r\n"
                 "Specification-Title: pokepensionbridge\r\n"
                 "Specification-Vendor: Tennosei_\r\n"
                 "Specification-Version: 1\r\n"
                 "Implementation-Title: PokéPension Bridge\r\n"
                 "Implementation-Version: %s\r\n"
                 "Implementation-Vendor: Tennosei_\r\n\r\n" % VERSION)
    entrees = [("META-INF/MANIFEST.MF", manifeste.encode("utf-8"))]
    ressources = ICI / "src" / "main" / "resources"
    for f in sorted(ressources.rglob("*")):
        if f.is_file():
            octets = f.read_bytes()
            if f.name == "mods.toml":
                octets = octets.replace(b"${version}", VERSION.encode())
            entrees.append((f.relative_to(ressources).as_posix(), octets))
    for f in sorted(classes.rglob("*.class")):
        entrees.append((f.relative_to(classes).as_posix(), f.read_bytes()))

    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w", zipfile.ZIP_DEFLATED) as z:
        dossiers = set()
        for nom, _ in entrees:
            parties = nom.split("/")[:-1]
            for i in range(1, len(parties) + 1):
                dossiers.add("/".join(parties[:i]) + "/")
        for d in sorted(dossiers):
            info = zipfile.ZipInfo(d, DATE_ZIP)
            info.external_attr = 0o40755 << 16
            z.writestr(info, b"")
        for nom, octets in entrees:
            info = zipfile.ZipInfo(nom, DATE_ZIP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, octets)
    jar.write_bytes(tampon.getvalue())
    return jar


def main():
    verifier = "--verifier" in sys.argv
    sans_copie = "--sans-copie" in sys.argv
    CACHE.mkdir(exist_ok=True)

    dire("Dépendances")
    deps = {nom: telecharger(chemin) for nom, chemin in DEPENDANCES.items()}
    brig = brigadier()

    dire("Compilation (Java 8)")
    stubs = SORTIE / "stubs"
    javac([ICI / "compilation" / "src"], stubs, [deps["commons-lang3"]], ["-nowarn", "-Xlint:-options"])
    classes = SORTIE / "classes"
    chemin = [stubs, brig, deps["gson"], deps["log4j-api"], deps["commons-lang3"]]
    javac([ICI / "src" / "main" / "java"], classes, chemin, ["-Xlint:all,-options", "-Werror"])
    n = version_des_classes(classes)
    dire("  %d classes, toutes en version 52 (Java 8)" % n)

    # Aucun stub dans le mod : ce sont les vraies classes de Forge qui répondront.
    for f in classes.rglob("*.class"):
        if not f.relative_to(classes).as_posix().startswith("fr/tennosei/pokepensionbridge/"):
            raise SystemExit("classe étrangère au mod : " + str(f))

    refs = references(classes)
    directes_mc = [c for g, c in refs if c.startswith("net/minecraft/")]
    if directes_mc:
        raise SystemExit("appel direct à Minecraft (doit passer par Jeu) : " + ", ".join(directes_mc))
    (SORTIE / "references-forge.txt").write_text("\n".join("%s %s" % r for r in refs) + "\n", encoding="utf-8")
    dire("  %d références à Forge, aucune à Minecraft en direct (build/references-forge.txt)" % len(refs))

    dire("Essais")
    junit = telecharger(ESSAIS)
    essais = SORTIE / "essais"
    # Les essais ne partent pas dans le mod : ils se compilent pour le Java qui les lance.
    javac([ICI / "src" / "test" / "java"], essais, [classes, brig, deps["gson"], deps["log4j-api"], junit],
          ["-nowarn"], release=None)
    shutil.copytree(ICI / "src" / "test" / "resources", essais, dirs_exist_ok=True)
    cp = os.pathsep.join(str(c) for c in [essais, classes, brig, deps["gson"], deps["log4j-api"]])
    lancer(["java", "-jar", str(junit), "execute", "--class-path", cp, "--scan-class-path",
            "--disable-banner", "--details=summary", "--fail-if-no-tests"])

    if verifier:
        dire("Vérification des noms contre les sources de Minecraft et de Forge")
        lancer([sys.executable, str(ICI / "outils" / "verifier-noms.py"), str(SORTIE / "references-forge.txt")])

    jar = empaqueter(classes)
    empreinte = hashlib.sha256(jar.read_bytes()).hexdigest()
    dire("Paquet  %s  (%d octets, sha256 %s…)" % (jar.relative_to(RACINE), jar.stat().st_size, empreinte[:16]))

    if not sans_copie:
        DESTINATION.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(jar, DESTINATION / "pokepensionbridge.jar")
        (DESTINATION / "version.txt").write_text(VERSION + "\n", encoding="utf-8")
        dire("Rangé dans %s — l'application l'embarquera à sa prochaine compilation."
             % DESTINATION.relative_to(RACINE))


if __name__ == "__main__":
    main()
