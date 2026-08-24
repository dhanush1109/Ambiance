import './AmbientBackdrop.css'

/**
 * A soft, slow field of the live cabin colour behind the entire app.
 *
 * This exists for one reason: blurring flat black returns flat black. Every
 * glass surface in the app — the nav bar, the dock, sheets, chips — needs
 * something behind it to bend and refract, or the "glass" is just a slightly
 * darker rectangle. This is that something. It stays under 5% opacity so it
 * never competes with the car, which is the actual light source the app is about.
 *
 * Mounted once in App.jsx, behind everything, decorative only.
 */
export default function AmbientBackdrop() {
  return (
    <div className="ambient-backdrop" aria-hidden="true">
      <div className="ambient-blob ambient-blob-a" />
      <div className="ambient-blob ambient-blob-b" />
    </div>
  )
}
