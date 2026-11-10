package com.ambiance.hycross.car;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.content.ContextCompat;

import java.util.ArrayDeque;
import java.util.Queue;
import java.util.UUID;

/**
 * Talks to the pinned ambient controller from the car app.
 *
 * WHY THIS IS NOT THE APP'S BLE CODE
 * ----------------------------------
 * In the phone app, BLE goes through the Capacitor bluetooth-le plugin, driven
 * from JavaScript. The car app has no WebView and no JavaScript, so it has to
 * own a GATT connection itself.
 *
 * SERIALISED WRITES
 * -----------------
 * Android's GATT stack accepts exactly one outstanding operation per
 * connection. Firing the four writes a mood needs (two colours, two
 * brightnesses) back to back silently drops all but the first, which looks
 * like "the mood half-applied". So every write goes through a queue and the
 * next one is only sent from the onCharacteristicWrite callback.
 *
 * CONNECTION OWNERSHIP
 * --------------------
 * The controller accepts a single GATT client. If the phone app is open and
 * connected, the car app cannot also connect — so this disconnects after a
 * short idle period rather than holding the link, which lets the phone app
 * take over again the moment the driver picks it up.
 */
final class LightsController {

    private static final String TAG = "AmbianceCarLights";

    /** The one controller this app talks to — see web/src/config/device.js. */
    static final String PINNED_MAC = "7B:F7:38:62:BA:8A";

    /** Drop the link after this long with nothing to send. */
    private static final long IDLE_DISCONNECT_MS = 20_000L;

    /** A connect attempt that gets no callback is a failure, not a hang. */
    private static final long CONNECT_TIMEOUT_MS = 10_000L;

    interface Listener {
        /** Called on the main thread whenever connection state changes. */
        void onStateChanged(State state, String detail);
    }

    enum State { IDLE, CONNECTING, READY, FAILED }

    private final Context appContext;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Queue<byte[]> pending = new ArrayDeque<>();

    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic writeChar;
    private State state = State.IDLE;
    private boolean writeInFlight;
    private Listener listener;

    private final Runnable idleDisconnect = this::disconnect;
    private final Runnable connectTimeout = () -> {
        if (state == State.CONNECTING) {
            Log.w(TAG, "connect timed out");
            fail("Controller did not respond");
        }
    };

    LightsController(Context context) {
        this.appContext = context.getApplicationContext();
    }

    void setListener(Listener l) {
        this.listener = l;
    }

    State state() {
        return state;
    }

    /** True when the OS will actually let us open a GATT connection. */
    boolean hasPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(appContext, Manifest.permission.BLUETOOTH_CONNECT)
                    == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    boolean isBluetoothOn() {
        BluetoothAdapter adapter = adapter();
        return adapter != null && adapter.isEnabled();
    }

    /**
     * Queue a mood and make sure we are connected.
     *
     * Order matters: colour before brightness for each zone, so the strip
     * never flashes the previous colour at the new brightness.
     */
    void applyMood(Moods.Mood mood) {
        enqueue(CardiFrames.power(true));

        int[] z1 = CardiFrames.hexToRgb(mood.z1Hex);
        enqueue(CardiFrames.rgb(z1[0], z1[1], z1[2], CardiFrames.ZONE_FRONT));
        enqueue(CardiFrames.brightness(mood.z1Brightness, CardiFrames.ZONE_FRONT));

        int[] z2 = CardiFrames.hexToRgb(mood.z2Hex);
        enqueue(CardiFrames.rgb(z2[0], z2[1], z2[2], CardiFrames.ZONE_REAR));
        enqueue(CardiFrames.brightness(mood.z2Brightness, CardiFrames.ZONE_REAR));

        flush();
    }

    void setPower(boolean on) {
        enqueue(CardiFrames.power(on));
        flush();
    }

    private void enqueue(byte[] frame) {
        pending.add(frame);
    }

    /** Send what is queued, connecting first if we have to. */
    private void flush() {
        main.removeCallbacks(idleDisconnect);

        if (!hasPermission()) {
            fail("Bluetooth permission needed — open Ambiance on your phone");
            return;
        }
        if (!isBluetoothOn()) {
            fail("Bluetooth is off");
            return;
        }
        if (writeChar != null && gatt != null) {
            pump();
            return;
        }
        if (state != State.CONNECTING) {
            connect();
        }
    }

    private BluetoothAdapter adapter() {
        BluetoothManager bm = (BluetoothManager) appContext.getSystemService(Context.BLUETOOTH_SERVICE);
        return bm == null ? null : bm.getAdapter();
    }

