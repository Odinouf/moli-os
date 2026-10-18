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
- `notes/` : notes opérationnelles et relevés — version tracking, diffs de
  `integrations/`, déploiements LXC 125, migrations (Hue, zwave, tuya, frigate),
  refontes du dashboard (`accueil-*`, `dashboard-clim`, `dehors`, `fuseaux-horaires`,
  `tablette-lenovo-moli`), la **parité `tablette-2025`** (`tablette-2025-parity.md`),
  les **satellites vocal/son** (`satellites-vocal-son.md` : ESP32 S3 Box, Alexa, Piper/Whisper),
  audits (`security-audit`, `energy-crosscheck`).
- `notes/patches/` : patches du **fork local** du dashboard Moli (édits ponctuels à
  ré-appliquer après chaque resync/mise à jour du dépôt source, et à remonter en **PR amont**
  `github.com/rudy-io/moli-os`). Contient aussi des **échantillons de config** (`.hainspire`)
  exportés pour traçabilité — ce ne sont *pas* des patches `git apply`. Ces échantillons
  **figent l'étape `accueil-ha-inspire`** (pièces, chauffage, caméra, piscine) ; les
  changements ultérieurs (`badges` d'`accueil-sections` p.ex.) ne s'y trouvent **pas** —
  se référer aux `.patch` pour l'état final. Pour (ré)appliquer un patch sur le CT125 :
  ```sh
  ssh moli-os 'cd /opt/moli-os && git apply --check <patch>'   # vérifie d'abord
  ssh moli-os 'cd /opt/moli-os && git apply <patch>'           # puis applique
  ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d'  # le web est embarqué (rust-embed)
  ```
  (copier le patch sur le CT avant : `cat notes/patches/x.patch | ssh moli-os 'cat > /tmp/x.patch'`).

  **Ordre des patches Accueil** (chaîne **legacy/historique uniquement** — superseded par
  `tablette2025-parity.patch`, ne plus appliquer sur la base courante ; chacun part de l'état
  du précédent) :
  `accueil-ha-inspire` → `accueil-clim-conditional` → `accueil-sections` → `accueil-tidy`
  → `accueil-heure-salon-sections` → `accueil-plan-frigate` → `accueil-arrows-heat`
  → `accueil-motion-colonnes` → `accueil-tempo` → `accueil-room-icons`.
  Voir `notes/accueil-sections.md`, `notes/accueil-tidy.md`,
  `notes/accueil-heure-salon-sections.md`, `notes/accueil-plan-frigate.md`,
  `notes/accueil-arrows-heat.md`, `notes/accueil-motion-colonnes.md` et
  `notes/accueil-room-icons.md`
  (ordre + supersession documentés).
  Le patch `accueil-tempo` (profil `tempo` + témoin couleur EDF sur l'Accueil) est décrit
  dans `notes/tempo-plugin.md`.
  ⚠️ `accueil-tempo` et `accueil-room-icons` sont **déjà inclus verbatim** dans
  `tablette2025-parity.patch` (base courante) — ne pas les appliquer par-dessus.

  ⚠️ **Base courante : `tablette2025-parity.patch`** — cumulatif depuis `d54c3de`, il
  **remplace toute la chaîne `accueil-*`** et porte la parité complète du dashboard HA
  `tablette-2025` (Wifi/Solaire, pilotes Linky/ESPHome, sidecars voix). **Ne pas** appliquer
  les deux. Détail et rollback : `notes/tablette-2025-parity.md`. Patchs associés :
  `linky-driver.patch`, `esphome-full-entities.patch`, `ha-moli-linky-bridge.json`,
  `compose.override.yaml.voice`.

  **Patchs locaux du 2026-10-18** (indépendants de la livraison 10-14 ci-dessus et de la parité) :
  Correctif d'affichage de la carte Plan de l'Accueil (`PlanPreview`, échelle des
  jetons + anti-chevauchement) : `notes/patches/accueil-plan-scale.patch`, à appliquer
  **après** `tablette2025-parity.patch` — voir `notes/accueil-plan-scale.md`.
  Déplacement de la carte Plan **dans l'en-tête** (entre date/heure et météo, **fond blanc
  retiré**) : `notes/patches/accueil-plan-hero.patch`, appliqué **après** `accueil-plan-scale`
  (fichiers distincts : `Accueil.svelte` + `SkyHero.svelte`) — voir `notes/accueil-plan-hero.md`.
  Côté serveur (driver `tuya`) : `notes/patches/tuya-seek-home-network.patch` — `seek`
  balaie le /24 de l'hôte quand `tuya.json` n'a aucune adresse (ventilo-lampe injoignable)
  — voir `notes/ceiling-fan-tuya.md`.
- Pas d'édition de code Moli ici (voir `AGENTS.md` du repo source pour ça).

## Règles
- Ne rien modifier côté Hermes.
- Secrets (code maison, clés) : jamais en clair, jamais dans le chat — pipe `moli-os secrets set`.
- Ne jamais exposer le port 8790 sur Internet.
