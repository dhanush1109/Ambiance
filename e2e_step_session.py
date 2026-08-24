#!/usr/bin/env python3
"""Stepped ATW test. Holds BLE connection. Advances only when e2e_cmd.txt contains 'next'."""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

from cardi_ble import (
    CardiController,
    classify_name,
    find_cardi_device,
    payload_piece,
    payload_power,
    payload_rgb,
)

ROOT = Path(__file__).resolve().parent
CMD = ROOT / "e2e_cmd.txt"
STATUS = ROOT / "e2e_status.txt"

STEPS = [
    ("front_green", "FRONT zone only GREEN (official zone 1)", lambda hw: payload_rgb(hw, 0, 255, 0, 1)),
    ("rear_green", "REAR zone only GREEN (official zone 2)", lambda hw: payload_rgb(hw, 0, 255, 0, 2)),
    ("all_green", "ALL zones GREEN (official zone 3)", lambda hw: payload_rgb(hw, 0, 255, 0, 3)),
]


def write_status(text: str) -> None:
    STATUS.write_text(text, encoding="utf-8")
    print(text, flush=True)


async def wait_for_next(timeout: float = 600.0) -> bool:
    CMD.write_text("", encoding="utf-8")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if CMD.exists():
            raw = CMD.read_text(encoding="utf-8").strip().lower()
            if raw in {"next", "ok", "yes", "approve"}:
                CMD.write_text("", encoding="utf-8")
                return True
            if raw in {"quit", "stop", "fail"}:
                CMD.write_text("", encoding="utf-8")
                return False
        await asyncio.sleep(0.35)
    return False


async def send_logged(ctl: CardiController, label: str, payload: bytes) -> bool:
    write_status(f"  WRITE {label}\n    hex {payload.hex(' ').upper()}")
    try:
        result = await ctl.send(payload)
        write_status(f"    ok {result}")
        return True
    except Exception as exc:
        write_status(f"    FAIL {type(exc).__name__}: {exc}")
        return False


async def main() -> int:
    write_status("Scanning 25s for ATW- ...")
    device = await find_cardi_device(25.0)
    if device is None:
        write_status("FAIL: ATW not advertising. Close phone app, power-cycle adapter.")
        return 2

    name = device.name or ""
    hw = classify_name(name) or "A"
    write_status(f"Found {name}  {device.address}  Type {hw}")
    ctl = CardiController()
    await ctl.connect(device, name, hw)
    write_status(f"Connected. protocol={ctl.hw}")

    write_status("Power ON")
    await send_logged(ctl, "power ON", payload_power(ctl.hw, True))
    await asyncio.sleep(0.4)

    for i, (key, title, builder) in enumerate(STEPS, start=1):
        write_status(f"\n=== STEP {i}/{len(STEPS)}: {title} ===")
        await send_logged(ctl, key, builder(ctl.hw))
        write_status(
            f"WAITING: look at the car, then approve.\n"
            f"Reply in chat, or write next into {CMD.name}"
        )
        if i == len(STEPS):
            break
        ok = await wait_for_next()
        if not ok:
            write_status("Stopped before remaining steps.")
            await ctl.disconnect()
            return 4

    await ctl.disconnect()
    write_status("Disconnected. Session done.")
    return 0


if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    raise SystemExit(asyncio.run(main()))
