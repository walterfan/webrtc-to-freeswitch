from __future__ import annotations

import logging
import os
import re
from typing import Any

_SECRET_ENV_HINTS = ("PASSWORD", "SECRET", "CREDENTIAL", "AUTHORIZATION", "TOKEN")
_KEY_VALUE_RE = re.compile(
    r"(?i)\b(password|authorization|credential|secret|token)\b(\s*[:=]\s*)(\S+)"
)


def secret_markers(extra: list[str] | None = None) -> list[str]:
    markers: list[str] = []
    for key, value in os.environ.items():
        if value and any(hint in key.upper() for hint in _SECRET_ENV_HINTS):
            markers.append(value)
    if extra:
        markers.extend(item for item in extra if item)
    return markers


def redact_text(text: str, extra: list[str] | None = None) -> str:
    redacted = _KEY_VALUE_RE.sub(r"\1\2[REDACTED]", text)
    for marker in secret_markers(extra):
        if marker:
            redacted = redacted.replace(marker, "[REDACTED]")
    return redacted


def contains_secret(text: str, extra: list[str] | None = None) -> bool:
    return redact_text(text, extra) != text


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except (TypeError, ValueError):
            message = str(record.msg)
        record.msg = redact_text(message)
        record.args = ()
        return True


def configure_logging() -> logging.Logger:
    logger = logging.getLogger("webrtc_to_freeswitch")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s %(message)s"))
        handler.addFilter(RedactingFilter())
        logger.addHandler(handler)
    logger.addFilter(RedactingFilter())
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger


def safe_error_body(category: str, message: str) -> dict[str, Any]:
    return {"error": {"category": category, "message": redact_text(message)}}
