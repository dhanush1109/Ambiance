# Innova Hycross 19-piece kit — layout vs real BLE zones

Physical kit: **19 LED modules**.  
Controller: **ATW-FWD-AAA6** (Cardi Magic Type A).

Live test (Aug 2026) showed the firmware does **not** address 19 pieces separately. It only has **3 official commands**:

| BLE zone | Official command (Type A) | What actually changed on the Hycross |
|----------|----------------------------|----------------------------------------|
| **1 Front** | `<10` + `rrggbb` + `>` | Almost the whole cabin |
| **2 Rear** | `<09` + `rrggbb` + `>` | Door handles + all footwells |
| **3 All** | `<06` + `rrggbb` + `>` | Entire kit together |

Independent per-piece color, “unlink one door”, and 19-tap cabin maps are **not supported** by this box. The UI can still *draw* 19 pieces, but taps must map onto Front, Rear, or All.

---

## 19 pieces mapped onto real zones

### Zone 1 — Front cabin (12 pieces)

These all followed the **Front** command (turned green while handles/feet stayed blue):

| Group | Count | Pieces |
|-------|--------|--------|
| Dashboard line | 2 | Passenger dash long strip; driver-right short strip |
| AC vents | 2 | Far-left vent ring; far-right vent ring |
| Door lines | 4 | Upper door accent, FL / FR / RL / RR |
| Door storage pockets | 4 | Lower door pocket LEDs, FL / FR / RL / RR |

Front-row **and** rear-row **door lines and pockets** are on zone 1. Rear doors are not on the Rear BLE zone.

### Zone 2 — Handles and feet (7 pieces)

These stayed blue during Front, then turned green on **Rear**:

| Group | Count | Pieces |
|-------|--------|--------|
| Door handles | 4 | Inner handle recess LEDs, FL / FR / RL / RR |
| Footwells | 3 modules / 4 seating spots | Footwell FL, Footwell FR, 2nd-row shared (one module covering both rear floor sides) |

### Zone 3 — Master

Sends the same color/brightness to **all 19 pieces**. Used for static all-cabin color and for animations that the firmware applies globally.

---

## Cabin UI blueprint (zones, not 19 independent taps)

Use a top-down Hycross cabin, but color by **linked groups**, not 19 BLE IDs.

```
+-------------------------------------------------------------+
|  [X] Close       INNOVA HYCROSS LIGHTS          (o) Connect |
+-------------------------------------------------------------+
|  Zone:  ( All )   ( Front cabin )   ( Handles & feet )     |
+-------------------------------------------------------------+
|                                                             |
|                    ZONE 1 — FRONT CABIN                     |
|                         [ AC Vent L ]                       |
|   [ Dash L ]                 _                 [ Dash R ]   |
|                             (_)                             |
|                           [Screen]                          |
|                                                             |
|   +--------------------- FRONT ROW -----------------------+ |
|   | [Handle FL]  ZONE 2                   [Handle FR] Z2 | |
|   |                                                       | |
|   | ==[ Door FL Line ]== Z1           ==[ Door FR Line ]== | |
|   |                                                       | |
|   |  (Footwell FL) ZONE 2               (Footwell FR) Z2 | |
|   |                                                       | |
|   | [Pocket FL] ZONE 1                      [Pocket FR]  | |
|   +---------------------- REAR ROW -------------------------+ |
|   | [Handle RL]  ZONE 2                   [Handle RR] Z2 | |
|   |                                                       | |
|   | ==[ Door RL Line ]== Z1           ==[ Door RR Line ]== | |
|   |                                                       | |
|   |  (------ 2nd Row Shared Footwell  ZONE 2 ------)       | |
|   |                                                       | |
|   | [Pocket RL] ZONE 1                      [Pocket RR]    | |
|   +-----------------------------------------------------+   |
+-------------------------------------------------------------+
| [ Master Color Wheel ]   [ Brightness 0–9 ]                |
+-------------------------------------------------------------+
|  Modes: Static  |  RGB animations  |  Magic Dazzle          |
|         Music Rhythm  |  Magic Shadow                      |
+-------------------------------------------------------------+
```

---

## What the UI should do (honest)

**Works today (send these BLE commands):**

- Tap **All cabin** → zone 3 color / brightness / animations  
- Tap **Front cabin** → zone 1 (dash, vents, all door lines, all pockets)  
- Tap **Handles & feet** → zone 2 (all 4 handles + all footwells)  
- Optional: dim “rear row sleeping” by setting zone 2 brightness lower (handles + feet only). Door lines in the rear still follow zone 1.

**Cannot work on this firmware:**

- One door a different color from the others  
- Dash vs door line vs pocket as separate colors  
- 19 independent color wells  
- Unlinking a single door from a “door group”

If the UI shows 19 glowing parts, they are **previews of two linked groups**:

- Selecting any dash / vent / door-line / pocket control → drives **zone 1**  
- Selecting any handle / footwell control → drives **zone 2**  
- Master wheel → **zone 3** (or both 1 and 2 if you want the same static color)

---

## Suggested tap targets for the React cabin map

| UI hotspot | BLE zone | Pieces represented |
|-----------|----------|--------------------|
| Dash L, Dash R, AC L, AC R | 1 | 4 |
| Door line FL, FR, RL, RR | 1 | 4 |
| Pocket FL, FR, RL, RR | 1 | 4 |
| Handle FL, FR, RL, RR | 2 | 4 |
| Foot FL, FR, 2nd-row bar | 2 | 3 |
| Master / All | 3 | 19 |

**Zone link (UI only):** “Link all doors” can still exist as a shortcut that paints zone 1 (lines + pockets). It cannot isolate one door on this ATW controller.

---

## Animations

RGB (31), Magic Dazzle (63), Music Rhythm (42), and Magic Shadow (63) are **global** on this box (same as All). They are not per-piece or per-row in the official protocol.
