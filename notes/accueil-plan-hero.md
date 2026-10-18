# Accueil — carte Plan déplacée dans l'en-tête (accueil-plan-hero)

Date : 2026-10-18. Patch : `notes/patches/accueil-plan-hero.patch` (appliqué **après**
`accueil-plan-scale.patch` par convention d'ordre — **fichiers disjoints**, ce n'est pas une
dépendance : `accueil-plan-scale` ne touche que `PlanPreview.svelte`, `accueil-plan-hero` que
`Accueil.svelte` + `SkyHero.svelte`).

## Objet

Sortir l'aperçu **Plan** (`PlanPreview`) de la colonne droite et le poser **dans l'en-tête**
(`SkyHero`), horizontalement **entre la date/heure** et **la carte météo**. Le fond blanc de
la carte (surface + ombre + padding) est **supprimé** : le plan se tient directement sur la
page, ce qui gagne de la hauteur et rend l'ensemble moins lourd.

## Ce que le patch change

| # | Fichier | Changement |
|---|---|---|
| C1 | `web/src/maison/pages/Accueil.svelte` | `<SkyHero />` → `<SkyHero><PlanPreview /></SkyHero>` ; `<PlanPreview />` **retiré** de la colonne droite (plus de doublon) |
| C2 | `web/src/maison/ui/SkyHero.svelte` | `let { children } = $props();` + rendu `{#if children}<div class="hero-plan">{@render children()}</div>{/if}` entre `.hello` et `.sky` |
| C3 | `web/src/maison/ui/SkyHero.svelte` | `.hello { flex: none }` : la date/heure ne se fait plus comprimer (plus de « Dimanche 18 / octobre » sur deux lignes) |
| C4 | `web/src/maison/ui/SkyHero.svelte` | `.hero-plan` : `flex: 1 1 auto` (occupe l'espace libre) + `display: grid; place-items: center` |
| C5 | `web/src/maison/ui/SkyHero.svelte` | `.hero-plan :global(.plan)` : `max-width: 436px` (largeur = celle de l'ancienne carte) ; `background: none; box-shadow: none; padding: 0` — **fond blanc retiré** |
| C6 | `web/src/maison/ui/SkyHero.svelte` | `.hero-plan :global(.frame img)` : `filter: drop-shadow(...)` — le plan nu garde une ombre douce pour se détacher de la page |
| C7 | `web/src/maison/ui/SkyHero.svelte` | `@media (max-width: 760px)` : `.hero-plan { flex: none }` — en colonne, le plan ne s'étire pas verticalement |

`PlanPreview.svelte` **n'est pas modifié** : les 16 pastilles, la relaxation anti-chevauchement
(`SEP=38`, 200 itérations) et les lectures restent telles quelles.

## Mécanique de hauteur

- `.hero` est un flex row ; en insérant le plan, c'est **l'en-tête** qui grandit, pas la
  grille `sections` en dessous (d'où « décale le contenu » mais en **hauteur seulement**, d'un
  seul bloc — pas de décalage en cascade).
- La largeur du plan est **bornée** (`max-width: 436px`) pour que l'en-tête ne grandisse que
  de la hauteur du plan (~200 px d'image), au lieu de prendre toute la largeur libre.
- Sans le fond blanc ni le padding (C5), cette croissance est **~58 px** mesurée
  (`.hero` 160 → 218 px), au lieu de ~150 px avec la carte complète.

## Preuves (CT125, `http://192.168.1.x:8790`, navigateur 1280×800)

- `docker compose build` OK ; `up -d --force-recreate`.
- `GET /api/health` → **14/14** drivers `running`, `journal_failures: 0`.
- DOM à 1280×800 :
  - `document.querySelectorAll('.plan').length` = **1** (plus de doublon) ; **16** `.pin`.
  - `.hero` = `{x:112, y:28, w:1132, h:218}` ; `.plan` = `{x:287, y:34, w:400}` ;
    `.hero .sky` = `{x:703, …}` → `plan.x > hello.x+hello.w` (260) **et**
    `plan.x+plan.w < sky.x` (703). Plan **entre** date/heure et météo.
  - `.plan` : `background-color: rgba(0,0,0,0)`, `padding: 0px`, `box-shadow: none`
    → **fond blanc retiré**.
  - `.dot` = **34 px**, `.reading` = **12 px** ; **16** pastilles ; distance minimale entre
    jetons = **38 px** (≥ `SEP`), **0** recouvrement.
  - Métadonnées `.hero .sky` : clic → ouverture de `SkyDetail` (`Prévisions`/`Heures`
    présentes dans le DOM) → météo intacte.
- Responsive 700 px : `.hero` en colonne, `.plan` à `{x:134,y:91,w:436,h:230}` empilé
  **au-dessus** de `.sky` ; `document.documentElement.scrollWidth == clientWidth` (700)
  → **pas de débordement horizontal**.
- Captures avant/après dans `.playwright-cli/` (dont
  `page-2026-10-18T16-39-56-861Z.png` : en-tête date/heure · plan nu · météo).
- Patch : `git apply --check` (inverse) sur le live → **OK** ; application forward sur les
  deux fichiers pré-changement → **identique** au rendu live (`diff -rq` : identical).

## Rollback

```sh
ssh moli-os 'cd /opt/moli-os && git apply -R /tmp/accueil-plan-hero.patch'
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d --force-recreate'
```

## Hors périmètre

`PlanPreview.svelte` (pastilles, relaxation) et `PlanOverlay` ne sont pas touchés. Le reste de
l'en-tête (`SkyHero`) garde son comportement (météo cliquable, dégradé carte). La largeur du
plan reste plafonnée à 436 px (celle de l'ancienne carte de colonne).
