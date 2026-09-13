from __future__ import annotations

from collections.abc import Awaitable, Callable
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response

from app.models import (
    HealthLiveResponse,
    HealthNotReadyResponse,
    HealthReadyResponse,
    RuntimeConfigResponse,
    runtime_config_from_settings,
)
from app.redaction import configure_logging, redact_text, safe_error_body
from app.security import security_headers
from app.settings import Settings, SettingsLoad, load_settings

logger = configure_logging()


def resolve_dist_dir(settings: Settings | None) -> Path | None:
    if settings is None:
        return None
    path = Path(settings.frontend_dist_dir)
    if not path.is_absolute():
        path = Path.cwd() / path
    if path.is_dir() and (path / "index.html").is_file():
        return path
    return None


def create_app(runtime: SettingsLoad | None = None) -> FastAPI:
    loaded = runtime if runtime is not None else load_settings()
    app = FastAPI(title="webrtc-to-freeswitch")
    app.state.runtime = loaded
    headers = security_headers(loaded.settings)
    dist = resolve_dist_dir(loaded.settings)

    @app.middleware("http")
    async def apply_security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        for name, value in headers.items():
            response.headers.setdefault(name, value)
        return response

    @app.exception_handler(Exception)
    async def unhandled_error(request: Request, exc: Exception) -> Response:
        if isinstance(exc, HTTPException):
            return await http_exception_handler(request, exc)
        logger.error("api_error category=internal")
        return JSONResponse(
            status_code=500,
            content=safe_error_body("internal", "Request failed"),
        )

    @app.get("/health/live", response_model=HealthLiveResponse)
    def health_live() -> HealthLiveResponse:
        return HealthLiveResponse()

    @app.get("/health/ready")
    def health_ready() -> Response:
        current: SettingsLoad = app.state.runtime
        if current.ready:
            return JSONResponse(HealthReadyResponse().model_dump())
        logger.error("readiness_failed category=configuration")
        body = HealthNotReadyResponse(reason=redact_text(current.error or "Invalid configuration"))
        return JSONResponse(status_code=503, content=body.model_dump())

    @app.get(
        "/api/config",
        response_model=RuntimeConfigResponse,
        response_model_exclude_none=True,
    )
    def api_config() -> RuntimeConfigResponse:
        current: SettingsLoad = app.state.runtime
        if current.settings is None:
            logger.error("config_unavailable category=configuration")
            raise HTTPException(
                status_code=503,
                detail=safe_error_body(
                    "configuration",
                    current.error or "Invalid configuration",
                )["error"],
            )
        return runtime_config_from_settings(current.settings)

    if dist is not None:
        assets = dist / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/")
        def spa_index() -> FileResponse:
            return FileResponse(dist / "index.html")

        @app.get("/{full_path:path}")
        def spa_fallback(full_path: str) -> FileResponse:
            if full_path == "api" or full_path.startswith("api/"):
                raise HTTPException(status_code=404, detail="Not found")
            if full_path == "health" or full_path.startswith("health/"):
                raise HTTPException(status_code=404, detail="Not found")
            candidate = dist / full_path
            if candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
