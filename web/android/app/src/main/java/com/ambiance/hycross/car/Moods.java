package com.ambiance.hycross.car;

/**
 * The moods offered on the car screen.
 *
 * A deliberate subset of web/src/data/moods.js. The full app has fourteen;
 * Android Auto hosts cap a list at roughly six rows while driving, and a
 * driver scrolling a long list is exactly what the car app quality rules are
 * written to prevent. So this is the shortlist: the signature warm look, a
 * vivid one, two cool ones, and the two utility extremes
 * (find-something-bright and barely-there-dim).
 *
 * Values are copied verbatim from moods.js — same hexes, same 0-9 brightness —
 * so a mood picked in the car and the same mood picked in the app put the
 * cabin in an identical state.
 */
public final class Moods {

    private Moods() {}

    /** Two zones, two colours, two brightness levels. That is a mood. */
    public static final class Mood {
        public final String id;
        public final String name;
        /** Front cabin colour + brightness. */
        public final String z1Hex;
        public final int z1Brightness;
        /** Handles & footwells colour + brightness. */
        public final String z2Hex;
        public final int z2Brightness;

        Mood(String id, String name, String z1Hex, int z1Brightness, String z2Hex, int z2Brightness) {
            this.id = id;
            this.name = name;
            this.z1Hex = z1Hex;
            this.z1Brightness = z1Brightness;
            this.z2Hex = z2Hex;
            this.z2Brightness = z2Brightness;
        }
    }

    public static final Mood[] CAR_MOODS = new Mood[]{
            new Mood("ember-drift", "Ember Drift", "#ff8a3d", 7, "#c22f06", 4),
            new Mood("kinetic-red", "Kinetic Red", "#ff2436", 8, "#ff5a0a", 5),
            new Mood("cobalt-cruise", "Cobalt Cruise", "#2e6bff", 6, "#0b2b8a", 3),
            new Mood("velvet-hour", "Velvet Hour", "#a341ff", 6, "#2b1e9c", 3),
            new Mood("clear-cabin", "Clear Cabin", "#fff4e6", 9, "#ffe9cc", 8),
            new Mood("midnight-ink", "Midnight Ink", "#1e40a8", 2, "#2a1466", 1),
    };

    public static Mood byId(String id) {
        for (Mood m : CAR_MOODS) {
            if (m.id.equals(id)) return m;
        }
        return null;
    }
}
