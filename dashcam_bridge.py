#!/usr/bin/env python3
"""
Dash Cam Pro+ bridge.

The dashcam is its own Wi-Fi access point. It answers plain HTTP CGI, it has
no internet route, and it never initiates anything — so the only way to know
what it is doing is to stand on its network and ask. That is what this script
is: it runs on a device joined to the camera's Wi-Fi (a spare phone in the car
via Termux, a Raspberry Pi, or a laptop), polls the camera, and posts the
reading to the app's relay so it can be read from any device.

One direction only. The relay receives a snapshot; it has no path back to the
camera, so nothing here exposes the recorder or the footage to the internet.

The camera is pinned by name (MYTVS_FNP8H0XW): a reading positively identified
as a different recorder is never published.

Usage:
    set DASHCAM_RELAY=https://ambiance-amber.vercel.app/api/dashcam-status
    set DASHCAM_TOKEN=<the same token configured on the relay>
    python dashcam_bridge.py

    # read once and print, without posting anywhere
    python dashcam_bridge.py --once --no-post

Protocol reference: research/dashcam/PROTOCOL.md
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from typing import Any

# Two firmware families ship under this app: Novatek-style boxes answer on
# .1.254, the others on .169.1.
CAMERA_HOSTS = ("192.168.1.254", "192.168.169.1")

# The camera fitted to this car. Its CGI surface has no authentication, so any
# recorder on the same subnet answers the same calls on the same address —
# pinning the name is what stops a bridge that drifted onto a different
# network from reporting a stranger's recorder as yours.
PINNED_CAMERA_NAME = "MYTVS_FNP8H0XW"

CGI_DEVICE_ATTR = "getdeviceattr.cgi"
CGI_WORK_STATE = "getworkstate.cgi"
CGI_SD_STATUS = "getsdstatus.cgi"
CGI_WIFI = "getwifi.cgi"

# The camera is on the other side of a weak radio link; a hung request must
# not stall the poll loop.
HTTP_TIMEOUT = 4.0

DEFAULT_INTERVAL = 20.0

_PAIR = re.compile(r"^-?([A-Za-z0-9_.-]+)\s*[=:]\s*(.*)$")
_TRUE = re.compile(r"^(1|on|true|yes|recording|start(ed)?)$", re.I)


def _get(host: str, cgi: str) -> str:
    """Fetch one CGI reply as text."""
    with urllib.request.urlopen(f"http://{host}/{cgi}", timeout=HTTP_TIMEOUT) as res:
        return res.read().decode("utf-8", errors="replace")


def parse_cgi(body: str) -> dict[str, str]:
    """
    Split the firmware's flat `key=value` reply into a dict.

    Tolerant on purpose: unknown keys are ignored and a truncated body yields
    whatever parsed, because a parse error here would be reported as "camera
    offline" when the camera is merely noisy.
    """
    out: dict[str, str] = {}
    if not body:
        return out
    for raw in re.split(r"[\r\n&]+", body):
        line = raw.strip()
        if not line:
            continue
        match = _PAIR.match(line)
        if match:
            out[match.group(1).lower()] = match.group(2).strip()
    return out


def _pick(map_: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        value = map_.get(key)
        if value:
            return value
    return None


def _as_bool(value: str | None) -> bool | None:
    if value is None:
        return None
    return bool(_TRUE.match(value.strip()))


def _as_int(value: str | None) -> int | None:
    if value is None:
        return None
    digits = re.sub(r"[^\d-]", "", value)
    try:
        return int(digits)
    except ValueError:
        return None


def read_camera(host: str) -> dict[str, Any]:
    """
    Read one camera's status.

    The identity call is made first and is allowed to fail the whole read: if
    the camera will not say who it is, it is not there. The rest are optional,
    because older firmware omits some of these CGIs entirely and a missing SD
    reply should still leave a usable "it is recording" answer.
    """
    device_attr = parse_cgi(_get(host, CGI_DEVICE_ATTR))

    def optional(cgi: str) -> dict[str, str]:
        try:
            return parse_cgi(_get(host, cgi))
        except Exception:
            return {}

    work = optional(CGI_WORK_STATE)
    sd = optional(CGI_SD_STATUS)
    wifi = optional(CGI_WIFI)

    mode = _pick(work, "workmode", "mode", "state", "workstate")
    recording = _as_bool(_pick(work, "recording", "record", "isrecording", "rec"))
    if recording is None and mode:
        recording = bool(re.search(r"rec", mode, re.I))

    total_mb = _as_int(_pick(sd, "total", "totalspace", "sdtotal", "totalsize"))
    free_mb = _as_int(_pick(sd, "free", "freespace", "sdfree", "remain", "freesize"))
    present = _as_bool(_pick(sd, "sdexist", "sdcard", "exist", "mounted", "sdstatus"))
    if present is None and total_mb is not None:
        present = total_mb > 0

    used_pct = None
    if total_mb and free_mb is not None and total_mb > 0:
        used_pct = max(0, min(100, round((total_mb - free_mb) / total_mb * 100)))

    return {
        "online": True,
        "recording": recording,
        "mode": mode,
        "parking": _as_bool(_pick(work, "parking", "parkingmode", "parkmonitor")),
        "sd": {
            "present": present,
            "totalMb": total_mb,
            "freeMb": free_mb,
            "usedPct": used_pct,
        },
        "wifi": {
            "ssid": _pick(wifi, "ssid", "wifissid", "apssid", "name"),
            "channel": _as_int(_pick(wifi, "channel", "wifichannel")),
        },
        "device": {
            "model": _pick(device_attr, "model", "product", "devicename", "name", "brand"),
            "firmware": _pick(device_attr, "firmware", "version", "fwversion", "softversion"),
        },
        "host": host,
        "at": int(time.time() * 1000),
    }


def normalize_camera_name(name: str | None) -> str:
    """
    Canonicalise a camera name for comparison.

    Firmware is inconsistent about case and separators — the same unit turns up
    as `MYTVS_FNP8H0XW`, `MyTVS-FNP8H0XW` and `mytvs fnp8h0xw` depending on
    which CGI the name came from. All three are the same camera.
    """
    if not name:
        return ""
    return re.sub(r"[\s._-]+", "", str(name).strip().upper())


def is_pinned_camera(status: dict[str, Any], expected_name: str) -> bool | None:
    """
    Does this reading come from the pinned camera?

    Three-valued, because "I cannot tell" is not "no": older firmware omits
    the identity CGI entirely, and treating a quiet reply as an intruder would
    raise a false alarm every time the camera answered with less detail.

    Returns True on a match, False on a different camera, None when nothing
    identifying was reported.
    """
    expected = normalize_camera_name(expected_name)
    if not expected:
        return None

    reported = [
        normalize_camera_name((status.get("device") or {}).get("model")),
        normalize_camera_name((status.get("wifi") or {}).get("ssid")),
    ]
    reported = [name for name in reported if name]
    if not reported:
        return None

    # A match on either identifier is enough; the two come from different CGIs
    # and only one is often populated.
    return any(name == expected for name in reported)


def find_camera(hosts: tuple[str, ...] = CAMERA_HOSTS) -> dict[str, Any] | None:
    """Read from the first host that answers, or None if none do."""
    for host in hosts:
        try:
            return read_camera(host)
        except Exception:
            continue
    return None


def post_status(relay: str, token: str, status: dict[str, Any]) -> None:
    """Hand the reading to the relay."""
    body = json.dumps({"status": status}).encode("utf-8")
    request = urllib.request.Request(
        relay,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    with urllib.request.urlopen(request, timeout=10.0) as res:
        res.read()


def describe(status: dict[str, Any]) -> str:
    """One line a person can read in a terminal."""
    sd = status.get("sd") or {}
    state = "recording" if status.get("recording") else "standby"
    card = f"{sd['usedPct']}% used" if sd.get("usedPct") is not None else "card unknown"
    return f"{status.get('host')}: {state}, {card}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Poll Dash Cam Pro+ and report its status.")
    parser.add_argument("--relay", default=os.environ.get("DASHCAM_RELAY", ""))
    parser.add_argument("--token", default=os.environ.get("DASHCAM_TOKEN", ""))
    parser.add_argument("--host", default=None, help="skip the probe; use this address")
    parser.add_argument("--interval", type=float, default=DEFAULT_INTERVAL)
    parser.add_argument("--once", action="store_true", help="read once and exit")
    parser.add_argument("--no-post", action="store_true", help="print only, never upload")
    parser.add_argument(
        "--camera-name",
        default=os.environ.get("DASHCAM_NAME", PINNED_CAMERA_NAME),
        help="expected camera name; readings from any other camera are not posted",
    )
    parser.add_argument(
        "--any-camera",
        action="store_true",
        help="post whatever answers, without checking it is the pinned camera",
    )
    args = parser.parse_args(argv)

    posting = not args.no_post
    if posting and not (args.relay and args.token):
        parser.error("--relay and --token are required unless --no-post is given")

    hosts = (args.host,) if args.host else CAMERA_HOSTS

    while True:
        status = find_camera(hosts)

        if status is None:
            # Say nothing to the relay. A silent bridge lets the app show the
            # reading going stale, which is true; posting "offline" from here
            # would claim the camera is off when it may be the bridge that
            # wandered off the camera's Wi-Fi.
            print("camera did not answer", file=sys.stderr, flush=True)
        else:
            print(describe(status), flush=True)

            # A positively identified foreign camera is never published: the
            # whole point of the relay is that the status you read is yours.
            # An unidentifiable reply (None) is allowed through, because old
            # firmware simply does not report a name.
            match = None if args.any_camera else is_pinned_camera(status, args.camera_name)
            if match is False:
                model = (status.get("device") or {}).get("model")
                ssid = (status.get("wifi") or {}).get("ssid")
                print(
                    f"refusing to report {model or ssid or 'an unknown camera'}: "
                    f"expected {args.camera_name}. Pass --any-camera to override.",
                    file=sys.stderr,
                    flush=True,
                )
            elif posting:
                try:
                    post_status(args.relay, args.token, status)
                except urllib.error.HTTPError as err:
                    print(f"relay rejected it: HTTP {err.code}", file=sys.stderr, flush=True)
                except Exception as err:
                    print(f"relay unreachable: {err}", file=sys.stderr, flush=True)

        if args.once:
            return 0 if status else 1

        time.sleep(max(5.0, args.interval))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
