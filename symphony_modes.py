"""Official Cardi Magic Symphony page: Magic Dazzle / Music Rhythm / Magic Shadow.

Type A frames copied from huancaiFragment.playmode1().
"""

from __future__ import annotations

DAZZLE_NAMES = [
    "Color Flow", "RGB Color Flow", "Cyan-Yellow-Purple Flow", "Red-Blue Flow",
    "Orange-Purple Flow", "Yellow-Blue Flow", "Cyan-Purple Flow", "Color Trail",
    "Red-Blue Trail", "Red Trail", "Purple Trail", "Blue Trail", "Yellow Trail",
    "Cyan Trail", "Colorful Curtain", "Cyan Yellow Purple Curtain", "Red Green Blue Curtain",
    "Orange Blue Purple Curtain", "Red Blue Curtain", "Red Green Curtain", "Green Purple Curtain",
    "Colorful Curtain 2", "Cyan Yellow Purple Chasing", "Red Blue Orange Chasing", "Red Blue Chasing",
    "Red Green Chasing", "Red Pink Chasing", "Cyan Blue Chasing", "Colorful Closing",
    "Cyan Yellow Purple Closing", "Red Green Blue Closing", "Orange Blue Purple Closing",
    "Red Blue Closing", "Red Green Closing", "Green Purple Closing", "Colorful Welcome",
    "Cyan Yellow Welcome", "Red Green Welcome", "Purple Orange Welcome", "Red Welcome",
    "Purple Welcome", "Blue Welcome", "Colorful Jump", "Red Green Blue Jump",
    "Cyan Purple Yellow Jump", "Red Blue Jump", "Red Green Jump", "Red Purple Jump",
    "Blue Purple Jump", "Red Green Blue Wave", "Cyan Purple Yellow Wave", "Orange Blue Purple Wave",
    "Blue Wave", "Purple Wave", "Red Wave", "Yellow Wave", "Purple White Purple Flow",
    "Red White Red Flow", "Blue White Blue Flow", "Green White Green Flow",
    "Yellow White Yellow Flow", "Cyan White Cyan Flow", "Orange White Orange Flow",
]

MUSIC_NAMES = [
    "Colorful Spectrum", "Red Blue Spectrum", "Red Green Spectrum", "Green Blue Spectrum",
    "Red Yellow Spectrum", "Cyan Yellow Purple Spectrum", "Red Blue Orange Spectrum",
    "Colorful Extension", "Red Blue Extension", "Red Green Extension", "Green Blue Extension",
    "Red Yellow Extension", "Cyan Yellow Purple Extension", "Red Blue Orange Extension",
    "Colorful Wave", "Red Blue Wave", "Red Green Wave", "Green Blue Wave", "Red Yellow Wave",
    "Cyan Yellow Purple Wave", "Red Blue Orange Wave", "Colorful Column", "Red Blue Column",
    "Red Green Column", "Green Blue Column", "Red Yellow Column", "Cyan Yellow Purple Column",
    "Red Blue Orange Column", "Colorful Contraction", "Red Blue Contraction", "Red Green Contraction",
    "Green Blue Contraction", "Red Yellow Contraction", "Cyan Yellow Purple Contraction",
    "Red Blue Orange Contraction", "Multi-color Rhythm", "Red and Blue Rhythm",
    "Red and Green Rhythm", "Green and Blue Rhythm", "Red and Yellow Rhythm",
    "Cyan Yellow Purple Rhythm", "Red Blue Orange Rhythm",
]

