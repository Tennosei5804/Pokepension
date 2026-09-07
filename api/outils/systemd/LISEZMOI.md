# La sauvegarde quotidienne, sur le VPS

Deux fichiers, à copier dans `/etc/systemd/system/` :

```
scp api/outils/systemd/pp-sauvegarde.* root@<vps>:/etc/systemd/system/
ssh root@<vps> "systemctl daemon-reload && systemctl enable --now pp-sauvegarde.timer"
```

**Un minuteur systemd et non cron**, parce que la machine n'a pas cron —
ni le paquet, ni la commande. Un minuteur ne demande rien à installer,
se relit par `systemctl list-timers`, et laisse ses traces dans
`journalctl -u pp-sauvegarde.service`. Documenter cron ici aurait envoyé
quelqu'un taper une commande qui n'existe pas.

`Persistent=true` rattrape au démarrage suivant si la machine dormait à
l'heure dite. Sans lui, un VPS éteint une nuit perd sa sauvegarde sans le
dire — et une sauvegarde qui manque en silence ne vaut pas mieux que pas
de sauvegarde.

La commande tourne **dans le conteneur**, qui porte déjà l'adresse de la
base et son mot de passe. Les redire dans l'unité les mettrait dans la
liste des processus, visible de quiconque est sur la machine.

## Vérifier

```
systemctl list-timers pp-sauvegarde.timer
systemctl start pp-sauvegarde.service      # sans attendre l'heure
journalctl -u pp-sauvegarde.service -n 20
docker exec deploiement-pokepension-api-1 ls -lh /api/sauvegardes/
```

## Ce que ça ne protège pas

Les fichiers restent **sur la même machine**, dans le volume
`deploiement_pa_sauvegardes`. C'est une protection contre une commande SQL
de trop ou une base corrompue — pas contre la perte du VPS. Pour ça, il
faut les sortir de la machine :

```
docker cp deploiement-pokepension-api-1:/api/sauvegardes ./sauvegardes-vps
```
