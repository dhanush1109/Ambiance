"""Cardi Magic BLE protocol and connection helper."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Callable, Optional

from bleak import BleakClient, BleakScanner
from bleak.backends.device import BLEDevice
from bleak.exc import BleakError

SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb"
CHAR_FFE1 = "0000ffe1-0000-1000-8000-00805f9b34fb"
CHAR_FFE2 = "0000ffe2-0000-1000-8000-00805f9b34fb"

NAME_TYPE_A = ("ATW-", "ATW-", "atw-", "atw-", "VE-CD")
NAME_TYPE_B = ("CD-AMB",)

ZONE_RGB = {1: 0x01, 2: 0x02, 3: 0x03}
ZONE_BRIGHT = {1: 0xF1, 2: 0xF2, 3: 0xF3}

# Official RGB page names (rgbmoshi1..31). Index is 1-based like the APK.
RGB_ANIMATIONS = [
    (1, "Rainbow Gradient"),
    (2, "Red-Purple Gradient"),
    (3, "Cyan-Orange Gradient"),
    (4, "Blue-Yellow Gradient"),
    (5, "Cyan-Purple Gradient"),
    (6, "Red-Green Gradient"),
    (7, "Red-Blue Gradient"),
    (8, "Green-Blue Gradient"),
    (9, "Red-Green Gradient 2"),
    (10, "Red-Green-Blue Gradient"),
    (11, "Cyan-Yellow-Purple Gradient"),
    (12, "Blue-Purple-White Gradient"),
    (13, "Colorful Flash"),
    (14, "Red Flash"),
    (15, "Green Flash"),
    (16, "Blue Flash"),
    (17, "Yellow Flash"),
    (18, "Cyan Flash"),
    (19, "Purple Flash"),
    (20, "White Flash"),
    (21, "Red-Green-Blue Flash"),
    (22, "Colorful Jump"),
    (23, "Red-Green-Blue Jump"),
    (24, "Cyan-Purple-Orange Jump"),
    (25, "Colorful Breathing"),
    (26, "Red-Green-Blue Breathing"),
    (27, "Cyan-Purple-Orange Breathing"),
    (28, "Red Breathing"),
    (29, "Blue Breathing"),
    (30, "Green Breathing"),
    (31, "Purple Breathing"),
]

# playmode2() MM byte for Type B
_ANIM_B_MM = {
    1: 0x07, 2: 0x04, 3: 0x08, 4: 0x05, 5: 0x0A, 6: 0x02, 7: 0x01,
    8: 0x05, 9: 0x02, 10: 0x03, 11: 0x09, 12: 0x06, 13: 0x21, 14: 0x1D,
    15: 0x20, 16: 0x1F, 17: 0x1E, 18: 0x22, 19: 0x23, 20: 0x1B, 21: 0x1C,
    22: 0x12, 23: 0x11, 24: 0x13, 25: 0x18, 26: 0x14, 27: 0x19, 28: 0x15,
    29: 0x16, 30: 0x17, 31: 0x1A,
}

SCENES_B = {
    "rainbow": bytes([0x3B, 0x34, 0x34, 0x34, 0x34, 0x07, 0xB3]),
    "flash": bytes([0x3B, 0x34, 0x34, 0x34, 0x34, 0x21, 0xB3]),
    "breathe": bytes([0x3B, 0x34, 0x34, 0x34, 0x34, 0x18, 0xB3]),
    "music": bytes([0x3B, 0x34, 0x34, 0x34, 0x34, 0x0B, 0xB3]),
}

SCENES_A = {
    "rainbow": b"<040000>",
    "flash": b"<04000c>",
    "breathe": b"<040018>",
    "music": b"<040501>",
}


@dataclass
class NearbyDevice:
    address: str
    name: str
    rssi: Optional[int]
    hw: Optional[str]
    is_cardi: bool
    ble_device: Optional[BLEDevice] = None


def classify_name(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    if any(token in name for token in NAME_TYPE_B):
        return "B"
    if any(token in name for token in NAME_TYPE_A):
        return "A"
    return None


def write_uuid_for(hw: str) -> str:
    return CHAR_FFE1 if hw == "B" else CHAR_FFE2


def _ascii_frame(inner: str) -> bytes:
    return ("<" + inner + ">").encode("ascii")


def payload_power(hw: str, on: bool) -> bytes:
    if hw == "B":
        return bytes.fromhex("3B30000000F0B3" if on else "3B300000000FB3")
    return _ascii_frame("0701" if on else "0700")


def payload_rgb(hw: str, r: int, g: int, b: int, zone: int = 3) -> bytes:
    if hw == "B":
        return bytes([0x3B, 0x33, ZONE_RGB[zone], r & 0xFF, g & 0xFF, b & 0xFF, 0xB3])
    prefix = {1: "10", 2: "09", 3: "06"}[zone]
    return _ascii_frame(f"{prefix}{r:02x}{g:02x}{b:02x}")


def payload_piece(hw: str, index: int, r: int, g: int, b: int) -> bytes:
    """Color one module. Uses the Type B RGB frame with index as the zone byte."""
    n = max(1, min(19, int(index)))
    return bytes([0x3B, 0x33, n & 0xFF, r & 0xFF, g & 0xFF, b & 0xFF, 0xB3])


def payload_brightness(hw: str, level: int, zone: int = 3) -> bytes:
    level = max(0, min(9, int(level)))
    if hw == "B":
        return bytes([0x3B, 0x39, ZONE_BRIGHT[zone], 0x00, 0x00, level, 0xB3])
    prefix = {1: "01010", 2: "01020", 3: "02000"}[zone]
    return _ascii_frame(prefix + str(level))


def payload_scene(hw: str, scene: str) -> bytes:
    table = SCENES_B if hw == "B" else SCENES_A
    if scene not in table:
        raise ValueError(f"Unknown scene: {scene}")
    return table[scene]


def payload_rgb_mode(hw: str, select: int) -> bytes:
    """Official RGB animation from rgbFragment.playmode1/2. select is 1..31."""
    select = max(1, min(31, int(select)))
    if hw == "B":
        return bytes([0x3B, 0x34, 0x34, 0x34, 0x34, _ANIM_B_MM[select], 0xB3])
    if select < 11:
        prefix, extra = "3C3034303030", select + 29
    elif select < 13:
        prefix, extra = "3C3034303031", select + 19
    elif select < 22:
        prefix, extra = "3C3034303130", select + 17
    elif select < 25:
        prefix, extra = "3C3034303230", select + 8
    else:
        prefix, extra = "3C3034303430", select + 5
    return bytes.fromhex(prefix + f"{extra:02d}" + "3E")


def payload_speed(hw: str, level: int, family: str = "rgb") -> bytes:
    """RGB / Symphony animation speed. Official seekbar is 0..10.

    Type A uses the same +30 ASCII trick as brightness. Level 10 would make
    `10 + 30 = 40`, an odd-length hex string, so the APK substitutes 61 ('a').
    RGB page:  `<3e0X>`   Symphony page: `<0b0X>`.
    Type B is a single global frame `3B 38 F3 00 00 LL B3`.
    """
    level = max(0, min(10, int(level)))
    if hw == "B":
        return bytes([0x3B, 0x38, 0xF3, 0x00, 0x00, level, 0xB3])
    extra = 61 if level == 10 else level + 30
    prefix = "3C306230" if family == "symphony" else "3C336530"
    return bytes.fromhex(prefix + f"{extra:02d}" + "3E")


def normalize_mac(address: str) -> str:
    hex_only = "".join(ch for ch in address.upper() if ch in "0123456789ABCDEF")
    if len(hex_only) != 12:
        raise ValueError("MAC must be 12 hex digits, like 7B:F7:38:62:BA:8A")
    return ":".join(hex_only[i : i + 2] for i in range(0, 12, 2))


async def find_device_by_mac(address: str, timeout: float = 12.0) -> Optional[BLEDevice]:
    """Find a live BLEDevice for a known MAC. Returns None if it is not advertising."""
    mac = normalize_mac(address)
    return await BleakScanner.find_device_by_address(mac, timeout=timeout)


async def find_cardi_device(timeout: float = 15.0) -> Optional[BLEDevice]:
    """Return the first advertising Cardi Magic BLEDevice, or None."""

    def matches(device: BLEDevice, adv) -> bool:
        name = device.name or adv.local_name or ""
        return classify_name(name) is not None

    return await BleakScanner.find_device_by_filter(matches, timeout=timeout)


async def scan_nearby(timeout: float = 6.0) -> list[NearbyDevice]:
    found: dict[str, NearbyDevice] = {}

    def _remember(device: BLEDevice, adv) -> None:
        name = (device.name or adv.local_name or "").strip()
        prev = found.get(device.address)
        if prev and prev.name != "Unknown" and not name:
            return
        hw = classify_name(name) or (prev.hw if prev else None)
        rssi = adv.rssi if adv.rssi is not None else (prev.rssi if prev else None)
        found[device.address] = NearbyDevice(
            address=device.address,
            name=name or (prev.name if prev else "Unknown"),
            rssi=rssi,
            hw=hw,
            is_cardi=hw is not None,
            ble_device=device,
        )

    scanner = BleakScanner(detection_callback=_remember)
    await scanner.start()
    try:
        await asyncio.sleep(timeout)
    finally:
        await scanner.stop()

    cardi = [item for item in found.values() if item.is_cardi]
    named = [item for item in found.values() if not item.is_cardi and item.name != "Unknown"]
    unnamed = [item for item in found.values() if not item.is_cardi and item.name == "Unknown"]
    cardi.sort(key=lambda d: d.rssi or -999, reverse=True)
    named.sort(key=lambda d: d.rssi or -999, reverse=True)
    return cardi + named + unnamed


class CardiController:
    def __init__(self, on_disconnect: Optional[Callable[[], None]] = None):
        self.client: Optional[BleakClient] = None
        self.hw = "A"
        self.write_uuid: Optional[str] = None
        self.write_response: Optional[bool] = None
        self.address: Optional[str] = None
        self.name: Optional[str] = None
        self.on_disconnect = on_disconnect

    @property
    def connected(self) -> bool:
        return bool(self.client and self.client.is_connected)

    def _handle_disconnect(self, _client: BleakClient) -> None:
        if self.on_disconnect:
            self.on_disconnect()

    async def connect(
        self,
        target,
        name: str = "",
        hw: Optional[str] = None,
    ) -> None:
        await self.disconnect()
        if isinstance(target, BLEDevice):
            address = target.address
            name = name or target.name or ""
        else:
            address = str(target)
        self.hw = hw or classify_name(name) or "A"
        self.address = address
        self.name = name
        client = BleakClient(
            target,
            disconnected_callback=self._handle_disconnect,
            timeout=20.0,
        )
        await client.connect()
        self.client = client
        self.write_uuid = None
        self.write_response = None

    async def disconnect(self) -> None:
        client = self.client
        self.client = None
        self.write_uuid = None
        self.write_response = None
        if client is not None:
            try:
                await client.disconnect()
            except Exception:
                pass

    async def send(self, payload: bytes) -> str:
        if not self.connected or self.client is None:
            raise RuntimeError("Not connected")
        if self.write_uuid is not None and self.write_response is not None:
            await self.client.write_gatt_char(
                self.write_uuid, payload, response=self.write_response
            )
            return f"{payload.hex(' ').upper()} -> {self.write_uuid}"

        primary = write_uuid_for(self.hw)
        fallback = CHAR_FFE2 if primary == CHAR_FFE1 else CHAR_FFE1
        last_error: Optional[Exception] = None
        for uuid in (primary, fallback):
            for response in (True, False):
                try:
                    await self.client.write_gatt_char(uuid, payload, response=response)
                    self.write_uuid = uuid
                    self.write_response = response
                    return f"{payload.hex(' ').upper()} -> {uuid}"
                except (BleakError, ValueError) as exc:
                    last_error = exc
        raise RuntimeError(f"GATT write failed: {last_error}")

    async def set_power(self, on: bool) -> str:
        return await self.send(payload_power(self.hw, on))

    async def set_color(self, r: int, g: int, b: int, zone: int = 3) -> str:
        return await self.send(payload_rgb(self.hw, r, g, b, zone))

    async def set_piece(self, index: int, r: int, g: int, b: int) -> str:
        return await self.send(payload_piece(self.hw, index, r, g, b))

    async def set_pieces(self, indices: list[int], r: int, g: int, b: int) -> str:
        import asyncio

        lines: list[str] = []
        for index in indices:
            lines.append(await self.set_piece(index, r, g, b))
            await asyncio.sleep(0.04)
        return "\n".join(lines)

    async def set_brightness(self, level: int, zone: int = 3) -> str:
        return await self.send(payload_brightness(self.hw, level, zone))

    async def set_scene(self, scene: str) -> str:
        return await self.send(payload_scene(self.hw, scene))

    async def set_rgb_mode(self, select: int) -> str:
        return await self.send(payload_rgb_mode(self.hw, select))

    async def set_speed(self, level: int, family: str = "both") -> str:
        if self.hw != "A" or family == "rgb":
            return await self.send(payload_speed(self.hw, level, "rgb"))
        if family == "symphony":
            return await self.send(payload_speed(self.hw, level, "symphony"))
        rgb = await self.send(payload_speed(self.hw, level, "rgb"))
        symphony = await self.send(payload_speed(self.hw, level, "symphony"))
        return f"{rgb}\n{symphony}"

    async def set_symphony(self, kind: str, mode: int) -> str:
        from symphony_modes import payload_symphony_a

        return await self.send(payload_symphony_a(kind, mode))
