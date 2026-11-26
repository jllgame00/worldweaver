import os
from pathlib import Path

from dotenv import dotenv_values


ROOT_ENV_FILE: Path | None = Path(__file__).resolve().parents[2] / ".env"


def load_environment() -> dict[str, str]:
    values = dotenv_values(ROOT_ENV_FILE, encoding="utf-8-sig", interpolate=False) if ROOT_ENV_FILE else {}
    return {**{key: value for key, value in values.items() if value is not None}, **os.environ}
