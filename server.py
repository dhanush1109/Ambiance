#!/usr/bin/env python3
"""Bleak BLE backend for the Lumen React UI."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from cardi_ble import (
    RGB_ANIMATIONS,
    CardiController,
    NearbyDevice,
    classify_name,
    find_device_by_mac,
    normalize_mac,
    scan_nearby,
)
from symphony_modes import CATEGORIES, names_for

if sys.platform.startswith("win"):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

app = FastAPI(title="Lumen BLE")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_lock = asyncio.Lock()
_ctl = CardiController()
_scan_cache: dict[str, NearbyDevice] = {}
_last_error: Optional[str] = None
_busy = False
_CONFIG = Path(__file__).resolve().parent / "ambient_light.json"
KNOWN_ATW_MAC = "7B:F7:38:62:BA:8A"
KNOWN_ATW_NAME = "ATW-FWD-AAA6"


def _load_saved_mac() -> str:
    try:
        return json.loads(_CONFIG.read_text(encoding="utf-8")).get("last_mac") or KNOWN_ATW_MAC
    except Exception:
        return KNOWN_ATW_MAC


def _save_mac(address: str, name: str = "") -> None:
    try:
        _CONFIG.write_text(
            json.dumps({"last_mac": address, "last_name": name or KNOWN_ATW_NAME}, indent=2),
            encoding="utf-8",
        )
    except Exception:
        pass


def _public_device(item: NearbyDevice) -> dict[str, Any]:
    return {
        "address": item.address,
        "name": item.name,
        "rssi": item.rssi,
        "hw": item.hw,
        "isCardi": item.is_cardi,
    }


def _status() -> dict[str, Any]:
    return {
        "connected": _ctl.connected,
        "address": _ctl.address,
        "name": _ctl.name,
        "hw": _ctl.hw if _ctl.connected else None,
        "busy": _busy,
        "error": _last_error,
        "savedMac": _load_saved_mac(),
        "knownName": KNOWN_ATW_NAME,
    }


class ConnectBody(BaseModel):
    address: str


class PowerBody(BaseModel):
    on: bool


class ColorBody(BaseModel):
    r: int = Field(ge=0, le=255)
    g: int = Field(ge=0, le=255)
    b: int = Field(ge=0, le=255)
    zone: int = Field(default=3, ge=1, le=3)


class BrightBody(BaseModel):
    level: int = Field(ge=0, le=9)
    zone: int = Field(default=3, ge=1, le=3)


class RgbModeBody(BaseModel):
    index: int = Field(ge=1, le=31)


class SymphonyBody(BaseModel):
    kind: str
    mode: int = Field(ge=1, le=63)


class SpeedBody(BaseModel):
    level: int = Field(ge=0, le=10)
    family: str = "both"


@app.get("/api/status")
async def status():
    return _status()


@app.get("/api/catalog")
async def catalog():
    return {
        "rgb": [{"index": i, "name": n} for i, n in RGB_ANIMATIONS],
        "symphony": {
            key: {"title": title, "modes": [{"index": i, "name": n} for i, n in names_for(key)]}
            for key, title in CATEGORIES.items()
        },
        "zones": [
            {"id": 3, "name": "All"},
            {"id": 1, "name": "Front"},
            {"id": 2, "name": "Rear / doors & feet"},
        ],
        "presets": [
            {"name": "Ember", "r": 255, "g": 72, "b": 32},
            {"name": "Amber", "r": 255, "g": 176, "b": 48},
            {"name": "Ice", "r": 56, "g": 189, "b": 255},
            {"name": "Violet", "r": 168, "g": 85, "b": 247},
            {"name": "Forest", "r": 16, "g": 185, "b": 129},
            {"name": "Rose", "r": 244, "g": 63, "b": 94},
            {"name": "White", "r": 245, "g": 245, "b": 245},
            {"name": "Midnight", "r": 30, "g": 64, "b": 175},
        ],
    }


@app.post("/api/scan")
async def scan():
    global _busy, _last_error
    async with _lock:
        _busy = True
        try:
            devices = await scan_nearby(15.0)
            _scan_cache.clear()
            for item in devices:
                _scan_cache[item.address] = item
            _last_error = None
            return {"ok": True, "devices": [_public_device(d) for d in devices], **_status()}
        except Exception as exc:
            _last_error = str(exc)
            raise HTTPException(500, str(exc)) from exc
        finally:
            _busy = False


@app.post("/api/connect")
async def connect(body: ConnectBody):
    global _busy, _last_error
    try:
        mac = normalize_mac(body.address)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    item = _scan_cache.get(mac) or _scan_cache.get(body.address)
    name = (item.name if item else "") or (
        KNOWN_ATW_NAME if mac == KNOWN_ATW_MAC else "ATW"
    )
    hw = classify_name(name) or "A"
    target = item.ble_device if item and item.ble_device else None

    async with _lock:
        _busy = True
        try:
            if target is None:
                target = await find_device_by_mac(mac, timeout=12.0)
            if target is None:
                target = mac
            await _ctl.connect(target, name, hw)
            _save_mac(mac, name)
            _last_error = None
            return {"ok": True, **_status()}
        except Exception as exc:
            _last_error = str(exc)
            raise HTTPException(
                500,
                f"Direct connect to {mac} failed: {exc}. "
                "Keep the box powered and close Cardi Magic on the phone.",
            ) from exc
        finally:
            _busy = False


@app.post("/api/disconnect")
async def disconnect():
    async with _lock:
        await _ctl.disconnect()
    return {"ok": True, **_status()}


async def _run_cmd(coro):
    global _busy, _last_error
    if not _ctl.connected:
        raise HTTPException(400, "Not connected")
    async with _lock:
        _busy = True
        try:
            result = await coro
            _last_error = None
            return {"ok": True, "result": result, **_status()}
        except Exception as exc:
            _last_error = str(exc)
            raise HTTPException(500, str(exc)) from exc
        finally:
            _busy = False


@app.post("/api/power")
async def power(body: PowerBody):
    return await _run_cmd(_ctl.set_power(body.on))


@app.post("/api/color")
async def color(body: ColorBody):
    return await _run_cmd(_ctl.set_color(body.r, body.g, body.b, body.zone))


@app.post("/api/brightness")
async def brightness(body: BrightBody):
    return await _run_cmd(_ctl.set_brightness(body.level, body.zone))


@app.post("/api/rgb-mode")
async def rgb_mode(body: RgbModeBody):
    return await _run_cmd(_ctl.set_rgb_mode(body.index))


@app.post("/api/symphony")
async def symphony(body: SymphonyBody):
    if body.kind not in CATEGORIES:
        raise HTTPException(400, "kind must be dazzle, music, or shadow")
    return await _run_cmd(_ctl.set_symphony(body.kind, body.mode))


@app.post("/api/speed")
async def speed(body: SpeedBody):
    family = body.family if body.family in ("rgb", "symphony", "both") else "both"
    return await _run_cmd(_ctl.set_speed(body.level, family))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8787, reload=False)
