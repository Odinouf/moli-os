# Dashboard — retirer la section « Climatisation » de l'Accueil

**Date :** 2026-10-16 · **Portée :** n'afficher la carte **Climatisation** de l'Accueil que
si la maison déclare au moins une clim dans `data/home.json` (`favorites.climate`).
**Statut :** fait et vérifié (AC1–AC7).

## Contexte

- Le foyer **n'a pas de climatisation** ; la section apparaissait pourtant, **vide**, sur l'Accueil.
- La carte vient de `web/src/maison/pages/Accueil.svelte` (≈ lignes 208–214) :
  `<section class="card climate">`, alimentée par `cfg.favorites?.climate ?? []`.
- Elle était **rendue inconditionnellement** : sans entrée `favorites.climate` dans
  `data/home.json`, le dashboard affiche un titre « Climatisation » + son icône, sans contenu.
- Les **autres pages sont déjà dynamiques** (auto-vides si aucune clim) : Pièces
  (`room.climates`), Plan (`plan/Drawing.svelte`), Énergie (`deviceKind(d) === 'climate'`,
  qui sert aussi aux conseils). **Seul l'Accueil** était statique.
- Aucune option de config ne masque cette section : correction = **patch front** + rebuild.

## Correctif (option A — masquage conditionnel)

Envelopper la section dans un `{#if}` sur la liste des clims favorites :

```svelte
{#if (cfg.favorites?.climate ?? []).length}
  <section class="card climate">
    …
  </section>
{/if}
```

L'import `ClimateCard` et les règles CSS `.climate` sont **conservés** : la carte réapparaît
automatiquement si une clim est ajoutée un jour à `favorites.climate` (non destructif).
Alternative écartée (option B) : suppression franche du bloc + import + CSS — à refaire si une
clim arrive.

**Patch versionné :** `notes/patches/accueil-clim-conditional.patch`
(fork local → à remonter en **PR amont** `github.com/rudy-io/moli-os`, comme
`notes/patches/dehors-pump-powerkey.patch`).

> **⚠️ Superseded (2026-10-16).** Le patch `notes/patches/accueil-ha-inspire.patch`
> (refonte Accueil, cf. `notes/accueil-ha-inspire.md`) **absorbe** le même hunk
> `{#if (cfg.favorites?.climate ?? []).length}` — il a été produit contre la base
> amont `f3b1a7a` *avant* ce correctif. Les deux patches diffent la même région et
> **ne s'appliquent pas séquentiellement** : n'appliquer que
> `accueil-ha-inspire.patch`, celui-ci sert d'archive/PR amont dédiée à la clim.

**Applicabilité vérifiée** (format `git diff`, en-têtes `diff --git`/`index`) :

```sh
# depuis HEAD (état amont) : application forward
git apply --check /tmp/accueil.patch   # → OK
# sur l'arbre courant (déjà patché) : application inverse
git apply --check -R /tmp/accueil.patch # → OK
```

## Étapes (AC1–AC7)

1. **AC1** — Backup `web/src/maison/pages/Accueil.svelte.bak-preclim` (CT125).
2. **AC2** — Édition : section enveloppée dans `{#if (cfg.favorites?.climate ?? []).length}`.
3. **AC3** — Patch `notes/patches/accueil-clim-conditional.patch` + la présente note.
4. **AC4** — Rebuild image embarquée (`docker compose build` + `up -d`) → bundle web à jour.
5. **AC5** — Preuve rendu : `#/` → plus de section « Climatisation » ; reste de l'Accueil intact.
6. **AC6** — Non-régression : pilotes `running`, HA `200`, `/api/health` OK.
7. **AC7** — Documentation (ce fichier).

## Rollback

- **Rapide** : `cp web/src/maison/pages/Accueil.svelte.bak-preclim web/src/maison/pages/Accueil.svelte`
  puis `docker compose up -d --build` dans `/opt/moli-os`.
- **Amont** : annuler le patch `notes/patches/accueil-clim-conditional.patch`.
