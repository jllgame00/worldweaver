from dataclasses import dataclass
from typing import Protocol

from .contracts import Content, Fact


@dataclass(frozen=True)
class GenerationRequest:
    model: str
    content: tuple[Content, ...]
    canonical_facts: tuple[Fact, ...]


class StructuredProvider(Protocol):
    async def generate(self, request: GenerationRequest) -> str: ...


class ProviderUnavailable(Exception):
    pass


class ProviderQuota(Exception):
    pass
