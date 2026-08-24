"""Generate src/test/golden_vectors.json from the REAL Python protocol modules.

This is the acceptance oracle for the JavaScript port in web/src/protocol/.
It imports `cardi_ble` and `symphony_modes` from the project root (the known-good
implementations that have been proven against the physical ATW-FWD-AAA6 box) and
dumps every payload as an uppercase space-separated hex string.

Run with the project venv:

    & "..\\.venv\\Scripts\\python.exe" web\\tools\\gen_golden.py

Output shape:

    {
      "power":      [ { "args": {...}, "hex": "3C 30 ..." }, ... ],
      "rgb":        [ ... ],
      "brightness": [ ... ],
      "rgbMode":    [ ... ],
      "symphony":   [ ... ]
    }

Nothing here is hand-written into the JSON: if you change a frame builder in
Python, re-run this and the JS test will immediately tell you what drifted.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
WEB_ROOT = HERE.parent.parent
PROJECT_ROOT = WEB_ROOT.parent
OUT_PATH = WEB_ROOT / "src" / "test" / "golden_vectors.json"

# The real modules live at the project root, next to PROTOCOL.md.
sys.path.insert(0, str(PROJECT_ROOT))

import cardi_ble  # noqa: E402
import symphony_modes  # noqa: E402

HW_KINDS = ("A", "B")
ZONES = (1, 2, 3)

# 10 colours, deliberately including both extremes plus the app accent and a
# few awkward values that exercise nibble-to-ASCII encoding on Type A.
COLORS = [
    "000000",
    "ffffff",
    "ff0000",
    "00ff00",
    "0000ff",
    "ff8a3d",
    "12ab7c",
    "7b00ff",
    "ffcc00",
    "0a0b0e",
]


def to_hex(payload: bytes) -> str:
    """Uppercase, space separated - matches bytesToHex(bytes, ' ') in JS."""
    return payload.hex(" ").upper()


def vector(args: dict, payload: bytes) -> dict:
    return {"args": args, "hex": to_hex(payload)}


def build_power() -> list[dict]:
    out = []
    for hw in HW_KINDS:
        for on in (True, False):
            out.append(vector({"hw": hw, "on": on}, cardi_ble.payload_power(hw, on)))
    return out


def build_rgb() -> list[dict]:
    out = []
    for hw in HW_KINDS:
        for zone in ZONES:
            for color in COLORS:
                r = int(color[0:2], 16)
                g = int(color[2:4], 16)
                b = int(color[4:6], 16)
                out.append(
                    vector(
                        {"hw": hw, "r": r, "g": g, "b": b, "zone": zone, "color": color},
                        cardi_ble.payload_rgb(hw, r, g, b, zone),
                    )
                )
    return out


def build_brightness() -> list[dict]:
    out = []
    for hw in HW_KINDS:
        for zone in ZONES:
            for level in range(10):
                out.append(
                    vector(
                        {"hw": hw, "level": level, "zone": zone},
                        cardi_ble.payload_brightness(hw, level, zone),
                    )
                )
    return out


def build_rgb_mode() -> list[dict]:
    names = dict(cardi_ble.RGB_ANIMATIONS)
    out = []
    for hw in HW_KINDS:
        for select in range(1, 32):
            out.append(
                vector(
                    {"hw": hw, "select": select, "name": names[select]},
                    cardi_ble.payload_rgb_mode(hw, select),
                )
            )
    return out


def build_symphony() -> list[dict]:
    out = []
    for kind in ("dazzle", "music", "shadow"):
        for index, name in symphony_modes.names_for(kind):
            out.append(
                vector(
                    {"kind": kind, "mode": index, "name": name},
                    symphony_modes.payload_symphony_a(kind, index),
                )
            )
    return out


def main() -> int:
    data = {
        "power": build_power(),
        "rgb": build_rgb(),
        "brightness": build_brightness(),
        "rgbMode": build_rgb_mode(),
        "symphony": build_symphony(),
    }

    total = sum(len(v) for v in data.values())
    if total < 230:
        raise SystemExit(f"Refusing to write only {total} vectors; expected 230+")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    for key, items in data.items():
        print(f"  {key:<11} {len(items):>4} vectors")
    print(f"  {'TOTAL':<11} {total:>4} vectors -> {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
