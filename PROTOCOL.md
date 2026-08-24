# Cardi Magic BLE Protocol

Source: `Cardi Magic 1.2.7.apk` decompiled with JADX into `decompiled_source/`.

The APK does **not** use a `0x7E` frame. Lighting commands are hex strings converted to bytes (`TypeConversion.hexString2Bytes`) and written with `BluetoothGatt.writeCharacteristic`.

There are **two lighting dialects**, selected from the advertised BLE name:

| `yingjian_LX` | BLE name contains | Frame style |
|---------------|-------------------|-------------|
| `1` (default) | `ATW-`, `atw-`, `VE-CD` | ASCII inside `<` `>` (`0x3C` … `0x3E`) |
| `2` | `CD-AMB` | Binary `0x3B` … `0xB3` |

`CarFan` is a **seat-motor** controller on service `FFF0`, not the ambient-light protocol. Ignore it for RGB.

---

## BLE identity

### Filter names (scan)

`ATW-` / `atw-` / `VE-CD` / `CD-AMB`  (`BLEManager.addDevice`)

### GATT UUIDs

The app matches UUIDs with `String.contains("ffe0")` etc., so the 16-bit aliases expand to the Bluetooth SIG base:

| Role | 16-bit | Full UUID |
|------|--------|-----------|
| **Service** | `0xFFE0` | `0000ffe0-0000-1000-8000-00805f9b34fb` |
| Notify / read (default) | `0xFFE1` | `0000ffe1-0000-1000-8000-00805f9b34fb` |
| **Write (default)** | `0xFFE2` | `0000ffe2-0000-1000-8000-00805f9b34fb` |

`bleconfig.java` defaults:

```
SERVICE_UUID = "ffe0"
READ_UUID    = "ffe1"
WRITE_UUID   = "ffe2"
```

**CD-AMB exception:** if the name contains `CD-AMB`, the app **swaps** write/notify:

```
READ_UUID  = "ffe2"
WRITE_UUID = "ffe1"
```

`FFF0` is only used when connecting a previously-seen `CarFan` address.

After a successful service discovery the app also writes ASCII AT-style `+DISCID\r\n` (`2B4449534349440D0A`). Lighting frames still work without it.

---

## Byte-frame structure

### Type A — ATW / VE-CD (`yingjian_LX == 1`)

Every lighting command is **ASCII** wrapped in `<` `>` then hex-encoded for GATT:

```
3C  ....payload as ASCII hex....  3E
<   command characters             >
```

Examples (ASCII → on-wire hex):

| ASCII | Hex bytes |
|-------|-----------|
| `<0701>` | `3C 30 37 30 31 3E` |
| `<10ff0000>` | `3C 31 30 66 66 30 30 30 30 3E` |

RGB for Type A is built in `rgbFragment.send_color*()`: each nibble of R/G/B is turned into the ASCII code of that hex digit via `commom.hextoHII` (`'f'` → `66`, `'0'` → `30`).

**Brightness quirk:** the seek bar is **0–9** (not 0–100). The app concatenates the decimal value `brightness + 30` into the hex string. That is how it produces the ASCII digit:

- brightness `0` → `+30` → `"30"` → byte `0x30` = `'0'`
- brightness `5` → `"35"` → `'5'`
- brightness `9` → `"39"` → `'9'`

Speed uses the same `+30` trick; when the result is `40` it is replaced with `61` (`'a'`) because `10 + 30` would otherwise be an odd-length hex string.

### Type B — CD-AMB (`yingjian_LX == 2`)

Fixed **7-byte** binary frames. `0xB3` is a constant tail, **not** a checksum (the same tail is used for every command).

```
[0x3B] [CMD] [ZONE/SUB] [P0] [P1] [P2] [0xB3]
  hdr    op     zone      payload        tail
```

| Field | Size | Meaning |
|-------|------|---------|
| Header | 1 | always `0x3B` |
| Command | 1 | `0x30` power, `0x33` RGB, `0x39` brightness, `0x34` RGB scene/music, `0x38` speed, `0x3A` welcome, `0x37` atmosphere scene, … |
| Zone / sub-cmd | 1 | RGB zone `01`/`02`/`03`; brightness zone `F1`/`F2`/`F3`; welcome `11`/`22`; scene padding `0x34` |
| Payload | 3 | RGB, brightness, or flags |
| Tail | 1 | always `0xB3` |

**RGB zone (`rgb_fenqu`):**

| Zone | App value | Type B RGB `ZONE` | Type B brightness `ZONE` |
|------|-----------|-------------------|--------------------------|
| Front / zone 1 | `1` | `0x01` | `0xF1` |
| Rear / zone 2 | `2` | `0x02` | `0xF2` |
| Global | `3` | `0x03` | `0xF3` |

---

## Classes that build `byte[]` / hex payloads

