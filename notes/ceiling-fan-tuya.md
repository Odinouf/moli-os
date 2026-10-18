# Ventilo-lampe Tuya injoignable (« ceiling fan/Light v2 »)

**Date :** 2026-10-18 · **Cible :** CT125 `/opt/moli-os`, driver `tuya`.
**Symptôme :** le dashboard renvoie `switch_led → true` puis
`driver error: ceiling fan/Light v2 est injoignable` (journal id 288).

## Cause racine

`data/tuya.json` ne contenait **aucune adresse** (`ip`) ni `version` pour les appareils
Tuya. À chaque démarrage, moli-tuya doit donc trouver leur adresse :

1. **Broadcast UDP** des appareils (ports 6666/6667/7000) — n'en captait que 2 sur 4 ;
2. **Repli `seek`** (balayage du /24 + identification par clé locale) — **ne démarrait
   jamais** : `locate()` (`crates/moli-tuya/src/lib.rs`) dérivait le /24 de `known`, la
   liste des `ip` **du fichier**… vide. Aucun log « tuya devices looked for by their key ».

Les appareils sans adresse refusent donc toute commande (`pilotes.tuya.injoignable`).
`Ceiling Lamp RGB` était aussi touché ; il l'est toujours (voir ci-dessous).

## Correction appliquée (données)

`data/tuya.json` — adresses **prouvées par Moli lui-même** (broadcast ou handshake de
clé), `version` incluse :

| Appareil | id | ip | version | source de la preuve |
|---|---|---|---|---|
| Guirlande | `…<id>` | 192.168.1.x | 3.3 | broadcast |
| Star Alicia | `…<id>` | 192.168.1.x | 3.3 | clé (`found by its key`) |
| **ceiling fan/Light v2** | `…<id>` | **192.168.1.x** | **3.5** | clé |
| Chat (caméra) | `…<id>` | 192.168.1.x | 3.4 | broadcast + clé |

Clés locales ré-importées depuis HA (procédure `tools/home-assistant/tuya-export.py`
→ `moli-os tuya import`, clés jamais affichées) : **7 devices, 7 clés**. `merge_import`
a conservé les `ip`/`version`/`room` posés à la main.

Sauvegardes : `data/tuya.json.bak-fanfix-*`, `.bak-boot-*`.

## Preuves

- Log boot : `tuya device found by its key device="ceiling fan/Light v2" ip=192.168.1.x version=V35`.
- `/api/devices` : `tuya:<device-id> online=true`.
- Commande réelle (API `POST /api/command`) :
  - `tuya:<device-id>/switch_led true` → `{"ok":true}`, état `switch_led=true` ;
  - `…/fan_switch true` → `{"ok":true}`, état `fan_switch=true` ; puis remis à `false`.
  - journal : `result: ok`.
- `/api/health` : `journal_failures=0`, `drivers_running=14`.

## Reste : « Ceiling Lamp RGB » — appareil absent du réseau (cause externe)

Enquête complétée le 2026-10-18 :

| Preuve | Résultat |
|---|---|
| Cloud Tuya (`tuya_sharing` via HA) | `Ceiling Lamp RGB` → **`online=False`**, dernier contact `1774554028` (mars) |
| Broadcasts UDP (6666/6667/7000, 85 s d'écoute) | seule la caméra `Chat` s'annonce, jamais la lampe |
| Écouteurs TCP 6668 du LAN | `.68` (ventilo), `.106` (Chat), `.159` (Guirlande), `.83` (inconnu) |
| `.83` (MAC `cc:8c:bf:xx:xx:xx`, OUI Tuya) testé avec **les 7 clés** du compte, v3.3/3.4/3.5 | **aucun match** → appareil étranger au foyer, ce n'est pas la lampe |
| `.83` assignée tour à tour à la lampe, `Piscine`, `Grenier` | échec pour les 3 (`integrity check failed` / `cannot decrypt` / `no answer`) |

**Conclusion :** la lampe n'est pas joignable — elle n'est pas alimentée ou a perdu son
Wi-Fi. Ce n'est **pas** un défaut du pilote ni de la configuration : aucune commande ne
peut aboutir tant qu'elle n'est pas de retour sur le réseau. Elle est laissée **sans
`ip`** dans `tuya.json` : le `seek` (désormais fonctionnel) la trouvera **tout seul** à
son retour, puis il suffira de relancer (`docker compose restart moli-os`).

Pour la récupérer : la réalimenter / la ré-appairer dans Smart Life ; si elle a été
ré-appairée, relancer l'import (`tuya-export.py | moli-os tuya import`) pour rafraîchir
sa clé locale. Idem `Piscine` (`online=False` côté cloud).

## Correctif durable (patch amont)

`notes/patches/tuya-seek-home-network.patch` : quand aucun appareil connu n'a d'adresse,
`locate()` balaie le /24 **de l'hôte** (déduit de la table de routage, sans config)
au lieu de ne rien faire. La **sélection** du /24 est une fonction pure
(`home_network(known, host)`), donc testable : deux tests couvrent les deux branches —
`home_network_prefers_a_known_address` (adresse connue la plus basse) et
`home_network_falls_back_to_the_host` (fichier vide → réseau de l'hôte ; pas de route IPv4 →
`None`, jamais de balayage au hasard). La sonde de table de routage reste isolée dans
`host_ipv4()`. Rebuild+retest : `cargo test -p moli-tuya` **23/23**. À
re-appliquer selon `AGENTS.md` §5 (le dépôt ne réécrit pas le code Moli).

Complément recommandé (anti-récidive) : **baux DHCP statiques** dans la box
(192.168.1.x) pour ces appareils, afin que leurs IP soient fixes.

## Vérification finale

`docker logs moli-os | grep 'by its key'` : la recherche par clé identifie désormais
Star Alicia, Chat et le ventilo-lampe sans adresse pré-remplie.
