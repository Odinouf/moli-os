# Moli OS — HTTPS public + voix via Cloudflare (tunnel dédié CT125)

**Date :** 2026-10-17 · **Statut :** fait (voix à confirmer au navigateur)
**Portée :** rendre `https://moli.p1ra.org` fonctionnel (l'erreur `host not allowed`),
fournir un **contexte sécurisé** (le micro du navigateur l'exige), sans dépendre du LXC
`cloudflared` (CT104).

## Cause initiale

`host not allowed (add it to server.allowed_hosts)` venait du **garde d'hôte** de Moli
(`crates/moli-api/src/guard.rs`) : `Host: moli.p1ra.org` n'était pas dans `[server] allowed_hosts`.

Mais un **second garde** bloquait ensuite (`crates/moli-api/src/caller.rs`) : Moli ne reconnaît
Cloudflare **que si le tunnel termine sur sa propre machine** (pair = `127.0.0.1`). Le tunnel
tournait sur **CT104** (192.168.1.164) → Moli voyait un étranger → `403 accès refusé`.
C'est le garde-fou anti-proxy de Moli, **voulu**.

## Correctif

1. `allowed_hosts = ["moli.local", "moli.p1ra.org"]` (backup `data/moli.toml.bak-allowed-hosts`).
2. **Tunnel Cloudflare dédié sur CT125** (indépendant de CT104) :
   - Binaire : `cloudflared 2026.10.1` (paquet apt officiel, `/usr/bin/cloudflared`).
   - Service : `/etc/systemd/system/cloudflared-moli.service` (enabled, actif) — unité **token-based**,
     token dans `/etc/cloudflared/moli.env` (0600 root), jamais en argv.
   - Tunnel `4845d62b-8093-463d-b66b-7a31ee96c041` (compte `5b45515c…`).
   - Public hostname : `moli.p1ra.org → http://127.0.0.1:8790` (**loopback** = exigence Moli).
   - `moli.p1ra.org` **retiré** du tunnel CT104 (pas de conflit de hostname).
3. **Cloudflare Access** sur `moli.p1ra.org` (application self-hosted, policy e-mail).
4. `[server.access]` dans `data/moli.toml` (backup `data/moli.toml.bak-serveraccess-*`) :
   ```toml
   [server.access]
   team = "p1ra"
   aud = "967da85dd2305d01eebfe8b70fd60bc2608c6718d23c6233b6f7976792dd61df"
   ```

## Preuves

- `https://moli.p1ra.org/` → **200**, `/api/session` → 200 ; via l'edge CF :
  `curl --resolve moli.p1ra.org:443:188.114.97.2 https://moli.p1ra.org/`.
- Redirection Access : `302 → https://p1ra.cloudflareaccess.com/cdn-cgi/access/login/moli.p1ra.org`
  (team `p1ra` ; `aud` décodé du meta-JWT).
- Journal Moli après requête authentifiée : `INFO Cloudflare Access: person recognized
  email=odinouf@gmail.com`.
- `/api/health` : 12 drivers running, 0 échec.
- En-têtes : `permissions-policy` absente → micro non bloqué ; HTTPS = `isSecureContext` → bouton voix actif.

## DNS

`moli.p1ra.org` → `188.114.96.2 / 188.114.97.2` (Cloudflare, autoritatif `erin/aron.ns.cloudflare.com`).
⚠️ La BBox (192.168.1.247) a servi un **NXDOMAIN en cache** sur le LAN (transitoire, TTL).

## Notes

- `owners` non renseigné : le compte Access `odinouf@gmail.com` n'a pas de fiche « personne »
  → il navigue le dashboard mais n'est pas « owner ». Pour le rendre owner :
  ajouter l'e-mail à `owners = [...]` **ou** créer une personne avec cet e-mail.
- Accès depuis l'extérieur = filtré par Access (e-mail) **avant** Moli.

## Rollback

- `systemctl disable --now cloudflared-moli.service` ; `rm /etc/systemd/system/cloudflared-moli.service`.
- Retirer `[server.access]` (restaurer le `.bak`) ; `systemctl restart cloudflared` sur CT104 si besoin.
- `allowed_hosts` : restaurer `data/moli.toml.bak-allowed-hosts`.
