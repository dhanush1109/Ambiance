package com.ambiance.hycross.car;

/**
 * Cardi Magic BLE frames for the car screen. Pure, no I/O.
 *
 * WHY THIS IS A SECOND COPY
 * -------------------------
 * The app's real frame builders live in web/src/protocol/frames.js and run
 * inside the Capacitor WebView. A car app runs native, in a different process
 * surface entirely, with no WebView and no JavaScript — so the handful of
 * commands the car screen needs have to exist in Java too.
 *
 * Only what the car screen is allowed to send is ported: power, a mood's two
 * zone colours, and the matching brightness levels. Scenes, animations and
 * speed are deliberately absent — Android Auto's IOT rules forbid offering
 * that kind of fine-grained control to a driver, so there is no reason for the
 * code to exist here.
 *
 * Type A only (the pinned ATW-FWD-AAA6). Type B is unported for the same
 * reason: this car does not have one.
 *
 * The "+29 / +30" decimal-into-hex trick below looks like a bug and is not.
 * It is how the vendor APK encodes these bytes, and frames.js carries the same
 * comment. See research/PROTOCOL.md. Verified against the JS golden vectors in
 * CardiFramesTest.
 */
public final class CardiFrames {

    private CardiFrames() {}

    public static final String SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
    public static final String CHAR_FFE2 = "0000ffe2-0000-1000-8000-00805f9b34fb";

    /** The controller exposes exactly three zones. */
    public static final int ZONE_FRONT = 1;
    public static final int ZONE_REAR = 2;
    public static final int ZONE_ALL = 3;

    /** Type A ASCII prefixes, straight from frames.js. */
    private static String rgbPrefix(int zone) {
        switch (zone) {
            case 1: return "10";
            case 2: return "09";
            case 3: return "06";
            default: throw new IllegalArgumentException("Unknown zone: " + zone);
        }
    }

    private static String brightPrefix(int zone) {
        switch (zone) {
            case 1: return "01010";
            case 2: return "01020";
            case 3: return "02000";
            default: throw new IllegalArgumentException("Unknown zone: " + zone);
        }
    }

    /** {@code payload_power} */
    public static byte[] power(boolean on) {
        return asciiFrame(on ? "0701" : "0700");
    }

    /**
     * {@code payload_rgb} — prefix plus lowercase rrggbb.
     */
    public static byte[] rgb(int r, int g, int b, int zone) {
        return asciiFrame(rgbPrefix(zone) + lowerHex2(r) + lowerHex2(g) + lowerHex2(b));
    }

    /**
     * {@code payload_brightness} — level is clamped to 0..9. The firmware
     * scale is 0-9, never 0-100, and the raw digit becomes the ASCII byte
     * 0x30..0x39.
     */
    public static byte[] brightness(int level, int zone) {
        int lvl = Math.max(0, Math.min(9, level));
        return asciiFrame(brightPrefix(zone) + lvl);
    }

    /** Wrap an ASCII command in the Type A delimiters: 0x3C ... 0x3E. */
    private static byte[] asciiFrame(String inner) {
        String text = "<" + inner + ">";
        byte[] out = new byte[text.length()];
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c > 0x7f) {
                throw new IllegalArgumentException("asciiFrame: non-ASCII character");
            }
            out[i] = (byte) c;
        }
        return out;
    }

    /** {@code f"{value:02x}"} — lowercase, zero padded to 2. */
    private static String lowerHex2(int value) {
        int v = Math.max(0, Math.min(255, value));
        return String.format("%02x", v);
    }

    /** Parse '#rrggbb' into {r, g, b}. */
    public static int[] hexToRgb(String hex) {
        String raw = hex == null ? "" : hex.trim();
        if (raw.startsWith("#")) raw = raw.substring(1);
        if (raw.length() == 3) {
            raw = "" + raw.charAt(0) + raw.charAt(0)
                    + raw.charAt(1) + raw.charAt(1)
                    + raw.charAt(2) + raw.charAt(2);
        }
        if (raw.length() != 6) {
            throw new IllegalArgumentException("hexToRgb: expected #rrggbb, got " + hex);
        }
        return new int[]{
                Integer.parseInt(raw.substring(0, 2), 16),
                Integer.parseInt(raw.substring(2, 4), 16),
                Integer.parseInt(raw.substring(4, 6), 16),
        };
    }

    /** Uppercase hex, space separated — matches bytesToHex() in hex.js. */
    public static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < bytes.length; i++) {
            if (i > 0) sb.append(' ');
            sb.append(String.format("%02X", bytes[i] & 0xff));
        }
        return sb.toString();
    }
}
