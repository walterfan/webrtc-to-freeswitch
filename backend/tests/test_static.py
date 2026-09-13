from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings, SettingsLoad


def _client(tmp_path: Path) -> TestClient:
    (tmp_path / "index.html").write_text("<html><body>spa-shell</body></html>", encoding="utf-8")
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log('ok')", encoding="utf-8")
    settings = Settings(
        environment="production",
        frontend_dist_dir=str(tmp_path),
    )
    return TestClient(create_app(SettingsLoad(settings, None)))


def test_static_spa_and_security_headers(tmp_path: Path) -> None:
    client = _client(tmp_path)

    root = client.get("/")
    asset = client.get("/assets/app.js")
    spa = client.get("/calls/unknown")
    missing_api = client.get("/api/unknown")

    assert root.status_code == 200
    assert "spa-shell" in root.text
    assert asset.status_code == 200
    assert "console.log" in asset.text
    assert spa.status_code == 200
    assert "spa-shell" in spa.text
    assert missing_api.status_code == 404
    assert "spa-shell" not in missing_api.text

    csp = root.headers["content-security-policy"]
    assert "connect-src" in csp
    assert "'self'" in csp
    assert "wss:" in csp
    assert "ws:" in csp
    assert root.headers["x-content-type-options"] == "nosniff"
    assert root.headers["referrer-policy"] == "no-referrer"
    assert root.headers["x-frame-options"] == "DENY"
