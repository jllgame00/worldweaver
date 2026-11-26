import pytest


@pytest.fixture(autouse=True)
def default_provider_for_tests(monkeypatch):
    monkeypatch.setenv("WORLDWEAVER_PROVIDER", "mock")
    for name in (
        "OPENAI_API_KEY", "OPENAI_BASE_URL", "WORLDWEAVER_MODEL", "WORLDWEAVER_TIMEOUT_SECONDS",
        "CHATKHU_API_KEY", "CHATKHU_MODEL", "CHATKHU_API",
        "WORLDWEAVER_MAX_INPUT_BYTES", "WORLDWEAVER_MAX_OUTPUT_TOKENS", "WORLDWEAVER_LIVE_MAX_ATTEMPTS",
    ):
        monkeypatch.delenv(name, raising=False)
