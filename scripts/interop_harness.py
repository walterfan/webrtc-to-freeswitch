#!/usr/bin/env python3
"""Opt-in FreeSWITCH interoperability harness.

Reads two test extensions only from protected environment variables.
Skips safely when they are unset. Never prints credentials, Authorization
headers, or SDP.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

REQUIRED = (
    "INTEROP_SIP_WEBSOCKET_URL",
    "INTEROP_SIP_DOMAIN",
    "INTEROP_USER_A",
    "INTEROP_PASSWORD_A",
    "INTEROP_USER_B",
    "INTEROP_PASSWORD_B",
)

FORBIDDEN_OUTPUT = ("authorization", "sdp", "v=0", "a=fingerprint")


def configured(env: dict[str, str] | None = None) -> bool:
    source = env if env is not None else os.environ
    return all(source.get(name) for name in REQUIRED)


def run(env: dict[str, str] | None = None) -> dict[str, Any]:
    source = env if env is not None else os.environ
    if not configured(source):
        return {"status": "not configured", "ran": False}
    return {
        "status": "ready",
        "ran": False,
        "note": "Operator checklist is documented; this harness does not dial.",
        "websocketHostSet": bool(source.get("INTEROP_SIP_WEBSOCKET_URL")),
        "usersPresent": bool(source.get("INTEROP_USER_A") and source.get("INTEROP_USER_B")),
    }


def render(result: dict[str, Any]) -> str:
    text = json.dumps(result)
    lowered = text.lower()
    for needle in FORBIDDEN_OUTPUT:
        if needle in lowered:
            raise RuntimeError("refusing to print protocol or credential material")
    for key, value in os.environ.items():
        if value and any(part in key.upper() for part in ("PASSWORD", "SECRET", "CREDENTIAL")):
            if value in text:
                raise RuntimeError("refusing to print a secret value")
    return text


def main() -> int:
    parser = argparse.ArgumentParser(description="Opt-in interop harness")
    parser.parse_args()
    output = render(run())
    print(output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
