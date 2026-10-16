# Migration Philips Hue → Moli OS

**Date :** 2026-10-16 · **Portée :** intégration du pont Hue dans Moli (lumières, capteurs, pièces, zones)
**Statut :** faite et vérifiée (H1–H9), **sauf l'harmonisation pièces/doublons** (cf. « Doublons et
suivi » en fin de document) : les pièces/zones Hue apparaissent aussi comme appareils et recouvrent
les areas HA.

## Contexte

- **Pont Hue** : `Hue Bridge 00178826c31f`, IP **`192.168.1.46`** (MAC `00:17:88:26:c3:1f`),
  port **443** ouvert. Certificat CN `001788FFFE26C31F`, SHA-256
  `79:FA:F1:73:36:BE:25:B5:0A:60:2E:36:74:95:95:A4:AD:16:3A:EB:90:66:75:11:A1:1B:2A:5B:85:C0:E2:70`.
- **HA** a une entrée `hue` `loaded` (« Hue Bridge 00178826c31f », zeroconf), déjà appairée.
- **Moli** : LXC 125 `moli-lab`, code `/opt/moli-os`, driver `moli-hue` (CLIP v2 local, cert épinglé TOFU).

## Choix d'entrée de clé : récolte depuis HA (voie A)

Plutôt qu'un appairage physique (appui sur le bouton du pont), la **clé d'app Hue déjà présente
dans HA** a été récoltée en **lecture seule** :

- Source : `/config/.storage/core.config_entries` de HA, entrée `hue`, champ `data.api_key`
  (chaîne de 40 caractères).
- Route : `ssh root@192.168.1.4` → `qm guest exec 222` → `docker exec homeassistant python3`.
- Aucun appui bouton, pont inchangé, HA non modifié.

**Hygiène** : la clé a transité par un tube (stdout HA → stdin de `moli-os secrets set`) et n'a
**jamais** été affichée ni écrite en clair dans un fichier/argv. Preuve : la seule sortie est
`hue/app_key: stored (40 characters)`.

## H2 — Pose de la clé dans le coffre Moli

Commande (clé par stdin, jamais en argument) :

```sh
… récolte stdout … | ssh moli-os 'docker exec -i moli-os /moli-os secrets set hue app_key'
# → hue/app_key: stored (40 characters)
```

Le `cert_sha256` est épinglé et rangé par le pilote lui-même au premier contact (coffre chiffré).

## H3 — Configuration `data/moli.toml`

Sauvegarde : `data/moli.toml.bak-prehue`. Bloc ajouté :

```toml
[[driver]]
id = "hue"
kind = "hue"

[driver.options]
host = "192.168.1.46"
```

**Preuve :** `docker exec moli-os /moli-os check-config` → `configuration OK (5 driver(s))`.

## H4 — Démarrage

`docker compose restart moli-os` → pilote chargé depuis la config + le coffre.

**Preuve :** `/api/health` → `drivers_running: 7/7`, `hue` `running`, `journal_failures: 0`.

## H5 — Publication

`GET /api/devices` → **28 appareils** instance `hue` :

- **Lumières** (`LCT010`, `LST002`, `LCT007`, `LTW013`, `LWB006`, `LWG004`…) avec points
  `on`, `brightness`, `color_temp`, `color` (et `effect` sur certaines) **écrivables**, plus
  `color.x`/`color.y` en lecture.
- **Boutons** (`RWL021` : `Télécommande HUE Chambre`, `Switch Tv`) : points événement.
- **Capteurs** (`SML001`, `SML003` : `Capteur Poele`, `Parents`, `Capteur grange`,
  `capteur Couloir extention`) : `motion`, `temperature`, `illuminance`, `battery`.
- **Pièces** (`room` : Dressing, Spot, Toilette, Cave, Alicia, Chambre, Salon) publiées avec
  `on`/`brightness` **écrivables** ; **zones** en lecture seule.

## H6 — Test neutre (lampe `Extension couloir`)

- `POST /api/command {"point":"hue:0dc33458…/on","value":true}` → `{"ok":true}` ; état Moli `on=true`.
- `POST /api/command … value:false` → `{"ok":true}` ; état Moli `on=false`.
- **Cohérence HA** : `light.extension_couloir` → `off` (le pont reflète la commande des deux côtés).

Aucune chambre touchée.

## H7 — Non-régression

