# Croisement dashboard énergie HA ↔ Moli OS

**Portée : lecture seule.** Aucune écriture côté HA ni Moli. Moli n'a pas de `[energy]`
configuré (option de config laissée de côté), donc `/api/energy` renvoie `404` : on compare
les **mesures brutes par appareil** exposées par le pilote z2m de Moli
(`/api/devices` et page Atelier) avec le dashboard Énergie de HA.

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
- **`[energy]` non configurée dans Moli** : `/api/energy` et la page `#/energie` renvoient
  `404` (aucun compteur déclaré). C'est attendu : c'est précisément ce qu'ajouterait une
  phase ultérieure de configuration (`[[energy.meter]]` + tarif Tempo + `[energy.live]`).

## Conclusion

Les mesures par prise que Moli restitue depuis le parc Zigbee2MQTT sont **exactement
alignées** avec le dashboard énergie HA pour tout le parc z2m commun. Les seuls points hors
périmètre sont non-Zigbee (Z-Wave, onduleur Deye/solaire) et relèvent d'intégrations que
Moli n'a pas (encore).
