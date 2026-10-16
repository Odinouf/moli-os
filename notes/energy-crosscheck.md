# Croisement dashboard énergie HA ↔ Moli OS

**Portée initiale : lecture seule** (cross-check). Une **configuration `[energy]` de Moli**
a ensuite été ajoutée (portée b, config seule) pour que la page Énergie rende — voir la
section dédiée plus bas. Aucune écriture côté HA : lecture des états via API REST.
Moli expose les **mesures brutes par appareil** (`/api/devices`, page Atelier) et sa page
Énergie (`#/energie`, `/api/energy`).

## Méthode

- HA : lecture des états via l'API REST (`/api/states/<entity>`) avec le token long-lived
  local (jamais affiché) ; registres lus dans `.storage` (lecture seule).
- Moli : `GET http://192.168.1.125:8790/api/devices`.
- Les deux surfaces lisent **le même compteur Zigbee2MQTT** : le croisement valide le parse
  et la restitution de Moli.
- Script rejouable : `notes/energy-crosscheck.py`.

## Correspondance HA ↔ IEEE z2m ↔ Moli

| Libellé HA (dashboard) | Entité HA (kWh) | IEEE z2m | Moli `z2m:<ieee>` |
|---|---|---|---|
| Tondeuse | `sensor.prise_tondeuse_energy` | `0xa4c138287ee9c869` | OK |
| Chaudière | `sensor.prise_chaudiere_energy` | `0xa4c138b252971b97` | OK |
| Frigos | `sensor.prise_frigos_energy` | `0xa4c13842b692dcc9` | OK |
| Pompe Piscine | `sensor.prise_pompe_piscine_energy` | `0xa4c138bb3c3e1f88` | OK |
| Imprimante 3D | `sensor.prise_imprimante_3d_energy` | `0xa4c138d04532f541` | OK |
| PC | `sensor.zig_prise_pc_energy` | `0xa4c138a07a1d1df2` | OK |
| VMC | `sensor.zig_prise_vmc_energy` | `0xa4c13828ef638d36` | OK |
| Rallonge | `sensor.zig_prise_rallonge_energy` | `0xa4c13818d6898fb7` | OK |
| UV Alicia | `sensor.zig_prise_uv_alicia_energy` | `0xa4c138c1932e41db` | OK |
| Grange | `sensor.zig_prise_grange_energy` | `0xa4c1386f28530d52` | OK |
| Tore Apartment | `sensor.tore_apartment_energy` | `0xd878f0fffeaff727` | OK |
| Compteur Principal | `sensor.0x385cfbfffe274bd7_energy` | `0x385cfbfffe274bd7` | OK |

## Résultat du cross-check

**12/12 compteurs cumulés identiques, Δ = 0,000 kWh.** Puissance live identique sur chaque
prise (ex. Tondeuse 55 W, PC 215 W, Tore 450–481 W). Énergie injectée (« produced »)
identique (Compteur Principal 13 000,53 kWh).

Preuve UI (page Atelier, lecture seule) : « Prise Tondeuse Zigbee » = **55 W / 1 221,08 kWh**,
identique à HA.

## Écarts explicités (non comparables)

- **Piscine** (`sensor.prise_piscine_electric_consumption_kwh_2`) : appareil **Z-Wave**
  (`zwave_js`), pas Zigbee → Moli n'a pas de pilote z-wave. Non croisable.
- **Grid / Solaire / Batterie** : onduleur **Deye 16 kWh** (sources `type: grid`/`solar`/
  `battery`, capteurs « simulated ») via l'intégration Deye → pas dans z2m. Moli ne gère pas
  encore la production (« brique future »). Non croisable.
- **`0xa4c13861bf3c8f14` « Prise pompe eau piscine »** : présent dans le registre HA mais
  **sans entité énergie** et absent du parc z2m vu par Moli → appareil orphelin/retiré.
  Non comparable.
- **`[energy]` — désormais configurée** : la page `#/energie` et `/api/energy` rendent le
  total maison + les appareils (voir section « Configuration `[energy]` »).

## Configuration `[energy]` de Moli (portée b, config seule)

Après le cross-check (portée a), `[energy]` a été configurée dans `data/moli.toml` (CT125)
pour que la page Énergie rende :

- **1 compteur `total`** : « Maison » sur la pince *Tore Apartment*
  (`z2m:0xd878f0fffeaff727/energy`, `power` associé). C'est la maison entière (choix humain).
- **7 compteurs `appliance`** en miroir du `device_consumption` HA (parc z2m) : Tondeuse,
  Chaudière, Frigos, Pompe Piscine, Imprimante 3D, PC, VMC — chacun `point = .../energy`,
  `power = .../power`.

**Pas de tarif ni de jauge « en direct »** : le tarif périodique exige un point PTEC
(Linky) et la jauge fournisseur un point PAPP — aucun des deux n'est dans zigbee2mqtt (le
Tempo HA vient d'un publisher MQTT distinct, le fournisseur = Deye, hors z2m). Prix/kWh et
abonnement donc absents : Moli compte les **kWh**, pas les euros.

**Sauvegarde** : `data/moli.toml.bak-preenergy`. **Réversible** : retirer les blocs
`[energy]`/`[[energy.meter]]` et supprimer `data/energy.db`.

**Démarrage à froid** : le comptage par heure commence à la configuration (pas d'import de
l'historique HA, portée config seule). Les kWh du jour/de l'heure se remplissent au fil de
l'eau ; la puissance live est immédiate.

## Conclusion

Les mesures par prise que Moli restitue depuis le parc Zigbee2MQTT sont **exactement
alignées** avec le dashboard énergie HA pour tout le parc z2m commun, et Moli affiche
désormais sa propre page Énergie (total maison + appareils). Les seuls points hors
périmètre sont non-Zigbee (Z-Wave, onduleur Deye/solaire) et relèvent d'intégrations que
Moli n'a pas (encore).
