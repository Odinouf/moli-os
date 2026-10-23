# Compteur Linky (via Home Assistant)

Moli lit la consommation électrique du foyer **telle que Home Assistant la
connaît déjà** : index Linky, puissance instantanée (maison / appartement /
résiduel), couleur Tempo et heures creuses, coût du jour. Il ne parle pas au
Linky directement et n'importe **pas** l'installation solaire.

## Ce qu'il faut

- Un broker MQTT joignable (celui de Home Assistant, Mosquitto, en général).
- Les capteurs Linky/Tempo dans Home Assistant (intégration Linky + RTE Tempo).
- Une automatisation Home Assistant qui republie ces valeurs sous `moli/linky/#`
  (voir `ha-moli-linky-bridge.json`, à importer dans HA).

## Étapes

1. Importer l'automatisation `moli_linky_mqtt_bridge` dans Home Assistant, puis
   la déclencher une fois pour publier les messages retenus.
2. Ajouter le bloc suivant à `data/moli.toml` :

   ```toml
   [[driver]]
   id = "linky"
   kind = "linky"

   [driver.options]
   host = "192.168.1.78"
   port = 1883
   base_topic = "moli/linky"
   username = "moli"
   password_env = "MOLI_Z2M_PASSWORD"
   ```

3. `docker exec moli-os /moli-os check-config` → `configuration OK`.
4. `docker compose restart moli-os` puis vérifier `GET /api/devices`
   (l'appareil `linky` et ses points apparaissent).

## Points produit

| Sujet | Point Moli |
|---|---|
| Consommation du jour | `conso_jour` (kWh) |
| Appartement (jour) | `appart_jour` (kWh) |
| Résiduel (jour / cumulé) | `residuel_jour`, `residuel_cumul` (kWh) |
| Index Linky | `index` (kWh) |
| Puissances | `power_appart`, `power_residuel`, `power_principale` (W) |
| Coût du jour / J-1 | `cout_jour`, `cout_hier` (€) |
| Prix actuel + grille Tempo | `prix`, `prix_bleu_hp`… `prix_rouge_hc` (€/kWh) |
| Tempo | `tempo_couleur` (bleu/blanc/rouge/inconnu), `tempo_hc` (heures creuses) |

Un foyer qui ne mesure pas l'appartement ne publie simplement jamais ces
topics : le point correspondant reste vide.
