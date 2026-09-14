## 1. Project Foundation

- [x] 1.1 Scaffold `frontend/` with the pinned toolchain (Node 20 LTS, Vue 3, TypeScript, Vite, `sip.js` at the exact tested version from design decision 1) and scaffold `backend/` as a `uv`-managed FastAPI package (Python 3.11+, FastAPI/Pydantic v2/Uvicorn per design decision 1); verify clean dependency installation with locked versions, a frontend typecheck, and a backend import smoke test.
- [x] 1.2 Configure frontend formatting, linting, Vitest, Vue component tests, and Playwright plus backend formatting, linting, type checking, and pytest; verify each empty/smoke suite and static check runs through documented commands.
- [x] 1.3 Add root development commands and example environment files that start FastAPI and Vite without real credentials; verify a new checkout can reach the frontend and backend liveness endpoint by following the README only.

## 2. Runtime Configuration Backend

- [x] 2.1 Implement typed settings for the `APP_*` environment variables in the design env table (environment, SIP domain, SIP WebSocket URL, `APP_ICE_SERVERS` as RTCIceServer objects, frontend asset location, registration retry knobs, preferred DTMF method), including production-WSS and loopback-development validation and ICE-object/DTMF-method/retry-value validation; verify pytest covers valid and invalid URL, domain, scheme, ICE-object, DTMF-method, retry-value, and environment combinations.
- [x] 2.2 Implement the allowlisted `GET /api/config` response from an explicit response model matching the design contract (`environment`, `iceServers`, `registration`, `dtmf`) without serializing internal settings; verify API tests assert the exact JSON shape/keys and prove unrelated environment values and SIP-like secret values are absent.
- [x] 2.3 Implement independent `GET /health/live` and configuration-aware `GET /health/ready` endpoints; verify API tests cover live/ready and live/not-ready states with safe diagnostics.
- [x] 2.4 Add structured safe-error handling and log redaction for configuration/API failures; verify tests capture logs and responses and assert that injected credential markers, private settings, and trace details do not leak.
- [x] 2.5 Serve the production frontend fallback and add the designed CSP, MIME-sniffing, referrer, and framing headers; verify API tests cover static assets, SPA fallback, API 404 behavior, and the exact security-header policy.

## 3. Frontend Application and SIP Registration

- [x] 3.1 Implement the runtime-config client with loading, ready, failed, and retry behavior; verify unit tests keep SIP actions disabled until validated configuration is available and recover after a simulated retry.
- [x] 3.2 Define typed SIP and media ports plus discriminated registration and call states, normalized error categories, and stale-session identifiers; verify reducer/service tests reject every illegal transition and accept each designed transition.
- [x] 3.3 Implement the SIP.js adapter for parsed address-of-record creation, WebSocket connection, registration, unregistration, and transport shutdown using memory-only credentials; verify adapter tests prove the password is cleared and never passed to persistence, URLs, logs, or the backend client.
- [x] 3.4 Implement bounded jittered registration recovery driven by the `registration` config block (`maxRetries`/`baseDelayMs`/`maxDelayMs` with full-jitter exponential backoff per design decision 4) and explicit retry/disconnect cancellation; verify fake-timer tests cover successful recovery, retry exhaustion at `maxRetries`, delay bounds, no automatic authentication retry, and no retry after user disconnect.
- [x] 3.5 Implement browser capability and secure-context preflight before registration; verify tests distinguish missing WebRTC APIs, insecure deployment context, and supported loopback development.
- [x] 3.6 Accept unsolicited out-of-dialog NOTIFY (FreeSWITCH message-summary MWI) with 200 and discard the body; verify adapter tests call accept, do not reject, and do not log the NOTIFY payload.

## 4. Audio Call and Media Services

