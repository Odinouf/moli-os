# Réconciliation : `lab/ct125` rebasée sur l'amont (2026-10-23)

Le code du CT125 a été sauvegardé sur le fork (`lab/ct125`, 7 commits depuis `d54c3de`),
puis **rebasé sur l'amont** pour que le fork ne traîne plus 16 commits de retard.
Cette note dit ce qui a bougé, les preuves, et comment revenir en arrière.

## Pourquoi deux branches

| Branche (fork `Odinouf/moli-os`) | Base | Rôle |
|---|---|---|
| `lab/ct125` → `61c35d9` | `d54c3de` | **archive** de l'état déployé avant réconciliation |
| `lab/ct125-rebased` → `1bae9b3` | `04f60a3` | état courant, **déployé sur le CT125** |

`lab/ct125` n'a **pas** été réécrite : c'est la seule sauvegarde de l'état d'avant, et un
force-push l'aurait effacée de GitHub. Le rebase part sur une branche séparée.

## Ce que le rebase a fait

Base : `04f60a3` (« Merge pull request #12 »), 16 commits amont rattrapés.
Résultat : `git rev-list --left-right --count upstream/main...lab/ct125-rebased` = `0 7`.

**Le commit `c5af13e` (règle `Stale`) a été abandonné automatiquement** par le rebase :

```
warning: skipped previously applied commit c5af13e
```

C'est le bon comportement — ce contenu est déjà en amont (PR #9, `4c5c273`), fusionné
avant la réconciliation. Le padd a été vérifié identique mot pour mot :

```sh
diff <(git show lab/ct125~7:crates/moli-automation/src/model.rs) \
     <(git show upstream/main:crates/moli-automation/src/model.rs)  # → identique
```

Les neuf fichiers qui « se chevauchaient » avec l'amont (`moli-automation/*`,
`locales/*/automatismes.json`, `locales/*/moteur.json`, `Inspector.svelte`,
`auto.svelte.js`) sont désormais **identiques à l'amont** : le rebase les a résolus seul,
sans conflit. Le seul vrai travail restant tient en cinq lignes :

- `Cargo.toml` : `moli-linky = { path = "crates/moli-linky" }`
- `crates/moli-os/Cargo.toml` : `moli-linky.workspace = true`
- `crates/moli-os/src/main.rs` : `"linky"` dans `KINDS` + branche `build_driver`
- `Cargo.lock` : entrée `moli-linky`
- `.gitignore` : `moli.env`

Le rebase apporte aussi le pilote amont `moli-dirigera` (IKEA). Moli le connaît, mais
**aucun bloc `[[driver]]` ne l'active** : `check-config` reste à **14 pilotes**, comme avant.

## Preuves

**Différence de contenu**

```
git diff --name-status lab/ct125..lab/ct125-rebased | grep -c '^D'   → 0
comm (jeux de fichiers lab/ct125 vs probe)                            → 0 fichier manquant
```

**Compilation** (worktree `/opt/moli-os-wt`, `rust:1-alpine`, comme le Dockerfile)

```
cargo build --release --locked -p moli-os
  Finished `release` profile [optimized] target(s) in 6m 32s      → exit 0
  target/release/moli-os  24 Mo, ELF 64-bit static-pie
```

⚠️ Ordre imposé : **le front d'abord**. `crates/moli-api/src/assets.rs` fait
`#[derive(RustEmbed)] #[folder = "../../web/dist"]` ; sans `web/dist`, `Dist::get` n'existe
pas et la compilation casse (`E0599`). Le Dockerfile construit `web` avant `build`, à
reproduire pour toute compilation hors image.

**Tests**

```
cargo test --locked -p moli-automation -p moli-esphome
  6 suites, 52 tests passés, 0 failed
web/ npm test        → 93 pass, 0 fail
web/ npm run build   → ✓ built in 12.13s
```

**Après déploiement**

```
docker exec moli-os /moli-os check-config   → configuration OK (14 driver(s))
GET /api/health                              → 200, 16 pilotes dont 16 running,
                                               journal_failures = 0
/  /infra  /chauffage                        → 200
/api/infra  /api/plan  /api/home             → 200
```

Le chunk `Infra-Ce8E_lVm.js` servi contient `last_restart` et `systeme.infra.redemarre` :
la pastille « Redémarré » de la revue de code est bien dans l'image.

## Rollback

Revenir à l'état d'avant réconciliation, sur le CT125 :

```sh
ssh moli-os 'cd /opt/moli-os && git checkout lab/ct125 && git reset --hard 61c35d9'
ssh moli-os 'cd /opt/moli-os && docker compose up -d --build'
ssh moli-os 'curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8790/api/health'  # → 200
```

Les deux SHA : **avant** `61c35d9` (`lab/ct125`), **après** `1bae9b3` (`lab/ct125-rebased`).
La branche `lab/ct125` reste sur GitHub, donc le rollback ne dépend pas du poste local.

`moli.env`, `data/master.key`, `data/secrets.enc` et `data/telegram.token` ne sont **pas**
dans les branches (vérifié) : un `checkout` ne les touche pas, mais les sauvegarder avant
un `git reset --hard` reste la règle (AGENTS.md, §8).
