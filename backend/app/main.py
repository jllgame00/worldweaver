import asyncio
from dataclasses import dataclass
import math
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ValidationError
from starlette.exceptions import HTTPException
from starlette.requests import ClientDisconnect

from .contracts import Candidate, ProjectSnapshot, Run
from .mock_provider import MockProvider
from .narrative import GenerationRejected, generate
from .provider import StructuredProvider


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
    "provider_error": (502, "The provider could not complete generation."),
}


@dataclass(frozen=True)
class Settings:
    model: str = "worldweaver-mock-v1"
    timeout_seconds: float = 8.0

    @classmethod
    def from_environment(cls) -> "Settings":
        if os.getenv("WORLDWEAVER_PROVIDER", "mock") != "mock":
            raise ValueError("WORLDWEAVER_PROVIDER must be mock in Phase 1")
        model = os.getenv("WORLDWEAVER_MODEL", "worldweaver-mock-v1")
        timeout = float(os.getenv("WORLDWEAVER_TIMEOUT_SECONDS", "8"))
        if not model.strip() or not math.isfinite(timeout) or not 0 < timeout <= 120:
            raise ValueError("WORLDWEAVER_MODEL and WORLDWEAVER_TIMEOUT_SECONDS are invalid")
        return cls(model, timeout)


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
    adapter = provider if provider is not None else MockProvider()
    app = FastAPI(title="WORLDWEAVER", version="1.0.0")
    if (DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == 404 else "http_error"
        return error_response(exc.status_code, code, "The requested route is unavailable.")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/candidates", response_model=ProposalResponse)
    async def candidates(request: Request) -> ProposalResponse | JSONResponse:
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

        task = asyncio.create_task(generate(
            project.narrative_data, adapter, model=config.model, timeout=config.timeout_seconds,
        ))
        try:
            while not task.done():
                await asyncio.wait({task}, timeout=0.1)
                if not task.done() and await request.is_disconnected():
                    return error_response(499, "cancelled", "Generation was cancelled.")
            result = task.result()
        except GenerationRejected as exc:
            status, message = GENERATION_ERRORS[exc.code]
            return error_response(status, exc.code, message, exc.run, exc.field)
        finally:
            if not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
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