- [x] 4.1 Implement safe destination normalization for numeric extensions and canonical SIP URIs plus normalized SIP failure categories; verify tests reject control characters and malformed targets and map busy, declined, not-found, unavailable, certificate, and generic failures to user-safe results.
- [x] 4.2 Implement outgoing invitation and incoming invitation handling with the single-session guard, safe display identity, answer, reject, cancel, hangup, and remote termination; verify service tests cover all specified call states, stale events, busy rejection, and return to idle.
- [x] 4.3 Implement the audio-only media profile and just-in-time microphone acquisition with permission, missing-device, and generic error categories; verify mocked-media tests assert `audio: true`, `video: false`, no media request on registration/rejection, and failed-call cleanup.
- [x] 4.4 Implement remote receiver-track attachment and autoplay recovery through a dedicated audio element; verify tests cover successful playback, blocked playback with an enable-audio action, and remote-media detachment.
- [x] 4.5 Implement idempotent local-track cleanup and mute synchronization for normal, failed, and disposed sessions; verify tests prove tracks stop exactly once, mute reflects actual track state, and every terminal path resets media controls.
- [x] 4.6 Implement DTMF validation and the RTP/INFO adapter path selected by `dtmf.preferredMethod` (RFC 4733 telephone-event when negotiated, documented SIP INFO fallback per design decision 5); verify tests accept only `0-9`, `*`, and `#`, disable DTMF outside active calls, assert the configured mechanism receives the digit, and cover the RTP-to-INFO fallback when `telephone-event` is not negotiated.

## 5. Call Console User Interface

- [x] 5.1 Build the responsive call-console shell with runtime/service status and an accessible remote-audio element; verify component tests cover loading, ready, configuration-failure, unsupported-browser, and enable-audio presentations.
- [x] 5.2 Add credential, connect, registration-status, retry, and disconnect controls with password-manager-safe semantics and no persistence; verify component tests cover control gating, authentication errors, duplicate-action prevention, and password clearing.
- [x] 5.3 Add destination entry and outgoing dialing UI plus incoming and active call cards for answer, reject, cancel, hangup, mute, and DTMF; verify component tests cover every state and ensure untrusted caller names render as text rather than markup.
- [x] 5.4 Add keyboard operation, visible focus, status announcements, responsive layout, and disabled-state explanations; verify accessibility checks and Playwright viewport/keyboard smoke tests pass.

## 6. Build and Deployment Integration

- [x] 6.1 Configure Vite's development API proxy and the production frontend build consumed by FastAPI; verify a production build starts under FastAPI and serves the SPA, config API, and health endpoints from one origin.
- [x] 6.2 Add browser smoke tests with fake signaling and media for startup, register, outgoing call, incoming call, autoplay recovery, and disconnect; verify the Playwright suite passes without network access or real credentials.
- [x] 6.3 Document required FreeSWITCH Sofia WSS, trusted certificate, WebRTC codec, ICE/NAT, test-user, restricted dialplan, and DTMF settings plus HTTPS deployment and TURN guidance; verify every environment key and diagnostic step matches the implemented configuration contract.
- [x] 6.4 Add an opt-in interoperability harness and checklist that reads two test extensions and endpoints only from protected environment input; verify it skips safely when unset and never prints credentials, authorization headers, or SDP.

## 7. Acceptance and Hardening

- [x] 7.1 Run all backend tests/static checks and frontend lint/typecheck/unit/component/browser/build checks from the documented root commands; verify every command succeeds from a clean dependency installation.
- [x] 7.2 Review the implementation against the security controls in design decision 8 (allowlisted config, memory-only credentials, redacted logging, WSS enforcement, CSP and security headers), run available dependency audits (`npm audit`, `uv`/pip audit), and resolve high-severity findings; verify the final report records commands and contains no credentials or raw SIP/SDP data.
- [ ] 7.3 Execute the interoperability checklist against a non-production WebRTC-enabled FreeSWITCH instance to verify two-user registration, incoming/outgoing two-way audio, cancel/reject/hangup, mute, DTMF, reconnect, certificate failure guidance, and media cleanup; record pass/fail evidence without sensitive data.

