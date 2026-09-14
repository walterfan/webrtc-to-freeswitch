## Context

The repository currently contains only OpenSpec configuration. See `proposal.md` for motivation and the four capability specs for observable behavior. The target is an existing FreeSWITCH deployment with a Sofia profile that accepts SIP over WebSocket; production browsers require HTTPS/WSS, trusted certificates, ICE, and DTLS-SRTP. SIP.js supports FreeSWITCH-compatible SIP-over-WebSocket and browser WebRTC, but its protocol objects and asynchronous state transitions should not leak into Vue components.

The first release is a single-user, single-call browser endpoint. The backend is configuration and static-content infrastructure, not a signaling proxy: SIP signaling travels directly from the browser to FreeSWITCH, and negotiated RTP media travels between WebRTC peers according to ICE.

## Goals / Non-Goals

**Goals:**

- Establish explicit, testable state machines for runtime startup, registration, calls, and media.
- Isolate SIP.js and browser media APIs behind narrow TypeScript interfaces so UI tests do not need a real PBX and future media profiles can add video.
- Keep SIP account secrets ephemeral and minimize the backend's security responsibilities.
- Make local development and production deployment use the same runtime-configuration contract.
- Provide enough diagnostics to distinguish configuration, signaling, authentication, and media failures without displaying raw SIP traffic or secrets.

**Non-Goals:**

- Acting as a SIP proxy, credential broker, user directory, TURN credential issuer, or FreeSWITCH control plane.
- Supporting multiple simultaneous sessions, attended/blind transfer, hold, conference, recording, messaging, presence, or call-history persistence.
- Guaranteeing connectivity through every NAT topology without an operator-provided TURN service.
- Implementing video in this change; the design only preserves a seam for a future audio/video media profile.

## Decisions

### 1. Use a two-workspace repository with one production origin

Create `frontend/` for Vue 3, TypeScript, Vite, and SIP.js, and `backend/` for Python, FastAPI, Pydantic settings, and `uv`. During development, Vite proxies `/api` to FastAPI. For production, FastAPI serves the built frontend and the API from one origin, or an equivalent reverse proxy preserves that same-origin contract.

This makes browser deployment and CORS behavior predictable while keeping frontend and backend toolchains independent. A frontend-only static configuration file was considered, but it makes environment validation and readiness reporting awkward. A larger application server was rejected because no domain data or server-side call control is required.

#### Pinned toolchain baseline

Versions are pinned so tests are reproducible and browser/library behavior is known. Exact patch versions are locked in `package-lock.json` / `uv.lock` at scaffold time; the supported major/minor ranges are:

- Frontend: Node.js 20 LTS, Vue `^3.4`, TypeScript `~5.4`, Vite `^5`, `sip.js` pinned to an exact tested version (target `0.21.2`), Vitest `^1`, `@vue/test-utils` `^2`, Playwright `^1.4x`.
- Backend: Python 3.11+, FastAPI `^0.110`, Pydantic `^2` with `pydantic-settings` `^2`, Uvicorn `^0.29`, `pytest` `^8`, `httpx` for the test client, `ruff` for lint/format.

The exact `sip.js` version is treated as a compatibility contract: it is imported only inside the SIP adapter and is re-verified against supported browsers before any upgrade.

#### Backend environment variables

Pydantic settings read the following variables (prefix `APP_`); these are the only recognized inputs and are the keys documented in the example env files and README:

| Variable | Meaning | Notes |
| --- | --- | --- |
| `APP_ENVIRONMENT` | `development` or `production` | Returned to the browser for client-side WSS enforcement |
| `APP_SIP_WEBSOCKET_URL` | Optional default SIP WS(S) URL | Prefills the registration form; empty allowed |
| `APP_SIP_DOMAIN` | Optional default SIP domain | Prefills the registration form; empty allowed |
| `APP_ICE_SERVERS` | JSON array of RTCIceServer objects | Empty array allowed; STUN/TURN entries |
| `APP_FRONTEND_DIST_DIR` | Path to built frontend assets | Used only in production static serving |
| `APP_REGISTRATION_MAX_RETRIES` | Client retry budget | Default 5 |
| `APP_REGISTRATION_BASE_DELAY_MS` | Retry base delay | Default 1000 |
| `APP_REGISTRATION_MAX_DELAY_MS` | Retry delay ceiling | Default 15000 |
| `APP_DTMF_PREFERRED_METHOD` | `rtp` or `info` | Default `rtp` |

No SIP username, password, WebSocket URL, or SIP domain is ever a backend environment variable. The user enters the SIP endpoint (WSS URL and domain) together with account credentials in the browser. The `registration` and `dtmf` config values are passed through to the browser; all other values are backend-internal and never leave the process except through the allowlisted `/api/config` response.

### 2. Keep the backend out of SIP signaling and credentials

The backend exposes:

- `GET /api/config` with an allowlisted response containing `environment`, `iceServers`, `registration`, and `dtmf`;
- `GET /health/live` for process liveness; and
- `GET /health/ready` for validated-configuration readiness.

