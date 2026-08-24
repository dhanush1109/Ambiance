# Ambiance — Module Contract (single source of truth)

**App name: `Ambiance`** (French for *ambience*). Use this name everywhere — title, nav, splash, package,
docs, about screen. Never "Lumen", never "Ambient Light".

Every module below is authored against **exactly** these paths, exports, and shapes.
Do not invent alternate names. Do not change a signature without changing this file.

Stack: **React 19 + Vite 6, plain JavaScript** (JSDoc types, no TypeScript), **zustand 5**, **vitest 3**.
Target: Android APK via Capacitor (phone + 11.5" tablet), plus desktop browser dev via the `server.py` bridge.

Hardware truth (see `../HYCROSS_ZONES.md`): 19 LED pieces, but the ATW firmware exposes only
**3 zones** — Z1 Front cabin (12 pieces), Z2 Handles & feet (7 pieces), Z3 All. Never pretend otherwise in UI.

---

## 0. Pinned device — DONE, do not rewrite

`src/config/device.js` already exists and is final:
`PINNED_DEVICE = { mac: '7B:F7:38:62:BA:8A', name: 'ATW-FWD-AAA6', hw: 'A' }`, `ENFORCE_PIN`,
`normalizeMac(addr)`, `isPinnedAddress(addr)`.

- `controller.connectPinned()` connects **directly by MAC with no scan**. Primary connect path everywhere.
- Scan is a diagnostic fallback only. Connecting to a non-pinned device is refused.
- `server.py` already accepts an unknown address, so connect-by-MAC works on the bridge with **no server change**.

## 0b. Already built and verified — DO NOT MODIFY

`src/protocol/{hex,frames,symphony,catalog}.js`, `src/test/`, `tools/gen_golden.py`, `vitest.config.js`,
`src/config/device.js`, `src/data/moods.js`, `src/data/effectGradients.js`.
381 golden-vector tests pass; the JS frames are byte-identical to the working Python. Import from these; never edit.

---

## 1. Design language — OLED night + Apple Liquid Glass, applied properly

Sourced from `apple-skills/design/liquid-glass` (quoted below) and `apple-skills/design/typography`.

**Two colours, two jobs — read this before touching any colour in this app:**
- `--accent` is a **fixed** premium System Indigo (`#5E5CE6`, Apple's own dark-mode palette). It is the
  app's one tint colour: tabs, rings, primary buttons, focus states. It never changes.
- `--light` is the **live cabin colour**, rewritten at runtime by `App.jsx` from `dominantHex()`. It drives
  only things that ARE the light: `CarHero`, `MiniCar`, swatches, mood previews, `Brightness`'s fill,
  `PowerButton`'s on-state, `ColorField`'s handle halo, and `AmbientBackdrop`.
  **Never mix these up.** The app used to rewrite `--accent` itself, which made the whole interface turn
  orange whenever the cabin was set to orange — that was the single biggest thing wrong with it.

**The five rules, non-negotiable, quoted from `design/liquid-glass/SKILL.md`:**
1. *"Liquid Glass is the material of the navigation layer — bars, toolbars, floating controls — never the
   content layer (tables, lists, rows in a scroll view)."* In this app that means: nav bar/rail, the control
   dock, sheets, chips (zone/mood/drift), the status pill, the effects segmented switcher, the search field,
   toasts, the running-animation banner, and the settings advanced panel are glass. Mood/effect/favourite
   cards and settings rows are **solid** — that content/navigation boundary is what keeps this looking like
   Apple's own apps rather than glass soup.
2. *"Never glass on glass — elements sitting ON glass don't get the material again, style them with fills
   and vibrancy."* `ColorButton`, `Brightness`'s track and `PowerButton`'s off-state all live inside the
   glass dock, so they use `--fill-*` vibrancy, not another blurred layer.
3. *"Tint only the primary action — when every element is tinted, nothing stands out."* `--accent` is spent
   on the active tab, the selected chip, primary buttons and focus rings. Nothing else.
4. **Concentric radii.** Inner radius = parent radius − padding. Capsules = half the element height.
5. **Deep OLED black + an ambient backdrop.** True black so the cabin glow is the only light source —
   but blurring flat black returns flat black, so `components/AmbientBackdrop` paints a very soft (<5%
   opacity), slow-drifting field of `--light` behind everything. That is what every glass surface refracts;
   without it, "glass" is just a darker rectangle.

`src/theme/tokens.css` — exact custom property names:

```
--bg #000000        --bg-raise #0B0C0F   --surface #131519  --surface-2 #1A1D23  --surface-3 #23272F
--hairline rgba(255,255,255,.07)   --hairline-strong rgba(255,255,255,.14)
--text #FFFFFF      --text-dim #C3CAD5   --text-muted #939CAA
--gold #C9A227      --danger #FF6961     --ok #32D74B

--accent #5E5CE6 (FIXED)  --accent-soft rgba(94,92,230,.18)  --accent-glow rgba(94,92,230,.55)
--accent-press #4A48C4    --on-accent #FFFFFF   (text/icons ON a filled accent surface)

--light #ff8a3d (LIVE, rewritten by App.jsx)  --light-soft rgba(r,g,b,.18)  --light-glow rgba(r,g,b,.55)

--glass-thin rgba(20,22,28,.42)  --glass rgba(18,20,26,.58)  --glass-thick rgba(14,16,21,.74)
--fill-1/2/3 rgba(255,255,255, .08/.13/.19)      (vibrancy fills — content ON glass)
--vibrant-label/-secondary/-tertiary rgba(255,255,255, .94/.7/.46)   (vibrancy text)
--lens-top rgba(255,255,255,.38)  --lens-edge rgba(255,255,255,.1)  --lens-inner rgba(0,0,0,.3)

--r-xs 8px --r-sm 12px --r-md 18px --r-lg 24px --r-xl 32px --r-pill 999px
--s1 4 --s2 8 --s3 12 --s4 16 --s5 24 --s6 32 --s7 48 --s8 64   (px)
--font-display 'Inter'   --font-body 'Inter'   (one family, varied by weight — like SF Pro, not a display/body pair)
--dur-fast 140ms --dur 240ms --dur-slow 420ms --dur-accent 400ms (now transitions --light, not --accent)
--ease cubic-bezier(.22,1,.36,1)    --ease-spring cubic-bezier(.34,1.56,.64,1)
--sat/--sab/--sal/--sar env(safe-area-inset-*,0px)
--nav-h 72px  --rail-w 108px
```

`--light`/`--light-soft`/`--light-glow` are registered with `@property` so they **transition** — applying a
mood or dragging the colour field glides the car and its previews to the new hue. `--accent` is fixed and
needs no such registration. Text contrast on `#000000`: `--text-dim` ≈ 13:1, `--text-muted` ≈ 7.6:1, both
clear 7:1; `--accent` (~4.9:1 on black) is used for non-text UI and large text, never body copy.

`src/theme/glass.css` — primitives `.glass-thin`/`.glass`/`.glass-thick` (three depths, each with a
gradient specular border via `--lens-*` — this is what sells a surface as glass rather than a blurred div);
named surfaces `.glass-nav`, `.glass-dock`, `.glass-sheet` compose `--glass-thick`; `.chip`, `.statuspill`,
`.seg`, `.search-input`, `.toast`, `.home-banner`, `.home-quickchip`, `.advanced` (settings) each carry
their own glass treatment inline. Vibrancy: `.vibrant-fill-1/2/3`, `.vibrant-label/-secondary/-tertiary`.
Solid content layer, unchanged: `.card`, `.card-raise`, `.hairline`, `.pressable`, `.focus-ring`, `.sr-only`,
`.btn` (now a `--fill-2` vibrancy button — reads correctly on both cards and glass), `.btn-primary`,
`.screen`, `.screen-title`, `.section`. Shape utilities: `.shape-capsule`, `.shape-concentric`.
Shared keyframes: `amb-pulse`, `amb-shimmer`, `amb-rise`, `amb-fade`, `amb-breathe`, `amb-sheen`, `amb-tick`,
`amb-screen-in`.

`.screen` and `.home` inset their horizontal padding with `max(var(--s4), var(--sal)/--sar)` so a
landscape notch never clips content; `.nav-bottom` does the same. A
`@media (orientation: landscape) and (max-height: 500px)` block shrinks the hero and un-sticks the
control dock, so a phone on its side stays usable.

Fallbacks, three independent: `body[data-reduce-glass="1"]` (manual setting) → glass becomes solid, no blur.
`@media (prefers-reduced-transparency: reduce)` (Apple's own accessibility setting, distinct from the
manual toggle above) → same, glass becomes an opaque `--surface-2`. `@media (prefers-contrast: more)` →
glass becomes opaque black with a hard `--text`-coloured border, per the skill: *"Increased Contrast renders
glass elements black/white with a contrasting border."* `@media (prefers-reduced-motion: reduce)` and
`body[data-reduce-motion="1"]` → transitions ~1ms, loops off, `AmbientBackdrop` freezes (stays visible, stops
drifting).

---

## 2. The hero — `src/data/pieces.js`, `src/components/CarHero.jsx`, `CarHero.css`

**This is the landing page's centrepiece and the whole point of the app: you look at it and instantly see
your car, its four doors, and what colour every part of the cabin is right now.**

`pieces.js` exports:
```js
export const CAR_VIEWBOX = '0 0 420 700'         // nose/windscreen at top, top-down view
export const DOORS = [                            // the four doors, first-class objects
  { id:'fl', label:'Front left',  row:'front', side:'left'  },
  { id:'fr', label:'Front right', row:'front', side:'right' },
  { id:'rl', label:'Rear left',   row:'rear',  side:'left'  },
  { id:'rr', label:'Rear right',  row:'rear',  side:'right' },
]
export const PIECES = [/* 19 entries */]
export const CABIN_CHROME = [/* non-lit context shapes */]
export const ZONE_PIECES = { 1: [...12 ids], 2: [...7 ids] }
```
Each `PIECES` entry: `{ id, zone: 1|2, group, label, door?: 'fl'|'fr'|'rl'|'rr', kind, d?|cx,cy,r?, hit }`.
Required ids — Zone 1 (12): `dash-l`, `dash-r`, `vent-l`, `vent-r`, `line-fl/fr/rl/rr`, `pocket-fl/fr/rl/rr`.
Zone 2 (7): `handle-fl/fr/rl/rr`, `foot-fl`, `foot-fr`, `foot-row2` (one shared 2nd-row bar).
Door pieces carry `door`, so each of the four doors owns exactly three pieces: line (Z1), pocket (Z1), handle (Z2).

`CABIN_CHROME` draws a car people recognise: body outline with rounded nose and tail, windscreen and rear glass,
**four door panels as distinct outlined shapes with visible door gaps**, three seat rows, centre console,
steering wheel, infotainment screen.

`<CarHero zones selectedZone power activeMode onSelectZone onSelectDoor />`:
- Renders the car large and centred. The four doors read as four separate panels at a glance.
- Lit pieces in **exactly two `<g>` groups** (one per zone), each with **one shared glow filter** — never one
  filter per piece. Two filter applications for the entire hero.
- One radial-gradient wash behind the car, tinted by the dominant colour, so the whole car sits in its own light.
- Brightness → opacity `0.15 + 0.85 * (brightness/9)`. Power off → faint outlines only, no glow.
- Each door is a labelled, focusable hit region: tapping the door **line or pocket** selects Zone 1, the
  **handle** selects Zone 2, and door labels (FL/FR/RL/RR) sit beside each panel.
- Selected zone's group gets a brighter stroke + one 250 ms pulse. No layout shift.
- `activeMode` set → slow shimmer over both groups + the mode name; never fake per-piece colours.
- Every interactive region is a real focusable control with an `aria-label` naming the part and its zone.
- Colour transitions 240 ms, disabled under reduced motion.

---

## 3. Services — `src/services/` (unchanged contract)

```js
// transport.js
/** @typedef {{op:'power',on:boolean}|{op:'color',zone,r,g,b}|{op:'brightness',zone,level}
 *           |{op:'rgbMode',index}|{op:'symphony',kind,mode}} Intent
 *  @typedef {{address,name,rssi,hw,isPinned}} Device
 *  @typedef {{kind, isConnected(), currentDevice(), scan(timeoutMs,onDevice?),
 *             connect(address,hint?), disconnect(), send(bytes,intent), onDisconnect(cb)}} Transport */
export function getTransport(): Transport      // memoised
export function transportKind(): 'native'|'bridge'|'mock'
```
`send` gets both the frame and the intent: native/mock write `bytes`; bridge ignores bytes and calls the
matching `server.py` endpoint from `intent`.

- `nativeBleTransport.js` — `@capacitor-community/bluetooth-le`. Lazy
  `BleClient.initialize({ androidNeverForLocation: true })`. Scan **unfiltered**, filter in JS by `classifyName`
  (never filter by service UUID — the ATW advert may omit FFE0). Connect by MAC. Write fallback exactly like
  `CardiController.send`: `(writeUuidFor(hw), other) × (write, writeWithoutResponse)`, cache the winner per
  session, reset on reconnect. Full 128-bit UUIDs. Import the plugin defensively so a plain browser survives.
- `bridgeTransport.js` — wraps existing `src/api.js` (unchanged) against `server.py`.
- `mockTransport.js` — records `{ts,hex,intent}`, simulated latency, `simulateDrop()`.
- `commandQueue.js` — `QUEUE_GAP_MS = 40`, `enqueue(key, run, {coalesce=true})`, `clearQueue`, `queueDepth`,
  `onQueueError`. Single FIFO chain, ≥40 ms spacing; a **pending, not in-flight** entry with the same key is
  **replaced** by the newer one. Keys: `color:1|2|3`, `bright:1|2|3`, `power`, `mode`. One retry after 120 ms.
- `storage.js` — `{ getItem, setItem, removeItem }` async; Capacitor Preferences on native, localStorage else.
- `reconnect.js` — `startAutoReconnect`, `stopAutoReconnect`, `isReconnecting`. Backoff 1→2→4→8→15→30 s.
  Boot goes straight to `connectPinned()`.
- `controller.js` — the ONLY API screens and the engine use:
  `init, scan, connectPinned, connect, disconnect, setPower, setColor(zone,hex,opts), setBrightness(zone,level,opts),
   setRgbMode, setSymphony, applyMood, applyFavorite, restoreLastState`.
  Optimistic store update, then enqueue. Zone 3 mirrors into 1 and 2 (firmware behaviour).
  `opts.manual !== false` → `lightStore.markManual()`, which halts the ambient engine.

## 4. State — `src/state/` (zustand 5)

```js
// connectionStore.js
{ status:'idle'|'scanning'|'connecting'|'connected'|'reconnecting'|'error',
  device:null|{address,name,hw}, devices:[], error:null, attempt:0,
  setStatus,setDevice,setDevices,setError,setAttempt,reset }

// lightStore.js  (persist ONLY power, zones, selectedZone via partialize)
{ power:false, selectedZone:3,
  zones:{1:{hex:'#ff8a3d',brightness:5},2:{...},3:{...}},
  activeMode:null|{family,index,name}, activeMoodId:null, driftOn:false, lastManualAt:0,
  setZoneColor,setZoneBrightness,setPower,selectZone,setActiveMode,clearMode,setMood,setDrift,markManual }
export function dominantHex(state)          // zones[selectedZone].hex
```
`setZoneColor(3,…)`/`setZoneBrightness(3,…)` also write zones 1 and 2. `setZoneColor` clears `activeMode`.
`setActiveMode` clears `activeMoodId`.

```js
// favoritesStore.js (persist) { items:[{id,name,z1,z2,mode,createdAt}], add(name?),remove,rename,reorder }
// settingsStore.js (persist) { autoReconnect:true, restoreLastState:true, welcomeAnimation:true,
//                              timeOfDayTheme:false, keepAwake:false, reduceGlass:false, reduceMotion:false, set }
// uiStore.js { tab:'home'|'moods'|'effects'|'favorites'|'settings', setTab,
//              toast:null|{id,text,tone}, showToast(text,tone?), hideToast }
```
`src/hooks/useBreakpoint.js` → `'phone' | 'tablet'` at `matchMedia('(min-width:900px)')`.

## 5. Components — `src/components/` (default exports)

```
Icon.jsx        <Icon name size=24 filled? title? />  inline SVG sprite. NO EMOJI ANYWHERE.
                names: home, moods, effects, favorites, settings, power, bluetooth, link, check,
                chevron-right, chevron-left, chevron-down, plus, trash, star, sun, moon, refresh,
                alert, close, drag, play, stop, info, car, brightness, palette
AmbientBackdrop.jsx  <AmbientBackdrop />  no props. Mounted once in App.jsx, first child, decorative,
                     aria-hidden. Two slow-drifting radial fields of --light at <5% opacity — what
                     every glass surface in the app refracts. Freezes under reduced motion, hidden
                     under reduceGlass (nothing left to sample it).
LaunchOverlay.jsx <LaunchOverlay />  no props. LAST child of App.jsx, z-index 100 (over toast at 90
                     and sheet at 80). Decorative: aria-hidden + pointer-events:none, so Home is live
                     and tappable from the first frame and a screen reader never meets it.
                     1.2s: bloom 0ms, sweep 300ms, reveal 780ms, unmount 1200ms. The reveal starts
                     while CarHero's outline is still drawing, so the logo's line-work hands off to
                     the car's rather than cutting to a finished picture.
                     Every keyframe is opacity/transform only — a launch runs on the slowest frames
                     the app ever sees, so the neon bloom is a second pre-blurred copy cross-faded
                     underneath (compositor) instead of an animated filter (paint).
                     Unmounts on its OWN animationend (children bubble; they are filtered out) with a
                     2200ms safety timeout — a dropped event must never leave a black sheet.
                     Renders null under either reduced-motion signal, decided once at mount so a
                     mid-flight settings change cannot cut the fade to a hard edge.
                     Art: src/assets/logo-launch.jpg, 900px/124KB. The 5.6MB original never ships.
Card.jsx        <Card raise interactive as className>   SOLID surface, not glass
CarHero.jsx     see section 2
ColorField.jsx  <ColorField hex onChange onCommit />    hue strip + sat/val pad, pointer events, 8 presets
ColorButton.jsx <ColorButton hex disabled open onPress> round swatch, opens ColorSheet
ColorSheet.jsx  <ColorSheet open onClose />              Sheet(anchor) wrapping ColorField; owns the
                                                          throttle/commit logic for the selected zone
Brightness.jsx  <Brightness value onChange />           0..9, ten discrete segments
ZoneChips.jsx   <ZoneChips value onChange />
PowerButton.jsx <PowerButton on busy onToggle />
StatusPill.jsx  <StatusPill onPress />                  reads connectionStore
NavBar.jsx      <NavBar variant="bottom"|"rail" />      THE glass surface
ControlDock.jsx <ControlDock />                         floating glass dock on Home: ColorButton +
                                                          Brightness + PowerButton in one row. Closes
                                                          ColorSheet on zone change or leaving the Home tab.
MoodCard.jsx    <MoodCard mood active onPress />
EffectCard.jsx  <EffectCard family index name active onPress />
FavoriteCard.jsx<FavoriteCard fav onApply onRename onRemove onMove />
Toast.jsx       <Toast />
Sheet.jsx       <Sheet open title onClose anchor?>      glass, focus-trapped, Escape to close.
                On PHONE it drags away from the grab bar / header (never from
                .sheet-body, so scrollable bodies and ColorField's own pointer
                capture are never contested). Physics in ./sheetDrag.js:
                dismissal judged from the PROJECTED endpoint, upward pulls
                rubber-band, 10px hysteresis, catchable mid-flight. Escape,
                back and scrim-tap still close instantly — the drag is an
                addition, never the only way out. Tablet dialog does not drag
                and hides the handle.
```
Every tappable ≥48 px, visible `:focus-visible` ring, `aria-label` on icon-only controls, decorative SVG
`aria-hidden`, pressed feedback 80–150 ms with no layout shift.

## 6. Screens — `src/screens/`

- **`HomeScreen.jsx` — THE LANDING PAGE.** Opens here. Top: app wordmark **Ambiance** + `StatusPill`.
  Centre: `CarHero`, as large as the viewport allows — the car with its four doors, glowing live.
  Under it: the current colour and zone stated in words, `ZoneChips`, and a row of quick mood swatches.
  Floating above: `ControlDock` (glass) — a colour button, brightness, power in one row. The colour picker
  itself lives behind that button in `ColorSheet`, not inline, so the car keeps the room. Phone = single
  column, dock docked above the tab bar. Tablet ≥900 px = **two panes**, car ~58% left, controls right;
  purpose-built, not stretched. `ColorSheet` anchors to that right pane there (`Sheet anchor`), per Apple's
  guidance that a sheet springs from its source element, instead of taking the centre of the screen.
  Disconnected → prominent **Connect by MAC** CTA (`controller.connectPinned()`, no scan) and controls
  genuinely disabled. Animation active → banner naming it + one-tap return to static colour.
  One honest line: Front cabin and Handles & feet are the two controllable groups; pieces in a group share a colour.
- **`MoodsScreen.jsx`** — grid of `MoodCard` (2 cols phone / 3–4 tablet), `controller.applyMood`, staggered reveal.
- **`EffectsScreen.jsx`** — the four families from `catalog.js` (199 modes). Segmented family switcher renders
  **one family at a time**, plus a text filter. `setRgbMode` for rgb, else `setSymphony`. Persistent
  "Back to static colour". States plainly that animations are global and Music Rhythm uses the controller's mic.
- **`FavoritesScreen.jsx`** — save current look, apply, rename via `Sheet`, delete with confirm, reorder via
  up/down buttons (keyboard-reachable; there is no drag-reorder, and nothing should imply one).
- **`SettingsScreen.jsx`** — pinned-device card (ATW-FWD-AAA6 / `7B:F7:38:62:BA:8A`) with **Connect by MAC** as
  the primary button and an explicit note that it needs no scan; collapsed Advanced section with the scan
  fallback that refuses non-pinned devices; all `settingsStore` toggles with plain-language descriptions;
  diagnostics (`transportKind()`, status, last error); About (3-zone truth, keystore-backup warning).

## 7. Shell — `src/App.jsx`, `src/main.jsx`

All five screens stay mounted, toggled by CSS, so `CarHero` never re-mounts. `NavBar` variant from
`useBreakpoint`. `App.jsx` writes `--accent`/`--accent-soft`/`--accent-glow` from `dominantHex()` onto
`documentElement`, mirrors `reduceGlass`/`reduceMotion` onto `body[data-*]`, calls `controller.init()` once
(StrictMode-safe), renders `Toast`. `main.jsx` imports `theme/tokens.css` then `theme/glass.css`.
**Delete `src/App.css`.**

## 8. Ambient engine — `src/engine/`

`ambient = { start(effect,opts), stop(reason), isRunning(), current() }` over `welcome | drift | timeOfDay`.
All sends go through the queue; one effect at a time.
`welcome` — on connect: power on, warm and dim, ~8 steps over ~3 s (≥250 ms apart) to the restored state;
skipped if the drop lasted <60 s. `drift` — HSL hue walk, one tick every 2–8 s, 2 writes/tick.
`timeOfDay` — dawn/day/dusk/night dual-zone presets, applied once on connect and every 30 min foregrounded.
**Stop guards (all four):** manual command (`lastManualAt`), disconnect/reconnecting, app backgrounded
(`@capacitor/app` `appStateChange`, imported defensively), firmware animation started. Zero timer leaks.

## 9. Capacitor — `capacitor.config.json`, `package.json`

`appId com.ambiance.hycross`, `appName Ambiance`, `webDir dist`, `backgroundColor #000000`,
SplashScreen `launchAutoHide:true` + `launchFadeOutDuration:200` (the fade is what makes the native
splash meet `LaunchOverlay` without a visible cut). Plugins: `@capacitor/app`, `@capacitor/preferences`,
`@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor-community/bluetooth-le`,
`@capacitor-community/keep-awake`. minSdk 26 / target 35. Manifest: `BLUETOOTH_SCAN`
(`usesPermissionFlags="neverForLocation"`) + `BLUETOOTH_CONNECT`, legacy BT/location `maxSdkVersion="30"`.

## 9a. App identity — icon and splash

Source of truth is the owner's artwork, `Logo/Logo.png` (2246×1888 neon Hycross front end on black).
Never referenced directly: it is 5.6 MB, and only downscaled derivatives ship.

```
resources/icon.png             1024² logo at 82%, black    legacy pre-Android-8 launcher icon
resources/icon-foreground.png  1024² logo at 78%, alpha    adaptive foreground
resources/icon-background.png  1024² solid black           generated but unused (see below)
resources/splash.png           2732² logo at 55%, black    pre-Android-12 splash
src/assets/logo-launch.jpg     900px, 124KB                LaunchOverlay art
```

Regenerate with `npx @capacitor/assets generate --android --iconBackgroundColor '#000000'
--splashBackgroundColor '#000000' --splashBackgroundColorDark '#000000'`. **Three things must then be
re-applied by hand — the generator overwrites them:**

1. **`mipmap-anydpi-v26/ic_launcher{,_round}.xml`.** The generator wraps every layer in
   `<inset 16.7%>`, which is right for the foreground (that inset *is* the adaptive safe zone, so the
   source art should be near full-bleed — pre-shrinking it shrinks it twice) but wrong for the
   background: an inset image leaves the outer ring transparent, exactly the part a launcher reveals
   during parallax or with a mask wider than the safe zone. So the background is `@color/launcher_bg`,
   which fills all 108 dp by definition and costs no bytes. The same files also add `<monochrome>` for
   Android 13+ themed icons, which the generator does not emit at all.
2. **`mipmap-*/ic_launcher_monochrome.png`** (6 densities, 108 dp canvas, logo at 78% to match the
   foreground). Built from the logo's own luminance as the alpha channel — the artwork is light on
   black, so its brightness already *is* its shape — with flat white RGB for the launcher to tint.
3. **Splash recompression.** The generated splashes are 24-bit PNGs of a neon glow, up to 1.6 MB each
   and 8.46 MB over the density set. They are one hue over black, so a 256-colour palette carries them
   at 2.53 MB — a 70% saving with no visible loss.

`values/styles.xml` pins `windowSplashScreenBackground` and `windowSplashScreenIconBackgroundColor` to
black. Android 12+ ignores the splash drawable and composes its own system splash from the adaptive
icon on the theme's background; left unset that background follows the system light/dark setting, and
a phone in light mode would put this pale neon outline on white.

## 9b. Premium pass — additions

Layered on top of everything above. Nothing here changes the protocol, the
transports, the queue or the engine's internals.

**Tokens** (`theme/tokens.css`): `--t-wordmark`, `--t-caps`, `--track-caps`,
`--dur-accent`, `--dur-sheen`, `--dur-draw`. `.caps-label` is the tracked-caps
instrument-label voice used by every secondary heading (applied via CSS, so DOM
text stays sentence case). A fixed `body::before` vignette lifts the black.

`--accent` / `--accent-soft` / `--accent-glow` are registered with `@property`
so they animate; `:root` transitions them over `--dur-accent`. `App.jsx` mirrors
`reduceMotion` onto **both** `body` and `documentElement` — `body[data-*] *`
cannot select `:root`, so the html flag is what disables that transition.

**Reduced motion** zeroes `animation-delay` and `transition-delay` as well as
durations. Without that, the intro's delayed lights-up would leave the car dark.

**Keyframes/utilities** (`theme/glass.css`): `amb-sheen`, `amb-tick`,
`amb-screen-in`; `.tick-swap` (keyed value readouts), `.card-sheen` (one-shot
sweep — remount with a changing key to replay; wired into MoodCard and
EffectCard on press).

**CarHero v2.** `pieces.js` exports `BODY_D`, the single bezier outline shared by
the body fill, the intro tracer, the sweep clip and MiniCar. Layer order: floor
pool → gradient shell + rim → cabin/glass/doors/seats → sheen → door labels →
tracer → zone 1 → zone 2 → sweep → hit regions. Still **exactly two filters**.
The wash no longer uses `filter: blur` — softness is in the gradient stops.
Two once-only moments: the outline draws itself on first mount, and connecting
sweeps a light down the body. **Deviation from §2:** CarHero subscribes to
`connectionStore.status` itself to detect that connect — its props are unchanged.

**`components/MiniCar.jsx`** — static, filter-free, `aria-hidden`, no focusable
nodes (its labels would otherwise collide with the real map's hit regions).
Rotated 90° so the car fills a wide swatch; strokes ×3 to survive the scale.
Used by MoodCard. FavoriteCard deliberately keeps its compact dual swatch, and
so do the Home quick chips — a car is illegible at that size.

**`services/haptics.js`** — `tick` (8ms, selection), `tap` (15ms, applied),
`success` ([10,30,20], connected — a short rising triple), `error`
([30,60,30], link lost or command failed — a heavy symmetric double-thump,
deliberately unmistakable from success in a pocket). Gated on the `haptics`
setting and on `navigator.vibrate` existing. Also exports `createDetent(fn,
gapMs)`, the rate limiter `Brightness` uses so a drag feels detented instead
of buzzing.
**Single owner:** fired only from press handlers, from `controller.connect()`
on success, and from the two adverse choke points inside `controller.init()`
(the transport's `onDisconnect` and `onQueueError`) — never from
`setColor`/`setBrightness` or the engine, so drags and drift stay silent, and
one underlying fault never double-buzzes.

**Drift** has a chip on Home (`ambient.start('drift')` / `ambient.stop`), which
is the only UI entry point to the engine.

**Assets:** `resources/icon.svg` + `splash.svg` (monogram as paths, no font
dependency). See BUILD_APK.md for `@capacitor/assets`.

## 9c. Shell and edge cases

**Fonts are bundled**, not fetched — `main.jsx` imports latin-only `@fontsource`
weights (9 woff2, ~148KB). A car is offline more often than not, and a CDN font
would fall back to a system face exactly when it matters.

**`services/backButton.js`** — Android back closes the top sheet, else returns to
Home, else minimises. `backAction()` is a pure function so the priority is
testable. Registering any listener suppresses Capacitor's default
finish-the-activity, making exit deliberate. `Sheet` registers itself in
`uiStore.sheets` (with its real `onClose`, so parent state clears) and locks
body scroll while open.

**`services/nativeShell.js`** — `initKeepAwake()` subscribes to the setting for
the app's lifetime (it was previously a decorative toggle). `initStatusBar()`
paints the bar black; note `Style.Dark` means *dark background*, i.e. light
icons.

**`engine/timeOfDayScheduler.js`** — the 30-minute re-apply §8 promises. Pure
`shouldReapply()` guard: **once the driver changes anything, it stands down for
the rest of the session** rather than waiting out a quiet period, which would
eventually overwrite a deliberate choice. Also yields to drift and to firmware
animations.

**App.jsx boot subscription is intentionally never unsubscribed** — it is
app-lifetime, and returning it as cleanup under the `booted` guard meant a
StrictMode remount tore it down and then skipped re-creating it, silently
disabling restore-on-connect in every dev session.

## 9d. No page-wide horizontal scroll

`html, body { overflow-x: clip }` in tokens.css, plus `overflow: clip` on `.carhero`
itself. **`clip`, not `hidden`** — `hidden` creates a new scroll container and
would break `position: sticky` on the floating dock and the tablet's sticky car
pane; `clip` clips paint without doing that. The thing being clipped is
deliberate: `.carhero-wash`'s light pool is `inset: -10% -16%`, bleeding past
the car on purpose, and the glow filters paint at `x:-60%, width:220%`. Both
still render fully — only the page's ability to scroll to see the overflow is
removed.

## 10. Conventions

- The app is called **Ambiance** in every user-visible string.
- No emoji as icons, anywhere. SVG only, consistent 1.75 px stroke.
- No hardcoded hex in components — tokens only; the one dynamic value is the live light colour.
- `VITE_TRANSPORT=mock` selects the mock transport for UI work without hardware.
- Files under ~300 lines; split rather than sprawl.
- Never claim a light state the firmware cannot deliver.
