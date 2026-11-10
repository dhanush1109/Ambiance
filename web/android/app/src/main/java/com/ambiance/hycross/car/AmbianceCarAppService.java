package com.ambiance.hycross.car;

import android.content.Intent;
import android.content.pm.ApplicationInfo;

import androidx.annotation.NonNull;
import androidx.car.app.CarAppService;
import androidx.car.app.Session;
import androidx.car.app.validation.HostValidator;

/**
 * The app's entry point on an Android Auto head unit.
 *
 * Android Auto never shows the Ambiance app itself. It binds to this service
 * and draws screens built from the Android for Cars App Library templates, so
 * everything the driver sees in the car is defined in the `car` package and
 * shares nothing with the WebView UI but the data underneath.
 *
 * Declared in AndroidManifest.xml under the IOT category, which is what sets
 * the rules these screens follow: device state and one-touch actions while
 * driving, and none of the colour or brightness adjustment the phone app
 * offers.
 */
public final class AmbianceCarAppService extends CarAppService {

    @NonNull
    @Override
    public HostValidator createHostValidator() {
        // A car app is bound by whatever process claims to be a car host, so
        // the host has to be checked. Debug builds accept any host because
        // that is what makes the Desktop Head Unit and a sideloaded test on a
        // real car work; release builds accept only Google's signed hosts.
        boolean debuggable =
                (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;

        if (debuggable) {
            return HostValidator.ALLOW_ALL_HOSTS_VALIDATOR;
        }
        return new HostValidator.Builder(getApplicationContext())
                .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
                .build();
    }

    @NonNull
    @Override
    public Session onCreateSession() {
        return new Session() {
            @NonNull
            @Override
            public androidx.car.app.Screen onCreateScreen(@NonNull Intent intent) {
                return new HomeScreen(getCarContext());
            }
        };
    }
}
