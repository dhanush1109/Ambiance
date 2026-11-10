package com.ambiance.hycross.car;

import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.ActionStrip;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.ListTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;

/**
 * Dash camera status on the car screen.
 *
 * This is the read-only half of the app and the reason an IOT car app makes
 * sense at all: "is the camera actually recording right now" is a question
 * worth answering on a glance-sized surface, and the phone is in a pocket.
 *
 * HONESTY ABOUT STALENESS
 * -----------------------
 * The reading comes from the relay, posted by the car-side bridge. If the
 * bridge stopped — phone off the camera's Wi-Fi, camera asleep — the last
 * snapshot keeps saying "Recording" forever. Showing that as current would be
 * worse than showing nothing, so anything past STALE_AFTER_MS is relabelled as
 * a last-seen reading with its age.
 *
 * No Start/Stop here, unlike the phone screen. Commanding the recorder needs a
 * direct HTTP call to the camera, and the head unit is not on the camera's
 * network — the button would fail every time, which `DR-1` treats as a defect.
 */
final class DashcamScreen extends Screen implements DefaultLifecycleObserver {

    /** Matches POLL_MS in web/src/config/dashcam.js. */
    private static final long POLL_MS = 10_000L;

    private final DashcamRelay relay;
    private final Handler main = new Handler(Looper.getMainLooper());

    private DashcamRelay.Status status;
    private DashcamRelay.Problem problem = DashcamRelay.Problem.NONE;
    private String detail;
    private boolean loading = true;
    private boolean active;

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            refresh();
            // Re-armed from here rather than on a fixed interval, so a slow
            // response cannot stack up overlapping requests.
            if (active) main.postDelayed(this, POLL_MS);
        }
    };

    DashcamScreen(@NonNull CarContext carContext) {
        super(carContext);
        this.relay = new DashcamRelay(carContext);
        getLifecycle().addObserver(this);
    }

    @Override
    public void onStart(@NonNull LifecycleOwner owner) {
        active = true;
        main.post(poll);
    }

    @Override
    public void onStop(@NonNull LifecycleOwner owner) {
        // Stop polling the moment the screen is off display: a background
        // request every ten seconds for the whole drive is pure waste.
        active = false;
        main.removeCallbacks(poll);
    }

    @Override
    public void onDestroy(@NonNull LifecycleOwner owner) {
        relay.shutdown();
    }

    private void refresh() {
        relay.fetch(result -> main.post(() -> {
            if (!active) return;
            loading = false;
            status = result.status;
            problem = result.problem;
            detail = result.detail;
            invalidate();
        }));
    }

    @NonNull
    @Override
    public Template onGetTemplate() {
        ItemList.Builder list = new ItemList.Builder();

        if (loading) {
            // A template with no items and no loading flag is rejected by the
            // host, so this state has to be explicit.
            return new ListTemplate.Builder()
                    .setTitle("Dash Cam")
                    .setHeaderAction(Action.BACK)
                    .setLoading(true)
                    .build();
        }

        switch (problem) {
            case UNPAIRED:
                list.addItem(new Row.Builder()
                        .setTitle("Not paired on this phone")
                        .addText("Open Ambiance on your phone to enter the pairing code")
                        .build());
                break;
            case NOTHING_REPORTED:
                list.addItem(new Row.Builder()
                        .setTitle("No reading yet")
                        .addText("The camera has not reported since the bridge last ran")
                        .build());
                break;
            case UNREACHABLE:
                list.addItem(new Row.Builder()
                        .setTitle("Status unavailable")
                        .addText(detail == null ? "Could not reach the relay" : detail)
                        .build());
                break;
            case NONE:
            default:
                addStatusRows(list);
                break;
        }

        return new ListTemplate.Builder()
                .setTitle("Dash Cam")
                .setHeaderAction(Action.BACK)
                .setSingleList(list.build())
                .setActionStrip(new ActionStrip.Builder()
                        .addAction(new Action.Builder()
                                .setTitle("Refresh")
                                .setOnClickListener(() -> {
                                    loading = true;
                                    invalidate();
                                    refresh();
                                })
                                .build())
                        .build())
                .build();
    }

    private void addStatusRows(ItemList.Builder list) {
        DashcamRelay.Status s = status;
        if (s == null) {
            list.addItem(new Row.Builder().setTitle("No reading yet").build());
            return;
        }

        long age = System.currentTimeMillis() - s.at;
        boolean stale = s.at <= 0 || age > DashcamRelay.STALE_AFTER_MS;

        // THE HEADLINE ROW. Stale readings never claim to be live.
        String headline;
        String sub;
        if (stale) {
            headline = "Last seen " + humanAge(age);
            sub = describe(s) + " when it last reported";
        } else if (!s.online) {
            headline = "Camera offline";
            sub = "The bridge is reporting, but the camera is not answering";
        } else {
            headline = describe(s);
            sub = "Live — updated " + humanAge(age);
        }

        list.addItem(new Row.Builder()
                .setTitle(headline)
                .addText(sub)
                .build());

        if (s.usedPct != null) {
            String storage = s.usedPct + "% used";
            if (Boolean.FALSE.equals(s.sdPresent)) {
                storage = "No card inserted";
            }
            list.addItem(new Row.Builder()
                    .setTitle("Storage")
                    .addText(storage)
                    .build());
        } else if (Boolean.FALSE.equals(s.sdPresent)) {
            list.addItem(new Row.Builder()
                    .setTitle("Storage")
                    .addText("No card inserted")
                    .build());
        }

        if (Boolean.TRUE.equals(s.parking)) {
            list.addItem(new Row.Builder()
                    .setTitle("Parking mode")
                    .addText("Armed")
                    .build());
        }

        String name = s.model != null ? s.model : "Dash Cam Pro+";
        String idLine = s.ssid != null ? s.ssid : (s.firmware != null ? s.firmware : "Paired camera");
        list.addItem(new Row.Builder()
                .setTitle(name)
                .addText(idLine)
                .build());
    }

    /** The one sentence that matters: is it recording? */
    private static String describe(DashcamRelay.Status s) {
        if (Boolean.TRUE.equals(s.recording)) return "Recording";
        if (Boolean.FALSE.equals(s.recording)) return "Not recording";
        if (s.mode != null) return s.mode;
        return s.online ? "Camera online" : "Camera offline";
    }

    /** Coarse on purpose — a driver does not need seconds. */
    private static String humanAge(long ms) {
        if (ms < 0) return "just now";
        long seconds = ms / 1000L;
        if (seconds < 45) return "just now";
        long minutes = seconds / 60L;
        if (minutes < 1) return "under a minute ago";
        if (minutes == 1) return "1 minute ago";
        if (minutes < 60) return minutes + " minutes ago";
        long hours = minutes / 60L;
        if (hours == 1) return "1 hour ago";
        if (hours < 24) return hours + " hours ago";
        long days = hours / 24L;
        return days == 1 ? "1 day ago" : days + " days ago";
    }
}