    @SuppressWarnings("MissingPermission")
    private void connect() {
        BluetoothAdapter adapter = adapter();
        if (adapter == null) {
            fail("No Bluetooth on this device");
            return;
        }

        setState(State.CONNECTING, "Connecting to your controller");
        try {
            BluetoothDevice device = adapter.getRemoteDevice(PINNED_MAC);
            // TRANSPORT_LE explicitly: without it the stack can pick BR/EDR
            // for a dual-mode address and never find the GATT services.
            gatt = device.connectGatt(appContext, false, callback, BluetoothDevice.TRANSPORT_LE);
            if (gatt == null) {
                fail("Could not reach the controller");
                return;
            }
            main.postDelayed(connectTimeout, CONNECT_TIMEOUT_MS);
        } catch (IllegalArgumentException e) {
            fail("Controller address is invalid");
        } catch (SecurityException e) {
            fail("Bluetooth permission needed — open Ambiance on your phone");
        }
    }

    @SuppressWarnings("MissingPermission")
    void disconnect() {
        main.removeCallbacks(idleDisconnect);
        main.removeCallbacks(connectTimeout);
        pending.clear();
        writeInFlight = false;
        writeChar = null;
        if (gatt != null) {
            try {
                gatt.disconnect();
                gatt.close();
            } catch (SecurityException ignored) {
                // Permission revoked while connected; nothing useful to do.
            }
            gatt = null;
        }
        setState(State.IDLE, null);
    }

    /** Send the next queued frame, if the stack is free to take one. */
    @SuppressWarnings("MissingPermission")
    private void pump() {
        if (writeInFlight || gatt == null || writeChar == null) return;

        byte[] frame = pending.poll();
        if (frame == null) {
            // Nothing left — let go of the controller so the phone app can
            // have it back.
            main.removeCallbacks(idleDisconnect);
            main.postDelayed(idleDisconnect, IDLE_DISCONNECT_MS);
            return;
        }

        writeInFlight = true;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                gatt.writeCharacteristic(writeChar, frame,
                        BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
            } else {
                writeChar.setValue(frame);
                writeChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                gatt.writeCharacteristic(writeChar);
            }
        } catch (SecurityException e) {
            writeInFlight = false;
            fail("Bluetooth permission was revoked");
        }
    }

    private final BluetoothGattCallback callback = new BluetoothGattCallback() {
        @Override
        @SuppressWarnings("MissingPermission")
        public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            if (newState == BluetoothProfileState.CONNECTED) {
                main.removeCallbacks(connectTimeout);
                try {
                    g.discoverServices();
                } catch (SecurityException e) {
                    main.post(() -> fail("Bluetooth permission was revoked"));
                }
            } else if (newState == BluetoothProfileState.DISCONNECTED) {
                main.post(() -> {
                    boolean wasConnecting = state == State.CONNECTING;
                    writeChar = null;
                    writeInFlight = false;
                    if (gatt != null) {
                        try {
                            gatt.close();
                        } catch (SecurityException ignored) {
                            // Already gone.
                        }
                        gatt = null;
                    }
                    if (wasConnecting) {
                        // status 133 is the stack's generic "could not reach
                        // it", which in practice means out of range or
                        // already claimed by the phone app.
                        fail(status == 133
                                ? "Controller not in range, or the phone app has it"
                                : "Controller disconnected");
                    } else {
                        setState(State.IDLE, null);
                    }
                });
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            main.post(() -> {
                BluetoothGattService service = g.getService(UUID.fromString(CardiFrames.SERVICE_UUID));
                if (service == null) {
                    fail("This is not the ambient controller");
                    return;
                }
                BluetoothGattCharacteristic c =
                        service.getCharacteristic(UUID.fromString(CardiFrames.CHAR_FFE2));
                if (c == null) {
                    fail("Controller is missing its command channel");
                    return;
                }
                writeChar = c;
                setState(State.READY, "Connected");
                pump();
            });
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
            main.post(() -> {
                writeInFlight = false;
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    Log.w(TAG, "write failed, status=" + status);
                }
                // Keep going either way: a dropped colour frame should not
                // strand the brightness frame behind it.
                pump();
            });
        }
    };

    /** The two BluetoothProfile constants we care about, named for clarity. */
    private static final class BluetoothProfileState {
        static final int CONNECTED = android.bluetooth.BluetoothProfile.STATE_CONNECTED;
        static final int DISCONNECTED = android.bluetooth.BluetoothProfile.STATE_DISCONNECTED;
    }

    private void fail(String message) {
        pending.clear();
        setState(State.FAILED, message);
    }

    private void setState(State next, String detail) {
        state = next;
        Listener l = listener;
        if (l != null) {
            main.post(() -> l.onStateChanged(next, detail));
        }
    }
}