Pydantic settings validate ICE server objects, DTMF method, and registration retry knobs. The API response is built explicitly rather than serializing the complete settings object. Static SIP or private TURN credentials are not configuration fields, and exception logging is filtered so settings and user-entered credentials are never included.

The user enters the SIP WebSocket URL, SIP domain, username, and password in the browser. The browser validates that production uses `wss` and that plain `ws` is limited to loopback development. The password exists only in the active SIP service instance, is cleared on disconnect, and is never sent to FastAPI or persistent storage. Endpoint fields stay in memory for the page session and are not written to persistent browser storage. Server-issued short-lived credentials could be added later as a separate authentication capability.

Proxying SIP through FastAPI was rejected because it would require a SIP stack, increase latency, and expand the credential and media trust boundary without helping the MVP.

#### `GET /api/config` response contract

The response is a JSON object with camelCase keys and this exact shape:

```jsonc
{
  "environment": "development",            // string enum: "development" | "production"
  "sipWebSocketUrl": "wss://fs.example:7443", // string; may be "" when unset
  "sipDomain": "fs.example.com",           // string; may be "" when unset
  "iceServers": [                          // array of RTCIceServer-shaped objects
    { "urls": ["stun:stun.example:3478"] },
    {
      "urls": ["turn:turn.example:3478?transport=udp"],
      "username": "ephemeral-user",        // optional; present only for TURN
      "credential": "ephemeral-secret"     // optional; present only for TURN
    }
  ],
  "registration": {                        // client retry knobs (see decision 4)
    "maxRetries": 5,
    "baseDelayMs": 1000,
    "maxDelayMs": 15000
  },
  "dtmf": { "preferredMethod": "rtp" }      // "rtp" | "info"; see decision 5
}
```

`iceServers` is an array of `RTCIceServer`-shaped objects (not bare URL strings) so it can be passed directly into `RTCPeerConnection` and can carry TURN credentials. If the deployment provides TURN, the backend MAY emit short-lived TURN `username`/`credential` here; these are ICE transport credentials only and are never SIP account credentials. When no TURN is configured, only STUN entries (or an empty array) are returned. The `environment`, `registration`, and `dtmf` blocks are always present. The response is assembled from an explicit response model, never by serializing the settings object.

### 3. Wrap the full SIP.js API behind an application service

Use SIP.js `UserAgent` and registration/session primitives rather than binding Vue directly to `SimpleUser`. The adapter owns transport connection, registration, inbound invitation delegation, outgoing invitation creation, session termination, DTMF, and teardown. It emits normalized domain events and user-safe failure categories. Out-of-dialog NOTIFY (for example FreeSWITCH message-summary MWI after REGISTER) is accepted with 200 and discarded; SIP.js otherwise answers 481 because this client never SUBSCRIBEs.

The full API requires more integration code, but it gives deterministic control over registration recovery, busy rejection, session transitions, and future session features. `SimpleUser` was considered for faster startup, but its intentionally constrained API and simplified lifecycle would push special cases into components.

No SIP URI is created through string concatenation. The adapter builds the address of record and targets through the library URI parser after rejecting control characters. Numeric extensions are resolved against the user-entered SIP domain; canonical `sip:` destinations are parsed and normalized. Remote display names are rendered with Vue text interpolation only, never HTML insertion.

### 4. Model registration and calling as explicit finite states

The application state layer exposes discriminated unions rather than independent booleans:

- registration: `disconnected`, `connecting`, `registering`, `registered`, `reconnecting`, `failed`;
- call: `idle`, `incoming-ringing`, `outgoing-dialing`, `outgoing-ringing`, `active`, `terminating`, `ended`.

All commands check the current state before acting. One session reference is authoritative; a second outgoing request is rejected locally and an incoming invitation received while busy is rejected without replacing it. SIP.js session events are translated once in the adapter, and stale events are ignored by comparing a generated session identifier.

Unexpected transport loss triggers a cancelable retry policy driven by the `registration` block of the config contract (decision 2): `baseDelayMs` (default 1000), `maxDelayMs` (default 15000), and `maxRetries` (default 5). Delay for attempt `n` (1-based) is `min(baseDelayMs * 2^(n-1), maxDelayMs)` with full jitter applied (a uniform random value in `[0, delay]`), yielding the approximate 1, 2, 4, 8, 15 second progression. After `maxRetries` failed attempts the state machine enters `failed` and requires a manual retry. Authentication and configuration errors are not automatically retried. A user disconnect cancels pending retry work before unregistering and stopping the transport.

Scattered component-level flags were rejected because SIP and media callbacks can arrive out of order and would make illegal combined states easy to create.

### 5. Separate call media policy from SIP session control

Define an application-level media profile whose MVP value is `{ audio: true, video: false }`. A browser media adapter owns capability checks, microphone acquisition, peer-connection track extraction, remote `MediaStream` attachment, playback, mute state, and cleanup. SIP.js remains responsible for SDP negotiation, while the media adapter observes the resulting session description handler through a single integration boundary.