| Class | Role |
|-------|--------|
| `ble.bleconfig` | UUID constants |
| `ble.BLEManager` | name filter, UUID swap, `sendlaya_message(hex)` |
| `ble.BLEDeviceManager.sendMessage` | `hexString2Bytes` + `writeCharacteristic` |
| `huancai.rgbFragment` | RGB, brightness, speed, scene, music |
| `huancai.huancaiActivity` | power button (`dianyuan_kg`) |
| `huancai.huancaiFragment` | atmosphere scenes + shared brightness |
| `huancai.shezhiFragment` | welcome-light (迎宾) on/off + colors |
| `huancai.zidingyiFragment` | custom palettes (`3E … E3` on Type B) |
| `huancai.zuoyi` | `CarFan` seat protocol on `FFF0` |

---

## Hex payload cheat sheet

Use **Type B** if the adapter advertises `CD-AMB`. Use **Type A** for `ATW-` / `VE-CD`.

Brightness in the official UI is **0–9**. Values below use global zone / full scale where it applies.

### Power (main switch — `huancaiActivity.dianyuan_img`)

| Action | Type A (ASCII) | Type A hex | Type B hex |
|--------|----------------|------------|------------|
| **ON** | `<0701>` | `3C 30 37 30 31 3E` | `3B 30 00 00 00 F0 B3` |
| **OFF** | `<0700>` | `3C 30 37 30 30 3E` | `3B 30 00 00 00 0F B3` |

### Static RGB (global zone = 3)

Type B: `3B 33 03 RR GG BB B3`  
Type A: `<06` + lowercase `rrggbb` + `>`

| Color | Type A hex | Type B hex |
|-------|------------|------------|
| **Red** `FF0000` | `3C 30 36 66 66 30 30 30 30 3E` | `3B 33 03 FF 00 00 B3` |
| **Green** `00FF00` | `3C 30 36 30 30 66 66 30 30 3E` | `3B 33 03 00 FF 00 B3` |
| **Blue** `0000FF` | `3C 30 36 30 30 30 30 66 66 3E` | `3B 33 03 00 00 FF B3` |

Zone 1 (front) Type B red: `3B 33 01 FF 00 00 B3`  
Zone 2 (rear) Type B red: `3B 33 02 FF 00 00 B3`

### Brightness (0–9)

Type B global: `3B 39 F3 00 00 LL B3` where `LL` is the seek-bar value.

| Level | Type A global (`<02000` + digit + `>`) | Type B global |
|-------|------------------------------------------|---------------|
| 0 | `3C 30 32 30 30 30 30 3E` (`<020000>`) | `3B 39 F3 00 00 00 B3` |
| 5 (default) | `3C 30 32 30 30 30 35 3E` (`<020005>`) | `3B 39 F3 00 00 05 B3` |
| 9 (max) | `3C 30 32 30 30 30 39 3E` (`<020009>`) | `3B 39 F3 00 00 09 B3` |

Type B zone 1 brightness 5: `3B 39 F1 00 00 05 B3`  
Type B zone 2 brightness 5: `3B 39 F2 00 00 05 B3`

---

## Scene / music (RGB page)

### Type B RGB scenes — `rgbFragment.playmode2`

Frame: `3B 34 34 34 34 MM B3`

| UI index | Name (app string) | `MM` | Full hex |
|---------|--------------------|------|----------|
| 1 | Rainbow Gradient | `07` | `3B 34 34 34 34 07 B3` |
| 2 | Red-Purple Gradient | `04` | `3B 34 34 34 34 04 B3` |
| 7 | Red-Blue Gradient | `01` | `3B 34 34 34 34 01 B3` |
| 13 | Colorful Flash | `21` | `3B 34 34 34 34 21 B3` |
| 25 | Colorful Breathing | `18` | `3B 34 34 34 34 18 B3` |

Music / mic on Type B cycles `MM = 0B … 10` with the same `3B 34 34 34 34 MM B3` frame.

### Type A RGB scenes — `rgbFragment.playmode1`

ASCII family `<0400…>`. Example first scene (`select == 1`):  
`3C 30 34 30 30 30` + `(1+29=30)` + `3E` → `3C3034303030303E` = `<040000>`.

Mic on Type A: `<040501>` = `3C 30 34 30 35 30 31 3E`  
Mic off Type A: `<040500>` = `3C 30 34 30 35 30 30 3E`

---

## Welcome light (settings, not main power)

| | Type A | Type B |
|-------|--------|--------|
| Welcome ON | `<3001>` `3C333030313E` | `3B 3A 11 00 00 F0 B3` |
| Welcome OFF | `<3000>` `3C333030303E` | `3B 3A 11 00 00 0F B3` |
| Welcome red | `<3800>` | `3B 3A 22 FF 00 00 B3` |

---

## Custom palette (Type B only)

`zidingyiFragment` writes a longer frame:

```
3E  35|36  0M  RRGGBB × 8 colors  E3
hdr  RGB|atm  mode                 tail
```

Not required for static color / power / brightness.

---

## Recommended test sequence (CD-AMB)

1. Scan for `CD-AMB` (or `ATW-` / `VE-CD`).
2. Connect; discover service `FFE0`.
3. Write characteristic: `FFE1` on CD-AMB, `FFE2` on ATW/VE-CD. If a write fails, try the other.
4. Power ON → static red → brightness 5.

`test_controller.py` in this folder implements that sequence.