SHADOW_NAMES = [
    "Multi-color Fantasy", "Red and Blue Fantasy", "Red and Green Fantasy",
    "Yellow Cyan Purple Fantasy", "Red White Blue Fantasy", "Red Yellow Cyan Fantasy",
    "Red White Yellow Fantasy", "Red Green Blue Transition", "Yellow Cyan Purple Transition",
    "Six-color Transition Red", "Six-color Transition Green", "Six-color Transition Blue",
    "Six-color Transition Purple", "Six-color Transition Orange", "Seven-color Open-Close",
    "Red Green Blue Open-Close", "Cyan Yellow Purple Open-Close", "Red White Yellow Open-Close",
    "Blue White Cyan Open-Close", "Red Blue Open-Close", "Red Purple Open-Close",
    "Seven-color Gradient", "Cyan Yellow Purple Gradient", "Red Blue Gradient",
    "Red Yellow Gradient", "Cyan Purple Gradient", "Green Yellow Gradient", "Red Green Gradient",
    "Red Green Blue Dynamic Shadow", "Cyan Blue Purple Dynamic Shadow", "Red Blue Dynamic Shadow",
    "Cyan Orange Dynamic Shadow", "Red Purple Dynamic Shadow", "Blue Green Dynamic Shadow",
    "Cyan Purple Dynamic Shadow", "Multi-color Magic Flowing", "Cyan Yellow Purple Magic Flowing",
    "Red Blue Magic Flowing", "Yellow Purple Magic Flowing", "Red Green Magic Flowing",
    "Red White Magic Flowing", "Cyan Purple Magic Flowing", "Blue Light Shadow", "Purple Light Shadow",
    "Red Light Shadow", "Green Light Shadow", "Cyan Light Shadow", "Orange Light Shadow",
    "Yellow Light Shadow", "Red Green Blue Breathing", "Cyan Yellow Purple Breathing",
    "Purple Orange Blue Breathing", "Red Purple Breathing", "Cyan Orange Breathing",
    "Blue Green Breathing", "Cyan Purple Breathing", "Colorful Stacking", "Green-Blue Stacking",
    "Cyan-Yellow-Purple Stacking", "Red Stacking", "Blue Stacking", "Green Stacking", "Purple Stacking",
]

CATEGORIES = {
    "dazzle": "Magic Dazzle",
    "music": "Music Rhythm",
    "shadow": "Magic Shadow",
}


def _a(prefix: str, extra: int) -> bytes:
    return bytes.fromhex(prefix + str(int(extra)) + "3E")


def payload_symphony_a(kind: str, mode: int) -> bytes:
    """Type A command for Symphony page. kind: dazzle | music | shadow. mode is 1-based."""
    mode = int(mode)
    if kind == "dazzle":
        if mode < 8:
            return _a("3C3238303139", mode + 30)
        if mode < 15:
            return _a("3C3238303032", mode + 23)
        if mode < 22:
            return _a("3C3238303033", mode + 16)
        if mode < 29:
            return _a("3C3238303034", mode + 9)
        if mode < 36:
            return _a("3C3238303035", mode + 2)
        if mode < 43:
            return _a("3C3238303036", mode - 5)
        if mode < 50:
            return _a("3C3238303037", mode - 12)
        if mode < 57:
            return _a("3C3238303038", mode - 19)
        if mode < 64:
            return _a("3C3238303039", mode - 26)
        raise ValueError("dazzle mode 1-63")
    if kind == "music":
        if mode < 8:
            return _a("3C3238303133", mode + 30)
        if mode < 15:
            return _a("3C3238303134", mode + 23)
        if mode < 22:
            return _a("3C3238303135", mode + 16)
        if mode < 29:
            return _a("3C3238303136", mode + 9)
        if mode < 36:
            return _a("3C3238303137", mode + 2)
        if mode < 43:
            return _a("3C3238303138", mode - 5)
        raise ValueError("music mode 1-42")
    if kind == "shadow":
        if mode < 8:
            return _a("3C3238303237", mode + 30)
        if mode < 15:
            return _a("3C3238303041", mode + 23)
        if mode < 22:
            return _a("3C3238303042", mode + 16)
        if mode < 29:
            return _a("3C3238303044", mode + 9)
        if mode < 36:
            return _a("3C3238303045", mode + 2)
        if mode < 43:
            return _a("3C3238303046", mode - 5)
        if mode < 50:
            return _a("3C3238303130", mode - 12)
        if mode < 57:
            return _a("3C3238303131", mode - 19)
        if mode < 64:
            return _a("3C3238303132", mode - 26)
        raise ValueError("shadow mode 1-63")
    raise ValueError(kind)


def names_for(kind: str) -> list[tuple[int, str]]:
    table = {"dazzle": DAZZLE_NAMES, "music": MUSIC_NAMES, "shadow": SHADOW_NAMES}[kind]
    return [(i + 1, n) for i, n in enumerate(table)]
