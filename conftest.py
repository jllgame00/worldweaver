import pytest

from backend.app import environment


def pytest_configure(config: pytest.Config) -> None:
    # Disable the owner's dotenv before test modules import the application.
    patch = pytest.MonkeyPatch()
    patch.setattr(environment, "ROOT_ENV_FILE", None)
    patch.setenv("WORLDWEAVER_PROVIDER", "mock")
    patch.delenv("WORLDWEAVER_MODEL", raising=False)
    patch.delenv("WORLDWEAVER_TIMEOUT_SECONDS", raising=False)
    config.add_cleanup(patch.undo)
