#!/usr/bin/env python3
"""Scan nearby Cardi Magic BLE devices and control the lights."""

from __future__ import annotations

import asyncio
import json
import sys
import threading
from pathlib import Path
from tkinter import colorchooser

import customtkinter as ctk

from cardi_ble import (
    CardiController,
    NearbyDevice,
    RGB_ANIMATIONS,
    classify_name,
    scan_nearby,
)
from symphony_modes import CATEGORIES, names_for

CONFIG_PATH = Path(__file__).with_name("ambient_light.json")

PRESETS = [
    ("Red", 227, 59, 59),
    ("Orange", 240, 122, 42),
    ("Amber", 240, 180, 41),
    ("Warm", 243, 213, 176),
    ("Green", 46, 204, 113),
    ("Teal", 45, 212, 191),
    ("Blue", 59, 130, 246),
    ("Ice", 147, 197, 253),
    ("Purple", 139, 92, 246),
    ("Pink", 236, 72, 153),
    ("White", 245, 245, 245),
]

ACCENT = "#E8A87C"
BG = "#101218"
CARD = "#171B24"
CARD_2 = "#1E2733"
TEXT = "#E8EEF4"
MUTED = "#8A96A8"


class BleLoop:
    def __init__(self) -> None:
        self.loop: asyncio.AbstractEventLoop | None = None
        ready = threading.Event()
        threading.Thread(target=self._run, args=(ready,), daemon=True).start()
        ready.wait(timeout=5)

    def _run(self, ready: threading.Event) -> None:
        if sys.platform.startswith("win"):
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        ready.set()
        self.loop.run_forever()

    def submit(self, coro):
        if self.loop is None:
            raise RuntimeError("BLE loop is not ready")
        return asyncio.run_coroutine_threadsafe(coro, self.loop)

    def stop(self) -> None:
        if self.loop is not None:
            self.loop.call_soon_threadsafe(self.loop.stop)


