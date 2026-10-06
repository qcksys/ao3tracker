"""Generate platform icons from assets/branding (requires Pillow)."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
BRANDING = ROOT / "assets/branding"
NATIVE = ROOT / "apps/native-kmp"


def save_png(image, path, size):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.resize((size, size), Image.Resampling.LANCZOS).save(path, optimize=True)


for beta in (False, True):
    suffix = "-beta" if beta else ""
    source = Image.open(BRANDING / f"ao3-tracker{suffix}.png").convert("RGB")
    extension = ROOT / "apps/browser-extension/public" / ("icon-beta" if beta else "icon")
    for size in (16, 32, 48, 96, 128):
        save_png(source, extension / f"{size}.png", size)

    common = NATIVE / "composeApp/src/commonMain/composeResources/drawable"
    save_png(source, common / ("app_logo_beta.png" if beta else "app_logo.png"), 256)

    android = NATIVE / "androidApp/src" / ("dev" if beta else "main") / "res"
    save_png(source, android / "drawable-nodpi/app_icon.png", 432)
    for density, size in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
        for name in ("ic_launcher", "ic_launcher_round"):
            save_png(source, android / f"mipmap-{density}/{name}.png", size)

    if not beta:
        save_png(source, NATIVE / "iosApp/iosApp/Assets.xcassets/AppIcon.appiconset/app-icon-1024.png", 1024)
        desktop = NATIVE / "composeApp/icons"
        save_png(source, desktop / "app.png", 512)
        source.save(desktop / "app.ico", sizes=[(size, size) for size in (16, 32, 48, 64, 128, 256)])
        source.resize((1024, 1024), Image.Resampling.LANCZOS).save(desktop / "app.icns")
