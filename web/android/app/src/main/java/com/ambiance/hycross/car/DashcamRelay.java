package com.ambiance.hycross.car;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Reads the Dash Cam Pro+ status for the car screen.
 *
 * The camera is its own Wi-Fi access point with no internet route, so the car
 * screen cannot ask it anything directly — the head unit is not on the
 * camera's network. What it can do is read the last snapshot the car-side
 * bridge posted to the relay, which is the same thing the phone app shows.
 *
 * PAIRING CODE
 * ------------
 * Reads are gated on the shared code. That code is already on this phone,
 * stored by the app through Capacitor Preferences — which is a plain
 * SharedPreferences file under the hood, so the car app can read the very same
 * value instead of asking the driver to type a code on a car screen (which the
 * templates would not allow anyway).
 */
final class DashcamRelay {

    private static final String TAG = "AmbianceCarDashcam";

    /** Where Capacitor Preferences keeps its values on Android. */
    private static final String CAPACITOR_PREFS = "CapacitorStorage";

    /** Must match PAIR_KEY in web/src/config/dashcam.js. */
    private static final String PAIR_KEY = "ambiance.dashcam.pair";

    /** Must match RELAY_ORIGIN + RELAY_PATH in web/src/config/dashcam.js. */
    private static final String RELAY_URL = "https://ambiance-amber.vercel.app/api/dashcam-status";

    /** Anything older than this is "last seen", never "live". */
    static final long STALE_AFTER_MS = 90_000L;

    private static final int CONNECT_TIMEOUT_MS = 8_000;
    private static final int READ_TIMEOUT_MS = 8_000;

    /** Single thread: one poll at a time is all the car screen ever needs. */
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Context appContext;

    DashcamRelay(Context context) {
        this.appContext = context.getApplicationContext();
    }

    /** What the car screen needs to render. */
    static final class Status {
        boolean online;
        Boolean recording;
        Boolean parking;
        String mode;
        Integer usedPct;
        Boolean sdPresent;
        String ssid;
        String model;
        String firmware;
        long at;
    }

    /** Why there is nothing to show. */
    enum Problem { NONE, UNPAIRED, NOTHING_REPORTED, UNREACHABLE }

    static final class Result {
        final Status status;
        final Problem problem;
        final String detail;

        Result(Status status, Problem problem, String detail) {
            this.status = status;
            this.problem = problem;
            this.detail = detail;
        }
    }

    interface Callback {
        /** Delivered on whatever thread finished the request. */
        void onResult(Result result);
    }

    /** The code this device was paired with, or "" when unpaired. */
    String pairCode() {
        SharedPreferences prefs =
                appContext.getSharedPreferences(CAPACITOR_PREFS, Context.MODE_PRIVATE);
        String code = prefs.getString(PAIR_KEY, "");
        return code == null ? "" : code.trim();
    }

    void fetch(Callback callback) {
        io.execute(() -> {
            try {
                callback.onResult(fetchBlocking());
            } catch (Exception e) {
                Log.w(TAG, "status fetch failed", e);
                callback.onResult(new Result(null, Problem.UNREACHABLE, "Could not reach the relay"));
            }
        });
    }

    void shutdown() {
        io.shutdownNow();
    }

    private Result fetchBlocking() throws Exception {
        String code = pairCode();
        if (code.isEmpty()) {
            return new Result(null, Problem.UNPAIRED, null);
        }

        HttpURLConnection conn = (HttpURLConnection) new URL(RELAY_URL).openConnection();
        try {
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setRequestProperty("x-dashcam-pair", code);
            conn.setRequestProperty("Accept", "application/json");
            // A cached "Recording" is worse than no answer, because it looks
            // current.
            conn.setUseCaches(false);

            int status = conn.getResponseCode();
            if (status == 401) {
                return new Result(null, Problem.UNPAIRED, null);
            }
            if (status == 404) {
                return new Result(null, Problem.NOTHING_REPORTED, null);
            }
            if (status != 200) {
                return new Result(null, Problem.UNREACHABLE, "Relay returned HTTP " + status);
            }

            String body = readAll(conn.getInputStream());
            JSONObject root = new JSONObject(body);
            JSONObject raw = root.optJSONObject("status");
            if (raw == null) {
                return new Result(null, Problem.NOTHING_REPORTED, null);
            }
            return new Result(parse(raw), Problem.NONE, null);
        } finally {
            conn.disconnect();
        }
    }

    private static Status parse(JSONObject raw) {
        Status s = new Status();
        s.online = raw.optBoolean("online", false);
        s.recording = optBoolean(raw, "recording");
        s.parking = optBoolean(raw, "parking");
        s.mode = optString(raw, "mode");
        s.at = raw.optLong("at", 0L);

        JSONObject sd = raw.optJSONObject("sd");
        if (sd != null) {
            s.sdPresent = optBoolean(sd, "present");
            s.usedPct = sd.has("usedPct") && !sd.isNull("usedPct") ? sd.optInt("usedPct") : null;
        }

        JSONObject wifi = raw.optJSONObject("wifi");
        if (wifi != null) {
            s.ssid = optString(wifi, "ssid");
        }

        JSONObject device = raw.optJSONObject("device");
        if (device != null) {
            s.model = optString(device, "model");
            s.firmware = optString(device, "firmware");
        }
        return s;
    }

    /** Tri-state: the relay omits fields it has no reading for. */
    private static Boolean optBoolean(JSONObject o, String key) {
        if (!o.has(key) || o.isNull(key)) return null;
        return o.optBoolean(key);
    }

    private static String optString(JSONObject o, String key) {
        if (!o.has(key) || o.isNull(key)) return null;
        String v = o.optString(key, "").trim();
        return v.isEmpty() ? null : v;
    }

    private static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        // Cap the read: this endpoint returns a small object, and an
        // unbounded read on a misbehaving host would grow without limit.
        int total = 0;
        while ((n = in.read(buf)) != -1) {
            total += n;
            if (total > 64 * 1024) break;
            out.write(buf, 0, n);
        }
        return out.toString("UTF-8");
    }
}
