# Telegram sur Moli

Relevé : 2026-10-22. Pilote `moli-telegram` (déjà compilé dans l'image `moli-os:latest`,
aucun patch à appliquer) — configuration seule.

## Ce qui a été fait

| Élément | Valeur |
|---|---|
| Bot | **`@foranhomebot`** — « Foran N8N Home », id `8557113347` (**dédié à Moli**) |
| Bot HA (intact) | `@ForanHome_bot`, id `6585149969` — non touché |
| Chat | `1232618977` (= *Pyra* / `odinouf`, chat privé) — **un seul destinataire** |
| Jeton | `/opt/moli-os/data/telegram.token`, `0600`, `1000:1000`, hors dépôt |
| Bloc | `[[driver]] id="telegram" kind="telegram"`, `token_file=/data/telegram.token`, `chats=[1232618977]` |
| Sauvegarde config | `data/moli.toml.bak-telegram-20261022-122911` |

Le jeton vient d'un bot **recyclé** : le solde était un webhook n8n
(`https://n8n-home.p1ra.org/webhook/…`) dont l'hôte est aujourd'hui **NXDOMAIN**
(Cloudflare renvoie `Status: 3` pour `n8n-home.p1ra.org`). Ce webhook a été supprimé
(`deleteWebhook`) — sans effet de bord, la cible n'existait plus. `getWebhookInfo` est
désormais vide et `getUpdates` répond `ok` sans conflit (avant : `409 Conflict`).

## Preuves

Relevé du **2026-10-18**, avant le pilote `moli-lab` (le CT lui-même) : les compteurs
ont grandi depuis, ils ne sont pas la preuve — l'état `running` l'est.

```
$ docker exec moli-os /moli-os check-config
configuration OK (13 driver(s))          # 14/16 au 2026-10-22, `moli-lab` compris

$ curl -s http://127.0.0.1:8790/api/health
… "instance":"telegram","kind":"telegram","status":{"state":"running"} …
… "stats":{"drivers":15,"drivers_running":15,"devices":87,…}
                                         # 16/16 au 2026-10-22

$ curl -s http://127.0.0.1:8790/api/devices   # appareil
{"id":"telegram:bot","native_name":"Telegram","model":"@foranhomebot","online":true,
 "points":[{"key":"notify","access":{"read":false,"write":true},"kind":{"type":"text"}}]}

$ POST /api/command {"point":"telegram:bot/notify","value":"…"}  → {"ok":true}  (HTTP 200)
$ tail -1 data/journal.jsonl
{"id":697,…,"actor":"tableau de bord (127.0.0.1)","action":{"kind":"command",
 "point":"telegram:bot/notify",…},"outcome":{"result":"ok"},"duration_ms":174}
```

Message reçu côté humain : **confirmé**.

## Ce que le pilote sait faire — et pas

- Un appareil « Telegram » avec un point `notify` (texte, **écriture seule**) : Moli envoie
  le texte aux `chats` configurés via `sendMessage`, en HTTPS direct (`api.telegram.org`).
- Canal « Telegram » des automatismes = une commande sur ce point, journalisée au nom de
  l'automatisme (pas d'appareil `notify` → le message retombe dans la maison).
- Texte découpé à 4 000 caractères (limite Telegram 4 096), vide refusé.
- **La réception n'existe pas** : le pilote n'appelle jamais `getUpdates`/`getWebhookInfo`
  en service. Rien ne se bat pour le webhook quand on n'y touche pas.

## Pièges rencontrés

- **`409 Conflict: can't use getUpdates method while webhook is active`** — un jeton recyclé
  garde le webhook de son ancien usage. Diagnostiquer avec `getWebhookInfo` avant de
  supprimer : si l'URL pointe encore quelque part de vivant, on ne supprime pas.
- **`403 forbidden: bot can't initiate conversation`** — il faut que la personne écrive
  `/start` au bot une fois. Sans ça, `sendMessage` échoue même avec un jeton valide.
- **`/data` est gitignored** et `telegram.token` n'est **pas** dans la liste `FILES` de
  `moli-os backup` : après un `restore`, le rejouer par le tube (`read -rs T; …`).
- Le fichier déposé était en `644` : `chmod 0600` + `chown 1000:1000` vérifiés après coup.

## Rejouer

```sh
# pousser un jeton (tapé à l'aveugle, jamais en argv, jamais dans l'historique) :
read -rs T; printf %s "$T" | ssh moli-os 'umask 077; cat > /opt/moli-os/data/telegram.token && chmod 600 /opt/moli-os/data/telegram.token && chown 1000:1000 /opt/moli-os/data/telegram.token'
unset T
ssh moli-os 'cd /opt/moli-os && docker compose restart moli-os'

# changer de destinataire : éditer `chats` (10 max), check-config, restart.
```
