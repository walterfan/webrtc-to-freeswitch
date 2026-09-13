from __future__ import annotations

import logging

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from app.main import create_app
from app.redaction import configure_logging
from app.settings import Settings, SettingsLoad


def test_config_error_and_logs_are_redacted(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("SIP_PASSWORD", "SENTINEL_PW")
    monkeypatch.setenv("APP_SECRET_UNRELATED", "SENTINEL_X")
    logger = configure_logging()
    with caplog.at_level(logging.ERROR, logger="webrtc_to_freeswitch"):
        client = TestClient(
            create_app(SettingsLoad(None, "Invalid configuration field: iceServers"))
        )
        response = client.get("/api/config")
        logger.error("debug password=SENTINEL_PW secret=SENTINEL_X")

    assert response.status_code == 503
    raw = response.content.decode().lower()
    assert "sentinel_pw" not in raw
    assert "sentinel_x" not in raw
    assert "traceback" not in raw
    assert "configuration" in raw
    combined = " ".join(record.getMessage() for record in caplog.records)
    assert "SENTINEL_PW" not in combined
    assert "SENTINEL_X" not in combined


def test_unhandled_error_is_safe(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SIP_PASSWORD", "SENTINEL_PW")
    # Avoid SPA catch-all so the boom route is reachable.
    settings = Settings(environment="development", frontend_dist_dir="/tmp/does-not-exist")
    app = create_app(SettingsLoad(settings, None))

    @app.get("/boom")
    def boom(request: Request) -> None:
        raise RuntimeError(f"failed with {request.headers.get('x-marker', '')}")

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/boom", headers={"x-marker": "SENTINEL_PW"})
    assert response.status_code == 500
    raw = response.content.decode()
    assert "SENTINEL_PW" not in raw
    assert "traceback" not in raw.lower()
    assert response.json()["error"]["category"] == "internal"