- Pilotes : `bambu-a1`, `bambu-a1mini`, `energie`, `frigate`, `hue`, `personnes`, `z2m` → tous `running`.
- Appareils : `z2m` 31, `frigate` 14, `hue` 28, `bambu-a1` 3, `bambu-a1mini` 2, `energie` 1, `personnes` 1.
- `journal_failures: 0`. HA **non modifié** (récolte en lecture seule).

## H8 — Pièces et recouvrements

9 lumières Hue affectées aux pièces Moli existantes (`PUT /api/labels/<id>`, persisté dans `labels.toml`) :

- **Entrée** : `entrée` (`hue:e9cef3e4…`).
- **Alicia** : `Bandeau Alicia` (`hue:d6d1971c…`).
- **Salon** : `Bandeau Tv`, `Bandeau Buffet`, `TV Couleur`, `Gu10 salon 1`, `Spot poêle`,
  `Spot côté canapé`, `Spot côté table`.

**Non affectées (volontairement)** : les **pièces/zones Hue** apparaissent aussi comme *appareils*
Moli (Dressing, Toilette, Cave, Spot, Chambre, Salon, Parents, Alicia…). Les **zones** peuvent
**chevaucher une chambre** → laissées **sans pièce** côté Moli (lecture seule, non pilotées ici).

**Recouvrement de nommage** : les libellés de pièces Moli viennent des *areas* HA
(Apartement, Cuisine, Alicia, Entree, Salon, Piscine, Grenier, Atelier, SDB, Chaufferie), tandis que
Hue publie ses propres *rooms* (Dressing, Toilette, Cave…). Les deux coexistent ; libre à
l'utilisateur d'aligner plus tard (pas d'action automatique).

### Doublons et suivi (à traiter)

Hue publie **à la fois** les lumières (appareils « feuille ») **et** ses **pièces/zones** comme
appareils Moli (avec `on`/`brightness`). Conséquence : la même lumière physique peut apparaître
**deux fois** (une fois seule, une fois via sa pièce), et des *rooms* Hue (`Dressing`, `Toilette`,
`Cave`…) **doublonnent** les areas HA (`Alicia`, `Salon`…). → liste Hue de 28 appareils, un peu
ambiguë pour un lecteur pressé.

- **Propriétaire :** opérateur Moli (harmonisation manuelle).
- **Échéance suggérée :** prochaine passe de rangement du dashboard Hue.
- **Recommandation de filtrage (guidage, non appliqué) :**
  - **Piloter les lumières**, pas les pièces Hue : dans le dashboard, n'afficher que les appareils
    « feuille » (lumières individuelles) et **masquer les appareils `room`/zone** Hue — ils
    recouvrent leurs membres.
  - **Zones jamais pilotées ici** de toute façon : le pilote les publie **en lecture seule**
    (une zone peut chevaucher une chambre protégée).
  - **Rattacher les lumières feuille** aux pièces Moli existantes (fait en H8 pour 9 d'entre elles) ;
    laisser les appareils `room` Hue **sans pièce** pour éviter le double comptage dans une pièce.
- **Alternative écartée :** filtrer côté driver (liste blanche de types de services) — divergerait
  l'amont `moli-hue` (même raisonnement que pour Frigate). Préférer le choix d'affichage côté
  dashboard/libellés.

## Rollback

1. `cp /opt/moli-os/data/moli.toml.bak-prehue /opt/moli-os/data/moli.toml`.
2. `docker exec moli-os /moli-os secrets forget hue app_key` (et `cert_sha256` si voulu).
3. `docker compose restart moli-os`.

## Zones de vigilance

- **Clé Hue partagée HA + Moli** : la même `api_key` sert aux deux. Hue l'autorise (une clé = un
  utilisateur d'app), mais révoquer la clé dans l'app Hue coupe **les deux** à la fois. La clé reste
  dans le coffre (`master.key` 0600, `secrets.enc`), jamais en clair.
- **Pont en HTTPS local uniquement** : API CLIP v2 non exposée hors LAN. Certificat épinglé au
  premier contact (une régénération du cert du pont déclenche `PIN_MISMATCH` → `secrets forget hue
  cert_sha256`, cf. protocole du pilote).
- **Pièces/zones en double** : deux référentiels de pièces coexistent (areas HA importées vs rooms
  Hue). À harmoniser manuellement si souhaité.

## Hors périmètre

- **Entertainment / `client_key`** (sync lumière-vidéo) : non critique, non activé.
- **Décommission de l'intégration Hue de HA** : non faite (Moli et HA pilotent le pont en parallèle).
