import asyncio
from contextlib import asynccontextmanager
from ipaddress import ip_address
import logging
from pathlib import Path
from time import monotonic
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from openai import AsyncOpenAI, DefaultAsyncHttpxClient
from pydantic import BaseModel, ValidationError
from starlette.exceptions import HTTPException
from starlette.requests import ClientDisconnect

from .chatkhu_config import CHATKHU_BASE_URL
from .chatkhu_provider import ChatKHUProvider
from .contracts import Candidate, ProjectSnapshot, Run
from .mock_provider import MockProvider
from .narrative import GenerationRejected, generate
from .openai_provider import OpenAIProvider
from .provider import StructuredProvider
from .settings import Settings


DIST = Path(__file__).resolve().parents[2] / "frontend/dist"
MAX_PROJECT_BYTES = 1024 * 1024
GENERATION_ERRORS = {
    "empty_content": (422, "Add at least one creative fragment before generating."),
    "conflicting_input": (422, "The same fragment is marked both mandatory and excluded. Resolve its treatment before generating."),
    "candidate_count": (502, "The provider must return exactly three candidates."),
    "duplicate_directions": (502, "The provider returned identical story directions. Try generating again."),
    "invalid_provider_response": (502, "The provider returned an invalid candidate response."),
    "invalid_coverage": (502, "The provider response did not account for the submitted fragments correctly."),
    "fact_conflict": (422, "The provider reported a conflict with a pinned fact. Review the input and try again."),
    "provider_timeout": (504, "Generation timed out. You can try again."),
    "provider_unavailable": (503, "The provider is temporarily unavailable."),
    "provider_quota": (429, "The provider quota is unavailable."),
    "provider_insufficient_credits": (402, "ChatKHU has insufficient credits for this request. Check the balance and output limit."),
    "provider_access_denied": (403, "ChatKHU does not permit this gateway request. Check your API model access."),
    "provider_rate_limit": (429, "The provider is rate limiting requests. Wait before trying again."),
    "provider_authentication": (503, "The server could not authenticate with the generation provider. Check its credentials and project access."),
    "provider_incomplete": (502, "The provider returned an incomplete result. Try a shorter brief or adjust the server's output limit."),
    "provider_refused": (422, "The provider declined this generation request. Review the brief before trying again."),
    "provider_request_rejected": (502, "The provider rejected the request. Check the configured model and its Structured Outputs support."),
    "generation_input_too_large": (413, "The fragments and pinned facts exceed the generation input limit."),
    "provider_error": (502, "The provider could not complete generation."),
}


def local_live_request(request: Request) -> bool:
    if request.client is None or any(
        name in request.headers for name in ("forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip")
    ):
        return False
    host = request.headers.get("host", "")
    try:
        address = urlsplit(f"//{host}")
        if not ip_address(request.client.host).is_loopback or address.hostname not in {"localhost", "127.0.0.1", "::1"}:
            return False
        if address.netloc != host or address.username is not None:
            return False
    except ValueError:
        return False
    return request.headers.get("origin") in {None, f"http://{host}", f"https://{host}"}


class ProposalResponse(BaseModel):
    baseRevision: int
    candidates: list[Candidate]
    run: Run


def error_response(status: int, code: str, message: str, run: Run | None = None, field: str | None = None) -> JSONResponse:
    if field is not None:
        message = f"{message} Field {field}."
    error = {"code": code, "message": message}
    return JSONResponse(
        status_code=status,
        content={"error": {**error, **({"run": run} if run is not None else {})}},
    )


