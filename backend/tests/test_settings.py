from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from app.settings import Settings, load_settings


def settings(**overrides: object) -> Settings:
    payload: dict[str, object] = {
        "environment": "production",
        "ice_servers": [],
    }
    payload.update(overrides)
    return Settings(**payload)  # type: ignore[arg-type]


def test_production_settings_are_accepted() -> None:
    loaded = settings()
    assert loaded.environment == "production"
    assert loaded.ice_servers == []


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("ice_servers", [{"username": "tu"}]),
        ("dtmf_preferred_method", "pulse"),
        ("registration_max_retries", -1),
    ],
)
def test_malformed_settings_are_rejected(field: str, value: object) -> None:
    with pytest.raises(ValidationError) as exc:
        settings(**{field: value})
    text = exc.value.json()
    assert "SENTINEL" not in text


def test_ice_servers_parse_from_json_string() -> None:
    loaded = settings(
        ice_servers=json.dumps([{"urls": ["turn:t:3478"], "username": "tu", "credential": "tc"}])
    )
    assert loaded.ice_servers[0].urls == ["turn:t:3478"]
    assert loaded.ice_servers[0].username == "tu"


def test_load_settings_reports_public_field_name(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENVIRONMENT", "production")
    monkeypatch.setenv("APP_ICE_SERVERS", "not-json")
    result = load_settings()
    assert result.settings is None
    assert result.error is not None
    assert "iceServers" in result.error
    assert "not-json" not in result.error


def test_optional_sip_endpoint_defaults_are_accepted() -> None:
    loaded = settings(
        environment="development",
        sip_websocket_url="ws://127.0.0.1:7443",
        sip_domain="localhost",
    )
    assert loaded.sip_websocket_url == "ws://127.0.0.1:7443"
    assert loaded.sip_domain == "localhost"


def test_empty_sip_endpoint_defaults_are_accepted() -> None:
    loaded = settings()
    assert loaded.sip_websocket_url == ""
    assert loaded.sip_domain == ""


def test_production_rejects_plain_ws_default() -> None:
    with pytest.raises(ValidationError):
        settings(sip_websocket_url="ws://127.0.0.1:7443", sip_domain="localhost")
