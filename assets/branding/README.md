# App artwork

`ao3-tracker.png` is the production source artwork. `ao3-tracker-beta.png` adds a gold Beta badge.

Run `python scripts/generate-app-icons.py` from the repository root with Pillow installed to regenerate extension, Android, iOS and desktop assets. The script only resizes and encodes the source artwork.

The extension selects its icon using WXT's `beta` mode. Android's `dev` resource source set overrides the launcher icons; the About screen selects the badge using the build's default API environment.
