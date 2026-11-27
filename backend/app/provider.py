from dataclasses import dataclass
from typing import Any, Literal, Protocol

from .contracts import Content, Fact, Run


@dataclass(frozen=True)
class GenerationRequest:
    model: str
    content: tuple[Content, ...]
    canonical_facts: tuple[Fact, ...]
    task: Literal["candidates", "scenario", "revision", "semantic"] = "candidates"
    context: dict[str, Any] | None = None


@dataclass(frozen=True)
class ProviderUsage:
    input_tokens: int | None
    output_tokens: int
    cached_input_tokens: int | None
    reasoning_tokens: int | None = None


def record_provider_usage(run: Run, usage: ProviderUsage | None, model: str | None) -> None:
    if model:
        run["receipts"].append({"tool": "provider_model", "outcome": "passed", "detail": f"model={model}"})
    if usage is None:
        return
    counts = []
    if usage.input_tokens is not None:
        run["tokens"] = run.get("tokens", 0) + usage.input_tokens + usage.output_tokens
        counts.append(f"inputTokens={usage.input_tokens}")
    if usage.cached_input_tokens is not None:
        counts.append(f"cachedInputTokens={usage.cached_input_tokens}")
    counts.append(f"outputTokens={usage.output_tokens}")
    run["receipts"].append({
        "tool": "provider_usage", "outcome": "passed",
        "detail": " ".join(counts),
    })
    if usage.reasoning_tokens is not None:
        run["receipts"].append({
            "tool": "provider_reasoning", "outcome": "passed", "detail": f"reasoningTokens={usage.reasoning_tokens}",
        })


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
