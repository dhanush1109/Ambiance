#!/usr/bin/env python3
"""Live BLE end-to-end test: official all-zone colors vs experimental per-piece frames.

Does not change the GUI. Prints GATT results only — watch the car for actual light changes.
"""

from __future__ import annotations

import asyncio
import sys
from typing import Optional

from cardi_ble import (
    CardiController,
    classify_name,
    find_cardi_device,
    payload_piece,
    payload_power,
    payload_rgb,
    scan_nearby,
    write_uuid_for,
)


async def send_logged(ctl: CardiController, label: str, payload: bytes) -> bool:
    hex_str = payload.hex(" ").upper()
    print(f"  WRITE {label}")
    print(f"    hex  {hex_str}")
    try:
        result = await ctl.send(payload)
        print(f"    uuid {ctl.write_uuid}  with_response={ctl.write_response}")
        print(f"    ok   {result}")
        return True
    except Exception as exc:
        print(f"    FAIL {type(exc).__name__}: {exc}")
        return False


async def main() -> int:
    print("=" * 60)
    print("Cardi Magic live E2E test")
    print("Official protocol: 3 zones only. Piece 1/19 frames are experimental.")
    print("=" * 60)

    print("\n[1] Scanning 25s for ATW- / VE-CD / CD-AMB ...")
    device = await find_cardi_device(25.0)
    if device is None:
        print("    No Cardi Magic advertisement.")
        print("    Nearby named devices:")
        nearby = await scan_nearby(8.0)
        for item in nearby:
            if item.name != "Unknown":
                print(f"      {item.address}  rssi={item.rssi}  {item.name}")
        print("\nRESULT: FAIL connect — adapter not advertising.")
        print("Force-close the phone app, power-cycle the box, retry.")
        return 2

    name = device.name or ""
    hw = classify_name(name) or "A"
    print(f"    found name={name!r}")
    print(f"    mac={device.address}")
    print(f"    protocol=Type {hw}  expected write={write_uuid_for(hw)}")

    print("\n[2] Connecting ...")
    ctl = CardiController()
    try:
        await ctl.connect(device, name, hw)
    except Exception as exc:
        print(f"    FAIL {type(exc).__name__}: {exc}")
        print("\nRESULT: FAIL connect.")
        return 3

    print(f"    connected={ctl.connected}")
    print(f"    protocol={ctl.hw}")

    results: dict[str, bool] = {}

    print("\n[3] Official power ON")
    results["power_on"] = await send_logged(ctl, "power ON", payload_power(ctl.hw, True))
    await asyncio.sleep(0.4)

    print("\n[4] Official ALL-ZONE red (zone 3)")
    results["all_red"] = await send_logged(ctl, "all-zone red", payload_rgb(ctl.hw, 255, 0, 0, 3))
    print("    Watch the car: whole kit should go RED.")
    await asyncio.sleep(2.0)

    print("\n[5] Official ALL-ZONE blue (zone 3)")
    results["all_blue"] = await send_logged(ctl, "all-zone blue", payload_rgb(ctl.hw, 0, 0, 255, 3))
    print("    Watch the car: whole kit should go BLUE.")
    await asyncio.sleep(2.0)

    print("\n[6] Experimental PIECE 1 green (not in official app unless zone 1)")
    results["piece1"] = await send_logged(ctl, "piece 1 green", payload_piece(ctl.hw, 1, 0, 255, 0))
    print("    Watch: only ONE strip green = individual works.")
    print("    Whole kit green, or no change = individual does NOT work.")
    await asyncio.sleep(2.0)

    print("\n[7] Experimental PIECE 19 yellow (index 19 is NOT in official app)")
    results["piece19"] = await send_logged(
        ctl, "piece 19 yellow", payload_piece(ctl.hw, 19, 255, 255, 0)
    )
    print("    Watch: only one other strip yellow = individual works.")
    print("    No change, or whole kit changes = individual does NOT work.")
    await asyncio.sleep(2.0)

    print("\n[8] Disconnect")
    await ctl.disconnect()
    print("    disconnected")

    print("\n" + "=" * 60)
    print("GATT table (write accepted by BLE stack, not proof lights moved)")
    print("=" * 60)
    for key, ok in results.items():
        print(f"  {key:12}  {'WRITE_OK' if ok else 'WRITE_FAIL'}")

    print("\nHow to read this:")
    print("  - If steps 4-5 changed ALL lights: all-zone control WORKS.")
    print("  - If step 6 changed only one strip AND step 7 changed a different")
    print("    strip: individual 19-piece control WORKS.")
    print("  - If piece 1/19 did nothing extra, or moved the whole kit:")
    print("    individual 19-piece control DOES NOT WORK on this firmware.")
    print("=" * 60)
    return 0 if results.get("power_on") else 1


if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    raise SystemExit(asyncio.run(main()))
