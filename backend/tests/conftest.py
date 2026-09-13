from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings, SettingsLoad

VALID_ENV = {
    "APP_ENVIRONMENT": "production",
    "APP_SIP_WEBSOCKET_URL": "",
    "APP_SIP_DOMAIN": "",
    "APP_ICE_SERVERS": '[{"urls":["stun:stun.example:3478"]}]',
    "APP_FRONTEND_DIST_DIR": "/tmp/does-not-exist",
    "APP_REGISTRATION_MAX_RETRIES": "5",
    "APP_REGISTRATION_BASE_DELAY_MS": "1000",
    "APP_REGISTRATION_MAX_DELAY_MS": "15000",
    "APP_DTMF_PREFERRED_METHOD": "rtp",
}

APP_KEYS = tuple(VALID_ENV.keys())


@pytest.fixture
def valid_env(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    for key in list(os.environ):
        if key.startswith("APP_"):
            monkeypatch.delenv(key, raising=False)
    for key, value in VALID_ENV.items():
        monkeypatch.setenv(key, value)
    return dict(VALID_ENV)


@pytest.fixture
def valid_settings(valid_env: dict[str, str]) -> Settings:
    return Settings()


@pytest.fixture
def client(valid_env: dict[str, str]) -> Iterator[TestClient]:
    with TestClient(create_app()) as test_client:
        yield test_client


def client_with_settings(settings: Settings) -> TestClient:
    return TestClient(create_app(SettingsLoad(settings, None)))


def client_with_invalid_runtime(
    error: str = "Invalid configuration field: iceServers",
) -> TestClient:
    return TestClient(create_app(SettingsLoad(None, error)))
