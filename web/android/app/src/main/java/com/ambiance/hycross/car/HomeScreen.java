package com.ambiance.hycross.car;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.ListTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;

/**
 * The first thing the driver sees: two doors, nothing else.
 *
 * Kept to two rows on purpose. The car app quality rules cap a task at five
 * screens and forbid anything that makes a driver hunt, so this is a signpost
 * rather than a dashboard — the actual readouts live one tap away.
 */
final class HomeScreen extends Screen {

    HomeScreen(@NonNull CarContext carContext) {
        super(carContext);
    }

    @NonNull
    @Override
    public Template onGetTemplate() {
        Row dashcam = new Row.Builder()
                .setTitle("Dash Cam")
                .addText("Recording status and storage")
                .setBrowsable(true)
                .setOnClickListener(() -> getScreenManager().push(new DashcamScreen(getCarContext())))
                .build();

        Row lights = new Row.Builder()
                .setTitle("Cabin Lighting")
                .addText("Moods and on/off")
                .setBrowsable(true)
                .setOnClickListener(() -> getScreenManager().push(new LightsScreen(getCarContext())))
                .build();

        ItemList list = new ItemList.Builder()
                .addItem(dashcam)
                .addItem(lights)
                .build();

        return new ListTemplate.Builder()
                .setTitle("Ambiance")
                .setHeaderAction(Action.APP_ICON)
                .setSingleList(list)
                .build();
    }
}
