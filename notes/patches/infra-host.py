#!/usr/bin/env python3
"""Host measurement for Moli OS: containers, disks, failed services, and the
hub's own health.

Writes `data/infra.json` (read by `GET /api/infra` in the dashboard's Infra
page) from the Docker API over its Unix socket, and restarts the hub after two
consecutive failed `/api/health` answers (one restart per ten minutes at most).

Standard library only. Installed as `/usr/local/bin/moli-infra`, run every
minute by root's cron.
"""

import fcntl
import http.client
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

DATA_DIR = os.environ.get("MOLI_DATA", "/opt/moli-os/data")
OUT = os.path.join(DATA_DIR, "infra.json")
STATE_DIR = os.environ.get("MOLI_INFRA_STATE", "/var/lib/moli-infra")
FAILS = os.path.join(STATE_DIR, "health-fails")
LAST_RESTART = os.path.join(STATE_DIR, "last-restart")
RESTARTS = os.path.join(STATE_DIR, "restarts")
LOCK = os.path.join(STATE_DIR, "lock")
PAUSE = os.path.join(STATE_DIR, "pause")
DOCKER_SOCK = os.environ.get("MOLI_DOCKER_SOCK", "/var/run/docker.sock")
HUB = os.environ.get("MOLI_HUB", "http://127.0.0.1:8790")
HUB_CONTAINER = os.environ.get("MOLI_CONTAINER", "moli-os")
FAILS_BEFORE_RESTART = 2
RESTART_COOLDOWN = 10 * 60
HEALTH_TIMEOUT = 5

DISKS = [("/", "Système")]


class UnixHTTPConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(10)
        self.sock.connect(DOCKER_SOCK)


_api = None


def api_version():
    global _api
    if _api is None:
        conn = UnixHTTPConnection("localhost")
        conn.request("GET", "/version")
        _api = json.loads(conn.getresponse().read()).get("MinAPIVersion", "1.41")
        conn.close()
    return _api


def request(method, path):
    conn = UnixHTTPConnection("localhost")
    conn.request(method, f"/v{api_version()}{path}")
    res = conn.getresponse()
    body = res.read()
    conn.close()
    if res.status >= 400:
        raise RuntimeError(f"{method} {path}: {res.status}")
    return json.loads(body) if body else None


def api(path):
    return request("GET", path)


def cpu_percent(stats):
    try:
        cur = stats["cpu_stats"]
        pre = stats["precpu_stats"]
        delta = cur["cpu_usage"]["total_usage"] - pre["cpu_usage"]["total_usage"]
        system = cur["system_cpu_usage"] - pre["system_cpu_usage"]
        online = len(cur["cpu_usage"].get("percpu_usage") or []) or os.cpu_count() or 1
        if system <= 0 or delta <= 0:
            return 0.0
        return round(delta / system * online * 100, 2)
    except (KeyError, TypeError, ZeroDivisionError):
        return None


def memory_used(stats):
    """Working set: usage minus the file cache the kernel can reclaim."""
    mem = stats.get("memory_stats") or {}
    usage = mem.get("usage")
    if not isinstance(usage, int):
        return None
    detail = mem.get("stats") or {}
    inactive = detail.get("inactive_file") or detail.get("total_inactive_file") or 0
    return max(0, usage - inactive)


def containers():
    out = []
    for c in api("/containers/json?all=1") or []:
        cid = c["Id"]
        name = (c.get("Names") or ["?"])[0].lstrip("/")
        item = {
            "name": name,
            "image": c.get("Image"),
            "state": c.get("State"),
            "status": c.get("Status"),
            "health": None,
            "cpu": None,
            "memory": None,
        }
        if c.get("State") == "running":
            try:
                stats = api(f"/containers/{cid}/stats?stream=false") or {}
                item["cpu"] = cpu_percent(stats)
                item["memory"] = memory_used(stats)
            except (RuntimeError, OSError):
                pass
        try:
            inspect = api(f"/containers/{cid}/json") or {}
            health = (inspect.get("State") or {}).get("Health")
            if health:
                item["health"] = health.get("Status")
        except (RuntimeError, OSError):
            pass
        out.append(item)
    out.sort(key=lambda c: (c["state"] != "running", c["name"]))
    return out


