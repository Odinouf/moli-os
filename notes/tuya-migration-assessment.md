# Évaluation — migration des appareils Tuya de Home Assistant vers Moli

**Date :** 2026-10-16 · **Portée :** évaluation (T1–T2), **aucune migration effectuée**
**Caméras :** hors périmètre (traitées plus tard, voie séparée).

## T1 — Route d'exécution de `tuya-export.py`

`tools/home-assistant/tuya-export.py` doit tourner **dans le conteneur `homeassistant`**.

**Blocage initial :** l'addon SSH (`core-ssh`) n'a **ni `docker` ni `python3`** → impossible
d'y lancer `docker exec homeassistant …` directement.

**Route retenue :** Home Assistant est la **VM 222 `Home-Assist`** sur **PVE HOME**
(`192.168.1.4`). L'agent QEMU (`qm agent 222 ping` OK) permet d'exécuter une commande dans
la VM HAOS, où `docker` est disponible :

```sh
# 1. déposer le script (base64) dans la VM
qm guest exec 222 -- /bin/sh -c 'printf %s "<base64>" | base64 -d > /tmp/tuya-export.py'
# 2. lancer le contrôle (sans secret)
qm guest exec 222 -- /bin/sh -c \
  'docker exec -i homeassistant python3 - --summary < /tmp/tuya-export.py'
```

- Accès SSH PVE avec la clé existante (`~/.ssh/id_ed25519_pve4`, alias `root@192.168.1.4`).
- Alternative non retenue : SSH hôte HAOS port **22222** = **fermé**.
- **Lecture seule** : le script interroge l'API Tuya via le compte déjà lié à HA. Il **ne
  rafraîchit jamais le jeton de HA** (`KeepHasToken` quitte si le SDK tente un refresh) et
  **refuse de tourner si le jeton expire dans < 15 min** (`MARGIN_S = 900`). HA intact.
- **Preuve `--summary` (sans clés) :** exécuté, sortie ci-dessous.

```
0aq7kh   cz      2 DPs key:yes     Guirlande
41ne3j   sp      0 DPs key:yes     Piscine
10reao   sp      0 DPs key:yes     Grenier
78t83e   dj      6 DPs key:yes     Star Alicia
33vvtd   dj      9 DPs key:yes     Ceiling Lamp RGB
00gmgm   sp      0 DPs key:yes     Chat
f1g1uc   fsd     9 DPs key:yes     ceiling fan/Light v2
7 devices
```

## T2 — Périmètre : migrables vs non migrables

`moli-tuya` couvre « interrupteurs, prises, volets et tout appareil Tuya Wi-Fi joignable
directement », via les **points** issus des **DP**. Une **clé locale** (`key-<device_id>`,
16 car.) est requise par appareil.

| Appareil | Catégorie | DPs | Clé locale | Migrable Moli ? |
|---|---|---|---|---|
| Guirlande | `cz` (prise) | 2 | oui | ✅ **oui** |
| Star Alicia | `dj` (lampe RGB) | 6 | oui | ✅ **oui** |
| Ceiling Lamp RGB | `dj` (lampe RGB) | 9 | oui | ✅ **oui** |
| ceiling fan/Light v2 | `fsd` (ventilo+lampe) | 9 | oui | ✅ **oui** |
| Piscine | `sp` (caméra) | 0 | oui | ❌ non |
| Grenier | `sp` (caméra) | 0 | oui | ❌ non |
| Chat | `sp` (caméra) | 0 | oui | ❌ non |

**4 migrables** (prise + 3 lampes/ventilo, alimentés sur secteur, joignables en local).
**3 non migrables** = caméras (`sp`) : moli-tuya **ne gère pas les caméras** (pas de source
d'image) et ces appareils exposent **0 DP** → rien à mapper.

### Limites documentées du pilote `moli-tuya`

- Protocole **3.1 non géré** (seuls 3.3 / 3.4 / 3.5 ; « 3.2 » traité comme 3.3).
- **Sous-appareils derrière une passerelle ignorés** en local (nécessitent le cloud).
- **Capteurs Wi-Fi sur pile** (catégories `mcs`, `sj`, `ywbj`, `pir`…) jamais sur le LAN →
  visibles seulement via le **cloud Tuya en lecture seule** (clés de projet cloud requises,
  quota essai ~1 500 appels/mois). Ici, **aucun** de ces capteurs n'est présent.
- **Caméras** non prises en charge.
- L'**import dépend encore de HA** (pas de chemin sans HA documenté).
- Dépendances d'import à valider plus tard : requiert le SDK `tuya_sharing` **dans** le
  conteneur HA (présent, c'est celui de l'intégration Tuya de HA).

## Conclusion

- **Faisable** : l'import Tuya depuis HA est possible via **PVE → `qm guest exec 222` →
  `docker exec homeassistant`**, sans casser HA ni son jeton (lecture seule, garde d'expiration).
- **4 appareils migrables** (prise Guirlande + lampes Star Alicia / Ceiling Lamp RGB + ventilo-
  lampe), tous avec clé locale. **3 caméras exclues** (hors périmètre, traitées plus tard).
- Reste à faire lors d'un futur build : l'import réel (`| moli-os tuya import`), la
  déclaration `kind="tuya"`, le `check-config`, le redémarrage, et un test sur la prise neutre.

## Hygiène

- Script temporaire `/tmp/tuya-export.py` retiré de la VM HAOS après usage.
- Aucun secret manipulé ni affiché (mode `--summary` sans clés). HA/ Moli non modifiés.

## Suite (fait depuis)

Un appareil migré refusait les commandes (« est injoignable ») : `tuya.json` n'avait aucune
adresse et le repli `seek` ne démarrait pas. Diagnostic, IP prouvées, commandes testées et
correctif `tuya-seek-home-network` : voir `ceiling-fan-tuya.md`.
