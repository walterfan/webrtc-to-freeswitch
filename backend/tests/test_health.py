from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import client_with_invalid_runtime


def test_live_and_ready_when_configured(client: TestClient) -> None:
    live = client.get("/health/live")
    ready = client.get("/health/ready")
    assert live.status_code == 200
    assert live.json() == {"status": "live"}
    assert ready.status_code == 200
    assert ready.json() == {"status": "ready"}


def test_live_succeeds_when_not_ready() -> None:
    client = client_with_invalid_runtime("Invalid configuration field: iceServers")
    live = client.get("/health/live")
    ready = client.get("/health/ready")
    assert live.status_code == 200
    assert ready.status_code == 503
    body = ready.json()
    assert body["status"] == "not_ready"
    assert "iceServers" in body["reason"]
    raw = ready.content.decode()
    assert "SENTINEL" not in raw
    assert "traceback" not in raw.lower()
