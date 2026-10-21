# Moli OS — ancrage d'exploitation (workspace)

Ce dépôt est l'**ancrage d'exploitation** de Moli OS : on y pilote l'installation, les
appareils, les patchs du dashboard et les montées de version **sans éditer le code Moli
lui-même** (le code source vit sur `github.com/rudy-io/moli-os`, déployé dans le CT125).

Lis d'abord `README.md` (identité du projet, contenu attendu) puis `notes/` (relevés et
modes opératoires détaillés). Ce document est le **point d'entrée unique** : il regroupe
les accès, les méthodes et les procédures.

## Règles absolues

- **Jamais de blabla.** Réponses concises, résultat-first. Exécute, ne raconte pas un plan.
- **Zéro spéculation.** Si tu ne sais pas, cherche (`grep`, `curl`, logs). Pas de « je pense que ».
- **Pas de code sans preuve.** Écris → build/test → vérifie (curl output, test pass, DOM). `« J'ai fait X »` n'est pas une validation.
- **Secrets : jamais en clair, jamais dans le chat, jamais dans un argv.** Ils passent par un tube (`moli-os secrets set`, lit **stdin**).
- **Ne jamais exposer le port 8790 hors du LAN** (pas de reverse proxy sur la même machine).
- **Pas de `timedatectl set-time`** (corrompt l'epoch/historique) ; seul `set-timezone` est autorisé.
- **Ne rien modifier côté Hermes.** Ce workspace concerne Moli uniquement.
- **Patch, pas réécriture** sur un fichier existant. Tout changement de config = sauvegarde `.bak-*` d'abord.
- **Français** pour les messages humains ; code, logs, commentaires en anglais.

## Où tourne Moli OS

| Élément | Valeur |
|---|---|
| Hôte | Proxmox HOME `192.168.1.4` (`root`, clé `~/.ssh/id_ed25519_pve4`) |
| Container | LXC **125** `moli-lab` (unprivileged, Ubuntu, 2 cores / 2 Go) |
| Réseau | `net0 eth0 vmbr0 gw=192.168.1.247 ip=192.168.1.125/24` |
| Code | `/opt/moli-os` (branche `main`, remote `github.com/rudy-io/moli-os`) |
| Conteneur applicatif | Docker `moli-os:latest`, `network_mode: host`, `/moli-os serve` |
| Web (LAN only) | `http://192.168.1.125:8790` — santé : `GET /api/health` |
| Fuseau | Europe/Paris (LXC + conteneur via `TZ`) |

⚠️ Ancien nom `odysseus` et IP `192.168.1.93` : **obsolètes**.

## Accès

```sh
# Direct (alias ~/.ssh/config) :
ssh moli-os                          # → root@192.168.1.125 (clé id_ed25519_pve4)

# Via PVE (si SSH direct indisponible) :
ssh -i ~/.ssh/id_ed25519_pve4 root@192.168.1.4
pct exec 125 -- <commande>           # exécuter dans le CT125
```

- `~/.ssh/config` : `Host moli-os → HostName 192.168.1.125, User root, IdentityFile ~/.ssh/id_ed25519_pve4`.
- Clé publique déjà dans `/root/.ssh/authorized_keys` du CT.

## Le binaire `moli-os` (toutes les opérations)

Toujours l'exécuter **dans le conteneur** : `docker exec moli-os /moli-os <cmd>`.

| Commande | Rôle |
|---|---|
| `serve` | Le hub (défaut) |
| `check-config` | Valide `moli.toml` et affiche les drivers lus |
| `secrets set <instance> <nom>` | Range un secret dans le coffre (lu **stdin**, jamais affiché) |
| `secrets forget <instance> <nom>` | Oublie un secret (clé révoquée, pont remplacé) |
| `profile list` / `check <f>` / `trust <f>` | Pilotes déclaratifs (profils) |
| `catalogue check integrations` | Vérifie le catalogue d'intégrations |
| `energy import` / `demo` | Historique d'énergie |
| `tuya import` | Importe les clés Tuya (JSON sur stdin) |
| `backup <dir>` | Copie tout ce que Moli sait (sûr pendant l'exécution) |
| `restore <dir>` | Restaure (⚠️ Moli arrêté) |
| `health` | Exit 0 si l'instance répond `/api/health` |

## Méthodes — procédures

### 1. Modifier la configuration (`data/moli.toml`)

Un bloc `[[driver]]` par intégration. Toujours : sauvegarde → édition → check → restart.

```sh
ssh moli-os 'cd /opt/moli-os && cp data/moli.toml data/moli.toml.bak-<motif>'
# ... éditer data/moli.toml ...
ssh moli-os 'cd /opt/moli-os && docker exec moli-os /moli-os check-config'   # → configuration OK (N driver(s))
ssh moli-os 'cd /opt/moli-os && docker compose restart moli-os'
ssh moli-os 'cd /opt/moli-os && curl -s http://127.0.0.1:8790/api/health'     # drivers_running, journal_failures
```

Blocs en place (relevé 2026-10-16, 10 drivers) :
- `z2m` : `host=192.168.1.78`, `port=1883`, `base_topic=zigbee2mqtt`, `username=moli`, `password_env=MOLI_Z2M_PASSWORD`.
- `bambu-a1mini` / `bambu-a1` : `host`, `serial`, `name` (MQTT-TLS 8883, TOFU cert).
- `frigate` : `host=192.168.1.78`, `base_topic=frigate`, `api=http://192.168.1.188:5000`, mêmes creds MQTT que z2m.
- `hue` : `host=192.168.1.46` (CLIP v2, clé au coffre, TOFU cert).
- `tuya` : `devices_file=data/tuya.json` (prise + lampes + ventilo-lampe ; clés au coffre ; caméras `sp` reportées).
- `meteo` / `air` : `kind=profile`, `profile=open-meteo[-air]`, `vars={lat=46.231,lon=1.922}`.
- `[assistant]` : `base_url=http://192.168.1.200:8092/v1`, `model=current` (voir §4).
- `[automations]` : `latitude=46.231`, `longitude=1.922`, `timezone=Europe/Paris`.
- `[energy]` : compteurs z2m (`role=appliance` / `total`), `timezone`, `currency`.

> Comptes : `check-config` annonce les blocs `[[driver]]` (**8** : z2m, bambu ×2, frigate,
> hue, tuya, meteo, air) ; `/api/health` ajoute les pilotes maison (`energie`, `personnes`)
> → **10**. Les notes `accueil-*.md` citent les relevés de leur époque (7/9) — snapshots datés.

### 2. Secrets (coffre chiffré `data/secrets.enc` + `data/master.key`)

**Ne jamais** afficher un secret. Lecture par tube, valeur sur **stdin** :

```sh
# l'humain tape la valeur (invisible), elle n'apparaît ni à l'écran ni dans l'historique :
read -rs V; printf %s "$V" | ssh moli-os 'docker exec -i moli-os /moli-os secrets set <instance> <nom>'
# → <instance>/<nom>: stored (N characters)
ssh moli-os 'cd /opt/moli-os && docker compose restart moli-os'
```

- `data/master.key` (0600) est **indispensable** pour relire le coffre ; `moli-os backup` ne le
  contient **jamais** → garder une copie ailleurs (gestionnaire de mots de passe).
- Variables d'environnement de secrets : `moli.env` (0600 root) livré par `env_file` dans
  `compose.override.yaml`. Contient `MOLI_Z2M_PASSWORD` (partagé z2m **et** frigate) et `TZ`.

### 3. Ajouter une intégration

1. Lire `integrations/<nom>/onboarding.md` (dans `/opt/moli-os`) — il dit quoi demander et faire.
2. Ajouter son `[[driver]]` dans `moli.toml` (modèle : `moli.example.toml`).
3. Secrets par le tube (§2).
4. `check-config` → `restart` → vérifier `logs` + `/api/health` + dashboard.
5. Tester une commande sur une **cible neutre** (jamais une chambre), humain présent.

### 4. Assistant IA (`[assistant]`) — pont socat

Moli tape un pont **local** : `http://192.168.1.200:8092/v1` (socat `moli-ai-bridge`), qui
relaie vers le backend actif. **Changer de backend = changer la cible du socat**, pas `moli.toml`.

```sh
# état du pont :
docker ps --format '{{.Names}} {{.Ports}} {{.Status}}' | grep moli-ai-bridge
docker inspect moli-ai-bridge --format 'Cmd={{json .Config.Cmd}}'

# basculer vers un backend (ex. cluster-A1 : 100.124.230.124:8081) :
docker rm -f moli-ai-bridge
docker run -d --name moli-ai-bridge --restart unless-stopped \
  -p 127.0.0.1:8092:8092 -p 192.168.1.200:8092:8092 \
  alpine/socat TCP-LISTEN:8092,fork,reuseaddr TCP:<hôte>:<port>

# preuve : le modèle servi à travers le pont
curl -s http://192.168.1.200:8092/props
```

Backends connus : **srv-ai** `100.115.200.86:8081` (35B-A3B texte) ; **cluster-A1**
`100.124.230.124:8081` (35B-A3B, ×4 slots, vision). L'IP LAN `192.168.1.11` de cluster-A1
n'est **pas** routable depuis HOME → utiliser la route Tailscale `100.124.230.124`.

### 5. Patchs du dashboard (fork local)

Ce dépôt **n'édite pas** le code Moli : il maintient des **patchs** à ré-appliquer après chaque
resync, et à remonter en **PR amont**.

```sh
# appliquer un patch sur le CT125 :
cat notes/patches/<x>.patch | ssh moli-os 'cat > /tmp/x.patch'
ssh moli-os 'cd /opt/moli-os && git apply --check /tmp/x.patch'   # vérifie D'ABORD
ssh moli-os 'cd /opt/moli-os && git apply /tmp/x.patch'
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d --force-recreate'  # web embarqué (rust-embed)
```

**Ordre des patchs Accueil** (chaîne **legacy/historique uniquement** — ne plus appliquer sur la base courante ; chaque patch part de l'état du précédent) :
`accueil-ha-inspire` → `accueil-clim-conditional` → `accueil-sections` → `accueil-tidy`
→ `accueil-heure-salon-sections` → `accueil-plan-frigate` → `accueil-arrows-heat`
→ `accueil-motion-colonnes` → `accueil-tempo` → `accueil-room-icons`.
Voir `notes/accueil-*.md` (ordre + supersession). Cette chaîne est **superseded par
`tablette2025-parity.patch`** (ci-dessous) : `accueil-tempo` et `accueil-room-icons` y sont
déjà inclus verbatim — ne pas les appliquer par-dessus la parité.

⚠️ **Base courante : `tablette2025-parity.patch`.** Cumulatif depuis `d54c3de`, il
**remplace toute la chaîne `accueil-*`** ci-dessus (parité complète du dashboard HA
`tablette-2025` : Wifi/Solaire, pilotes Linky/ESPHome, sidecars voix). Ne **pas**
enchaîner la chaîne `accueil-*` par-dessus, ni appliquer les deux. Détail, preuves et
rollback : `notes/tablette-2025-parity.md`. Autres patchs de la même livraison :
`linky-driver.patch`, `esphome-full-entities.patch`, `ha-moli-linky-bridge.json`,
`compose.override.yaml.voice`.

**Ordre explicite de la chaîne Accueil** (vérifié de bout en bout sur un clone propre de
`d54c3de` ; chaque patch part de l'état laissé par le précédent) :

| # | Patch | Note |
|---|---|---|
| 1 | `tablette2025-parity.patch` | `notes/tablette-2025-parity.md` |
| 2 | `accueil-plan-scale.patch` | `notes/accueil-plan-scale.md` — échelle des pins (`PlanPreview`) |
| 3 | `accueil-plan-hero.patch` | `notes/accueil-plan-hero.md` — carte Plan dans l'en-tête |
| 4 | `accueil-tablette2025-pixel.patch` | `notes/accueil-tablette2025-pixel.md` — refonte `Accueil.svelte` + 5 composants |
| 5 | `accueil-plan-pins.patch` | `notes/accueil-plan-pins.md` — jetons réduits, sans relevés, filtrés |
| 6 | `chauffage-trv.patch` | `notes/chauffage-trv.md` — hors Accueil, page `#/chauffage` |
| 7 | `chauffage-trv-zones.patch` | `notes/chauffage-trv.md` — axe horaire, paliers nommés Confort/Réduit/Personnalisé, édition sur place |
| 8 | `accueil-trv-witness.patch` | `notes/accueil-trv-witness.md` — témoin de vanne sur la rangée Chambre (état + consigne, non cliquable), rangée Appart sur la puissance résiduelle (watts seuls, sans mention) ; **+ 2 clés dans `data/home.json`, hors patch** |
| 9 | `accueil-badges-rebuild.patch` | `notes/accueil-badges-rebuild.md` — bandeau de pastilles reconstruit : Tempo + 2 puissances + prises, neutre par défaut, aligné sur les colonnes |

Hors chaîne, côté **moteur** : `notes/patches/moteur-stale-rule.patch` — ajoute
`Rule::Stale { point, for_s }` (« ce capteur ne dit plus rien depuis N »), la seule
règle qu'un seuil ne peut pas exprimer. C'est le correctif amont de l'incident
Alicia (capteur figé à une valeur plausible) ; voir
`notes/chauffage-alicia-vanne.md`. **Ne pas** l'appliquer sur le CT125 : il y est
déjà compilé dans l'image.

`accueil-tablette2025-pixel` **doit** passer après `accueil-plan-hero` : sur une base
`parity` seule il échoue (`Accueil.svelte:190`), la carte Plan devant déjà être dans
`SkyHero`. Appliquer les sept dans cet ordre, sans en sauter un, puis le n° 8
(`accueil-trv-witness`, qui part de leur état), puis le n° 9 (`accueil-badges-rebuild`,
qui reprend le bandeau de pastilles).

**`accueil-plan-pins.patch`** : sur la carte Plan de l'Accueil, **retire les relevés**
(pas de `.reading` : `pinReading` n'est plus importé), **réduit les jetons** (34 → 22 px,
icône 16 → 12 px, `SEP` 38 → 28, `EDGE` 28 → 18, halo et pulsation à l'échelle) et
**ne dessine que les appareils utiles** : ceux qu'on peut commander (`commands(d)` sur
`p.access.write`), plus ceux dont l'état se lit de loin (porte ouverte, mouvement,
alarme). Un thermomètre qui ne fait que rapporter **n'est plus dessiné du tout** — 16 → 8
jetons. Ajoute aussi la détection des vannes thermostatiques (`system_mode` /
`occupied_heating_setpoint` → `climate`, icône `radiator`) et la reconnaissance des
ventilateurs (`fan_speed` / `fan_*` / `wind_speed`, ou nom de l'appareil). Filtrage et
dimensions **locaux à `PlanPreview`** : la page Plan garde ses jetons 18 px et ses relevés.

Autre patch de la base (côté serveur, driver `tuya`) : `tuya-seek-home-network.patch` —
quand `tuya.json` n'a aucune adresse, `seek` balaie le /24 de l'hôte au lieu de ne rien
faire. Voir `notes/ceiling-fan-tuya.md`.

Enfin, **hors chaîne Accueil** : `chauffage-trv.patch` — page **Chauffage** (`#/chauffage`)
avec, par vanne thermostatique, la consigne, la **table horaire hebdomadaire** éditable
(7 pistes 24 h, paliers 15 min, 6 max) et le choix de qui pilote : le programme de la valve
(`system_mode=auto`) ou les automatisations de la maison. Corrige aussi `ClimateCard`
(une TRV expose `occupied_heating_setpoint`, pas `target_temperature`) et aligne le bandeau
`HeatingBar` sur la **variante B** : il n'écrit plus que la consigne, laissant à la valve son
override temporaire natif. Aucun fichier `crates/` touché. Voir `notes/chauffage-trv.md`.

Puis `chauffage-trv-zones.patch` (n° 7, par-dessus le n° 6) : la table devient lisible
(**axe** `00h / 06h / 12h / 18h / 24h` aligné sur les pistes, grille d'heures en fond,
**heure de début dans chaque palier** assez large, liseré de séparation) et
programmable (**tout le palier est cliquable**, bloc d'édition sous le jour concerné,
bouton **+** par jour plutôt qu'une insertion au clic invisible). Les paliers sont
**nommés** d'après `home.config.heating` — Confort 18.5°, Réduit 16°, sinon
Personnalisé (`levelOf()` dans `schedule.js`, tolérance 0.25°) — avec deux boutons
d'application directe. La vérité reste le texte `HH:MM/<deg>` de la valve : rien de
persisté en plus, `MAX_BLOCKS = 6` inchangé (c'est la limite matérielle du TRVZB).

### 6. Montée de version

```sh
ssh moli-os 'cd /opt/moli-os && git fetch origin main && git log --oneline HEAD..origin/main'  # écart
ssh moli-os 'cd /opt/moli-os && git reset --hard origin/main'
ssh moli-os 'cd /opt/moli-os && docker compose up -d --build'
ssh moli-os 'cd /opt/moli-os && curl -s http://127.0.0.1:8790/api/health'
# ré-appliquer les patchs locaux le cas échéant (§5)
```
Comparer `SKILL.md` et `moli.example.toml` avant/après (un changement peut exiger une MAJ de config).
Suivi dans `notes/version-tracking.md`.

### 7. Codes d'accès de la maison (dashboard)

Moli n'a **pas** de login/mot de passe admin. L'accès se fait par :
- **Code d'installation** (maison neuve uniquement) : usage unique, ~1 h, **lu par l'humain** dans
  les logs → `ssh moli-os 'cd /opt/moli-os && docker compose logs moli-os'` (chercher la ligne du
  code).
- **Code du tableau de bord** (choisi par un humain, ≥6 chiffres) : chiffré dans le coffre, sert à
  valider un automatisme / une pièce protégée (« Je suis là »). Bouton « Changer/Choisir » sur la
  page Système (`#/systeme`) → carte « Code du tableau de bord ».
- **Personnes** : rôles owner/member/guest ; invitation à usage unique (code + choix du mot de passe).
- **Oubli du code** (dernier recours, destructif — désactive les sessions humaines), procédure de
  référence `docs/components/installation.md` :
  ```sh
  ssh moli-os 'cd /opt/moli-os && docker compose stop moli-os'
  ssh moli-os 'cd /opt/moli-os && docker compose run --rm moli-os secrets forget core ui_pin'
  ssh moli-os 'cd /opt/moli-os && docker compose run --rm moli-os secrets forget core ui_sessions'
  ssh moli-os 'cd /opt/moli-os && docker compose start moli-os && docker compose logs moli-os'   # nouveau code d'installation dans les logs
  ```

### 8. Backup / restore

```sh
# backup : dossier neuf/vide, sûr pendant l'exécution (VACUUM INTO + manifest.json) :
ssh moli-os 'cd /opt/moli-os && docker exec moli-os /moli-os backup /data/backup/$(date +%Y%m%d-%H%M%S)'
ssh moli-os "cd /opt/moli-os && tar -czf moli-\$(date +%Y%m%d).tar.gz -C data/backup . && rm -rf data/backup"

# restore : Moli ARRÊTÉ, via l'image (pas le conteneur de prod) :
ssh moli-os 'cd /opt/moli-os && mkdir -p /tmp/r && tar -xzf moli-<date>.tar.gz -C /tmp/r'
ssh moli-os 'cd /opt/moli-os && docker compose stop moli-os'
ssh moli-os 'cd /opt/moli-os && docker run --rm -v /tmp/r/<horodatage>:/b:ro -v "$PWD/data:/data" moli-os restore /b --force'
ssh moli-os 'cd /opt/moli-os && docker compose start moli-os'
```
Le backup **n'inclut pas** `master.key` (`secrets.enc` reste chiffré) : sans la clé maître gardée
ailleurs, les secrets restaurés sont illisibles. Référence : `docs/components/exploitation.md`.

### 9. Fuseaux horaires

- LXC : `ssh moli-os 'timedatectl set-timezone Europe/Paris'` (jamais `set-time`).
- Conteneur : `TZ=Europe/Paris` dans `moli.env`, puis `docker compose up -d`.
- Logs conteneur en `…Z` (UTC) = normal (formateur `tracing_subscriber` par défaut), l'instant est correct.

## Sécurité

- « Secrets (mot de passe, clé, code maison) : jamais en clair, jamais dans le chat » — pipe `moli-os secrets set`.
- Ne jamais exposer `8790` sur Internet ; accès distant = VPN (sous-réseau Tailscale) ou Cloudflare Access.
- API Frigate (`192.168.1.188:5000`) **non authentifiée** → LAN uniquement.
- Cred MQTT `moli` partagé z2m + frigate : un changement de `MOLI_Z2M_PASSWORD` casse les deux.
- Claudes/agents ne peuvent pas changer le code maison (`DashboardCode.svelte`).

## Carte des notes

| Note | Sujet |
|---|---|
| `deploy-lxc125.md` | Identité/accès du CT125, état initial |
| `version-tracking.md` | Suivi de version amont |
| `hue-migration.md` | Pont Hue (CLIP v2, clé récoltée HA) |
| `frigate-migration.md` | NVR Frigate (MQTT + images, purge caméras fantômes) |
| `zwave-moli.md` | Étude Z-Wave (postponed) |
| `tuya-migration-assessment.md` | Éval migration Tuya HA→Moli |
| `ceiling-fan-tuya.md` | Ventilo-lampe Tuya « injoignable » : cause (`tuya.json` sans `ip` → `seek` jamais lancé), IP prouvées, commandes testées, correctif `tuya-seek-home-network` |
| `fuseaux-horaires.md` | Fuseau LXC/conteneur |
| `dehors.md` | Page Dehors (météo/air/piscine) |
| `dashboard-clim.md` | Carte clim conditionnelle |
| `accueil-*.md` | Refontes de l'Accueil + ordre des patchs (chaîne historique) |
| `tablette-2025-parity.md` | **Parité tablette-2025** : portage complet du dashboard HA (Wifi/Solaire, pilotes Linky/ESPHome, voix) — patch cumulatif `tablette2025-parity` |
| `tempo-plugin.md` | Profil `tempo` + témoin couleur EDF (patch `accueil-tempo`, **legacy** : contenu déjà dans `tablette2025-parity`) |
| `accueil-room-icons.md` | Icônes de pièce selon leur fonction (patch `accueil-room-icons`, **legacy** : contenu déjà dans `tablette2025-parity`) |
| `accueil-plan-scale.md` | Échelle des pins du Plan de l'Accueil (`PlanPreview`) : jetons 34 px, lectures 12 px, anti-chevauchement — patch `accueil-plan-scale` (n° 2 de la chaîne) — **superseded par `accueil-plan-pins`** (§ Supersession) |
| `accueil-tablette2025-pixel.md` | Refonte du tableau de bord tablette : `Accueil.svelte` réécrit + 5 composants (`BatteryGauge`, `CameraCard`, `TabletteRow(s)`, `WeatherNow`) — patch `accueil-tablette2025-pixel` (n° 4 de la chaîne, **après** `accueil-plan-hero`) |
| `accueil-plan-pins.md` | Jetons du Plan de l'Accueil réduits (22 px) **sans aucun relevé**, filtrés sur les appareils utiles (16 → 8) — patch `accueil-plan-pins` (n° 5 de la chaîne) |
| `chauffage-trv.md` | Page **Chauffage** : consigne, table horaire hebdomadaire (7 pistes, 15 min) et choix programme/automatisations/éteinte par vanne — patch `chauffage-trv` (n° 6) + `chauffage-trv-zones` (n° 7 : axe horaire, paliers Confort/Réduit/Personnalisé, édition sur place) |
| `accueil-trv-witness.md` | Témoin de vanne thermostatique sur la rangée **Chambre** de l'Accueil (point de couleur + consigne, non cliquable ; « éteinte »/« hors ligne » écrits) et rangée **Appart** sur la puissance **résiduelle**, en watts seuls — patch `accueil-trv-witness` (n° 8) |
| `accueil-badges-rebuild.md` | Bandeau de pastilles de l'Accueil reconstruit depuis la version d'origine : Tempo (jour + demain), 2 puissances, prises ; alarmes et contacts retirés, neutre par défaut (couleur = anomalie seule), aligné sur les colonnes — patch `accueil-badges-rebuild` (n° 9) |
| `accueil-plan-hero.md` | Carte Plan déplacée dans l'en-tête (entre date/heure et météo), **fond blanc retiré** — patch `accueil-plan-hero` (n° 3 de la chaîne) |
| `satellites-vocal-son.md` | Satellites vocal/son : ESP32 S3 Box (firmware codecs WAV/FLAC, OTA), Alexa, sidecars Piper/Whisper, drivers `esphome-box`/`alexa` |
| `prise-lave-vaisselle.md` | Renommage prise `0xa4c138bb3c3e1f88` (Lave-Vaisselle) |
| `tablette-lenovo-moli.md` | Tablette kiosque (Fully Kiosk → Moli) |
| `energy-crosscheck.md` | Croisement énergie HA ↔ Moli |
| `security-audit.md` | Audit code malveillant |
| `chauffage-alicia-vanne.md` | Chauffage Alicia : la vanne régule sur son capteur interne, planning natif + 3 automatismes Moli, HA neutralisé (Better Thermostat désactivé) |
| `spot-entree-mouvement.md` | Spot d'entrée sur mouvement : remplace 2 automations HA, `sun is night` au lieu d'un seuil de luminosité inutilisable |
| `patches/` | Patchs du fork dashboard + échantillons config (`*.hainspire`) |

## Protocole sub-agents (Swarm/CrewAI)

- Pour **tout** `delegate_task` : charger le skill `swarm-agent-protocol`.
- Résultat structuré JSON obligatoire : `{status, changed_files, summary, findings, next_action, errors}`.
- Toolsets restreints par rôle (reader/coder/tester/reviewer/debugger/researcher) — jamais tous les outils.
- Handoff chains : ne passer que le JSON du précédent, jamais l'historique complet.
- Max 2 tentatives par sub-agent, puis escalade utilisateur.
