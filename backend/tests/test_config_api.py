from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings, SettingsLoad
from tests.conftest import client_with_settings

CONFIG_KEYS = {
    "environment",
    "sipWebSocketUrl",
    "sipDomain",
    "iceServers",
    "registration",
    "dtmf",
}


def test_config_returns_allowlisted_shape(client: TestClient) -> None:
    response = client.get("/api/config")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    body = response.json()
    assert set(body.keys()) == CONFIG_KEYS
    assert body["environment"] == "production"
    assert body["sipWebSocketUrl"] == ""
    assert body["sipDomain"] == ""
    assert body["iceServers"] == [{"urls": ["stun:stun.example:3478"]}]
    assert body["registration"] == {
        "maxRetries": 5,
        "baseDelayMs": 1000,
        "maxDelayMs": 15000,
    }
    assert body["dtmf"] == {"preferredMethod": "rtp"}


def test_config_omits_injected_secrets(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SIP_PASSWORD", "SENTINEL_PW")
    monkeypatch.setenv("APP_SECRET_UNRELATED", "SENTINEL_X")
    raw = client.get("/api/config").content.decode()
    assert "SENTINEL_PW" not in raw
    assert "SENTINEL_X" not in raw
    body = json.loads(raw)
    assert "password" not in body
    assert "username" not in body


def test_turn_credentials_are_ice_transport_only() -> None:
    settings = Settings(
        environment="production",
        ice_servers=[
            {
                "urls": ["turn:t:3478"],
                "username": "tu",
                "credential": "tc",
            }
        ],
    )
    response = client_with_settings(settings).get("/api/config")
    body = response.json()
    assert body["iceServers"] == [{"urls": ["turn:t:3478"], "username": "tu", "credential": "tc"}]
    assert "password" not in body
    assert set(body) == CONFIG_KEYS


def test_invalid_config_is_not_serialized() -> None:
    client = TestClient(
        create_app(SettingsLoad(None, "Invalid configuration field: iceServers"))
    )
    response = client.get("/api/config")
    assert response.status_code == 503
    raw = response.content.decode()
    assert "traceback" not in raw.lower()


def test_config_returns_sip_endpoint_defaults() -> None:
    settings = Settings(
        environment="development",
        sip_websocket_url="ws://127.0.0.1:7443",
        sip_domain="localhost",
        ice_servers=[],
    )
    response = client_with_settings(settings).get("/api/config")
    body = response.json()
    assert body["sipWebSocketUrl"] == "ws://127.0.0.1:7443"
    assert body["sipDomain"] == "localhost"
    assert set(body) == CONFIG_KEYS
