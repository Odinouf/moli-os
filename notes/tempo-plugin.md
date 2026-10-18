# Plugin RTE Tempo → Moli OS

> ⚠️ **Legacy / superseded (2026-10-18).** Le contenu de ce patch (`accueil-tempo.patch` :
> badge `.badge.tempo` + clés i18n `maison.tempo.*`) est **déjà inclus verbatim** dans
> `tablette2025-parity.patch` (base courante). **Ne pas appliquer** `accueil-tempo.patch`
> par-dessus la parité. Note conservée pour l'historique et le raisonnement (profil `tempo`,
> limite API lendemain). Voir `notes/tablette-2025-parity.md`.

**Date :** 2026-10-16 · **Portée :** activer la couleur EDF Tempo dans Moli + témoin sur l'Accueil
**Statut :** fait et vérifié (T1–T5).

> Demandé : « Il faut me construire le plugin RTE Tempo (visible dans HA) :
> https://github.com/hekmon/rtetempo ». Périmètre retenu avec l'humain : **minimal** —
> on n'étend pas le profil au-delà de ce qu'il publie déjà (`today`/`tomorrow`).

## Constat

- Moli embarque **déjà** un profil intégré `tempo` (`integrations/tempo/profile.toml`, liste
  `BUILTIN` → pas de `profile trust` requis), publiant `today` et `tomorrow` (enum
  `inconnu|bleu|blanc|rouge`) via l'API publique **`www.api-couleur-tempo.fr`** (données RTE
  republiées, sans clé). Il n'était **pas déclaré** dans `data/moli.toml` (8 drivers).
- L'intégration HA `rtetempo` (déjà installée) expose plus (couleur actuelle/prochaine, visuel
  emoji, jours restants/placés, heures creuses, prix). **Hors périmètre** ici.

## T1 — Déclaration

Backup : `data/moli.toml.bak-pretempo`. Bloc ajouté :

```toml
[[driver]]
id = "tempo"
kind = "profile"

[driver.options]
profile = "tempo"
```

**Preuve :** `docker exec moli-os /moli-os check-config` → `configuration OK (9 driver(s))`.

## T2 — Démarrage

`docker compose restart moli-os`.

**Preuve :** `/api/health` → `drivers_running: 11/11`, `journal_failures: 0`, `tempo` `running`.

## T3 — Publication

`GET /api/devices` → appareil `tempo:www.api-couleur-tempo.fr:443` (« Couleur Tempo », RTE) :

| Point | Kind | Valeur (2026-10-17) |
|---|---|---|
| `today` | enum `inconnu\|bleu\|blanc\|rouge` | `bleu` |
| `tomorrow` | enum `inconnu\|bleu\|blanc\|rouge` | `inconnu` |

Cohérent avec HA (`sensor.rte_tempo_today` = BLUE / `sensor.tempo_aujourd_hui` = 🔵).

> **Limite assumée :** l'API `api-couleur-tempo.fr` ne publie la couleur du lendemain qu'à
> ~11 h (`tomorrow = inconnu` le matin). L'API RTE directe utilisée par rtetempo la donne plus
> tôt ; passer par elle demanderait une clé (ID Client/Secret) → hors périmètre minimal.

## T4 — Témoin Accueil

- `data/home.json` : ajout de `outdoor.tempo = "tempo:www.api-couleur-tempo.fr:443"` (clé
  canonique déjà prévue par `docs/components/dashboard.md`).
- Patch `AccueilBadges.svelte` (**tracé** : `notes/patches/accueil-tempo.patch`) : un badge
  inséré **à droite** du badge puissance « {xxx} W en direct », affichant **la couleur du jour
  et du lendemain** (pastille + libellé), masqué si l'appareil est absent ; le segment
  **demain n'apparaît que lorsque la couleur est connue** (sinon le badge reste sur « auj. »,
  pour ne pas afficher « dem. inconnu » toute la matinée) ; clic → `#/energie`.
  Nouvelles clés i18n `maison.accueil.badges_tempo*` + `maison.tempo.{bleu,blanc,rouge,inconnu}`
  (fr + en).
- **Ordre des patchs Accueil** : s'applique **après** `accueil-motion-colonnes` (dernier
  patch du chantier). `accueil-tempo` ne touche **pas** les fichiers de `accueil-arrows-heat` /
  `accueil-motion-colonnes` (`Accueil.svelte`, `Plan*.svelte`) : il n'édite que
  `AccueilBadges.svelte` + les catalogues i18n. Il est donc **indépendant** de ces patchs, mais
  l'ordre documenté reste « chacun part de l'état du précédent ».
- Rebuild image (web embarqué, rust-embed) + `up -d --force-recreate`.

**Preuve (snapshot DOM)** :

```
link "713 W en direct" → #/energie
link "Couleur Tempo EDF" → #/energie
  auj. bleu          (dem. masqué : couleur du lendemain inconnue avant ~11 h)
```

Le snapshot DOM ci-dessus fait foi (donnée versionnée) ; aucun artefact binaire n'est requis
(les captures `.playwright-cli/*.png` sont du scratch non versionné).

**Tracé du patch :** `notes/patches/accueil-tempo.patch` — `git apply --check` sur la base
pré-édition → **OK** ; application reproduit **à l'identique** les 3 fichiers live
(`md5sum` égaux sur `AccueilBadges.svelte`, `locales/fr/maison.json`, `locales/en/maison.json`).

## T5 — Non-régression

11/11 pilotes `running` (`air, bambu-a1, bambu-a1mini, energie, frigate, hue, meteo, personnes,
tempo, tuya, z2m`), `journal_failures: 0`. HA non modifié (lecture seule).

## Rollback

1. `cp data/moli.toml.bak-pretempo data/moli.toml` (retire le bloc `tempo`), `restart`.
2. `cp data/home.json.bak-pretempo data/home.json` si l'on veut retirer `outdoor.tempo`.
3. Restaurer `AccueilBadges.svelte.bak-pretempo` + `locales/{fr,en}/maison.json.bak-pretempo`,
   rebuilder.

## Hors périmètre

- Couleur actuelle/prochaine version rtetempo (bascule à 6 h), visuel emoji, jours restants/
  placés, heures creuses, prix Tempo : non repris (périmètre minimal).
- Décommission de l'intégration `rtetempo` de HA : non faite (Moli et HA lisent en parallèle).

> **Revue (2026-10-17) :** le segment « demain » est gardé par `tempoNext !== 'inconnu'`
> (comparaison de chaîne brute vs enum) ; un durcissement (réutiliser `tempoName`/test de
> présence) est possible mais non fait ici. Le badge disparaît entièrement si `today` est
> inconnu (pas de « Tempo indisponible ») — assumé dans le périmètre minimal.
