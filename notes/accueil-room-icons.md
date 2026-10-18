# Accueil — icônes de pièce selon leur fonction (accueil-room-icons)

> ⚠️ **Legacy / superseded (2026-10-18).** Le contenu de ce patch
> (`accueil-room-icons.patch` : icônes `mdiHomeCityOutline`/`mdiBottleWineOutline`)
> est **déjà inclus verbatim** dans `tablette2025-parity.patch` (base courante).
> **Ne pas appliquer** `accueil-room-icons.patch` par-dessus la parité. Note conservée
> pour l'historique. Voir `notes/tablette-2025-parity.md`.

Date : 2026-10-17. Suite de `accueil-tempo` (même branche Accueil, part de son
état déployé sur le CT125). Demande utilisateur : **faire correspondre les
icônes des cartes de pièce à leur fonction** — toutes tombaient sur l'icône
générique `home`.

## Constat (cause racine)

`web/src/maison/lib/home.svelte.js` → `roomList()` :

```js
icon: defs.find((r) => r.name === name)?.icon ?? 'home',
```

L'icône de pièce vient du champ **`icon`** de `data/home.json` (`home.config.rooms[]`).
Aucune pièce n'avait de champ `icon` → toutes retombaient sur le repli `'home'`.
C'est de la **donnée de configuration** (pas du code) + un **complément du
bundle** pour deux icônes absentes.

## Changements

| # | Action | Fichier |
|---|--------|---------|
| R1 | Champ `icon` ajouté à chaque pièce | `data/home.json` |
| R2 | Deux icônes ajoutées au bundle (`home-city`, `bottle-wine`) — imports `@mdi/js` + entrées du map | `web/src/maison/lib/icons.js` |

Mapping retenu (validé par l'humain) :

| Pièce | `icon` | MDI |
|-------|--------|-----|
| Salon | `sofa` | `mdiSofaOutline` (déjà présent) |
| VMC + SDB | `shower-head` | `mdiShowerHead` (déjà présent) |
| Alicia | `bed-outline` | `mdiBedOutline` (déjà présent) |
| Parents | `bed-king-outline` | `mdiBedKingOutline` (déjà présent) |
| Appartement | `home-city` | `mdiHomeCityOutline` (**ajouté**) |
| Cave à Vins | `bottle-wine` | `mdiBottleWineOutline` (**ajouté**) |
| Piscine | `pool` | `mdiPool` (déjà présent) |

`mdiHomeCityOutline` et `mdiBottleWineOutline` font partie de `@mdi/js` ^7.4.47
(épinglé dans `web/package.json`) : noms vérifiés dans le paquet amont.

## Tracé du patch

Patch fork : `notes/patches/accueil-room-icons.patch` (n'édite que
`web/src/maison/lib/icons.js` ; le reste est de la donnée dans `home.json`,
non versionné). `git apply --check` sur la base pré-édition → **OK** ;
application reproduit **à l'identique** le fichier live (`diff -q`).

## Vérification (live `http://192.168.1.125:8790`)

- Build `DOCKER_BUILDKIT=1 docker compose build` (web vite + rust, bundle
  embarqué rust-embed) puis `docker compose up -d --force-recreate`.
- `GET /api/home` → `rooms[].icon` = mapping ci-dessus ; aucune pièce à `null`.
- Accueil (`/`) : chaque carte de pièce (`.room-icon`) rend l'icône attendue
  (snapshot DOM + attributs `path` MDI non-vides).
- Page Pièces (`#/pieces`) : mêmes icônes (consomme `roomList()`).
- Non-régression : `check-config` OK, `/api/health` drivers `running`,
  `journal_failures: 0`.

## Rollback

1. `cp data/home.json.bak-roomicons data/home.json` (retire les `icon`).
2. `git apply -R notes/patches/accueil-room-icons.patch` (retire les 2 icônes
   du bundle) — ou `cp web/src/maison/lib/icons.js.bak-roomicons …`.
3. Rebuild image.

## Ordre / supersession

S'applique **après** `accueil-tempo`. Ne remplace aucune décision antérieure :
il ne fait qu'attribuer une icône de fonction aux pièces (avant : repli `home`
uniforme). Ordre complet (AGENTS.md §5) :
`accueil-ha-inspire` → `accueil-clim-conditional` → `accueil-sections` →
`accueil-tidy` → `accueil-heure-salon-sections` → `accueil-plan-frigate` →
`accueil-arrows-heat` → `accueil-motion-colonnes` → `accueil-tempo` →
**`accueil-room-icons`**.
