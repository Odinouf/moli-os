# Infra Moli — la page `#/infra` alimentée pour le CT125

Relevé et mise en service : 2026-10-22.

**Objet.** La page `Infra` du dashboard (`web/src/maison/pages/Infra.svelte`) affiche les
machines de la maison. Elle ne lisait rien : aucune carte Serveur, et `/api/infra`
répondait `404 no host measurement yet (data/infra.json)`. Cette note couvre la mise en
service **du seul LXC `moli-lab` (CT125)** — pas de PC, pas de box, pas de sauvegardes
(Proxmox s'en charge).

## Ce qui a été changé

| Élément | Où | Rôle |
|---|---|---|
| Bloc `[[driver]] id = "moli-lab" kind = "host"` | `data/moli.toml` | le pilote `host` publie l'appareil « Serveur de la maison » |
| `pid: host` + montages `/proc:/host/proc:ro`, `/sys:/host/sys:ro` | `compose.override.yaml` | faire lire au conteneur le `/proc` du **CT**, pas celui du PVE |
| `notes/patches/infra-host.py` (source) → `/usr/local/bin/moli-infra` | dépôt + CT | écrit `data/infra.json` et surveille `/api/health` |
| `/etc/cron.d/moli-infra` | CT | lance le script chaque minute |

Sauvegardes faites avant écriture : `data/moli.toml.bak-infra-20261022-133435`,
`compose.override.yaml.bak-infra-20261022-133435`.

## 1. Le piège du `/proc` (le vrai sujet)

Le conteneur `moli-os` a un namespace de PID privé : son `/proc` est un procfs privé, et
`/proc/meminfo` / `/proc/cpuinfo` y décrivent **le PVE**, pas le CT. Mesures prises :

| Vue | `MemTotal` | `cores` |
|---|---|---|
| conteneur `moli-os` sans réglage | 15 745 140 kB (**15 Go**) | **16** |
| CT125 `moli-lab` | 2 097 152 kB (**2 Go**) | **4** |

Le pilote `host` aurait donc affiché les 15 Go du PVE sur la page du CT : faux, et sans
moyen de le deviner.

Binds seuls (`-v /proc:/host/proc:ro`) : **insuffisant**, Docker re-résout le `/proc` du
conteneur. Test fait : le montage rendait encore 15 Go / 16 cœurs.

Solution retenue — **`pid: host`** dans le service `moli-os` (`compose.override.yaml`) :

```yaml
services:
  moli-os:
    env_file:
      - moli.env
    pid: host
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
```

avec, côté config :

```toml
[[driver]]
id = "moli-lab"
kind = "host"

[driver.options]
name = "moli-lab"
root = "/host"
```

`root = "/host"` fait lire au pilote `/host/proc` et `/host/sys`. `/proc` est monté sous
`/host/proc` parce que le pilote joint `root + "proc"`.

⚠️ `pid: host` donne au conteneur la vue des processus du CT. C'est ce que demande la
mesure ; si on le retire, la page se remet à mesurer le PVE.

`pid: host` **plus** le bind est nécessaire : le bind seul donne un `/proc` où lxcfs ne
sait plus à quel conteneur il répond (`uptime` = 0, `ram_total` = 0,1 Go, mémoire fausse).
Les deux ensemble donnent les bonnes valeurs.

## 2. Le script `moli-infra`

Source versionnée : `notes/patches/infra-host.py`. Posée sur le CT :

```sh
cat notes/patches/infra-host.py | ssh moli-os 'cat > /usr/local/bin/moli-infra && chmod 755 /usr/local/bin/moli-infra'
```

Hors de `/opt/moli-os` **exprès** : il survit aux montées de version (§6 de `AGENTS.md`).

Python 3 stdlib seulement (`http.client`, `socket`, `os`, `json`, `subprocess`,
`urllib`). Aucune dépendance, aucun binaire `docker` : tout passe par **l'API Docker sur
son socket Unix** `/var/run/docker.sock`, version d'API lue au `GET /version`
(`MinAPIVersion`, ici `1.41`). Le choix API plutôt que CLI : JSON natif (pas de
`"1.32%"` / `"17.59MiB / 128MiB"` à parser), un seul processus par minute au lieu d'un
`docker inspect` par conteneur et par disque, et deux relevés CPU fournis par l'API
(`cpu_stats` / `precpu_stats`) — inutile de garder un échantillon précédent.

Endpoints utilisés :

| Endpoint | Pour quoi |
|---|---|
| `GET /version` | `MinAPIVersion` (négociation) |
| `GET /v{X}/containers/json?all=1` | la liste, nom, image, état, statut |
| `GET /v{X}/containers/{id}/stats?stream=false` | `cpu` et mémoire |
| `GET /v{X}/containers/{id}/json` | `State.Health.Status` |
| `POST /v{X}/containers/moli-os/restart?t=10` | redémarrage après 2 échecs de santé |

Calculs :
- `cpu` = `Δ cpu_usage.total_usage / Δ system_cpu_usage × nb cœurs × 100`, arrondi à 0,01.
- `memory` = `memory_stats.usage − memory_stats.stats.inactive_file` (l'ensemble de
  travail : sans retirer `inactive_file`, `moli-os` afficherait 24,8 Mo au lieu de 12,2 Mo,
  le page cache comptant dedans).
- `health` : `State.Health.Status` ; `null` quand le conteneur n'a pas de healthcheck
  (`moli-os` n'en a pas — c'est volontaire, voir `docs/components/exploitation.md`).
- `disks` : `statvfs("/")` seulement (`/var/lib/docker` et `data/` sont le même FS, trois
  lignes identiques n'apprendraient rien).
- `failed` : `systemctl --failed --plain --no-legend`, noms de `.service`.
- `backups` : toujours `[]` — hors périmètre, Proxmox gère ses propres sauvegardes.

Écriture **atomique** : fichier temporaire dans `data/`, `chmod 644`, `chown 1000:1000`,
puis `os.replace`. Aucun lecteur ne voit jamais un JSON tronqué.

### Schéma émis (`data/infra.json`)

```json
{
  "ts": 1792668789019,
  "containers": [
    { "name": "moli-os", "image": "moli-os:latest", "state": "running",
      "status": "Up About an hour", "health": null, "cpu": 0.21, "memory": 9039872 }
  ],
  "disks": [
    { "label": "Système", "path": "/", "used": 15811997696, "total": 20957491200,
      "free": 5145493504, "percent": 75.4 }
  ],
  "backups": [],
  "failed": [],
  "health": { "ok": true, "last_restart": 1792668189000, "restarts": 1, "paused": false }
}
```

`ts` en millisecondes : la page passe en « relevé ancien » au-delà de 5 min.
Les quatre tableaux sont **toujours présents**, même vides — `Infra.svelte` lit
`infra?.backups ?? []` mais `infra.disks` sans garde.

`health` dit ce que le watchdog sait de **ce passage** : `last_restart` (ms, `null` si
jamais), `restarts` (total depuis l'installation), `paused` (drapeau `/var/lib/moli-infra/pause`)
et `ok` (aucun redémarrage dans les 10 dernières minutes). Sans lui, un redémarrage par
surveillance ne laisse **aucune trace lisible** : le hub qui redémarre ne journalise pas son
propre redémarrage, et l'humain ne voit qu'un trou dans les courbes 6 h de `#/infra`.

## 3. Surveillance de santé et redémarrage (C3)

`docs/components/exploitation.md` (l. 145-147) : pas de `healthcheck` Docker (0,13 % de
CPU pour rien) ; mieux vaut interroger `/api/health` **depuis l'hôte par cron** et
redémarrer **après deux échecs**.

C'est ce que fait le même script :

1. `GET http://127.0.0.1:8790/api/health` (timeout 5 s).
2. Échec → compteur `/var/lib/moli-infra/health-fails` incrémenté.
3. **2 échecs consécutifs** → `POST /containers/<id>/restart?t=10`, compteur remis à 0,
   horodatage dans `/var/lib/moli-infra/last-restart` et total dans `restarts`.
   L'horodatage et le compteur ne sont écrits **qu'après un `POST` réussi** : un
   redémarrage qui échoue (404, socket mort) laisse le compteur en place pour que le
   passage suivant réessaie, au lieu de brûler le délai de garde et de laisser le hub
   à terre dix minutes de plus.
4. **Garde anti-boucle** : au plus **un redémarrage par 10 min** (`RESTART_COOLDOWN`) —
   sans elle, une instance qui ne démarre pas serait relancée toutes les deux minutes.
5. Succès → compteur remis à 0.
6. **Verrou d'exécution** : `flock` exclusif sur `/var/lib/moli-infra/lock` pour tout le
   passage. Le cron tire toutes les 60 s alors qu'un passage fait un `stats` par conteneur
   actif plus un `systemctl --failed` (10 s) : sans verrou, deux passages se marchaient
   dessus dans `STATE_DIR` (même panne comptée deux fois → redémarrage sur un seul échec
   réel, et deux écrivains sur `infra.json`). Un second passage sort en silence.
7. **Conteneur résolu par son nom une fois par passage** (`/containers/json?all=1`), pas
   adressé par son nom dans l'URL : un projet compose renommé (`--project-name`, second
   stack) rendait chaque appel du watchdog en 404 que personne ne lit. L'id est mémorisé
   et, s'il est introuvable, une ligne explicite le dit et le watchdog s'abstient.
8. La santé est vérifiée **avant** la mesure, pour que le `health` du JSON décrive bien
   le passage courant.

### Ce que le watchdog ne redémarre pas

Un conteneur **arrêté exprès** n'est pas une panne : il ne faut surtout pas le relancer au
milieu d'un restore. `AGENTS.md` §8 impose `docker compose stop moli-os` → `docker run …
restore` → `start` ; deux minutes plus tard le cron aurait relancé Moli sur une base en
cours de restauration. Avant de compter un échec, le script lit
`GET /containers/<id>/json` (l'id résolu au début du passage) et laisse tranquille :

- `State.Running == true` mais `/api/health` muet → **c'est une panne**, on compte ;
- conteneur arrêté avec `ExitCode` **0 ou 143** et `OOMKilled == false` → **arrêt
  volontaire**, compteur remis à 0, aucun redémarrage ;
- `OOMKilled` ou `Dead`, ou tout autre code de sortie (137 = `kill`) → **panne**, on compte.

Filet de sécurité pour les maintenances qui ne passent pas par un `stop` :

```sh
touch /var/lib/moli-infra/pause     # gèle la surveillance
rm /var/lib/moli-infra/pause        # la rend
```

Présent, le drapeau remet le compteur à 0 et ne redémarre rien.

Enfin, la santé est surveillée **avant** la mesure Docker : la sonde n'a besoin que de Moli,
donc un démon Docker absent (redémarrage, pull, socket) n'empêche plus le watchdog de juger
et de réparer le hub. La mesure, elle, échoue séparément et laisse `infra.json` intact plutôt
que de l'écraser avec un relevé vide.

## 4. Cron

```sh
mkdir -p /var/lib/moli-infra
printf '%s\n' \
  'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' \
  '* * * * * root /usr/local/bin/moli-infra' > /etc/cron.d/moli-infra
chmod 644 /etc/cron.d/moli-infra && systemctl restart cron
```

`PATH` explicite : le cron de `cron.d` n'hérite pas d'un PATH de shell.

## Preuves (2026-10-22)

**C1 — le serveur dit la vérité du CT**

```
state: cores=4  cpu=8  cpu_temperature=51  disk_temperature=41  load=0.8
       ram=25  ram_total=2.0  ram_used=0.5  swap=3  uptime=150840
CT   : MemTotal 2097152 kB ; /proc/uptime 150874 ; cores 4
      hwmon4 (k10temp) 48500 ; hwmon2 (nvme) 40850
```
`uptime` 150840 vs 150874 = décalage d'un cycle de sondage (15 s). Contre-preuve du bug :
sans `pid: host`, le même appareil annonçait `cores=16`, `ram_total=15`, `ram=70`.

**C2 — `/api/infra`**

```
GET /api/infra → 200
age du relevé : 47 s
moli-os     running  health=null      cpu 0,21 %  9 Mo
moli-piper  running  health=healthy   cpu 0     187 Mo
moli-whisper running health=healthy   cpu 0     168 Mo
disks: Système /  15 Go / 20 Go  75,4 %
backups: []   failed: []
```

**C3 — redémarrage et garde**

```
docker kill moli-os    (ExitCode 137, panne)
moli-infra (1er passage) → fails=1
moli-infra (2e passage)  → « 2 failed health checks, restarting moli-os », last-restart écrit
docker inspect → Running=true
--- garde anti-boucle (redémarrage récent) :
docker stop moli-os ; moli-infra ×2 → « moli-os STILL STOPPED » (fenêtre 10 min)
--- arrêt volontaire (ExitCode 0, restore/maintenance) :
docker stop -t 15 moli-os ; moli-infra ×3 → Running=false, fails=0 (aucun redémarrage)
--- socket Docker absent :
MOLI_DOCKER_SOCK=/nonexistent.sock moli-infra → « measurement failed », exit 1,
  mais watch() a tourné (fails absent = hub sain)
--- retour à la normale :
docker start moli-os ; moli-infra → fails=0
```

**C4 — disque** : 75,4 % sous les seuils 85/93 de `Infra.svelte` → aucune alerte.

**C5 — zéro faux positif** : `/api/health` → `journal_failures: 0`, 16 pilotes / 16 en
marche ; `failed: []` alors que `systemctl --failed` ne renvoie rien ; bandeau de la page
« **Tout va bien** ».

**C7 — non-régression**

```
docker exec moli-os /moli-os check-config → configuration OK (14 driver(s))
docker compose up -d → moli-os recréé, moli-piper et moli-whisper « Running » (voix intacte)
/api/health → drivers 16, drivers_running 16, journal_failures 0, devices 88
```

Page `#/infra` en 1280×900 (capture `work/infra-1280.png`) : carte `moli-lab` avec les
quatre jauges (Processeur 37 %, Mémoire 25 % « 0,5 / 2 Go », Température 51°, Disque 75 %
« 4,8 Go libres »), deux courbes 6 h, les 3 conteneurs avec leur pastille, « Disques et
sauvegardes → Système / 15 Go / 20 Go », et la carte Moli (16 / 16 pilotes).
Une seule erreur console : `404 /api/bench`, **préexistante** (elle apparaît aussi sur
l'Accueil ; `data/bench.json` est produit par un script de mesure hors dépôt, cf.
`docs/PERFORMANCE.md`).

## Rollback

```sh
ssh moli-os 'cd /opt/moli-os && cp data/moli.toml.bak-infra-20261022-133435 data/moli.toml \
  && cp compose.override.yaml.bak-infra-20261022-133435 compose.override.yaml \
  && docker compose up -d'
ssh moli-os 'rm -f /etc/cron.d/moli-infra /usr/local/bin/moli-infra /opt/moli-os/data/infra.json \
  && rm -rf /var/lib/moli-infra && systemctl restart cron'
```

La page retombe alors sur son message « le relevé n'est pas encore là », sans erreur.

## Ce qui n'est pas couvert (assumé)

- **Ordinateurs de la maison** (`host.options.machines`, Wake-on-LAN, agent) : aucune
  machine déclarée — hors périmètre de cette mise en service.
- **Box internet** (`igd`) : la Bbox Fast5330b de `192.168.1.247` ne répond **pas** en
  UPnP (aucune réponse `InternetGatewayDevice` ni `upnp:rootdevice` ; `gatedesc.xml`
  redirige vers `mabbox.bytel.fr/login.html`). Le pilote `igd` ne la trouvera pas. Son API
  REST LAN répond sans jeton (`GET https://mabbox.bytel.fr/api/v1/wan/ip` → IP publique
  `176.181.121.231`, `/api/v1/wan/ip/stats` → compteurs) mais l'exploiter demanderait un
  **nouveau pilote Rust**, pas une configuration.
- **Sauvegardes** : `backups: []` volontairement ; Proxmox sauvegarde le CT.
