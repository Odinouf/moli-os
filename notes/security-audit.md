# Audit de code malveillant — moli-os

**Date :** 2026-10-16 · **Cible :** `github.com/rudy-io/moli-os` + clone local `/tmp/moli-os-src`
**Commit audité :** `d54c3de46aa453691f0c96ddc42e853a8a964178` (arbre `e747441…`, 564 fichiers)
**Artefact déployé :** CT125 `/opt/moli-os` (même commit), conteneur `moli-os:latest`

## Verdict : AUCUN code malveillant trouvé. LXC 125 NON coupé.

---

## A0 — Intégrité source ↔ déploiement

- Clone local = GitHub `origin/main` = `d54c3de` (`git ls-remote` confirme, 0 ahead/0 behind).
- Historique complet récupéré (`git fetch --unshallow`) : **100 commits**, un seul auteur
  (`Rudy Molinillo <rudy@nxus.fr>`), aucun commit signé par un tiers.
- Aucune branche/tag caché (`refs/heads/main` + remotes seulement).
- CT125 : vérification que `/opt/moli-os` est au même commit `d54c3de`.
- Dépôt créé 2026-10-09, public, 17 stars, 1 repo chez l'owner `rudy-io` — projet réel et
  actif, pas de signe de compromission de compte.

## A1 — Scan de patterns suspects : RIEN

- **Exécution de process :** aucun `std::process::Command` / `Command::new` hors tests
  (les seuls hits sont `std::process::id()` dans des tests). Le binaire **ne shell pas**.
- **`unsafe` :** aucun bloc `unsafe` hors test (le seul hit est un `style-src 'unsafe-inline'`
  dans une CSP, sans rapport).
- **Obfuscation :** aucun `eval`, pas de blob base64 opaque. Les `decode`/`base64` sont des
  décodages de protocole (Tuya local, Tapo, percent-decode URL, MQTT) — légitimes.
- **Exécution distante :** aucun `curl|bash`, `wget|sh`, `/dev/tcp`, `nc -e`, reverse shell
  (vérifié aussi sur **tout l'historique git** `git log -p --all`).

## A2 — Build / exécution / CI : RIEN

- `build.rs` (unique) = `moli-i18n` : embarque les catalogues de `locales/`. Bénin.
- `Dockerfile` : multi-stage standard (node → rust → `FROM scratch`), pas de `curl|bash`,
  pas de script de post-installation. Utilisateur non-root (1000:1000).
- `scripts/` : `check.sh` (fmt/clippy/test), `leak-check.sh` (garde **anti-fuite** — honnête),
  `i18n-check.mjs`, helpers. `docker/dev.Dockerfile` minimal.
- `.github/workflows/` : `check.yml` (fmt/clippy/test/build) + `audit.yml` (cargo-audit).
  Actions épinglées officielles (`actions/checkout@v4`, `dtolnay/rust-toolchain`, etc.),
  `permissions: contents: read`. Aucune exfiltration, aucun secret requis.

## A3 — Dépendances : RIEN

- `Cargo.lock` : **100 % crates.io**, aucune dépendance `git =`, aucun registre tiers, aucun
  override. Crates toutes connues (tokio, axum, ring, rustls, rusqlite, rumqttc, rmcp, serde…).
- `web/package-lock.json` : toutes les 104 deps résolues sur `registry.npmjs.org`. Aucun
  `postinstall`/`preinstall`. Pas de CDN distant dans le HTML.
- `cargo-audit` est intégré au dépôt (RustSec), avec 4 avis ignorés documentés et argumentés
  (rustls-webpki non appelé en vérification).

## A4 — Historique git : RIEN

- Aucun binaire commité (seul « gros » fichier = `mobile/package-lock.json`).
- Aucun secret dans l'historique ni l'arbre (le dépôt a un `leak-check.sh` qui bloque les
  clés, tokens, MAC et e-mails réels au commit).

## A5 — Artefact déployé + egress réel : RIEN

- Source CT125 = `d54c3de`, seuls fichiers non suivis = notre config locale
  (`compose.override.yaml`, `moli.env`) — attendu.
- **Connexions réseau du conteneur en fonctionnement (network_mode host) :** toutes en LAN —
  `192.168.1.78:1883` (MQTT Z2M), `192.168.1.102:8883` & `192.168.1.110:8883` (imprimantes
  Bambu), `192.168.1.200:8790` (le dashboard local). **Aucune sortie Internet.**
- Hôtes externes référencés dans le code = intégrations **opt-in** uniquement :
  `api.open-meteo.com` (météo, si lat/lon configurés), `api.telegram.org` (bot, si token
  fourni), `api.openai.com` (endpoint assistant par défaut — **nous l'avons pointé sur le
  bridge local**), `tile.openstreetmap.org` (carte), liens apps streaming (Android TV),
  `alexa.amazon.fr`/`api.amazon.com` (Alexa). Aucune n'est active par défaut ici.
- La clé API de l'assistant n'est envoyée **qu'à l'endpoint configuré** (`base_url`, chez nous
  `http://192.168.1.200:8092/v1`).
- Fixture binaire auditée (`integrations/ipp/fixtures/mg3600-attributes.ipp`) = attributs IPP
  d'une imprimante (données, pas de code).

## Zones de vigilance (non malveillantes)

1. **Listen `0.0.0.0:8790`** : le conteneur écoute sur toutes les interfaces. L'exposition
   dépend du pare-feu de l'hôte / du routeur — à garder en LAN seul (règle projet déjà en place).
2. **Intégrations cloud opt-in** (Telegram, Alexa, Tuya cloud, Deye/solaire) : elles ne
   parlent au cloud que si l'utilisateur les configure et fournit un secret. Comportement voulu.
3. **Historique squashed au départ** : le clone initial était shallow (1 commit) ; après
   `--unshallow`, 100 commits cohérents, un auteur. Rien d'anormal.

## Méthode

Lecture seule intégrale : `git` (log/grep/history), `grep` ciblé (exec, unsafe, obfuscation,
URLs, télémétrie), inspection `Dockerfile`/CI/scripts/deps, `ss -tnp` sur le conteneur en
fonctionnement, vérification croisée source ↔ CT125. Aucune écriture sur HA, GitHub ou Moli.
