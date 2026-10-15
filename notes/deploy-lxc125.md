# Déploiement Moli OS — LXC 125 (`moli-lab`)

Relevé : 2026-10-15.

## Identité du container (PVE HOME `192.168.1.4`)
| Champ | Valeur |
|---|---|
| VMID | 125 |
| Hostname | `moli-lab` (ancien nom `odysseus` obsolète) |
| Statut | running |
| Type | LXC unprivileged, Ubuntu |
| CPU / RAM | 2 cores / 2048 Mo, swap 1024 |
| net0 | `name=eth0,bridge=vmbr0,gw=192.168.1.247,ip=192.168.1.125/24` |
| rootfs | `local-lvm:vm-125-disk-0`, 16 G |
| onboot | 0 |

## Accès
- Via PVE : `ssh -i ~/.ssh/id_ed25519_pve4 root@192.168.1.4` puis `pct exec 125 -- …`.
- Direct (désormais configuré) : `ssh moli-os` → `moli-lab`.
  - Clé publique `~/.ssh/id_ed25519_pve4.pub` ajoutée dans `/root/.ssh/authorized_keys` du CT.
  - Alias dans `~/.ssh/config`.
- Instance web : `http://192.168.1.125:8790`.

## Code source
- Chemin : `/opt/moli-os`
- Branche : `main`
- Remote : `https://github.com/rudy-io/moli-os`

## Container applicatif
- Image : `moli-os:latest`
- Commande : `/moli-os serve`
- Réseau : host

## Configuration (`/opt/moli-os/data/`)
- `moli.toml` : install fraîche, **aucun `[[driver]]`** configuré (seul le driver
  `personnes` par défaut tourne).
- `settings.json` : `{"language": "fr"}`.
- `master.key` (0600) et `secrets.enc` : **jamais lus ni copiés**.
- Données : `history.db`, `journal.jsonl`, `automations.json`, `plan/`, `recordings/`.

## Santé (avant montée de version, 2026-10-15)
```
GET http://192.168.1.125:8790/api/health
{"drivers":[{"instance":"personnes","integration":"people","kind":"people",
"status":{"state":"running"}}],"guard":{"dashboard":"trusted",
"protect_unassigned":false,"protected_rooms":[]},"journal_failures":0,
"name":"moli-os","stats":{"devices":1,"drivers":1,"drivers_running":1,
"points":3,"rss_bytes":11726848,"uptime_ms":864259},"version":"0.1.0"}
```