def create_app(settings: Settings | None = None, provider: StructuredProvider | None = None) -> FastAPI:
    config = settings if settings is not None else Settings.from_environment()
    client = None
    adapter = provider
    live = config.mode == "live"
    gateway = config.provider == "chatkhu"
    if adapter is None and not live:
        adapter = MockProvider()
    if adapter is None and config.api_key and not config.configuration_error:
        logging.getLogger("openai").setLevel(logging.WARNING)
        client = AsyncOpenAI(
            api_key=config.api_key, base_url=CHATKHU_BASE_URL if gateway else "https://api.openai.com/v1",
            organization="" if gateway else None, project="" if gateway else None,
            timeout=config.timeout_seconds / config.live_max_attempts, max_retries=0,
            http_client=DefaultAsyncHttpxClient(follow_redirects=False, trust_env=False),
        )
        limits = {"max_output_tokens": config.max_output_tokens, "max_input_bytes": config.max_input_bytes}
        adapter = ChatKHUProvider(client, api=config.chatkhu_api, **limits) if gateway else OpenAIProvider(client, **limits)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        try:
            yield
        finally:
            if client is not None:
                await client.close()

    app = FastAPI(title="WORLDWEAVER", version="1.0.0", lifespan=lifespan)
    active_live = False
    recent_live: dict[tuple[str, int], float] = {}
    if (DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == 404 else "http_error"
        return error_response(exc.status_code, code, "The requested route is unavailable.")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    def unavailable(request: Request) -> tuple[int, str, str] | None:
        if live and not local_live_request(request):
            return 403, "live_local_only", "Live AI generation is available only to local users of this development server."
        if config.configuration_error:
            return 503, "provider_configuration_invalid", "Generation is disabled. Review the server credentials, model, API and limits."
        if adapter is None:
            name = "ChatKHU Gateway" if gateway else "OpenAI"
            return 503, "provider_not_configured", f"{name} is selected but the server API key is missing."
        return None

    @app.get("/api/generation")
    async def generation_configuration(request: Request) -> dict[str, object]:
        failure = unavailable(request)
        status: dict[str, object] = {
            "mode": config.mode, "provider": config.provider, "model": config.model, "available": failure is None,
        }
        if gateway:
            status["api"] = config.chatkhu_api
        if live:
            status["limits"] = {
                "maxInputBytes": config.max_input_bytes, "maxOutputTokens": config.max_output_tokens,
                "maxAttempts": config.live_max_attempts,
            }
        if failure is not None:
            status["message"] = failure[2]
        return status

    @app.post("/api/candidates", response_model=ProposalResponse)
    async def candidates(request: Request) -> ProposalResponse | JSONResponse:
        nonlocal active_live
        failure = unavailable(request)
        if failure is not None:
            return error_response(*failure)
        assert adapter is not None
        expected = request.headers.get("x-worldweaver-generation")
        if (live or expected is not None) and expected != config.generation_intent:
            return error_response(409, "generation_configuration_changed", "Review the current provider before generating again.")
        if live and request.headers.get("content-type", "").partition(";")[0].strip().lower() != "application/json":
            return error_response(415, "json_required", "Live requests must use application/json.")
        body = bytearray()
        try:
            async for chunk in request.stream():
                if len(body) + len(chunk) > MAX_PROJECT_BYTES:
                    return error_response(413, "project_too_large", "This project exceeds the generation request size limit.")
                body.extend(chunk)
            project = ProjectSnapshot.model_validate_json(body)
        except ClientDisconnect:
            return error_response(499, "cancelled", "Generation was cancelled.")
        except ValidationError as exc:
            issue = exc.errors(include_input=False, include_url=False)[0]
            field = issue.get("ctx", {}).get("field")
            return error_response(422, "invalid_project", "The project does not match the v1 structure or references.", field=field)

        live_key = None
        if live:
            if active_live:
                return error_response(409, "generation_in_progress", "Another live generation request is already in progress.")
            now = monotonic()
            live_key = (str(project.root["id"]), project.narrative_data["revision"])
            for key in [key for key, until in recent_live.items() if until <= now]:
                del recent_live[key]
            if live_key in recent_live:
                return error_response(409, "duplicate_generation", "This project revision was just submitted. Wait before trying again.")
            active_live = True
        task = asyncio.create_task(generate(
            project.narrative_data, adapter, mode=config.mode, model=config.model, timeout=config.timeout_seconds,
            provider_name=config.provider, max_attempts=config.live_max_attempts if live else None,
        ))
        try:
            while not task.done():
                await asyncio.wait({task}, timeout=0.1)
                if not task.done() and await request.is_disconnected():
                    return error_response(499, "cancelled", "Generation was cancelled.")
            result = task.result()
        except GenerationRejected as exc:
            code = exc.code if exc.code in GENERATION_ERRORS else "provider_error"
            status, message = GENERATION_ERRORS[code]
            return error_response(status, code, message, exc.run, exc.field)
        finally:
            try:
                if not task.done():
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
            finally:
                if live_key is not None:
                    if len(recent_live) >= 128:
                        del recent_live[next(iter(recent_live))]
                    recent_live[live_key] = monotonic() + 3
                    active_live = False
        return ProposalResponse(baseRevision=result.base_revision, candidates=result.candidates, run=result.run)

    @app.get("/{path:path}", response_model=None, include_in_schema=False)
    async def frontend(path: str) -> FileResponse | JSONResponse:
        if path == "api" or path.startswith("api/"):
            return error_response(404, "not_found", "The requested API route does not exist.")
        index = DIST / "index.html"
        if not index.is_file():
            return error_response(404, "frontend_unbuilt", "Run the Vite dev server or build the frontend.")
        return FileResponse(index)

    return app


app = create_app()