_hub_id = None
_hub_missing = False


def hub_container_id():
    """The hub's container id, matched on its name.

    The Docker API accepts a name in the path, but only as long as the name is
    exactly right: a renamed compose project would turn every watchdog call into
    a 404 that nobody reads. Resolving the id once and failing loudly beats
    degrading silently — and the loud part happens once per run, not per call.
    """
    global _hub_id, _hub_missing
    if _hub_id is not None:
        return _hub_id
    if _hub_missing:
        return None
    try:
        for c in api("/containers/json?all=1") or []:
            names = [n.lstrip("/") for n in (c.get("Names") or [])]
            if HUB_CONTAINER in names:
                _hub_id = c["Id"]
                return _hub_id
    except (RuntimeError, OSError) as exc:
        sys.stderr.write(f"moli-infra: cannot list containers: {exc}\n")
        _hub_missing = True
        return None
    sys.stderr.write(
        f"moli-infra: no container named {HUB_CONTAINER!r}: "
        "watchdog cannot restart the hub (set MOLI_CONTAINER)\n"
    )
    _hub_missing = True
    return None


def disks():
    out = []
    for path, label in DISKS:
        try:
            st = os.statvfs(path)
        except OSError:
            continue
        total = st.f_blocks * st.f_frsize
        free = st.f_bavail * st.f_frsize
        used = total - free
        out.append(
            {
                "label": label,
                "path": path,
                "used": used,
                "total": total,
                "free": free,
                "percent": round(used / total * 100, 1) if total else 0.0,
            }
        )
    return out


