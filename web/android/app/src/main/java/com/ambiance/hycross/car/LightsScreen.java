package com.ambiance.hycross.car;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.CarToast;
import androidx.car.app.Screen;
import androidx.car.app.constraints.ConstraintManager;
import androidx.car.app.model.Action;
import androidx.car.app.model.ActionStrip;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.ListTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;

/**
 * Cabin lighting on the car screen — moods and off, and nothing finer.
 *
 * WHAT IS MISSING AND WHY
 * -----------------------
 * The phone app has a colour wheel, per-zone brightness, animations and
 * effects. None of that can be here. Google's IOT rules for car apps allow
 * device state, one-touch on/off and alerts while driving, and specifically
 * prohibit fine-grained controls like brightness or colour adjustment — a
 * driver dragging a colour picker at 80km/h is the exact thing being
 * designed out.
 *
 * A mood fits that rule perfectly: it is one touch, and it carries the colour
 * and brightness decisions that were already made on the phone. So the car
 * screen offers six of them plus an off switch, and the phone keeps the rest.
 */
final class LightsScreen extends Screen implements DefaultLifecycleObserver {

    private final LightsController lights;

    /** Last thing the controller told us, shown as the header subtitle. */
    private String statusLine;

    LightsScreen(@NonNull CarContext carContext) {
        super(carContext);
        this.lights = new LightsController(carContext);
        this.lights.setListener((state, detail) -> {
            // Only surface the states a driver can act on. "Connecting" flashes
            // past in about a second and would just make the screen twitch.
            if (state == LightsController.State.FAILED) {
                statusLine = detail;
                CarToast.makeText(getCarContext(),
                        detail == null ? "Could not reach the controller" : detail,
                        CarToast.LENGTH_LONG).show();
                invalidate();
            } else if (state == LightsController.State.READY && statusLine != null) {
                statusLine = null;
                invalidate();
            }
        });
        getLifecycle().addObserver(this);
    }

    @Override
    public void onStop(@NonNull LifecycleOwner owner) {
        // Hand the controller back as soon as the screen leaves the display,
        // so the phone app can connect without fighting us for it.
        lights.disconnect();
    }

    @NonNull
    @Override
    public Template onGetTemplate() {
        ItemList.Builder list = new ItemList.Builder();

        for (Moods.Mood mood : visibleMoods()) {
            list.addItem(new Row.Builder()
                    .setTitle(mood.name)
                    .setOnClickListener(() -> apply(mood))
                    .build());
        }

        ListTemplate.Builder template = new ListTemplate.Builder()
                .setTitle("Cabin Lighting")
                .setHeaderAction(Action.BACK)
                .setSingleList(list.build())
                .setActionStrip(new ActionStrip.Builder()
                        .addAction(new Action.Builder()
                                .setTitle("Off")
                                .setOnClickListener(this::turnOff)
                                .build())
                        .build());

        return template.build();
    }

    private void apply(Moods.Mood mood) {
        if (!precheck()) return;
        lights.applyMood(mood);
        // Acknowledge immediately. The writes take a moment and `DR-1` gives
        // us two seconds to respond to a touch, which a BLE connect can
        // exceed on a cold link.
        CarToast.makeText(getCarContext(), mood.name, CarToast.LENGTH_SHORT).show();
    }

    private void turnOff() {
        if (!precheck()) return;
        lights.setPower(false);
        CarToast.makeText(getCarContext(), "Lights off", CarToast.LENGTH_SHORT).show();
    }

    /**
     * Fail loudly before queueing anything.
     *
     * A car app cannot show a permission dialog — there is no activity on the
     * car screen to host one. `VI-1` requires telling the driver to look at
     * the phone instead, and to only do it when it is safe.
     */
    private boolean precheck() {
        if (!lights.hasPermission()) {
            CarToast.makeText(getCarContext(),
                    "Open Ambiance on your phone to allow Bluetooth — when it is safe to do so",
                    CarToast.LENGTH_LONG).show();
            return false;
        }
        if (!lights.isBluetoothOn()) {
            CarToast.makeText(getCarContext(), "Bluetooth is off", CarToast.LENGTH_LONG).show();
            return false;
        }
        return true;
    }

    /**
     * Trim the mood list to whatever this head unit will actually display.
     *
     * Hosts advertise their own row limit and silently reject a longer list,
     * so the limit is asked for rather than assumed. Six is the usual answer;
     * some units allow fewer.
     */
    private Moods.Mood[] visibleMoods() {
        int limit = Moods.CAR_MOODS.length;
        try {
            ConstraintManager cm = getCarContext().getCarService(ConstraintManager.class);
            int hostLimit = cm.getContentLimit(ConstraintManager.CONTENT_LIMIT_TYPE_LIST);
            if (hostLimit > 0) limit = Math.min(limit, hostLimit);
        } catch (Exception ignored) {
            // No constraint service on this host — keep the full shortlist.
        }
        if (limit >= Moods.CAR_MOODS.length) return Moods.CAR_MOODS;

        Moods.Mood[] trimmed = new Moods.Mood[limit];
        System.arraycopy(Moods.CAR_MOODS, 0, trimmed, 0, limit);
        return trimmed;
    }
}
