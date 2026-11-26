import os
from pathlib import Path

from dotenv import dotenv_values


ROOT_ENV_FILE: Path | None = Path(__file__).resolve().parents[2] / ".env"
GENERATION_SETTINGS = frozenset({
    "WORLDWEAVER_PROVIDER", "WORLDWEAVER_MODEL", "WORLDWEAVER_TIMEOUT_SECONDS",
    "WORLDWEAVER_MAX_OUTPUT_TOKENS", "WORLDWEAVER_SCENARIO_MAX_OUTPUT_TOKENS",
    "WORLDWEAVER_MAX_INPUT_BYTES", "WORLDWEAVER_LIVE_MAX_ATTEMPTS",
    "CHATKHU_API_KEY", "CHATKHU_API", "CHATKHU_MODEL", "OPENAI_API_KEY",
})


class ConfigurationError(ValueError):
    """A configuration correction that can be displayed without exposing values."""


def environment_with_overrides() -> tuple[dict[str, str], tuple[str, ...]]:
    try:
        values = dotenv_values(ROOT_ENV_FILE, encoding="utf-8-sig", interpolate=False) if ROOT_ENV_FILE else {}
    except (UnicodeError, OSError):
        raise ConfigurationError("Check that the root .env is readable and saved as UTF-8 (with or without BOM).") from None
    file_values = {key: value for key, value in values.items() if value is not None}
    overrides = tuple(sorted(
        name for name in GENERATION_SETTINGS & file_values.keys() & os.environ.keys()
        if file_values[name] != os.environ[name]
    ))
    return {**file_values, **os.environ}, overrides


def load_environment() -> dict[str, str]:
    return environment_with_overrides()[0]
