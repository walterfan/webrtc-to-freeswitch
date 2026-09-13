from __future__ import annotations

import ipaddress
import json
import re
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic_settings.exceptions import SettingsError

LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}$)(?!-)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.(?!-)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$"
)

FIELD_ALIASES = {
    "sip_websocket_url": "sipWebSocketUrl",
    "sip_domain": "sipDomain",
    "ice_servers": "iceServers",
    "dtmf_preferred_method": "dtmf.preferredMethod",
    "registration_max_retries": "registration.maxRetries",
    "registration_base_delay_ms": "registration.baseDelayMs",
    "registration_max_delay_ms": "registration.maxDelayMs",
    "environment": "environment",
    "frontend_dist_dir": "frontendDistDir",
}


class IceServer(BaseModel):
    urls: list[str]
    username: str | None = None
    credential: str | None = None

    @field_validator("urls", mode="before")
    @classmethod
    def normalize_urls(cls, value: object) -> list[str]:
        if isinstance(value, str):
            urls = [value]
        elif isinstance(value, list) and all(isinstance(item, str) for item in value):
            urls = [item for item in value if item.strip()]
        else:
            raise ValueError("iceServers entry missing urls")
        if not urls:
            raise ValueError("iceServers entry missing urls")
        return urls


def is_loopback_host(host: str) -> bool:
    cleaned = host.strip("[]").lower()
    if cleaned in LOOPBACK_HOSTS:
        return True
    try:
        return ipaddress.ip_address(cleaned).is_loopback
    except ValueError:
        return False


def is_valid_sip_domain(value: str) -> bool:
    if not value or any(ch.isspace() or ch in {"!", "/", "\\"} for ch in value):
        return False
    try:
        ipaddress.ip_address(value.strip("[]"))
        return True
    except ValueError:
        return bool(HOSTNAME_RE.fullmatch(value))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="APP_",
        extra="ignore",
        env_file=None,
        case_sensitive=False,
    )

    environment: Literal["development", "production"]
    sip_websocket_url: str = ""
    sip_domain: str = ""
    ice_servers: list[IceServer] = Field(default_factory=list)
    frontend_dist_dir: str = "../frontend/dist"
    registration_max_retries: int = 5
    registration_base_delay_ms: int = 1000
    registration_max_delay_ms: int = 15000
    dtmf_preferred_method: Literal["rtp", "info"] = "rtp"

    @field_validator("ice_servers", mode="before")
    @classmethod
    def parse_ice_servers(cls, value: object) -> object:
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError as exc:
                raise ValueError("iceServers must be a JSON array of RTCIceServer objects") from exc
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("iceServers must be a JSON array of RTCIceServer objects")
        return value


    @field_validator(
        "registration_max_retries",
        "registration_base_delay_ms",
        "registration_max_delay_ms",
    )
    @classmethod
    def non_negative(cls, value: int) -> int:
        if value < 0:
            raise ValueError("must be non-negative")
        return value

    @field_validator("sip_domain")
    @classmethod
    def validate_sip_domain(cls, value: str) -> str:
        value = value.strip()
        if value and not is_valid_sip_domain(value):
            raise ValueError("sipDomain is not a valid host")
        return value

    @field_validator("sip_websocket_url")
    @classmethod
    def strip_sip_websocket_url(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_optional_websocket(self) -> Settings:
        if not self.sip_websocket_url:
            return self
        parsed = urlparse(self.sip_websocket_url)
        if parsed.scheme not in {"ws", "wss"} or not parsed.hostname:
            raise ValueError("sipWebSocketUrl must be a valid ws or wss URL")
        if parsed.scheme == "ws" and (
            self.environment != "development" or not is_loopback_host(parsed.hostname)
        ):
            raise ValueError("sipWebSocketUrl: plain ws is only allowed for loopback development")
        return self




class SettingsLoad:
    def __init__(self, settings: Settings | None, error: str | None) -> None:
        self.settings = settings
        self.error = error

    @property
    def ready(self) -> bool:
        return self.settings is not None


def public_field_name(loc: tuple[int | str, ...]) -> str:
    parts = [str(item) for item in loc if item != "__root__"]
    if not parts:
        return "configuration"
    first = parts[0]
    return FIELD_ALIASES.get(first, first)


def safe_validation_message(exc: ValidationError) -> str:
    names: list[str] = []
    aliases = list(FIELD_ALIASES.values())
    for error in exc.errors():
        loc_name = public_field_name(error.get("loc", ()))
        message = str(error.get("msg", ""))
        mentioned = [alias for alias in aliases if alias in message]
        if loc_name != "configuration":
            names.append(loc_name)
        names.extend(mentioned)
    unique = ", ".join(dict.fromkeys(names)) or "configuration"
    return f"Invalid configuration field: {unique}"


def load_settings(env_file: Path | None = None) -> SettingsLoad:
    kwargs: dict[str, Any] = {}
    resolved = env_file if env_file is not None else Path(".env")
    if resolved.is_file():
        kwargs["_env_file"] = resolved
    try:
        return SettingsLoad(Settings(**kwargs), None)
    except ValidationError as exc:
        return SettingsLoad(None, safe_validation_message(exc))
    except SettingsError:
        # Env JSON decode failures for complex fields surface as SettingsError.
        return SettingsLoad(None, "Invalid configuration field: iceServers")
