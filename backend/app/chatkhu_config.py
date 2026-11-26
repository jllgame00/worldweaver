from collections.abc import Mapping
from typing import Literal


CHATKHU_BASE_URL = "https://factchat-cloud.mindlogic.ai/v1/gateway"
ChatKHUAPI = Literal["responses", "chat_completions"]


def get_chatkhu_key(environment: Mapping[str, str]) -> str | None:
    key = environment.get("CHATKHU_API_KEY", "").strip()
    return key if key and all("!" <= char <= "~" for char in key) else None


def shares_openai_key(gateway_key: str | None, environment: Mapping[str, str]) -> bool:
    return gateway_key is not None and gateway_key == environment.get("OPENAI_API_KEY", "").strip()
