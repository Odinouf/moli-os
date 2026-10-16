# Accueil — heure locale, capteur Salon, entêtes de sections (accueil-heure-salon-sections)

Date : 2026-10-16. Suite de `accueil-tidy` (même branche Accueil, part de son
état). Trois corrections signalées par l'utilisateur :

1. l'heure affichée était décalée de 2 h ;
2. la pièce « Salon » affichait la température du **Capteur Poele** (sonde de
   conduit, 35‑47°) au lieu de la température réelle de la pièce (~25°) ;
3. les **titres** des cartes de section de l'Accueil (Pièces / La semaine /
   Consigne chauffage / …) devaient disparaître.

## Changements

| # | Action | Fichier |
|---|--------|---------|
| T1 | Heure forcée sur `Europe/Paris` : `HOUSE_TZ` exporté et passé en `timeZone` à `clock()`, `longDate()` et à l'heure « Sonos muet » ; `greeting()` lit l'heure via `Intl.DateTimeFormat` en `Europe/Paris` au lieu de `getHours()` (heure de l'appareil) | `web/src/maison/lib/home.svelte.js`, `web/src/maison/pages/Accueil.svelte` |
| S1 | Salon exclut le Capteur Poele de la **moyenne de température** : nouveau helper `tempIgnored(roomName)` (lit `rooms[].temperature_ignore` de `home.json`) appliqué dans les cartes de pièce et la barre Pièces ; le capteur **reste** assigné à Salon (mouvement, etc.) | `web/src/maison/lib/home.svelte.js`, `web/src/maison/ui/RoomCard.svelte`, `web/src/maison/ui/RoomStrip.svelte` |
| H1 | Titres de cartes de section retirés (le `<h2>` et, quand il n'y a plus rien, le `.card-head`) : Pièces, La semaine, Consigne chauffage, Lumières, Clim, Plan, Piscine, Devant la porte, Routines. Les **contrôles fonctionnels** (toggle Affichage, liens « voir tout », status chips, nom des cartes de pièce) sont **conservés** ; un `aria-label` est ajouté sur chaque `<section>` dont le titre visible disparaît (nom accessible préservé) | `pages/Accueil.svelte`, `ui/RoomStrip.svelte`, `ui/WeekWeather.svelte`, `ui/HeatingBar.svelte`, `ui/PlanPreview.svelte`, `ui/PoolCard.svelte`, `ui/Routines.svelte` |

## Mécanisme T1 — pourquoi l'heure était fausse

Le serveur LXC 125 **est** en `Europe/Paris` (vérifié : `date` CEST, `TZ`
d'Europe/Paris, `date -u` = heure UTC). Le décalage venait du **rendu** : les
formatters appelaient `toLocaleTimeString(locale())` **sans `timeZone`**, donc le
navigateur rendait l'heure du fuseau de l'appareil affichant (la tablette du salon
est en UTC → −2 h). Correctif : forcer `timeZone: HOUSE_TZ` partout où l'heure est
rendue. Nommé `HOUSE_TZ` (et non `LOCAL_TZ`) parce que c'est le fuseau de la
maison, pas celui de l'appareil.

## Mécanisme S1 — exclusion par pièce, pas suppression

Le capteur Poele (`hue:27cc7345-…`, SML001, sonde de conduit) est le **seul**
capteur de température assigné à Salon dans `data/labels.toml` ; il lit la chaleur
du conduit (35‑47°). Le vrai capteur ambiant (`sensor.room_thermostat_air_temperature`,
25,2°) est un appareil **Z‑Wave JS** — Moli n'a **pas** de driver Z‑Wave
(cf. `notes/zwave-moli.md`), il est donc **invisible** côté Moli.

Décision (utilisateur) : ne pas retirer le capteur Poele (utile pour le
mouvement), mais **l'exclure de la moyenne**. Mécanisme générique et réutilisable :
liste d'exclusion par pièce dans `home.json`.

- `lib/home.svelte.js` : `tempIgnored(roomName)` → `Set` des ids à ignorer
  (`rooms[].temperature_ignore`).
- `RoomCard` / `RoomStrip` filtrent `!skip.has(d.id)` avant la moyenne.
- La **moyenne** ne contient plus la sonde ; s'il ne reste aucun capteur mesurable,
  la pièce affiche `maison.accueil.sans_mesure` (« pas de mesure »), déjà gérée.

## Données (hors patch, volontaire)

`data/` est **gitignoré** (state vivant). L'entrée Salon de `data/home.json`
porte désormais :

```json
{ "name": "Salon", "temperature_ignore": ["hue:27cc7345-444e-4bfb-86e2-184fdf6e6675"] }
```

Repro (idempotent) :

```sh
python3 - <<'EOF'
import json
p="data/home.json"; d=json.load(open(p))
for r in d["rooms"]:
    if r["name"]=="Salon":
        r["temperature_ignore"]=["hue:27cc7345-444e-4bfb-86e2-184fdf6e6675"]
json.dump(d, open(p,"w"), ensure_ascii=False, indent=2)
EOF
```

## Non-régression

- `DOCKER_BUILDKIT=1 docker compose build` puis `docker compose up -d`
  (web embarqué rust-embed ; build web seul validé d'abord via `--target web`).
- `/api/health` : `drivers_running` 9/9, `journal_failures` 0, `guard.dashboard`
  trusted, 72 appareils / 496 points.
- `docker run --rm -v /opt/moli-os/data:/data moli-os:latest check-config -c /data/moli.toml`
  → « configuration OK (7 driver(s)) ».
- Catalogues fr/en : **218 / 218** clés, parité stricte (aucune clé orpheline ;
  les 2 clés devenues mortes `maison.accueil.plan` / `maison.accueil.piscine` ont
  été retirées, cf. findings ci-dessous).
- `git apply --check /tmp/accueil-heure-salon-sections.patch` sur la base pré-édition
  → **OK** ; application reproduit **à l'identique** les 11 fichiers live
  (`diff -rq` : « IDENTICAL TO LIVE »).

## Preuves visuelles (live, navigateur sur `http://192.168.1.125:8790`)

- En-tête : « Vendredi 16 octobre / Bonsoir / **21:56** » — heure correcte (CEST).
- Pastille Pièces : « **Salon pas de mesure** » (plus de 35°) ; les autres pièces
  gardent leur température : VMC+SDB 22,5°, Alicia 25,9°, Parents 21,8°,
  Appartement 23,4°.
- Cartes de pièce : températures 22,5 / 25,9 / 21,8 / 23,4 — **plus** de valeur de
  conduit ; le nom de chaque pièce (h2) est conservé.
- Section « Lumières » : toggle Affichage + lien « Toutes les pièces » + ambiance,
  **sans** titre ; le Capteur Poele apparaît toujours sur le plan 3D (33,1°) —
  c'est le plan, pas la moyenne de la pièce.
- Cartes La semaine / Piscine / Devant la porte / Plan : contenu intact, **sans**
  titre.

## Ordre / supersession

Patch `accueil-heure-salon-sections` : **après** `accueil-tidy` (part de son état).
Il ne remplace aucune de ses décisions ; il ajoute le fuseau maison, l'exclusion
par pièce et retire les titres de sections.

## Revue de code (auto-checklist)

| # | Point | Résolution |
|---|-------|-----------|
| 1 | `tempIgnored` référence `home` — portée ? | `home` est le `$state` exporté en tête de `lib/home.svelte.js` (ligne 9) ; le helper est au même scope module → OK |
| 2 | Suppression des `<h2>` : contrôles voisins conservés ? | Vérifié : toggle Affichage, liens « voir tout », chips de statut Piscine et lecture « dans la pièce » du chauffage sont **conservés** |
| 3 | CSS orphelin `.card-head h2` après retrait des `<h2>` | Le retrait des `<h2>` (WeekWeather, HeatingBar, PlanPreview, PoolCard, Routines, RoomStrip) est fait ici, mais la purge du CSS `.card-head h2` resté orphelin est **reportée au patch suivant** (`accueil-plan-frigate`, qui la retire de `PlanPreview`, `WeekWeather`, `PoolCard`, `RoomStrip`, chacune n'ayant plus de `h2`). |
| 4 | Le nom des cartes de pièce disparaît-il par erreur ? | Non : les `RoomCard` gardent leur `<h2>{room.name}` (portée H1 = sections, pas pièces) |
| 5 | Faut-il un driver Z-Wave pour le vrai capteur ? | Hors périmètre (cf. `notes/zwave-moli.md`, postponed) ; le mécanisme d'exclusion rend le fix indépendant du capteur |
| 6 | `data/home.json` dans le patch ? | Non, hors patch (state gitignoré) ; snippet de repro fourni ci-dessus |

## Revue de code externe (findings)

Sept points remontés après le premier build ; traitement :

| # | Finding | Résolution |
|---|---------|-----------|
| F1 | `readLook(key, fallback)` toujours renvoyait le `fallback` (bug UX) | **Dismissed** — `readLook`/`saveLook` n'appartiennent qu'au **brouillon** `accueil-tidy` « 2e passe », non déployé et non conservé (live = `lightsCompact`/`setLightsCompact`) ; à corriger si ce brouillon est un jour promu. |
| F2 | `accueil-heure-salon-sections.patch` en conflit avec `accueil-tidy` (le patch repo régénéré divergait du live) | **Resolved** — le `accueil-tidy.patch` du working tree était un brouillon non déployé ; réverté sur la version committée (b731e87) qui **correspond au live**. Le présent patch est cohérent avec ce tidy committé. |
| F3 | `AGENTS.md` §5 : ordre des patches s'arrêtait à `accueil-tidy` | **Resolved** — §5 mis à jour, ajout `→ accueil-heure-salon-sections` (aligné sur README.md). |
| F4 | `PoolCard.svelte` : `import Icon` devenu mort (plus de `<Icon>`) | **Resolved** — import retiré. |
| F5 | `Accueil.svelte` : `litCount` devenu inutilisé après retrait du `<h2>` | **Resolved** — déclaration `const litCount = …` retirée. |
| F6 | a11y : sections Lumières/Clim/Devant la porte/Routines sans nom accessible après retrait du `<h2>` | **Resolved** — `aria-label` ajouté (`maison.accueil.lumieres`, `.clim`, `.devant_porte`, `automatismes.routines.titre`). |
| F7 | i18n : `maison.accueil.plan` / `maison.accueil.piscine` orphelins | **Resolved** — clés retirées des 2 catalogues (fr/en → 218/218). `automatismes.routines.titre` **conservée** (désormais utilisée comme `aria-label` de Routines). |

Ces résolutions sont **incluses dans le patch** (11 fichiers) et dans le build
vérifié ci-dessus.