def failed_services():
    try:
        res = subprocess.run(
            ["/usr/bin/systemctl", "--failed", "--plain", "--no-legend", "--no-pager"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    names = []
    for line in res.stdout.splitlines():
        parts = line.split()
        if parts and parts[0].endswith(".service"):
            names.append(parts[0])
    return names


def write(payload):
    os.makedirs(DATA_DIR, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, prefix=".infra-", suffix=".json")
    try:
        with os.fdopen(fd, "w") as fh:
            json.dump(payload, fh, separators=(",", ":"))
        os.chmod(tmp, 0o644)
        if os.geteuid() == 0:
            try:
                os.chown(tmp, 1000, 1000)
            except OSError:
                pass
        os.replace(tmp, OUT)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def read_int(path):
    try:
        with open(path) as fh:
            return int(fh.read().strip() or 0)
    except (OSError, ValueError):
        return 0


def write_int(path, value):
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = f"{path}.tmp"
    with open(tmp, "w") as fh:
        fh.write(str(value))
    os.replace(tmp, path)


def hub_healthy():
    """True when `/api/health` answers. urlopen already raises on non-2xx."""
    try:
        with urllib.request.urlopen(f"{HUB}/api/health", timeout=HEALTH_TIMEOUT):
            return True
    except (urllib.error.URLError, OSError, ValueError):
        return False


def stopped_on_purpose():
    """True when the hub is not running because someone stopped it.

    `docker compose stop moli-os` (backup restore, maintenance) leaves
    `State.Running == false` with a clean exit (0/143, not OOM-killed). Blindly
    restarting then would relaunch the hub in the middle of a restore.
    """
    cid = hub_container_id()
    if cid is None:
        # Cannot tell a deliberate stop from a crash: judge on health alone.
        return False
    try:
        state = (api(f"/containers/{cid}/json") or {}).get("State") or {}
    except Exception as exc:  # noqa: BLE001 - no daemon: judge on health alone
        sys.stderr.write(f"moli-infra: cannot read {HUB_CONTAINER} state: {exc}\n")
        return False
    if state.get("Running"):
        return False
    if state.get("OOMKilled") or state.get("Dead"):
        return False
    return state.get("ExitCode") in (0, 143)


def watch():
    """Two failures in a row restart the hub; one restart per ten minutes."""
    if hub_healthy():
        if read_int(FAILS):
            write_int(FAILS, 0)
        return
    if os.path.exists(PAUSE):
        write_int(FAILS, 0)
        return
    if stopped_on_purpose():
        # Deliberate stop: nothing to repair, and the counter must not grow.
        write_int(FAILS, 0)
        return
    fails = read_int(FAILS) + 1
    write_int(FAILS, fails)
    if fails < FAILS_BEFORE_RESTART:
        return
    now = int(time.time())
    if now - read_int(LAST_RESTART) < RESTART_COOLDOWN:
        write_int(FAILS, 0)
        return
    cid = hub_container_id()
    if cid is None:
        return
    sys.stderr.write(f"moli-infra: {fails} failed health checks, restarting {HUB_CONTAINER}\n")
    try:
        request("POST", f"/containers/{cid}/restart?t=10")
    except Exception as exc:  # noqa: BLE001 - a missing daemon is reported, not fatal
        # The restart did not happen: burning the cooldown here would leave the
        # hub down ten more minutes for nothing. Keep the counter so the next
        # minute tries again.
        sys.stderr.write(f"moli-infra: restart failed: {exc}\n")
        return
    write_int(LAST_RESTART, now)
    write_int(RESTARTS, read_int(RESTARTS) + 1)
    write_int(FAILS, 0)


def lock():
    """Exclusive run lock, held for the whole run.

    Cron fires every minute while a run does one `stats` call per running
    container plus a `systemctl --failed`. Two overlapping runs would race in
    STATE_DIR: the same outage counted twice (restarting the hub on a single
    real failure) and two writers on `infra.json`.
    """
    os.makedirs(STATE_DIR, exist_ok=True)
    handle = open(LOCK, "w")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return None
    return handle


def health_state():
    """What the watchdog knows, so the dashboard can explain a blink.

    A restart leaves no trace in the hub's own journal (it is the hub that
    restarts): without this, the human sees a silent gap in the 6 h curves.

    `recent_restart` says « the watchdog restarted the hub less than ten minutes
    ago » — *not* « the hub is unhealthy ». Right after a successful recovery the
    hub serves fine and the flag stays true for ten minutes; naming it `ok`
    would read as a liveness verdict and overstate the problem. Liveness belongs
    to `/api/health`, which the page already reads.
    """
    now = int(time.time())
    last = read_int(LAST_RESTART)
    return {
        "recent_restart": last != 0 and now - last <= RESTART_COOLDOWN,
        "last_restart": last * 1000 if last else None,
        "restarts": read_int(RESTARTS),
        "paused": os.path.exists(PAUSE),
    }


def main():
    handle = lock()
    if handle is None:
        return 0
    try:
        return run()
    finally:
        handle.close()


def run():
    code = 0
    # Health supervision needs no Docker for the probe itself: run it first, so
    # the payload below reports the watchdog state of *this* minute.
    try:
        watch()
    except Exception as exc:  # noqa: BLE001 - a watchdog must never crash the cron
        sys.stderr.write(f"moli-infra: watch failed: {exc}\n")
        code = 1
    try:
        payload = {
            "ts": int(time.time() * 1000),
            "containers": containers(),
            "disks": disks(),
            "backups": [],
            "failed": failed_services(),
            "health": health_state(),
        }
    except Exception as exc:  # noqa: BLE001 - never leave a stale file silently
        sys.stderr.write(f"moli-infra: measurement failed: {exc}\n")
        return 1
    write(payload)
    return code


if __name__ == "__main__":
    sys.exit(main())
