#!/usr/bin/env python3
"""Cross-check the Home Assistant energy dashboard against Moli OS (read-only).

Both surfaces read the same Zigbee2MQTT counter, so this validates that Moli
reports the same numbers as HA's energy dashboard for each plug.

Reads the HA long-lived token from the local OpenFox config (never printed).
No write is ever made to HA or Moli.
"""
import json
import os
import urllib.request
from pathlib import Path

HA = "http://192.168.1.78:8123"
MOLI = "http://192.168.1.125:8790"


def ha_token() -> str:
    cfg = json.loads((Path.home() / ".config/openfox/config.json").read_text())
    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == "HOMEASSISTANT_TOKEN":
                    return v
                r = walk(v)
                if r:
                    return r
        elif isinstance(o, list):
            for v in o:
                r = walk(v)
                if r:
                    return r
        return None
    tok = walk(cfg)
    if not tok:
        raise SystemExit("no HA token in config")
    return tok


def ha_get(path):
    req = urllib.request.Request(
        HA + path, headers={"Authorization": "Bearer " + ha_token()}
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


# HA energy sensor (cumulative kWh)  ->  (label, Moli z2m ieee)
MAP = {
    "sensor.prise_tondeuse_energy": ("Tondeuse", "0xa4c138287ee9c869"),
    "sensor.prise_chaudiere_energy": ("Chaudière", "0xa4c138b252971b97"),
    "sensor.prise_frigos_energy": ("Frigos", "0xa4c13842b692dcc9"),
    "sensor.prise_pompe_piscine_energy": ("Pompe Piscine", "0xa4c138bb3c3e1f88"),
    "sensor.prise_imprimante_3d_energy": ("Imprimante 3D", "0xa4c138d04532f541"),
    "sensor.zig_prise_pc_energy": ("PC", "0xa4c138a07a1d1df2"),
    "sensor.zig_prise_vmc_energy": ("VMC", "0xa4c13828ef638d36"),
    "sensor.zig_prise_rallonge_energy": ("Rallonge", "0xa4c13818d6898fb7"),
    "sensor.zig_prise_uv_alicia_energy": ("UV Alicia", "0xa4c138c1932e41db"),
    "sensor.zig_prise_grange_energy": ("Grange", "0xa4c1386f28530d52"),
    "sensor.tore_apartment_energy": ("Tore Apartment", "0xd878f0fffeaff727"),
    "sensor.0x385cfbfffe274bd7_energy": ("Compteur Principal", "0x385cfbfffe274bd7"),
}

# Produced-energy (injection) counters, for context (not in HA device_consumption).
PRODUCED = {
    "sensor.0x385cfbfffe274bd7_energy_produced": ("Compteur Principal", "0x385cfbfffe274bd7"),
    "sensor.tore_apartment_produced_energy": ("Tore Apartment", "0xd878f0fffeaff727"),
}


def moli_devices():
    with urllib.request.urlopen(MOLI + "/api/devices", timeout=10) as r:
        d = json.load(r)
    devs = d if isinstance(d, list) else d.get("devices", [])
    return {x["id"]: x for x in devs}


def moli_energy(dev):
    st = dev.get("state") or {}
    v = st.get("energy", {}).get("value")
    return v


def moli_power(dev):
    st = dev.get("state") or {}
    v = st.get("power", {}).get("value")
    return v


def main():
    mdev = moli_devices()
    rows = []
    for ent, (label, ieee) in MAP.items():
        try:
            st = ha_get("/api/states/" + ent)
            ha_kwh = st["state"]
            ha_unit = st["attributes"].get("unit_of_measurement")
        except Exception as e:  # noqa: BLE001
            ha_kwh, ha_unit = f"ERR {e}", "?"
        mid = "z2m:" + ieee
        dev = mdev.get(mid)
        mo_kwh = moli_energy(dev) if dev else None
        diff = ""
        try:
            if dev and mo_kwh is not None and ha_kwh not in (None, "unknown", "unavailable"):
                diff = f"{float(mo_kwh) - float(ha_kwh):+.3f}"
        except (TypeError, ValueError):
            diff = "n/a"
        rows.append((label, ha_kwh, ha_unit, mid if dev else "ABSENT", mo_kwh, diff))

    print(f"{'label':16} {'HA kWh':>12} {'unit':5} {'Moli id':32} {'Moli kWh':>12} {'Δ':>10}")
    print("-" * 96)
    for r in rows:
        print(f"{r[0]:16} {str(r[1]):>12} {str(r[2]):5} {r[3]:32} {str(r[4]):>12} {r[5]:>10}")

    print()
    print("live power (W): HA sensor.<plug>_power vs Moli power")
    for ent, (label, ieee) in MAP.items():
        pent = ent.replace("_energy", "_power")
        try:
            ha_p = ha_get("/api/states/" + pent)["state"]
        except Exception:  # noqa: BLE001
            ha_p = "-"
        dev = mdev.get("z2m:" + ieee)
        mo_p = moli_power(dev) if dev else None
        print(f"{label:16} HA={str(ha_p):>8}  Moli={str(mo_p):>8}")

    print()
    print("produced energy (kWh, injection) — context only:")
    for ent, (label, ieee) in PRODUCED.items():
        try:
            ha_v = ha_get("/api/states/" + ent)["state"]
        except Exception:  # noqa: BLE001
            ha_v = "-"
        dev = mdev.get("z2m:" + ieee)
        st = (dev or {}).get("state") or {}
        mo_v = None
        for k in ("energy_produced", "produced_energy"):
            if k in st:
                mo_v = st[k].get("value")
                break
        print(f"{label:16} HA={str(ha_v):>12}  Moli produced={str(mo_v):>12}")


if __name__ == "__main__":
    main()
