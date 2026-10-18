/**
 * Dash Cam Pro+ — the camera this app talks to.
 *
 * Recovered from the vendor app (`com.iot.amytvsdcam` v1.1.1) by inspecting
 * its own HTTP surface; see research/dashcam/PROTOCOL.md. Interoperability
 * with hardware the owner already has, same as config/device.js does for the
 * lighting controller.
 *
 * The camera is its own Wi-Fi access point. It answers plain HTTP CGI on a
 * fixed address, and it never reaches out — so "is it recording?" is only
 * answerable by something standing on the same network as the camera.
 */

/** Product name shown everywhere in the UI. */
export const DASHCAM_NAME = 'Dash Cam Pro+'

/**
 * The pinned camera.
 *
 * Same reasoning as config/device.js: this app drives one car's hardware, not
 * a generic fleet. The recorder fitted to it reports itself as
 * `MYTVS_FNP8H0XW`, and that name is also its Wi-Fi access point.
 *
 * Pinning it buys the thing that matters most for a dashcam — certainty about
 * whose footage you are looking at. A camera's CGI surface has no
 * authentication at all: any recorder on the same subnet answers the same
 * calls on the same address. Without a pin, a bridge that drifted onto a
 * different network, or a second MYTVS unit in the next bay, would quietly
 * report a stranger's recorder as yours.
 *
 * `firmware` is the build seen when this was pinned, kept so a silent
 * firmware change is visible rather than invisible. Date-stamped by the
 * vendor: 20250813.155628 is 2025-08-13 15:56:28.
 *
 * If the camera is ever replaced, this block is the single thing to edit.
 */
export const PINNED_CAMERA = {
  name: 'MYTVS_FNP8H0XW',
  ssid: 'MYTVS_FNP8H0XW',
  firmware: '20250813.155628',
}

/**
 * Candidate camera addresses, in probe order. Two families ship under this
 * app: the Novatek-style boxes answer on .1.254, the others on .169.1.
 * @type {string[]}
 */
export const CAMERA_HOSTS = ['192.168.1.254', '192.168.169.1']

/** Live view. `hello.mov` is the vendor's own stream name. */
export const RTSP_PATHS = ['hello.mov', 'livestream/11']

/** Recorded media roots on the camera's own filesystem. */
export const MEDIA_ROOTS = {
  movie: '/CARDV/MOVIE/',
  photo: '/CARDV/PHOTO/',
  locked: '/CARDV/MOVIE/RO/',
}

/**
 * The CGI calls this app uses. Status is read-only; the write calls are
 * deliberately limited to starting/stopping a recording and nothing that
 * could erase footage.
 */
export const CGI = {
  deviceAttr: 'getdeviceattr.cgi',
  workState: 'getworkstate.cgi',
  sdStatus: 'getsdstatus.cgi',
  wifi: 'getwifi.cgi',
  heartbeat: 'heartbeat.cgi',
  camNum: 'getcamnum.cgi',
  cameraFunc: 'getcamerafunc.cgi',
  recordStart: 'workmodecmd.cgi?&-cmd=start',
  recordStop: 'workmodecmd.cgi?&-cmd=stop',
  recordTrigger: 'workmodecmd.cgi?&-cmd=trigger',
}

/**
 * Where the app reads status from.
 *
 * `direct` works only while the phone is joined to the camera's own Wi-Fi,
 * and only over plain HTTP — a page served over HTTPS cannot call it, because
 * browsers block mixed content. `relay` is a small endpoint the car-side
 * bridge posts to, which is what makes the status readable from any device.
 */
export const STATUS_SOURCE = {
  direct: 'direct',
  relay: 'relay',
}

/** Status older than this is stale — shown as "last seen", never as live. */
export const STALE_AFTER_MS = 90_000

/** How often the app re-reads status while the screen is open. */
export const POLL_MS = 10_000

/** Relay endpoint path. */
export const RELAY_PATH = '/api/dashcam-status'

/**
 * Where the relay lives for clients that are not served from it.
 *
 * In a browser the app and the relay share an origin, so a relative path is
 * correct and keeps preview deployments talking to their own relay. The
 * Android app is served from `https://localhost`, where a relative path
 * resolves to a server that does not exist — so it has to name the real
 * origin explicitly.
 */
export const RELAY_ORIGIN = 'https://ambiance-amber.vercel.app'

/**
 * Where the pairing code is kept once entered.
 *
 * Reading status is gated on a shared code rather than left open. Status is
 * not footage, but "is this car recording right now, and where was it last
 * seen" is exactly what someone casing a car would want, and the endpoint's
 * only other protection was that its URL is unpublished — which is not
 * protection at all.
 *
 * One code for every device, entered once and remembered, because the
 * alternative is an account system for a single-owner app.
 */
export const PAIR_KEY = 'ambiance.dashcam.pair'
