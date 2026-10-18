# Accueil — échelle des pins du Plan (2026-10-18)

Patch : `notes/patches/accueil-plan-scale.patch` (à appliquer **après**
`tablette2025-parity.patch`).

## Problème

Sur l'Accueil, la carte « Plan » (`PlanPreview`) est dans la colonne droite étroite
(~436 px au 1280×800 kiosque). Trois causes se cumulaient et rendaient les lectures
(température/puissance) illisibles :

1. **Taille fixe** : `.dot` 28 px (icône 13 px) et `.reading` **10 px**.
2. **`line-height: 0`** hérité de `.frame` : chaque pastille de lecture était écrasée à
   une hauteur de **4 px** (texte débordant de la capsule) — c'est la cause principale de
   l'illisibilité. Corrigé par `line-height: 1.4` (pastille 19 px).
3. **`overflow: hidden`** sur `.frame` : une lecture en bas du plan était **rognée** par
   le bord. Corrigé en retirant le clip (arrondi porté par l'`<img>`), la pastille peut
   alors déborder dans le rembourrage de la carte.

Plus plusieurs jetons se recouvraient (2 paires mesurées à moins de 28 px sur 16).

## Correctif (marqueurs seulement ; hauteur d'image légèrement relevée)

Fichier : `web/src/maison/ui/PlanPreview.svelte`. Aucune modification de la grille de
l'Accueil (`sections`/`col`) ni de `PlanOverlay` ; la seule incidence de mise en page est
le `max-height` de l'image (voir dernière ligne), qui peut faire grandir la carte quand
la colonne est large.

| Critère | Changement |
|---|---|
| C1 | `.reading` : `font-size` 10 → **12 px**, `line-height: 1.4` (hauteur 4 → **19 px**), `padding` 1/5 → 1/6, `margin-top` 2 → 3 |
| C2 | `.dot` : 28 → **34 px**, icône `<Icon>` 13 → **16 px**, halos `--warm-glow` (4→5 px, 18→22) et pulse alarme (8→10 px) proportionnés |
| C3 | Anti-chevauchement : relaxation déterministe en pixels de la carte (200 itérations ; ressort vers la position vraie `0.03`, répulsion si distance < `SEP=38 px`, amorti `0.6`). Mesure via `bind:clientWidth/clientHeight` sur l'`<img>` |
| — | `.frame` : `overflow: hidden` retiré ; arrondi porté par `.frame img` (plus de rognage des lectures au bord) |
| — | `.frame img` : `max-height` 240 → **360 px** — **effet de mise en page assumé** : sur une carte large, l'image (et donc la carte) devient plus haute, dans la limite de la colonne |

### Déplacement induit (C3)

La relaxation ne déplace un jeton que s'il est à moins de `SEP=38 px` d'un voisin ; chaque
paire se sépare de moitié, donc le déplacement d'un jeton est **borné par `SEP/2 = 19 px`**.
Mesure sur le plan courant (16 jetons, 1280×800) : **déplacement maximal ≈ 11 px** —
nettement moins d'une pièce, le jeton reste dans la zone qu'il désigne. Pas de trait de
rappel (leader line) nécessaire à cette échelle.

### Recalcul

La relaxation ne dépend que de la **géométrie** (positions des appareils + taille de
l'image), pas de leur état vivant : le bloc lit `spots` (positions brutes) et non les
appareils ; chaque `deviceOf(id)` est résolu **dans le markup**. Un tick de température
ne relance donc pas la relaxation.

## Preuves

- `git apply --check /tmp/accueil-plan-scale.patch` dans `/opt/moli-os` → **OK**.
- `docker compose build` → **OK** ; `docker compose up -d --force-recreate`.
- `GET /api/health` → `journal_failures: 0`, `drivers_running: 14/14`.
- Bundle servi `assets/index-CqcfstSL.js` contient bien la relaxation (`ITERS=200`,
  `Math.hypot` + garde `dist<1e-6 && (dx=1,dist=1)`, ressort/amorti).
- Mesure DOM live au 1280×800 : `.dot` **34 px**, `.reading` **12 px / 19 px de haut**,
 16 jetons, **distance minimale 37,6 px**, **0 recouvrement** ; `.frame` `overflow: visible`.
- Captures : `element-2026-10-18T13-37-18-490Z.png` (avant, pastilles 4 px illisibles) vs
  `element-2026-10-18T14-48-28-168Z.png` (après : `25,9° / 19,6° / 20,4° / 20,8° / 24,8° /
  23,4° / 15,1° / 29 W` pleinement lisibles, aucune rognée, jetons disjoints).
- Layout : `sections` reste 2 colonnes ≥1100 px, 1 colonne <760 px (mesuré à 1280/1600/700 px) ;
  `PlanOverlay` et le reste de l'Accueil inchangés. Le relevé de `max-height` fait seulement
  grandir la carte Plan sur les colonnes larges.
- Cas limite : deux jetons exactement superposés sont séparés par un pas unitaire
  (direction `(1,0)`), sans division par une distance quasi nulle — plus de projection
  vers le bord de l'image.

## Rollback

```sh
ssh moli-os 'cd /opt/moli-os && git apply -R /tmp/accueil-plan-scale.patch'
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d --force-recreate'
```

## Hors périmètre

`PlanOverlay` (carte températures) n'est pas touchée (option A limitée à `PlanPreview`).
