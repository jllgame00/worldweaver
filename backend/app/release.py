"""Read-only release metadata and the Vite entrypoint contract."""
from html.parser import HTMLParser
import os
from pathlib import Path
import re

from fastapi.staticfiles import StaticFiles


def image_revision(marker: Path) -> str | None:
    mode = os.environ.get("WORLDWEAVER_EXECUTION_MODE", "public-demo" if marker.exists() else "local")
    if mode == "local" and not marker.exists():
        return None
    if mode != "public-demo" or not marker.is_file():
        raise ValueError("Public mode requires a packaged release; local mode requires a development checkout.")
    revision = marker.read_text(encoding="ascii").strip()
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Invalid packaged release revision.")
    return revision


class EntryAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths: list[str] = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        url = values.get("src" if tag == "script" else "href", "")
        if tag in {"script", "link"} and url.startswith("/assets/"):
            self.paths.append(url)


def required_files(dist: Path) -> list[Path]:
    index = dist / "index.html"
    parser = EntryAssets()
    try:
        parser.feed(index.read_text(encoding="utf-8"))
    except (OSError, UnicodeError):
        return []
    if not any(path.endswith(".js") for path in parser.paths):
        return []
    return [index, dist / "examples/salt-census.json", dist / "examples/salt-census.svg",
            *(dist / url.lstrip("/") for url in parser.paths)]


class BuiltAssets(StaticFiles):
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response.status_code in {200, 304}:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response
