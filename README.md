# Projet OpenFox — moli-os

## Identité
- **Nom** : `moli-os`
- **Workdir** : `/home/assist/moli-os`
- **Rôle** : piloter l'installation, les appareils et les montées de version de
  Moli OS depuis un ancrage dédié (distinct du repo `HA`).

## Où tourne Moli OS (relevé 2026-10-15)
- **Hôte** : Proxmox HOME, `192.168.1.4` (accès SSH `root@192.168.1.4`, clé `~/.ssh/id_ed25519_pve4`).
- **Container** : LXC **125**, hostname **`moli-lab`** (unprivileged, Ubuntu, 2 cores / 2 Go,
  `net0 ip=192.168.1.125/24`, gateway `192.168.1.247`).
  - ⚠️ L'ancien nom `odysseus` et l'IP `192.168.1.93` sont **obsolètes**.
- **Code source sur place** : `/opt/moli-os` (branche `main`).
- **Container applicatif** : `moli-os:latest` (`/moli-os serve`), mode réseau host.
- **Instance live** : `http://192.168.1.125:8790` — santé : `GET /api/health`.
- **Accès SSH direct** : `ssh moli-os` (alias dans `~/.ssh/config`) → `moli-lab`.

## Skill à installer (global OpenFox)
Chemin : `~/.config/openfox/skills/installer-moli/SKILL.md`
- Dossier == frontmatter `name: installer-moli` (contrainte OpenFox).
- Source : `main` du 2026-10-14 (`github.com/rudy-io/moli-os`, `.claude/skills/installer-moli/SKILL.md`).
- Vérif : `GET http://127.0.0.1:10369/api/skills` → `source: global-openfox`,
  `enabled: true`, `warnings: []`.

## Suivi de version
Dernier relevé 2026-10-15 : cf. `notes/version-tracking.md`.
Point d'évaluation précédent : 2026-10-13.

Nouveaux commits le 2026-10-14 :
- `220625c` Profils : appareil retrouvé par MAC quand l'IP change
- `9d41ed9` Dépendances : rustls 0.23.46 (4 alertes RustSec)
- `5dc681a` Box internet : retrouvée après redémarrage (n° série, annonces)
- `d54c3de` Tapo : ampoule relocalisée par MAC ; box : écoute SSDP continue

→ Aucun changement de `SKILL.md` ni de `moli.example.toml` requis.

## Contenu attendu du projet
- `README.md` (ce document).
- `notes/` : relevés de version, diffs de `integrations/`, suivis de déploiement LXC 125.
- Pas d'édition de code Moli ici (voir `AGENTS.md` du repo source pour ça).

## Règles
- Ne rien modifier côté Hermes.
- Secrets (code maison, clés) : jamais en clair, jamais dans le chat — pipe `moli-os secrets set`.
- Ne jamais exposer le port 8790 sur Internet.
