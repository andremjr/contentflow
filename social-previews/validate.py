from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "https://andremjr.github.io/contentflow/social-previews/"
PAGES = {
    "index.html": "home",
    "concept/index.html": "concept",
    "ecosystem/index.html": "ecosystem",
    "community/index.html": "community",
}

for page, preview in PAGES.items():
    html = (ROOT / page).read_text(encoding="utf-8")
    expected = {
        f'property="og:image" content="{BASE_URL}{preview}.jpg"',
        'property="og:image:width" content="1200"',
        'property="og:image:height" content="630"',
        'name="twitter:card" content="summary_large_image"',
        f'name="twitter:image" content="{BASE_URL}{preview}.jpg"',
    }
    for metadata in expected:
        assert metadata in " ".join(html.split()), f"{page}: missing {metadata}"

    with Image.open(ROOT / "social-previews" / f"{preview}.jpg") as image:
        assert image.size == (1200, 630), f"{preview}.jpg: expected 1200x630, got {image.size}"
        assert image.format == "JPEG", f"{preview}.jpg: expected JPEG, got {image.format}"

print("OK: 4 pages with Open Graph, Twitter Cards and 1200x630 JPEG previews")