class AmbientApp(ctk.CTk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Ambient Light")
        self.geometry("1100x860")
        self.minsize(960, 760)
        self.configure(fg_color=BG)

        self.ble = BleLoop()
        self.controller = CardiController(on_disconnect=self._on_ble_disconnect)
        self.devices: list[NearbyDevice] = []
        self.selected: NearbyDevice | None = None
        self.device_rows: dict[str, ctk.CTkFrame] = {}
        self.current_color = (227, 59, 59)
        self.power_on = False
        self.selected_pieces: set[int] = set()
        self.piece_btns: dict[int, ctk.CTkButton] = {}
        self.anim_btns: dict[tuple, ctk.CTkButton] = {}
        self.selected_anim: tuple | None = None
        self.anim_kind = "rgb"
        self.anim_scroll = None
        self._busy = False
        self._jobs: list[tuple] = []
        self._bright_job = None

        self._build()
        self._set_connected(False)
        self.protocol("WM_DELETE_WINDOW", self._close)
        self.after(400, self.scan)

    def _build(self) -> None:
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=22, pady=(18, 8))
        ctk.CTkLabel(
            header, text="Ambient Light",
            font=ctk.CTkFont(size=26, weight="bold"), text_color=TEXT,
        ).pack(side="left")
        self.status_dot = ctk.CTkLabel(
            header, text="  ●  Disconnected", font=ctk.CTkFont(size=13), text_color=MUTED
        )
        self.status_dot.pack(side="right", pady=8)

        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=22, pady=(0, 12))
        body.grid_columnconfigure(1, weight=1)
        body.grid_rowconfigure(0, weight=1)
        self._build_left(body)
        self._build_right(body)

        log_wrap = ctk.CTkFrame(self, fg_color=CARD, corner_radius=14)
        log_wrap.pack(fill="x", padx=22, pady=(0, 18))
        ctk.CTkLabel(
            log_wrap, text="Activity", text_color=MUTED, font=ctk.CTkFont(size=12)
        ).pack(anchor="w", padx=14, pady=(10, 0))
        self.log_box = ctk.CTkTextbox(
            log_wrap, height=56, fg_color=CARD_2, text_color="#C5D0DC",
            font=ctk.CTkFont(size=12),
        )
        self.log_box.pack(fill="x", padx=12, pady=(6, 12))
        self.log_box.configure(state="disabled")
        self._log("Turn on the car adapter, then click Scan.")

    def _build_left(self, parent: ctk.CTkFrame) -> None:
        left = ctk.CTkFrame(parent, fg_color=CARD, corner_radius=16, width=340)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 12))
        left.grid_propagate(False)

        bar = ctk.CTkFrame(left, fg_color="transparent")
        bar.pack(fill="x", padx=14, pady=(14, 8))
        ctk.CTkLabel(
            bar, text="Nearby devices",
            font=ctk.CTkFont(size=16, weight="bold"), text_color=TEXT,
        ).pack(side="left")
        self.scan_btn = ctk.CTkButton(
            bar, text="Scan", width=88, height=32,
            fg_color=ACCENT, hover_color="#D49263", text_color="#1A120C",
            command=self.scan,
        )
        self.scan_btn.pack(side="right")

        self.scan_hint = ctk.CTkLabel(
            left, text="Looking for ATW-, VE-CD, CD-AMB…",
            text_color=MUTED, font=ctk.CTkFont(size=12),
        )
        self.scan_hint.pack(anchor="w", padx=14)

        self.device_list = ctk.CTkScrollableFrame(left, fg_color=CARD_2, corner_radius=12)
        self.device_list.pack(fill="both", expand=True, padx=12, pady=10)

        actions = ctk.CTkFrame(left, fg_color="transparent")
        actions.pack(fill="x", padx=14, pady=(0, 8))
        self.connect_btn = ctk.CTkButton(
            actions, text="Connect", height=36, fg_color="#2F6FED",
            hover_color="#2558C4", command=self.connect_selected,
        )
        self.connect_btn.pack(side="left", expand=True, fill="x", padx=(0, 6))
        self.disconnect_btn = ctk.CTkButton(
            actions, text="Disconnect", height=36, fg_color="#3A3340",
            hover_color="#52465A", command=self.disconnect,
        )
        self.disconnect_btn.pack(side="left", expand=True, fill="x")

        proto = ctk.CTkFrame(left, fg_color="transparent")
        proto.pack(fill="x", padx=14, pady=(0, 16))
        ctk.CTkLabel(
            proto, text="Protocol", text_color=MUTED, font=ctk.CTkFont(size=12)
        ).pack(anchor="w")
        self.dialect = ctk.CTkSegmentedButton(
            proto, values=["Auto", "ATW", "CD-AMB"], command=self._on_dialect,
        )
        self.dialect.set("Auto")
        self.dialect.pack(fill="x", pady=(4, 0))

    def _build_right(self, parent: ctk.CTkFrame) -> None:
        right = ctk.CTkFrame(parent, fg_color=CARD, corner_radius=16)
        right.grid(row=0, column=1, sticky="nsew")

        top = ctk.CTkFrame(right, fg_color="transparent")
        top.pack(fill="x", padx=18, pady=(16, 8))
        self.device_title = ctk.CTkLabel(
            top, text="No device connected",
            font=ctk.CTkFont(size=18, weight="bold"), text_color=TEXT,
        )
        self.device_title.pack(anchor="w")
        self.device_sub = ctk.CTkLabel(
            top, text="Scan and connect to change the lights.",
            text_color=MUTED, font=ctk.CTkFont(size=12),
        )
        self.device_sub.pack(anchor="w")

        power = ctk.CTkFrame(right, fg_color=CARD_2, corner_radius=12)
        power.pack(fill="x", padx=18, pady=8)
        ctk.CTkLabel(
            power, text="Power", font=ctk.CTkFont(size=14, weight="bold")
        ).pack(side="left", padx=14, pady=12)
        self.power_switch = ctk.CTkSwitch(
            power, text="Lights on", command=self._toggle_power,
            progress_color=ACCENT, button_color="#F3E6D8",
        )
        self.power_switch.pack(side="right", padx=14)

        tabs = ctk.CTkTabview(
            right,
            fg_color=CARD_2,
            segmented_button_selected_color=ACCENT,
            segmented_button_selected_hover_color="#D49263",
            text_color="#1A120C",
        )
        tabs.pack(fill="both", expand=True, padx=14, pady=(4, 16))
        tab_pieces = tabs.add("19 pieces")
        tab_zones = tabs.add("Zones")
        tab_anims = tabs.add("Animations")
        tabs.set("Animations")

        self._build_pieces_tab(tab_pieces)
        self._build_zones_tab(tab_zones)
        self._build_anims_tab(tab_anims)

    def _build_pieces_tab(self, tab) -> None:
        ctk.CTkLabel(
            tab,
            text="Tap a number, then a color. Highlighted numbers are selected.",
            text_color=MUTED, font=ctk.CTkFont(size=12),
        ).pack(anchor="w", pady=(8, 6))
        row = ctk.CTkFrame(tab, fg_color="transparent")
        row.pack(fill="x", pady=(0, 8))
        ctk.CTkButton(
            row, text="Select all 19", height=32, fg_color=ACCENT,
            hover_color="#D49263", text_color="#1A120C",
            command=self._select_all_pieces,
        ).pack(side="left", expand=True, fill="x", padx=(0, 6))
        ctk.CTkButton(
            row, text="Clear", height=32, fg_color="#3A3340",
            hover_color="#52465A", command=self._clear_pieces,
        ).pack(side="left", expand=True, fill="x")

        grid_p = ctk.CTkFrame(tab, fg_color="transparent")
        grid_p.pack(fill="x", pady=(0, 10))
        for n in range(1, 20):
            btn = ctk.CTkButton(
                grid_p, text=str(n), width=56, height=40,
                font=ctk.CTkFont(size=16, weight="bold"),
                fg_color="#3A4458", hover_color="#4A5670",
                command=lambda i=n: self._toggle_piece(i),
            )
            btn.grid(row=(n - 1) // 5, column=(n - 1) % 5, padx=4, pady=4, sticky="ew")
            self.piece_btns[n] = btn
        for col in range(5):
            grid_p.grid_columnconfigure(col, weight=1)

        ctk.CTkLabel(tab, text="Color for selected pieces", text_color=MUTED, font=ctk.CTkFont(size=12)).pack(anchor="w")
        grid = ctk.CTkFrame(tab, fg_color="transparent")
        grid.pack(fill="x", pady=(6, 8))
        for i, (name, r, g, b) in enumerate(PRESETS):
            hex_color = f"#{r:02x}{g:02x}{b:02x}"
            ctk.CTkButton(
                grid, text="", width=36, height=36, corner_radius=18,
                fg_color=hex_color, hover_color=hex_color,
                command=lambda rr=r, gg=g, bb=b, n=name: self.apply_color(rr, gg, bb, n),
            ).grid(row=0, column=i, padx=3)
        custom = ctk.CTkFrame(tab, fg_color="transparent")
        custom.pack(fill="x", pady=(4, 8))
        self.swatch = ctk.CTkFrame(
            custom, width=42, height=42, corner_radius=10, fg_color="#E33B3B"
        )
        self.swatch.pack(side="left")
        self.swatch.pack_propagate(False)
        self.color_label = ctk.CTkLabel(custom, text="Red  #E33B3B", text_color=TEXT)
        self.color_label.pack(side="left", padx=12)
        ctk.CTkButton(
            custom, text="Custom color", width=130, height=34,
            fg_color="#2A3444", hover_color="#36445A",
            command=self.pick_custom_color,
        ).pack(side="right")

    def _build_zones_tab(self, tab) -> None:
        ctk.CTkLabel(tab, text="Zone", text_color=MUTED, font=ctk.CTkFont(size=12)).pack(anchor="w", pady=(8, 4))
        self.zone = ctk.CTkSegmentedButton(tab, values=["All", "Front", "Rear"])
        self.zone.set("All")
        self.zone.pack(fill="x")

        bright = ctk.CTkFrame(tab, fg_color="transparent")
        bright.pack(fill="x", pady=(16, 4))
        head = ctk.CTkFrame(bright, fg_color="transparent")
        head.pack(fill="x")
        ctk.CTkLabel(head, text="Brightness", text_color=MUTED, font=ctk.CTkFont(size=12)).pack(side="left")
        self.bright_value = ctk.CTkLabel(head, text="5 / 9", text_color=TEXT)
        self.bright_value.pack(side="right")
        self.bright = ctk.CTkSlider(
            bright, from_=0, to=9, number_of_steps=9,
            command=self._on_bright_slide, progress_color=ACCENT,
            button_color="#F3E6D8", button_hover_color="#FFFFFF",
        )
        self.bright.set(5)
        self.bright.pack(fill="x", pady=(6, 0))

        ctk.CTkLabel(
            tab,
            text="Use the Animations tab for Cardi Magic patterns.",
            text_color=MUTED, font=ctk.CTkFont(size=12),
        ).pack(anchor="w", pady=(16, 8))

    def _build_anims_tab(self, tab) -> None:
        ctk.CTkLabel(
            tab,
            text="Cardi Magic patterns. Magic Dazzle / Music Rhythm / Magic Shadow are the Symphony page.",
            text_color=MUTED, font=ctk.CTkFont(size=12), wraplength=520, justify="left",
        ).pack(anchor="w", pady=(8, 6))
        self.anim_kind_btn = ctk.CTkSegmentedButton(
            tab,
            values=["RGB", "Magic Dazzle", "Music Rhythm", "Magic Shadow"],
            command=self._on_anim_kind,
        )
        self.anim_kind_btn.set("Magic Dazzle")
        self.anim_kind_btn.pack(fill="x", pady=(0, 8))
        self.anim_kind = "dazzle"
        self.anim_scroll = ctk.CTkScrollableFrame(tab, fg_color="transparent")
        self.anim_scroll.pack(fill="both", expand=True)
        self._fill_anim_list()

    def _on_anim_kind(self, value: str) -> None:
        self.anim_kind = {
            "RGB": "rgb",
            "Magic Dazzle": "dazzle",
            "Music Rhythm": "music",
            "Magic Shadow": "shadow",
        }.get(value, "dazzle")
        self._fill_anim_list()

    def _fill_anim_list(self) -> None:
        for child in self.anim_scroll.winfo_children():
            child.destroy()
        self.anim_btns.clear()
        items = RGB_ANIMATIONS if self.anim_kind == "rgb" else names_for(self.anim_kind)
        for index, name in items:
            key = (self.anim_kind, index)
            btn = ctk.CTkButton(
                self.anim_scroll,
                text=f"{index}. {name}",
                height=32,
                anchor="w",
                fg_color="#2A3444",
                hover_color="#36445A",
                command=lambda k=self.anim_kind, i=index, n=name: self.apply_animation(k, i, n),
            )
            btn.pack(fill="x", pady=2)
            self.anim_btns[key] = btn

    def apply_animation(self, kind: str, index: int, name: str) -> None:
        self.selected_anim = (kind, index)
        for key, btn in self.anim_btns.items():
            if key == self.selected_anim:
                btn.configure(fg_color=ACCENT, text_color="#1A120C")
            else:
                btn.configure(fg_color="#2A3444", text_color=TEXT)
        if not self.controller.connected:
            self._log("Connect first, then tap a pattern.")
            return
        self.power_switch.select()
        self.power_on = True
        if kind == "rgb":
            coro = self.controller.set_rgb_mode(index)
        else:
            coro = self.controller.set_symphony(kind, index)
        self._run(
            coro,
            on_ok=lambda msg: self._log(f"{CATEGORIES.get(kind, kind)} {index} {name}: {msg}"),
            busy=False,
        )

    def _log(self, message: str) -> None:
        self.log_box.configure(state="normal")
        self.log_box.insert("end", message + "\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def _zone(self) -> int:
        return {"All": 3, "Front": 1, "Rear": 2}[self.zone.get()]

    def _chosen_hw(self, name: str) -> str:
        mode = self.dialect.get()
        if mode == "ATW":
            return "A"
        if mode == "CD-AMB":
            return "B"
        return classify_name(name) or "A"

    def _set_busy(self, busy: bool) -> None:
        self._busy = busy
        self.scan_btn.configure(state="disabled" if busy else "normal")

    def _set_connected(self, connected: bool) -> None:
        if connected:
            self.status_dot.configure(text="  ●  Connected", text_color="#5EE1A6")
            self.disconnect_btn.configure(state="normal")
            return
        self.status_dot.configure(text="  ●  Disconnected", text_color=MUTED)
        self.device_title.configure(text="No device connected")
        self.device_sub.configure(text="Scan and connect to change the lights.")
        self.disconnect_btn.configure(state="disabled")
        self.power_switch.deselect()
        self.power_on = False

    def _run(self, coro, on_ok=None, busy: bool = True) -> None:
        self._jobs.append((coro, on_ok, busy))
        self._pump_jobs()

    def _pump_jobs(self) -> None:
        if self._busy or not self._jobs:
            return
        coro, on_ok, busy = self._jobs.pop(0)
        self._set_busy(True)
        future = self.ble.submit(coro)

        def done(fut) -> None:
            error = None
            result = None
            try:
                result = fut.result()
            except Exception as exc:  # noqa: BLE001
                error = exc

            def finish() -> None:
                self._set_busy(False)
                if error:
                    self._log(f"Error: {error}")
                elif on_ok:
                    on_ok(result)
                self._pump_jobs()

            self.after(0, finish)

        future.add_done_callback(done)

    def _on_ble_disconnect(self) -> None:
        self.after(0, lambda: (self._set_connected(False), self._log("Disconnected.")))

    def _on_dialect(self, _value: str) -> None:
        if self.controller.connected and self.selected:
            self.controller.hw = self._chosen_hw(self.selected.name)
            label = "CD-AMB" if self.controller.hw == "B" else "ATW"
            self._log(f"Protocol set to {label}.")

    def scan(self) -> None:
        self.scan_hint.configure(text="Scanning 6 seconds… keep the adapter powered.")
        self._log("Scanning for nearby Bluetooth devices…")
        self._run(scan_nearby(6.0), on_ok=self._show_devices)

    def _show_devices(self, devices: list[NearbyDevice]) -> None:
        self.devices = devices
        for child in self.device_list.winfo_children():
            child.destroy()
        self.device_rows.clear()

        cardi = [item for item in devices if item.is_cardi]
        others = [item for item in devices if not item.is_cardi]
        self.scan_hint.configure(
            text=f"Found {len(cardi)} Cardi Magic device(s), {len(others)} other BLE."
        )
        if not devices:
            ctk.CTkLabel(
                self.device_list,
                text="Nothing found.\nEnable Bluetooth and power the adapter.",
                text_color=MUTED, justify="left",
            ).pack(anchor="w", padx=8, pady=12)
            return

        for device in devices:
            self._add_device_row(device)

        last = _load_last_mac()
        pick = next((item for item in devices if item.address == last), None)
        if pick is None:
            pick = next((item for item in devices if item.is_cardi), devices[0])
        self._select_device(pick)
        self._log(f"Scan complete: {len(devices)} device(s).")

    def _add_device_row(self, device: NearbyDevice) -> None:
        row = ctk.CTkFrame(self.device_list, fg_color=CARD, corner_radius=10)
        row.pack(fill="x", pady=4, padx=4)
        tag = "Cardi Magic" if device.is_cardi else "Other BLE"
        dialect = ""
        if device.hw == "B":
            dialect = "  ·  CD-AMB"
        elif device.hw == "A":
            dialect = "  ·  ATW"
        rssi = f"{device.rssi} dBm" if device.rssi is not None else ""
        title = ctk.CTkLabel(
            row, text=device.name, font=ctk.CTkFont(size=13, weight="bold"),
            text_color=TEXT, anchor="w",
        )
        title.pack(anchor="w", padx=10, pady=(8, 0))
        ctk.CTkLabel(
            row,
            text=f"{tag}{dialect}\n{device.address}   {rssi}",
            text_color=MUTED, font=ctk.CTkFont(size=11), justify="left",
        ).pack(anchor="w", padx=10, pady=(0, 8))
        for widget in (row, title):
            widget.bind("<Button-1>", lambda _event, item=device: self._select_device(item))
        row.bind("<Double-Button-1>", lambda _event, item=device: self._select_and_connect(item))
        self.device_rows[device.address] = row

    def _select_device(self, device: NearbyDevice) -> None:
        self.selected = device
        for address, row in self.device_rows.items():
            selected = address == device.address
            row.configure(fg_color=ACCENT if selected else CARD)
            for child in row.winfo_children():
                if isinstance(child, ctk.CTkLabel):
                    font = child.cget("font")
                    if font and "bold" in str(font):
                        child.configure(text_color="#1A120C" if selected else TEXT)

    def _select_and_connect(self, device: NearbyDevice) -> None:
        self._select_device(device)
        self.connect_selected()

    def connect_selected(self) -> None:
        if self.selected is None:
            self._log("Select a device first.")
            return
        device = self.selected
        hw = self._chosen_hw(device.name)
        self._log(f"Connecting to {device.name} ({device.address})…")
        target = device.ble_device or device.address
        self._run(
            self.controller.connect(target, device.name, hw),
            on_ok=lambda _: self._connected_ok(device),
        )

    def _connected_ok(self, device: NearbyDevice) -> None:
        _save_last_mac(device.address)
        self._set_connected(True)
        dialect = "CD-AMB" if self.controller.hw == "B" else "ATW"
        self.device_title.configure(text=device.name)
        self.device_sub.configure(text=f"{device.address}   ·   {dialect} protocol")
        self._log(f"Connected. Protocol: {dialect}.")
        red, green, blue = self.current_color
        self._run(
            self._power_on_then_apply(red, green, blue),
            on_ok=lambda msg: self._log(str(msg)),
            busy=False,
        )
        self.power_switch.select()
        self.power_on = True

    def disconnect(self) -> None:
        self._run(self.controller.disconnect(), on_ok=lambda _: self._set_connected(False))

    def _toggle_power(self) -> None:
        if not self.controller.connected:
            self.power_switch.deselect()
            self._log("Connect a device first.")
            return
        on = bool(self.power_switch.get())
        self.power_on = on
        self._run(
            self.controller.set_power(on),
            on_ok=lambda msg: self._log(("Lights ON. " if on else "Lights OFF. ") + str(msg)),
            busy=False,
        )

    def apply_color(self, red: int, green: int, blue: int, name: str = "Custom") -> None:
        self.current_color = (red, green, blue)
        hex_color = f"#{red:02x}{green:02x}{blue:02x}"
        self.swatch.configure(fg_color=hex_color)
        self.color_label.configure(text=f"{name}  {hex_color.upper()}")
        if not self.controller.connected:
            self._log("Connect a device, then pick a color.")
            return
        if not self.power_on:
            self.power_switch.select()
            self.power_on = True
            coro = self._power_on_then_apply(red, green, blue)
        else:
            coro = self._apply_color_now(red, green, blue)
        self._run(coro, on_ok=lambda msg: self._log(f"{name}: {msg}"), busy=False)

    def _toggle_piece(self, index: int) -> None:
        self.selected_pieces = {index}
        self._refresh_piece_btns()
        red, green, blue = self.current_color
        if not self.controller.connected:
            self._log(f"Piece {index} selected. Connect, then tap it again or pick a color.")
            return
        self._log(f"Piece {index} → {self.color_label.cget('text')}")
        self._run(
            self.controller.set_piece(index, red, green, blue),
            on_ok=lambda msg: self._log(str(msg)),
            busy=False,
        )

    def _select_all_pieces(self) -> None:
        self.selected_pieces = set(range(1, 20))
        self._refresh_piece_btns()
        self._log("All 19 pieces selected.")

    def _clear_pieces(self) -> None:
        self.selected_pieces.clear()
        self._refresh_piece_btns()
        self._log("Piece selection cleared — color will use Zone.")

    def _refresh_piece_btns(self) -> None:
        for n, btn in self.piece_btns.items():
            if n in self.selected_pieces:
                btn.configure(fg_color=ACCENT, text_color="#1A120C")
            else:
                btn.configure(fg_color="#2A3444", text_color=TEXT)

    async def _apply_color_now(self, red: int, green: int, blue: int) -> str:
        pieces = sorted(self.selected_pieces)
        if pieces:
            return await self.controller.set_pieces(pieces, red, green, blue)
        return await self.controller.set_color(red, green, blue, self._zone())

    async def _power_on_then_apply(self, red: int, green: int, blue: int) -> str:
        first = await self.controller.set_power(True)
        await asyncio.sleep(0.12)
        second = await self._apply_color_now(red, green, blue)
        return f"{first}\n{second}"

    def pick_custom_color(self) -> None:
        start = "#%02x%02x%02x" % self.current_color
        picked = colorchooser.askcolor(color=start, title="Pick a light color")
        if not picked or not picked[0]:
            return
        red, green, blue = (int(value) for value in picked[0])
        self.apply_color(red, green, blue, "Custom")

    def _on_bright_slide(self, value: float) -> None:
        level = int(round(float(value)))
        self.bright_value.configure(text=f"{level} / 9")
        if self._bright_job is not None:
            self.after_cancel(self._bright_job)
        self._bright_job = self.after(180, lambda: self._send_brightness(level))

    def _send_brightness(self, level: int) -> None:
        if not self.controller.connected:
            return
        self._run(
            self.controller.set_brightness(level, self._zone()),
            on_ok=lambda msg: self._log(f"Brightness {level}: {msg}"),
            busy=False,
        )

    def apply_scene(self, scene: str) -> None:
        if not self.controller.connected:
            self._log("Connect a device first.")
            return
        self.power_switch.select()
        self.power_on = True
        self._run(
            self.controller.set_scene(scene),
            on_ok=lambda msg: self._log(f"Scene {scene}: {msg}"),
            busy=False,
        )

    def _close(self) -> None:
        try:
            if self.controller.connected:
                self.ble.submit(self.controller.disconnect()).result(timeout=2)
        except Exception:
            pass
        self.ble.stop()
        self.destroy()


def _load_last_mac() -> str:
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8")).get("last_mac", "")
    except Exception:
        return ""


def _save_last_mac(mac: str) -> None:
    try:
        CONFIG_PATH.write_text(json.dumps({"last_mac": mac}, indent=2), encoding="utf-8")
    except Exception:
        pass


if __name__ == "__main__":
    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("dark-blue")
    AmbientApp().mainloop()
