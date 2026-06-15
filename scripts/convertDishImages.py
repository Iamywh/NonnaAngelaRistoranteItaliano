from PIL import Image
from pathlib import Path
import re

# Input: dove hai messo le foto originali
INPUT_DIR = Path("assets/images/dishes/raw")

# Output: dove devono stare le immagini usabili dal sito
OUTPUT_DIR = Path("public/images/dishes")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MAX_SIZE = 1200
QUALITY = 82

def clean_filename(name):
    name = name.lower()
    replacements = {
        "à": "a", "è": "e", "é": "e", "ì": "i",
        "ò": "o", "ù": "u", "ñ": "n"
    }

    for old, new in replacements.items():
        name = name.replace(old, new)

    name = re.sub(r"[^a-z0-9]+", "-", name)
    return name.strip("-")

if not INPUT_DIR.exists():
    print(f"ERROR: Folder not found: {INPUT_DIR}")
    print("Check that this folder exists:")
    print(INPUT_DIR.resolve())
    raise SystemExit(1)

files = [
    file for file in INPUT_DIR.iterdir()
    if file.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]
]

if not files:
    print(f"No images found inside: {INPUT_DIR}")
    raise SystemExit(0)

for file in files:
    try:
        img = Image.open(file).convert("RGB")
        img.thumbnail((MAX_SIZE, MAX_SIZE))

        output_name = clean_filename(file.stem) + ".webp"
        output_path = OUTPUT_DIR / output_name

        img.save(output_path, "WEBP", quality=QUALITY, method=6)

        print(f"Converted: {file.name} -> {output_path}")

    except Exception as error:
        print(f"FAILED: {file.name}")
        print(error)

print("Done.")