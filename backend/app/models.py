from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.settings import Settings


class IceServerResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    urls: list[str]
    username: str | None = None
    credential: str | None = None


class RegistrationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    maxRetries: int
    baseDelayMs: int
    maxDelayMs: int


class DtmfResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    preferredMethod: Literal["rtp", "info"]


class RuntimeConfigResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    environment: Literal["development", "production"]
    sipWebSocketUrl: str
    sipDomain: str
    iceServers: list[IceServerResponse]
    registration: RegistrationResponse
    dtmf: DtmfResponse


class HealthLiveResponse(BaseModel):
    status: Literal["live"] = "live"


class HealthReadyResponse(BaseModel):
    status: Literal["ready"] = "ready"


class HealthNotReadyResponse(BaseModel):
    status: Literal["not_ready"] = "not_ready"
    reason: str = Field(examples=["Invalid configuration field: iceServers"])


def runtime_config_from_settings(settings: Settings) -> RuntimeConfigResponse:
    ice_servers: list[IceServerResponse] = []
    for entry in settings.ice_servers:
        item = IceServerResponse(urls=list(entry.urls))
        if entry.username is not None:
            item.username = entry.username
        if entry.credential is not None:
            item.credential = entry.credential
        ice_servers.append(item)
    return RuntimeConfigResponse(
        environment=settings.environment,
        sipWebSocketUrl=settings.sip_websocket_url,
        sipDomain=settings.sip_domain,
        iceServers=ice_servers,
        registration=RegistrationResponse(
            maxRetries=settings.registration_max_retries,
            baseDelayMs=settings.registration_base_delay_ms,
            maxDelayMs=settings.registration_max_delay_ms,
        ),
        dtmf=DtmfResponse(preferredMethod=settings.dtmf_preferred_method),
    )
