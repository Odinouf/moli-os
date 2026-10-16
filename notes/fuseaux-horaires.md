# Fuseaux horaires → LXC 125 / conteneur Moli

**Date :** 2026-10-16 · **Portée :** correction du fuseau du LXC 125 `moli-lab` et du conteneur Moli.
**Statut :** fait et vérifié (T1–T5). Voir aussi `notes/dehors.md` (page Dehors, D1–D10).

## Contexte

- **Moli** : LXC **125 `moli-lab`** (SSH `moli-os`, web `http://192.168.1.125:8790`, code
  `/opt/moli-os`, conteneur `moli-os:latest`). Détail du container : `notes/deploy-lxc125.md`.
- **Symptôme de départ** : le LXC était en `Etc/UTC` alors que PVE et HA sont en Europe/Paris
  → horodatages locaux décalés de 2 h (l'epoch absolu, lui, était correct).

## T1 — Fuseau du LXC

```sh
ssh moli-os 'timedatectl set-timezone Europe/Paris'
```

Preuve : `date` → `Fri Oct 16 10:16:50 CEST 2026`, `/etc/localtime → /usr/share/zoneinfo/Europe/Paris`,
`timedatectl` → `Europe/Paris (CEST, +0200)`.

**Danger évité.** `timedatectl set-timezone` ne change **que** le fuseau, pas l'epoch : l'historique
reste cohérent. Il ne faut **jamais** utiliser `timedatectl set-time` (ferait sauter l'epoch de
±7200 s et corromprait `history.db` / `energy.db`).

## T2 — `TZ` dans le conteneur

`moli.env` (0600 root, passé par `env_file` dans `compose.override.yaml`) :

```
TZ=Europe/Paris
```

Puis `docker compose up -d`. Preuve : `docker inspect moli-os` contient `TZ=Europe/Paris`.
Le secret `MOLI_Z2M_PASSWORD` n'a jamais été affiché (fichier seule source, jamais d'argv ni stdout).

## T3 — Fin du décalage

- LXC : `CEST +0200` ; HA : `2026-10-16T10:17:12+02:00` → même heure locale.
- Logs conteneur : horodatés en `…Z` (UTC). **Ce n'est pas un bug** : c'est le formateur par
  défaut de `tracing_subscriber` (`crates/moli-os/src/main.rs`, `tracing_subscriber::fmt()` sans
  `with_timer`) qui rend toujours l'instant en UTC. L'instant affiché **est correct**, seule la
  représentation est en UTC. `TZ` n'affecte donc pas ces logs — attendu.

## T4 — Aucune corruption du temps absolu

Epoch relevé avant correction : `1792138608`. Après : les `ts` de `state.json` (en **millisecondes**)
valent ~`1792138618…` = instant courant, aucun saut de ±7200 s. `journal.jsonl` idem.
`history.db` / `energy.db` non rejoués. Preuve : dump des `ts` par point = tous ≈ `now`.

## T5 — Cohérence des fuseaux Moli

- `[energy] timezone = "Europe/Paris"` (déjà présent).
- `[automations] timezone = "Europe/Paris"` (ajouté avec la page Dehors, cf. `notes/dehors.md` D1).
- Assistant : défaut `Europe/Paris` (non surchargé).

Tous alignés.

## Rollback

```sh
ssh moli-os 'timedatectl set-timezone Etc/UTC'
# puis retirer la ligne TZ=… de /opt/moli-os/moli.env et recréer le conteneur :
ssh moli-os 'cd /opt/moli-os && docker compose up -d'
```
