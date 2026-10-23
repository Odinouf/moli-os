# Suivi de version — moli-os

Dépôt de référence : `github.com/rudy-io/moli-os` (branche `main`).
Déploiement suivi : LXC 125 `moli-lab`, `/opt/moli-os`.

## Relevé 2026-10-15

- **Point d'évaluation précédent** : 2026-10-13.
- **Déployé avant montée** : `1e1185e` (2026-10-12, « Docs : invités, enregistrements,
  assistant et budgets d'essais du code »).
- **`main` distant** : `d54c3de` (2026-10-14).
- **Écart** : **4 commits de retard** → montée appliquée (cf. ci-dessous).

### Nouveaux commits le 2026-10-14

| Commit | Résumé |
|---|---|
| `220625c` | Profils : un appareil qui change d'adresse est retrouvé par sa MAC |
| `9d41ed9` | Dépendances : rustls 0.23.46 (4 alertes RustSec corrigées) |
| `5dc681a` | Box internet : retrouvée après un redémarrage (n° série, annonces SSDP) |
| `d54c3de` | Tapo : ampoule relocalisée par MAC ; box : écoute SSDP continue |

### Impact sur la configuration

- `SKILL.md` (`.claude/skills/installer-moli/`) : **inchangé** (5128 o).
- `moli.example.toml` : **inchangé**.
- → Aucune modification de configuration requise pour adopter ces commits.

## Montée appliquée (2026-10-15)

- `git fetch origin main` + `git reset --hard origin/main` dans `/opt/moli-os`.
- Nouveau HEAD : `d54c3de46aa453691f0c96ddc42e853a8a964178`.
- Rebuild : `docker compose up -d --build` → image `moli-os:latest` reconstruite.
- Vérif : `GET http://192.168.1.125:8790/api/health` répond (driver `personnes` running).

## Réconciliation du 2026-10-23

Le code local du CT125 (7 commits, jamais poussés jusqu'ici) a été sauvegardé puis
**rebasé sur l'amont**, pour que le fork ne traîne plus 16 commits de retard.

- **Avant** : `lab/ct125` `61c35d9`, base `d54c3de` (15 fichiers en chevauchement amont).
- **Après** : `lab/ct125-rebased` `1bae9b3`, base `04f60a3` (`0 7` face à l'amont),
  **déployée sur le CT125**.
- Rebase **sans conflit** ; le commit `Stale` (`c5af13e`) a été abandonné
  automatiquement (contenu déjà en amont via la PR #9).
- Compilation `cargo build --release --locked -p moli-os` : OK (6 m 32 s) ;
  `cargo test` sur `moli-automation` + `moli-esphome` : 52/52 ;
  `npm test` 93/93 ; `npm run build` OK.
- `check-config` → 14 pilotes (le nouveau `dirigera` amont n'est pas activé, pas de hub IKEA).
- `/api/health` → 200, 16 pilotes running, `journal_failures` 0.

Détail, preuves et rollback : `notes/reconciliation-lab-ct125.md`.
