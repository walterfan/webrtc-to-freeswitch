from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


def load_interop():
    path = Path(__file__).resolve().parents[2] / "scripts" / "interop_harness.py"
    spec = importlib.util.spec_from_file_location("interop_harness", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_interop_harness_skips_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "INTEROP_SIP_WEBSOCKET_URL",
        "INTEROP_SIP_DOMAIN",
        "INTEROP_USER_A",
        "INTEROP_PASSWORD_A",
        "INTEROP_USER_B",
        "INTEROP_PASSWORD_B",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("SIP_PASSWORD", "SENTINEL_PW")
    harness = load_interop()
    result = harness.run({})
    output = harness.render(result)
    assert result["status"] == "not configured"
    assert "SENTINEL_PW" not in output
    assert "authorization" not in output.lower()
    assert "sdp" not in output.lower()
    assert "v=0" not in output
