#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Revérifie chaque nom de Minecraft et de Forge dont dépend le mod.

    py minecraft/construire.py --verifier     (qui l'appelle)

Le mod ne peut pas être essayé dans Minecraft par le script de construction :
ce qui remplace l'essai, c'est de vérifier qu'il n'appelle que des choses qui
existent, sous leur nom et leur forme exacts à l'exécution.

MINECRAFT — client/Jeu.java appelle Minecraft par réflexion, sous ses noms
« SRG ». Chacun est recoupé ici de trois sources publiques indépendantes :

  · MCPConfig 1.16.5 (révision 0cdc605, celle que Forge 36 utilise) :
    le nom SRG et la classe d'exécution ;
  · intermediary 1.16.5 (Fabric) : le même membre, avec son descripteur ;
  · yarn 1.16.5 (Fabric) : son nom lisible — pour qu'on sache que
    func_71410_x est bien getInstance, et pas un autre membre de Minecraft.

FORGE — chaque membre que le bytecode référence (build/references-forge.txt)
doit être déclaré dans les sources de Forge 36.2.42 (commit 54233da14, que
`git describe` numérote 36.2-42), d'EventBus 4.0 ou de ForgeSPI 3.2.
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

ICI = Path(__file__).resolve().parent.parent
CACHE = ICI / ".cache" / "verification"
JEU = ICI / "src" / "main" / "java" / "fr" / "tennosei" / "pokepensionbridge" / "client" / "Jeu.java"

RAW = "https://raw.githubusercontent.com/"
MCPCONFIG = RAW + "MinecraftForge/MCPConfig/0cdc6055297f0b30cf3e27e59317f229a30863a6/versions/release/1.16.5/joined.tsrg"
INTERMEDIARY = RAW + "FabricMC/intermediary/master/mappings/1.16.5.tiny"
YARN = RAW + "FabricMC/yarn/1.16.5/mappings/"
FORGE = RAW + "MinecraftForge/MinecraftForge/54233da14c9ae556d596c3df41a97f367b8d6e5d/"
EVENTBUS = RAW + "MinecraftForge/EventBus/4.0/src/main/java/"
FORGESPI = RAW + "MinecraftForge/ForgeSPI/3.2/src/main/java/"

# Ce que Jeu.java appelle : (classe d'exécution, nom SRG, nom yarn, descripteur).
# Le descripteur est celui des classes d'exécution ; pour un champ, son type.
ATTENDUS = [
    ("net/minecraft/client/Minecraft", "func_71410_x", "getInstance", "()Lnet/minecraft/client/Minecraft;"),
    ("net/minecraft/client/Minecraft", "func_147114_u", "getNetworkHandler",
     "()Lnet/minecraft/client/network/play/ClientPlayNetHandler;"),
    ("net/minecraft/client/Minecraft", "field_71456_v", "inGameHud", "Lnet/minecraft/client/gui/IngameGui;"),
    ("net/minecraft/client/Minecraft", "field_71462_r", "currentScreen", "Lnet/minecraft/client/gui/screen/Screen;"),
    ("net/minecraft/client/network/play/ClientPlayNetHandler", "func_195515_i", "getCommandDispatcher",
     "()Lcom/mojang/brigadier/CommandDispatcher;"),
    ("net/minecraft/client/gui/IngameGui", "func_146158_b", "getChatHud", "()Lnet/minecraft/client/gui/NewChatGui;"),
    ("net/minecraft/client/gui/IngameGui", "func_175188_a", "setOverlayMessage",
     "(Lnet/minecraft/util/text/ITextComponent;Z)V"),
    ("net/minecraft/client/gui/NewChatGui", "func_146227_a", "addMessage", "(Lnet/minecraft/util/text/ITextComponent;)V"),
    ("net/minecraft/client/gui/NewChatGui", "func_146239_a", "addToMessageHistory", "(Ljava/lang/String;)V"),
    ("net/minecraft/client/gui/screen/ChatScreen", "field_146415_a", "chatField",
     "Lnet/minecraft/client/gui/widget/TextFieldWidget;"),
    ("net/minecraft/client/gui/screen/ChatScreen", "field_228174_e_", "commandSuggestor",
     "Lnet/minecraft/client/gui/CommandSuggestionHelper;"),
    ("net/minecraft/client/gui/widget/TextFieldWidget", "func_146179_b", "getText", "()Ljava/lang/String;"),
    ("net/minecraft/client/gui/CommandSuggestionHelper", "func_228111_a_", "refresh", "()V"),
    ("net/minecraft/util/text/ITextComponent$Serializer", "func_240643_a_", "fromJson",
     "(Ljava/lang/String;)Lnet/minecraft/util/text/IFormattableTextComponent;"),
]
# Les classes que Jeu.java nomme sans en appeler de membre.
CLASSES_SEULES = ["net/minecraft/client/gui/screen/ReadBookScreen", "net/minecraft/util/text/ITextComponent"]

YARN_CLASSES = {
    "net/minecraft/client/Minecraft": "net/minecraft/client/MinecraftClient",
    "net/minecraft/client/network/play/ClientPlayNetHandler": "net/minecraft/client/network/ClientPlayNetworkHandler",
    "net/minecraft/client/gui/IngameGui": "net/minecraft/client/gui/hud/InGameHud",
    "net/minecraft/client/gui/NewChatGui": "net/minecraft/client/gui/hud/ChatHud",
    "net/minecraft/client/gui/screen/ChatScreen": "net/minecraft/client/gui/screen/ChatScreen",
    "net/minecraft/client/gui/widget/TextFieldWidget": "net/minecraft/client/gui/widget/TextFieldWidget",
    "net/minecraft/client/gui/CommandSuggestionHelper": "net/minecraft/client/gui/screen/CommandSuggestor",
    "net/minecraft/util/text/ITextComponent$Serializer": "net/minecraft/text/Text",
}

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def charger(url, nom):
    f = CACHE / nom
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(urllib.request.urlopen(url, timeout=120).read())
    return f.read_text(encoding="utf-8")


def tsrg():
    classes, champs, methodes = {}, {}, {}
    courant = None
    for ligne in charger(MCPCONFIG, "joined-1.16.5.tsrg").splitlines():
        if not ligne.strip():
            continue
        if not ligne.startswith("\t"):
            obf, mcp = ligne.split(" ")
            classes[obf] = mcp
            courant = obf
            continue
        p = ligne.strip().split(" ")
        if len(p) == 2:
            champs[(courant, p[0])] = p[1]
        else:
            methodes[(courant, p[0], p[1])] = p[2]
    return classes, champs, methodes


def intermediary():
    classes, champs, methodes = {}, {}, {}
    for ligne in charger(INTERMEDIARY, "intermediary-1.16.5.tiny").splitlines():
        p = ligne.split("\t")
        if p[0] == "CLASS":
            classes[p[1]] = p[2]
        elif p[0] == "FIELD":
            champs[(p[1], p[3])] = (p[2], p[4])
        elif p[0] == "METHOD":
            methodes[(p[1], p[3], p[2])] = p[4]
    return classes, champs, methodes


def yarn(classe):
    """intermediary -> nom lisible, pour une classe et ses classes internes."""
    texte = charger(YARN + classe + ".mapping", "yarn/" + classe.replace("/", "_") + ".mapping")
    noms, pile = {}, []
    for ligne in texte.splitlines():
        prof = len(ligne) - len(ligne.lstrip("\t"))
        p = ligne.strip().split(" ")
        if p[0] == "CLASS":
            pile = pile[:prof]
            inter = p[1] if prof == 0 else pile[-1][0] + "$" + p[1]
            nom = p[2] if len(p) > 2 else p[1]
            nom = nom if prof == 0 else pile[-1][1] + "$" + nom
            pile.append((inter, nom))
            noms[inter] = nom
        elif p[0] in ("FIELD", "METHOD") and pile and len(p) >= 3 and not p[2].startswith("("):
            noms[(pile[-1][0], p[1])] = p[2]
    return noms


def traduire(desc, table):
    return re.sub(r"L([^;]+);", lambda m: "L" + table.get(m.group(1), m.group(1)) + ";", desc)


def verifier_minecraft():
    classes, champs, methodes = tsrg()
    iclasses, ichamps, imethodes = intermediary()
    obf_de = {v: k for k, v in classes.items()}
    erreurs = []

    source = JEU.read_text(encoding="utf-8")
    dans_jeu = set(re.findall(r'"((?:func|field)_\d+_\w*)"', source))
    attendus = {srg for _, srg, _, _ in ATTENDUS}
    if dans_jeu != attendus:
        erreurs.append("Jeu.java et la liste attendue divergent : %s" % sorted(dans_jeu ^ attendus))
    for c in [a[0] for a in ATTENDUS] + CLASSES_SEULES:
        if '"' + c.replace("/", ".") + '"' not in source:
            erreurs.append("classe absente de Jeu.java : " + c)
        if c not in obf_de:
            erreurs.append("classe inconnue de MCPConfig 1.16.5 : " + c)

    noms_yarn = {}
    for c in set(YARN_CLASSES.values()):
        noms_yarn.update(yarn(c))

    for classe, srg, lisible, desc in ATTENDUS:
        obf = obf_de.get(classe)
        trouve = None
        if srg.startswith("field_"):
            for (o, nobf), s in champs.items():
                if o == obf and s == srg:
                    idesc, inter = ichamps.get((o, nobf), (None, None))
                    trouve = (inter, traduire(idesc, classes) if idesc else None)
        else:
            for (o, nobf, dobf), s in methodes.items():
                if o == obf and s == srg:
                    trouve = (imethodes.get((o, nobf, dobf)), traduire(dobf, classes))
        if not trouve:
            erreurs.append("%s.%s : absent de MCPConfig" % (classe, srg))
            continue
        inter, vrai_desc = trouve
        if vrai_desc != desc:
            erreurs.append("%s.%s : descripteur %s, attendu %s" % (classe, srg, vrai_desc, desc))
        classe_inter = iclasses.get(obf, "")
        nom = noms_yarn.get((classe_inter, inter))
        if nom != lisible:
            erreurs.append("%s.%s : c'est « %s » selon yarn, pas « %s »" % (classe, srg, nom, lisible))
        else:
            print("  ✓ %-52s %-16s = %s%s" % (classe.split("/")[-1], srg, lisible,
                                               "" if srg.startswith("field_") else desc[:desc.index(")") + 1]))
    return erreurs


def source_forge(classe):
    """Le fichier source d'une classe de Forge, d'EventBus ou de ForgeSPI."""
    racine = classe.split("$")[0]
    if racine.startswith("net/minecraftforge/eventbus/"):
        urls = [EVENTBUS + racine + ".java"]
    elif racine.startswith("net/minecraftforge/api/distmarker/"):
        urls = [FORGESPI + racine + ".java"]
    else:
        urls = [FORGE + "src/main/java/" + racine + ".java", FORGE + "src/fmllauncher/java/" + racine + ".java"]
    for url in urls:
        try:
            return charger(url, "forge/" + racine.replace("/", "_") + ".java")
        except Exception:
            continue
    return None


def verifier_forge(fichier_refs):
    erreurs = []
    for ligne in Path(fichier_refs).read_text(encoding="utf-8").splitlines():
        if not ligne.strip():
            continue
        genre, cible = ligne.split(" ", 1)
        proprietaire, reste = cible.split(".", 1)
        nom = reste.split(":")[0]
        # Un membre hérité (setCanceled sur ClientChatEvent) se cherche en remontant.
        classe, vu = proprietaire, None
        for _ in range(4):
            src = source_forge(classe)
            if src is None:
                break
            motif = (r"\b%s\s*\(" % re.escape(nom)) if genre != "Fieldref" else (r"\b%s\b\s*[;=,]|\b%s\b\s*[,}]|^\s*%s\s*[,;(]" % (nom, nom, nom))
            if re.search(motif, src, re.M):
                vu = classe
                break
            parent = re.search(r"class\s+%s\b[^{]*?\bextends\s+([\w.]+)" % re.escape(classe.split("/")[-1].split("$")[-1]), src)
            if not parent:
                break
            simple = parent.group(1).split(".")[-1]
            imp = re.search(r"import\s+([\w.]+\.%s)\s*;" % simple, src)
            classe = imp.group(1).replace(".", "/") if imp else classe.rsplit("/", 1)[0] + "/" + simple
        if vu:
            print("  ✓ %-60s %s" % (proprietaire.split("/")[-1] + "." + nom, "" if vu == proprietaire else "(dans " + vu.split("/")[-1] + ")"))
        else:
            erreurs.append("Forge : %s introuvable dans les sources de 36.2.42" % cible)
    return erreurs


def main():
    print("Minecraft 1.16.5 — MCPConfig × intermediary × yarn")
    erreurs = verifier_minecraft()
    if len(sys.argv) > 1:
        print("Forge 36.2.42 — sources, commit 54233da14")
        erreurs += verifier_forge(sys.argv[1])
    if erreurs:
        for e in erreurs:
            print("  ✗ " + e)
        raise SystemExit(1)
    print("Tous les noms existent, sous la forme attendue.")


if __name__ == "__main__":
    main()