Microphone acquisition is just-in-time: starting an outgoing call or answering an invitation may request it, but registration and rejection do not. Remote receiver tracks are collected into one stream attached to a dedicated audio element. A rejected `play()` promise leaves the call active and exposes an “Enable audio” gesture. Cleanup is idempotent and runs for normal termination, negotiation failure, disconnect, and component disposal.

Mute toggles enabled state on owned local audio tracks and verifies the resulting state before updating the UI. DTMF accepts only `0-9`, `*`, and `#`. The method is chosen by `dtmf.preferredMethod` in the config contract (decision 2): `"rtp"` sends RFC 4733 negotiated telephone-event tones through the session description handler when the negotiated SDP advertises `telephone-event`; `"info"` sends SIP INFO `application/dtmf-relay` bodies. When `"rtp"` is requested but the negotiated media does not offer `telephone-event`, the adapter falls back to SIP INFO and records the fallback as a structured event. The default is `"rtp"`.

Keeping media work inside Vue components was rejected because it would couple DOM lifecycle, SIP lifecycle, and future camera support.

### 6. Centralize presentation in a small call-console view

Use a single responsive page with four regions: service/config status, SIP endpoint plus credential and registration controls, destination/dial controls, and the current incoming/active call card. Vue composables expose readonly state and commands from the services. Controls derive their enabled state from the finite states; raw SIP response objects and exception messages never reach templates.

The initial release does not need a general-purpose global store. Plain Vue reactive state owned by a top-level provider is sufficient and easier to teardown. A store can be introduced if later capabilities add routes or persistent call collections.

### 7. Test at service boundaries and verify real interoperability separately

- Backend tests cover allowlisted serialization, production WSS enforcement, loopback development exceptions, invalid settings, liveness/readiness, static serving, and redacted failures.
- Frontend unit tests use a fake SIP port and fake media port to cover state transitions, duplicate-action prevention, retry cancellation, password cleanup, busy rejection, sanitization-by-rendering, media failure categories, autoplay recovery, and idempotent cleanup.
- Component tests verify control availability and user-facing states without real devices.
- A browser smoke suite verifies startup and core UI behavior with mocked signaling/media.
- An opt-in interoperability run uses two test extensions on an operator-supplied FreeSWITCH instance to verify registration, bidirectional audio, incoming/outgoing termination, mute, DTMF, reconnect, and WSS certificate behavior. It never embeds credentials in the repository or CI logs.

A fully emulated SIP/WebRTC server in unit tests was rejected because it would be expensive and still would not prove FreeSWITCH SDP, codec, ICE, and DTMF interoperability.

### 8. Apply browser and transport security controls at deployment

Production deployment terminates HTTPS with a trusted certificate. The browser connects to the FreeSWITCH WSS endpoint the user enters. Static responses include a restrictive Content Security Policy that permits network connections to the application origin and `ws:`/`wss:` signaling endpoints, along with standard MIME-sniffing, referrer, and framing protections. ICE server access is constrained by the validated runtime configuration because browser WebRTC transport is not governed uniformly by CSP. Configuration and displayed identities are treated as untrusted input. Logging uses structured event names and safe categories, never SIP authorization headers, SDP bodies, credentials, or full raw protocol messages.

## Risks / Trade-offs

- [Direct browser-to-FreeSWITCH connectivity exposes the SIP WSS endpoint to clients] → Require WSS, trusted certificates, restricted FreeSWITCH ACL/dialplan permissions, strong per-user credentials, rate limiting at the edge, and operator documentation.
- [NAT or firewall conditions can produce signaling success but no audio] → Make ICE servers configurable, document TURN as a production dependency where needed, categorize media failures, and include a real interoperability checklist.
- [SIP.js release cadence and browser behavior may vary] → Pin an exact tested version, keep all library usage in one adapter, and test supported browsers before dependency upgrades.
- [Automatic retries can create registration storms] → Use bounded jittered backoff, cancel retries on explicit disconnect, and avoid retrying authentication/configuration failures.
- [Serving frontend assets from FastAPI is convenient but not optimized for high scale] → Keep the same-origin URL contract so a CDN or reverse proxy can serve assets later without changing client behavior.
- [Memory-only passwords improve exposure but require re-entry after reload] → State this clearly in the UI; introduce short-lived server-issued credentials only through a separately reviewed capability.
- [Without a provisioned TURN service, some calls will fail in restrictive networks] → Treat TURN provisioning and ephemeral TURN credentials as an operational follow-up, not silently fall back to insecure media.

## Migration Plan

1. Add backend configuration and health endpoints, then verify failure behavior with no FreeSWITCH dependency.
2. Add the frontend shell and SIP/media adapters with fake-based tests.
3. Configure a non-production FreeSWITCH Sofia profile with WSS, trusted certificates, test users, codecs, ICE-visible addresses, and a restricted test dialplan.
4. Run the interoperability checklist using two test extensions before exposing the application beyond a development network.
5. Build the frontend, serve it with FastAPI behind HTTPS, apply security headers and origin restrictions, and deploy initially to a limited audience.
6. Roll back by routing traffic to the previous application version; the change creates no persistent application data or FreeSWITCH schema migration. Revoke test credentials and remove the client origin from edge policy if the deployment is retired.
