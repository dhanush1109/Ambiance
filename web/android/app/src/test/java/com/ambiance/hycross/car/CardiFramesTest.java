package com.ambiance.hycross.car;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * Pins the Java frame builders to the same bytes the app sends.
 *
 * Every expected value below is copied from web/src/test/golden_vectors.json,
 * which is generated from the real vendor APK's behaviour. That file is the
 * authority for this protocol — if this test and that file ever disagree, this
 * file is wrong.
 *
 * The point of the test is that a mood selected on the car screen puts the
 * cabin in a byte-for-byte identical state to the same mood selected in the
 * phone app. Two implementations of one protocol is a liability; this is what
 * keeps them honest.
 */
public class CardiFramesTest {

    @Test
    public void power_matchesGoldenVectors() {
        assertEquals("3C 30 37 30 31 3E", hex(CardiFrames.power(true)));
        assertEquals("3C 30 37 30 30 3E", hex(CardiFrames.power(false)));
    }

    @Test
    public void rgb_matchesGoldenVectors_allZones() {
        // zone 1 (front) — prefix '10'
        assertEquals("3C 31 30 66 66 38 61 33 64 3E", hex(rgb("#ff8a3d", CardiFrames.ZONE_FRONT)));
        assertEquals("3C 31 30 30 30 30 30 30 30 3E", hex(rgb("#000000", CardiFrames.ZONE_FRONT)));
        assertEquals("3C 31 30 66 66 66 66 66 66 3E", hex(rgb("#ffffff", CardiFrames.ZONE_FRONT)));

        // zone 2 (handles & feet) — prefix '09'
        assertEquals("3C 30 39 66 66 38 61 33 64 3E", hex(rgb("#ff8a3d", CardiFrames.ZONE_REAR)));
        assertEquals("3C 30 39 31 32 61 62 37 63 3E", hex(rgb("#12ab7c", CardiFrames.ZONE_REAR)));

        // zone 3 (all) — prefix '06'
        assertEquals("3C 30 36 37 62 30 30 66 66 3E", hex(rgb("#7b00ff", CardiFrames.ZONE_ALL)));
        assertEquals("3C 30 36 30 61 30 62 30 65 3E", hex(rgb("#0a0b0e", CardiFrames.ZONE_ALL)));
    }

    @Test
    public void brightness_matchesGoldenVectors() {
        assertEquals("3C 30 31 30 31 30 30 3E", hex(CardiFrames.brightness(0, CardiFrames.ZONE_FRONT)));
        assertEquals("3C 30 31 30 31 30 37 3E", hex(CardiFrames.brightness(7, CardiFrames.ZONE_FRONT)));
        assertEquals("3C 30 31 30 31 30 39 3E", hex(CardiFrames.brightness(9, CardiFrames.ZONE_FRONT)));

        assertEquals("3C 30 31 30 32 30 34 3E", hex(CardiFrames.brightness(4, CardiFrames.ZONE_REAR)));
        assertEquals("3C 30 31 30 32 30 39 3E", hex(CardiFrames.brightness(9, CardiFrames.ZONE_REAR)));

        assertEquals("3C 30 32 30 30 30 30 3E", hex(CardiFrames.brightness(0, CardiFrames.ZONE_ALL)));
        assertEquals("3C 30 32 30 30 30 39 3E", hex(CardiFrames.brightness(9, CardiFrames.ZONE_ALL)));
    }

    /**
     * The firmware scale is 0-9. Anything outside it has to be clamped, not
     * sent — a stray 100 would otherwise build a two-digit frame the
     * controller cannot parse.
     */
    @Test
    public void brightness_clampsToFirmwareRange() {
        assertEquals(hex(CardiFrames.brightness(0, CardiFrames.ZONE_ALL)),
                hex(CardiFrames.brightness(-7, CardiFrames.ZONE_ALL)));
        assertEquals(hex(CardiFrames.brightness(9, CardiFrames.ZONE_ALL)),
                hex(CardiFrames.brightness(100, CardiFrames.ZONE_ALL)));
    }

    /** Every mood on the car screen must build sendable frames. */
    @Test
    public void everyCarMood_buildsValidFrames() {
        for (Moods.Mood mood : Moods.CAR_MOODS) {
            int[] z1 = CardiFrames.hexToRgb(mood.z1Hex);
            int[] z2 = CardiFrames.hexToRgb(mood.z2Hex);

            // 3 bytes of colour become 6 ASCII hex chars, plus a 2-char
            // prefix and the two delimiters.
            assertEquals(mood.id, 10,
                    CardiFrames.rgb(z1[0], z1[1], z1[2], CardiFrames.ZONE_FRONT).length);
            assertEquals(mood.id, 10,
                    CardiFrames.rgb(z2[0], z2[1], z2[2], CardiFrames.ZONE_REAR).length);

            // Brightness must already be in firmware range in the data, not
            // rely on the clamp to save it.
            assertEquals(mood.id + " z1 brightness in range", mood.z1Brightness,
                    Math.max(0, Math.min(9, mood.z1Brightness)));
            assertEquals(mood.id + " z2 brightness in range", mood.z2Brightness,
                    Math.max(0, Math.min(9, mood.z2Brightness)));
        }
    }

    /** Moods are copied from moods.js by hand, so verify a known one. */
    @Test
    public void emberDrift_matchesTheAppsValues() {
        Moods.Mood ember = Moods.byId("ember-drift");
        assertEquals("#ff8a3d", ember.z1Hex);
        assertEquals(7, ember.z1Brightness);
        assertEquals("#c22f06", ember.z2Hex);
        assertEquals(4, ember.z2Brightness);
    }

    @Test(expected = IllegalArgumentException.class)
    public void rgb_rejectsAZoneTheControllerDoesNotHave() {
        CardiFrames.rgb(255, 0, 0, 4);
    }

    private static byte[] rgb(String hex, int zone) {
        int[] c = CardiFrames.hexToRgb(hex);
        return CardiFrames.rgb(c[0], c[1], c[2], zone);
    }

    private static String hex(byte[] bytes) {
        return CardiFrames.bytesToHex(bytes);
    }
}
