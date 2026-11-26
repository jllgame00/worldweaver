from dataclasses import dataclass, field
from typing import Literal
import math
import re

from .chatkhu_config import ChatKHUAPI, get_chatkhu_key, shares_openai_key
from .environment import load_environment


@dataclass(frozen=True)
class Settings:
    model: str = "worldweaver-mock-v1"
    timeout_seconds: float = 8.0
    provider: Literal["mock", "openai", "chatkhu"] = "mock"
    api_key: str | None = field(default=None, repr=False)
    max_output_tokens: int = 6000
    max_input_bytes: int = 32768
    live_max_attempts: int = 1
    configuration_error: bool = False
    chatkhu_api: ChatKHUAPI = "responses"

    @property
    def mode(self) -> Literal["mock", "live"]:
        return "mock" if self.provider == "mock" else "live"

    @property
    def generation_intent(self) -> str:
        if self.provider == "chatkhu":
            return f"chatkhu:{self.chatkhu_api}:{self.model}"
        return f"{self.mode}:{self.model}"

    @classmethod
    def from_environment(cls) -> "Settings":
        environment = load_environment()
        provider = environment.get("WORLDWEAVER_PROVIDER", "mock").strip()
        if provider not in {"mock", "openai", "chatkhu"}:
            raise ValueError("WORLDWEAVER_PROVIDER must be mock, openai or chatkhu")
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
            timeout = float(environment.get("WORLDWEAVER_TIMEOUT_SECONDS") or ("90" if live else "8"))
            output = int(environment.get("WORLDWEAVER_MAX_OUTPUT_TOKENS") or "6000") if live else 6000
            input_bytes = int(environment.get("WORLDWEAVER_MAX_INPUT_BYTES") or "32768") if live else 32768
            attempts = int(environment.get("WORLDWEAVER_LIVE_MAX_ATTEMPTS") or "1") if live else 1
            if (
                not re.fullmatch(model_pattern, model) or model.startswith("sk-")
                or model in {direct_key, gateway_key}
                or shares_openai_key(gateway_key, environment)
                or api not in {"responses", "chat_completions"}
                or not math.isfinite(timeout) or not 0 < timeout <= 120
                or not 128 <= output <= 16000 or not 1 <= input_bytes <= 65536
                or attempts not in {1, 2}
            ):
                raise ValueError
        except ValueError:
            if live:
                return cls(model="unconfigured", provider=provider, configuration_error=True)
            raise ValueError("WORLDWEAVER mock configuration is invalid") from None
        return cls(model, timeout, provider, key, output, input_bytes, attempts, chatkhu_api=api)
