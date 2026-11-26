from dataclasses import dataclass
from typing import Protocol

from .contracts import Content, Fact


@dataclass(frozen=True)
class GenerationRequest:
    model: str
    content: tuple[Content, ...]
    canonical_facts: tuple[Fact, ...]


@dataclass(frozen=True)
class ProviderUsage:
    input_tokens: int
    output_tokens: int
    cached_input_tokens: int | None


@dataclass(frozen=True)
class GenerationReply:
    text: str
    usage: ProviderUsage | None = None
    model: str | None = None


class StructuredProvider(Protocol):
    async def generate(self, request: GenerationRequest) -> str | GenerationReply: ...


class ProviderError(Exception):
    def __init__(
        self, code: str, *, usage: ProviderUsage | None = None, model: str | None = None,
        field: str | None = None, attempted: bool = True,
    ):
        super().__init__(code)
        self.code = code
        self.usage = usage
        self.model = model
        self.field = field
        self.attempted = attempted


class ProviderUnavailable(ProviderError):
    def __init__(self):
        super().__init__("provider_unavailable")


class ProviderQuota(ProviderError):
    def __init__(self):
        super().__init__("provider_quota")
