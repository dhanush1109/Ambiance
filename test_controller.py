#!/usr/bin/env python3
"""
Cardi Magic BLE test controller.

Uses the protocol extracted from Cardi Magic 1.2.7 (see PROTOCOL.md).

Usage:
    .\\.venv\\Scripts\\python.exe test_controller.py
    .\\.venv\\Scripts\\python.exe test_controller.py --scan
    .\\.venv\\Scripts\\python.exe test_controller.py --red
    .\\.venv\\Scripts\\python.exe test_controller.py --on
    .\\.venv\\Scripts\\python.exe test_controller.py --off
    .\\.venv\\Scripts\\python.exe test_controller.py --brightness 5
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from typing import Optional

from bleak import BleakClient, BleakScanner
from bleak.backends.device import BLEDevice
from bleak.exc import BleakError

# ---------------------------------------------------------------------------
# PASTE YOUR CAR / CONTROLLER MAC ADDRESS HERE (Windows: "AA:BB:CC:DD:EE:FF")
# Leave empty to auto-pick the first Cardi Magic-compatible advertisement.
# ---------------------------------------------------------------------------
DEVICE_MAC = ""  # e.g. "AA:BB:CC:DD:EE:FF"

# 16-bit aliases as used by bleconfig.java (matched with String.contains)
SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb"
CHAR_FFE1 = "0000ffe1-0000-1000-8000-00805f9b34fb"
CHAR_FFE2 = "0000ffe2-0000-1000-8000-00805f9b34fb"

NAME_PREFIXES_TYPE_A = ("ATW-", "atw-", "VE-CD")
NAME_PREFIXES_TYPE_B = ("CD-AMB",)
NAME_ALL = NAME_PREFIXES_TYPE_A + NAME_PREFIXES_TYPE_B


def hex_bytes(hex_str: str) -> bytes:
    cleaned = hex_str.replace(" ", "").replace(":", "")
    return bytes.fromhex(cleaned)


# --- Type B (CD-AMB): 3B ... B3 ---------------------------------------------
def type_b_power(on: bool) -> bytes:
    return hex_bytes("3B30000000F0B3" if on else "3B300000000FB3")


def type_b_rgb(r: int, g: int, b: int, zone: int = 3) -> bytes:
    return bytes([0x3B, 0x33, zone & 0xFF, r & 0xFF, g & 0xFF, b & 0xFF, 0xB3])


def type_b_brightness(level: int, zone: int = 3) -> bytes:
    zone_byte = {1: 0xF1, 2: 0xF2, 3: 0xF3}[zone]
    return bytes([0x3B, 0x39, zone_byte, 0x00, 0x00, level & 0xFF, 0xB3])


# --- Type A (ATW / VE-CD): ASCII <...> --------------------------------------
def _ascii_frame(inner: str) -> bytes:
    return ("<" + inner + ">").encode("ascii")


def type_a_power(on: bool) -> bytes:
    return _ascii_frame("0701" if on else "0700")


def type_a_rgb(r: int, g: int, b: int, zone: int = 3) -> bytes:
    # rgbFragment.send_color: zone 1="<10", 2="<09", 3="<06" + lowercase rrggbb
    prefix = {1: "10", 2: "09", 3: "06"}[zone]
    return _ascii_frame(f"{prefix}{r:02x}{g:02x}{b:02x}")


def type_a_brightness(level: int, zone: int = 3) -> bytes:
    # Seek bar 0-9. The APK appends (level + 30) as hex, which is ASCII '0'..'9'.
    prefix = {1: "01010", 2: "01020", 3: "02000"}[zone]
    return _ascii_frame(prefix + str(int(level)))


def classify_name(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    if any(p in name for p in NAME_PREFIXES_TYPE_B):
        return "B"
    if any(p in name for p in NAME_PREFIXES_TYPE_A):
        return "A"
    return None


def write_uuid_for(hw: str) -> str:
    # CD-AMB writes FFE1; everyone else writes FFE2 (bleconfig + BLEManager swap)
    return CHAR_FFE1 if hw == "B" else CHAR_FFE2


def notify_uuid_for(hw: str) -> str:
    return CHAR_FFE2 if hw == "B" else CHAR_FFE1


async def scan_devices(timeout: float = 8.0) -> list[BLEDevice]:
    print(f"Scanning {timeout:.0f}s for Cardi Magic adapters "
          f"(ATW- / VE-CD / CD-AMB)...")
    found: dict[str, BLEDevice] = {}
    devices = await BleakScanner.discover(timeout=timeout)
    for dev in devices:
        name = dev.name or ""
        if classify_name(name):
            found[dev.address] = dev
            print(f"  {dev.address}  rssi={getattr(dev, 'rssi', '?')}  {name}")
    if not found:
        print("  (none matched. Nearby BLE names:)")
        for dev in devices:
            if dev.name:
                print(f"    {dev.address}  {dev.name}")
    return list(found.values())


async def resolve_target(mac: str) -> tuple[BLEDevice, str]:
    mac = (mac or DEVICE_MAC).strip()
    if mac:
        print(f"Looking for MAC {mac} ...")
        device = await BleakScanner.find_device_by_address(mac, timeout=10.0)
        if device is None:
            raise SystemExit(f"No advertisement from {mac}. Is the controller powered?")
        hw = classify_name(device.name) or "B"
        print(f"  found {device.name!r}  dialect={'CD-AMB / Type B' if hw == 'B' else 'ATW / Type A'}")
        return device, hw

    matches = await scan_devices()
    if not matches:
        raise SystemExit("No Cardi Magic device found. Set DEVICE_MAC in this file.")
    device = matches[0]
    hw = classify_name(device.name) or "A"
    print(f"Using first match: {device.address}  {device.name}")
    return device, hw


async def write_command(client: BleakClient, hw: str, payload: bytes) -> None:
    primary = write_uuid_for(hw)
    fallback = CHAR_FFE2 if primary == CHAR_FFE1 else CHAR_FFE1
    last_error: Optional[Exception] = None
    for uuid in (primary, fallback):
        for response in (True, False):
            try:
                await client.write_gatt_char(uuid, payload, response=response)
                print(f"  wrote {payload.hex(' ').upper()}  ->  {uuid}  "
                      f"(response={response})")
                return
            except (BleakError, ValueError) as exc:
                last_error = exc
    raise RuntimeError(f"GATT write failed: {last_error}")


def build_payload(hw: str, action: str, brightness: int) -> bytes:
    if action == "on":
        return type_b_power(True) if hw == "B" else type_a_power(True)
    if action == "off":
        return type_b_power(False) if hw == "B" else type_a_power(False)
    if action == "red":
        return type_b_rgb(0xFF, 0x00, 0x00) if hw == "B" else type_a_rgb(0xFF, 0x00, 0x00)
    if action == "green":
        return type_b_rgb(0x00, 0xFF, 0x00) if hw == "B" else type_a_rgb(0x00, 0xFF, 0x00)
    if action == "blue":
        return type_b_rgb(0x00, 0x00, 0xFF) if hw == "B" else type_a_rgb(0x00, 0x00, 0xFF)
    if action == "brightness":
        return type_b_brightness(brightness) if hw == "B" else type_a_brightness(brightness)
    raise ValueError(action)


async def run(args: argparse.Namespace) -> None:
    if args.scan:
        await scan_devices()
        return

    device, hw = await resolve_target(args.mac)
    write_uuid = write_uuid_for(hw)
    print(f"Connecting to {device.address} ...")
    async with BleakClient(device, timeout=20.0) as client:
        if not client.is_connected:
            raise SystemExit("Connect failed.")
        print("Connected.")
        print(f"  expected write char: {write_uuid}")
        print(f"  expected notify char: {notify_uuid_for(hw)}")

        services = client.services
        ffe0 = services.get_service(SERVICE_UUID)
        if ffe0 is None:
            print("  warning: service FFE0 not found. Services present:")
            for svc in services:
                print(f"    {svc.uuid}")
        else:
            for char in ffe0.characteristics:
                print(f"    char {char.uuid}  props={char.properties}")

        action = args.action
        if action == "red":
            # Official app: power on, then set static colour
            print("Sending Power ON, then static red (global zone)...")
            await write_command(client, hw, build_payload(hw, "on", args.brightness))
            await asyncio.sleep(0.15)
            await write_command(client, hw, build_payload(hw, "red", args.brightness))
        else:
            print(f"Sending {action}...")
            await write_command(client, hw, build_payload(hw, action, args.brightness))

        await asyncio.sleep(0.3)
        print("Done. Disconnecting.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Cardi Magic BLE test controller")
    parser.add_argument(
        "--mac",
        default=DEVICE_MAC,
        help="Controller MAC (overrides DEVICE_MAC at the top of this file)",
    )
    parser.add_argument("--scan", action="store_true", help="Scan only, do not connect")
    parser.add_argument(
        "--action",
        choices=("red", "green", "blue", "on", "off", "brightness"),
        default="red",
        help="Command to send (default: red)",
    )
    parser.add_argument(
        "--red",
        dest="action",
        action="store_const",
        const="red",
        help="Shortcut for --action red",
    )
    parser.add_argument("--on", dest="action", action="store_const", const="on")
    parser.add_argument("--off", dest="action", action="store_const", const="off")
    parser.add_argument("--green", dest="action", action="store_const", const="green")
    parser.add_argument("--blue", dest="action", action="store_const", const="blue")
    parser.add_argument(
        "--brightness",
        type=int,
        default=5,
        metavar="0-9",
        help="Brightness 0-9 (app seek bar max is 9, not 100)",
    )
    args = parser.parse_args()
    if not 0 <= args.brightness <= 9:
        parser.error("brightness must be 0-9 (Cardi Magic UI scale)")
    return args


if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    try:
        asyncio.run(run(parse_args()))
    except KeyboardInterrupt:
        print("Interrupted.")
