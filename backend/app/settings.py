from dataclasses import dataclass, field
from typing import Literal
import re

from .chatkhu_config import ChatKHUAPI, get_chatkhu_key, shares_openai_key
from .environment import ConfigurationError, environment_with_overrides


def bounded_int(environment: dict[str, str], name: str, default: int, minimum: int, maximum: int) -> int:
    message = f"Set {name} to a whole number from {minimum} to {maximum}."
    try:
        value = int(environment.get(name) or default)
    except ValueError:
        raise ConfigurationError(message) from None
    if not minimum <= value <= maximum:
        raise ConfigurationError(message)
    return value


def timeout_seconds(raw: str) -> float:
    message = "Set WORLDWEAVER_TIMEOUT_SECONDS to a number greater than 0 and at most 120 seconds."
    try:
        value = float(raw)
    except ValueError:
        raise ConfigurationError(message) from None
    if not 0 < value <= 120:
        raise ConfigurationError(message)
    return value


@dataclass(frozen=True)
class Settings:
    model: str = "worldweaver-mock-v1"
    timeout_seconds: float = 8.0
    provider: Literal["mock", "openai", "chatkhu"] = "mock"
    api_key: str | None = field(default=None, repr=False)
    max_output_tokens: int = 6000
    max_input_bytes: int = 32768
    live_max_attempts: int = 1
    configuration_error: str | None = None
    chatkhu_api: ChatKHUAPI = "responses"
    scenario_max_output_tokens: int | None = None
    environment_overrides: tuple[str, ...] = ()

    @property
    def mode(self) -> Literal["mock", "live"]:
        return "mock" if self.provider == "mock" else "live"

    @property
    def generation_intent(self) -> str:
        if self.provider == "chatkhu":
            return f"chatkhu:{self.chatkhu_api}:{self.model}"
        return f"{self.mode}:{self.model}"

    @property
    def credential_message(self) -> str:
        name = "CHATKHU_API_KEY" if self.provider == "chatkhu" else "OPENAI_API_KEY"
        return f"Set {name} to a valid server-side key in the root .env or process environment."

    @classmethod
    def from_environment(cls) -> "Settings":
        environment, overrides = environment_with_overrides()
        provider = environment.get("WORLDWEAVER_PROVIDER", "mock").strip()
        if provider not in {"mock", "openai", "chatkhu"}:
            raise ConfigurationError("WORLDWEAVER_PROVIDER must be mock, openai or chatkhu")
        live = provider != "mock"
        gateway = provider == "chatkhu"
        direct_key = environment.get("OPENAI_API_KEY", "").strip() if live else ""
        gateway_key = get_chatkhu_key(environment) if live else None
        key = gateway_key if gateway else direct_key or None
        model = environment.get("CHATKHU_MODEL", "").strip() if gateway else (
            environment.get("WORLDWEAVER_MODEL") or ("gpt-6.2-sol" if live else "worldweaver-mock-v1")
        )
        api = (environment.get("CHATKHU_API") or "responses").strip() if gateway else "responses"
        model_pattern = r"[A-Za-z0-9_.:/-]{1,128}" if gateway else r"[A-Za-z0-9_.:-]{1,128}"
        try:
            if shares_openai_key(gateway_key, environment):
                raise ConfigurationError("Use separate CHATKHU_API_KEY and OPENAI_API_KEY credentials.")
            if not re.fullmatch(model_pattern, model) or model.startswith("sk-") or any(
                credential and credential in model for credential in (
                    environment.get("OPENAI_API_KEY", "").strip(), environment.get("CHATKHU_API_KEY", "").strip(),
                )
            ):
                name = "CHATKHU_MODEL" if gateway else "WORLDWEAVER_MODEL"
                raise ConfigurationError(f"Set {name} to an authorized model ID, up to 128 characters.")
            if api not in {"responses", "chat_completions"}:
                raise ConfigurationError("Set CHATKHU_API to responses or chat_completions.")
            timeout = timeout_seconds(environment.get("WORLDWEAVER_TIMEOUT_SECONDS") or ("90" if live else "8"))
            output, input_bytes, attempts, scenario_output = 6000, 32768, 1, None
            if live:
                output = bounded_int(environment, "WORLDWEAVER_MAX_OUTPUT_TOKENS", 6000, 128, 16000)
                if environment.get("WORLDWEAVER_SCENARIO_MAX_OUTPUT_TOKENS"):
                    scenario_output = bounded_int(environment, "WORLDWEAVER_SCENARIO_MAX_OUTPUT_TOKENS", output, 128, 16000)
                input_bytes = bounded_int(environment, "WORLDWEAVER_MAX_INPUT_BYTES", 32768, 1, 65536)
                attempts = bounded_int(environment, "WORLDWEAVER_LIVE_MAX_ATTEMPTS", 1, 1, 2)
        except ConfigurationError as exc:
            if live:
                return cls(model="unconfigured", provider=provider, configuration_error=str(exc), environment_overrides=overrides)
            raise
        return cls(model, timeout, provider, key, output, input_bytes, attempts, chatkhu_api=api,
                   scenario_max_output_tokens=scenario_output, environment_overrides=overrides)
