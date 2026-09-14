# Acceptance Case Catalog: build-webrtc-freeswitch-client

**Mode:** `plan` (greenfield repo; no executable target exists yet)
**Baseline state:** AWAITING APPROVAL
**Test basis:** `proposal.md`, `design.md`, and specs `runtime-configuration`,
`sip-registration`, `audio-calling`, `browser-media`; implementation checklist
in `tasks.md`. Config/contract details (`/api/config` shape, `APP_*` env vars,
retry/DTMF knobs, pinned toolchain) are from `design.md` decisions 1, 2, 4, 5.

## Test basis facts, assumptions, and gaps

**Confirmed:** Single-user, single-call, audio-only MVP. Backend is
config/static-serving only (no SIP proxy). Passwords are memory-only. WSS
required in production except loopback dev.

**Assumptions (A):**
- A1: Frontend tests use a fake SIP port and fake media port (design decision 7);
  no real PBX in inner-loop tests.
- A2: Backend uses FastAPI `TestClient`/`httpx`; no live FreeSWITCH.
- A3: A controllable/fake timer is used for retry-backoff cases (atc-patterns rule 4).
- A4: Interoperability cases (IT-real) require an operator-supplied non-production
  FreeSWITCH with two test extensions; credentials come only from protected env.

**Open decisions (must resolve before those cases can be judged exact):**
- OD1: Whether `APP_ICE_SERVERS` TURN entries are static or short-lived. Affects
  ATC-105 evidence but not its pass/fail oracle.
- OD2: Supported-browser matrix specifics (which browsers/versions gate ATC-460).

**Product risk summary:**
| Risk | Impact | Priority |
| --- | --- | --- |
| R-SEC-CRED | SIP password leaks to logs/URLs/storage/backend | P0 |
| R-SEC-CFG | `/api/config` leaks non-allowlisted secrets | P0 |
| R-SEC-WSS | Insecure `ws://` accepted in production | P0 |
| R-XSS | Malicious remote display name injects markup | P0 |
| R-CALL-DUP | Second/incoming call corrupts the active session | P0 |
| R-MEDIA-LEAK | Microphone stays live after call ends/fails | P0 |
| R-RETRY-STORM | Unbounded/auth retries flood FreeSWITCH | P1 |
| R-DTMF | Wrong/no DTMF method breaks IVR interop | P1 |
| R-AUTOPLAY | Autoplay block silently mutes call | P1 |
| R-INTEROP | Real FreeSWITCH SDP/codec/ICE mismatch | P1 |
| R-CFG-LOAD | UI allows calling before config validated | P1 |

---

## Backend runtime configuration (tasks 2.1-2.5)

## ATC-101: Allowlisted `/api/config` returns the exact documented shape

| Field | Value |
| --- | --- |
| Requirement / risk | runtime-configuration "Browser-safe runtime configuration"; task 2.2 |
| Priority | P0 |
| Dimension / level | functional, contract / IT (API) |
| Automation candidate | Yes |
| Preconditions | Valid `APP_*` env set; `APP_ENVIRONMENT=production`, valid WSS URL |
| Test data | Fixed env fixture with one STUN entry in `APP_ICE_SERVERS` |
| Expected evidence | JSON body captured by test client |

```gherkin
Scenario: Config endpoint returns only the allowlisted keys
  Given a correctly configured production backend
  When a client sends GET /api/config
  Then the response is HTTP 200 with content-type application/json
  And the JSON top-level keys are exactly: environment, iceServers, registration, dtmf
  And environment equals "production"
  And iceServers is an array of objects each having a "urls" array
  And registration has integer maxRetries, baseDelayMs, maxDelayMs
  And dtmf.preferredMethod is "rtp" or "info"
```

**Oracle notes:** Keys/casing from design decision 2. Exact key-set assertion
(no extra keys) is required — superset is a FAIL.

## ATC-102: No SIP secret or unrelated env value appears in the config response

| Field | Value |
| --- | --- |
| Requirement / risk | R-SEC-CFG; runtime-configuration "Secrets are not returned"; task 2.2 |
| Priority | P0 |
| Dimension / level | security / IT (API) |
| Automation candidate | Yes |
| Preconditions | Env additionally contains injected markers `SIP_PASSWORD=SENTINEL_PW`, `APP_SECRET_UNRELATED=SENTINEL_X` |
| Test data | Sentinel values that are easy to grep |
| Expected evidence | Full response body; assertion that sentinels are absent |

```gherkin
Scenario: Injected credential markers never reach the client
  Given the process environment contains SENTINEL_PW and SENTINEL_X
  When a client sends GET /api/config
  Then the serialized response body does not contain "SENTINEL_PW"
  And the serialized response body does not contain "SENTINEL_X"
  And no SIP username or password field is present
```

**Oracle notes:** Response is built from an explicit model, not by serializing
settings (design decision 2). This is a substring assertion over the raw body.

## ATC-103: TURN entries carry only transport credentials

| Field | Value |
| --- | --- |
| Requirement / risk | runtime-configuration "ICE servers carry only transport credentials"; R-SEC-CFG |
| Priority | P1 |
| Dimension / level | contract, security / IT (API) |
| Automation candidate | Yes |
| Preconditions | `APP_ICE_SERVERS` includes a TURN entry with username/credential |
| Test data | `[{"urls":["turn:t:3478"],"username":"tu","credential":"tc"}]` |
| Expected evidence | Response `iceServers[]` |

```gherkin
Scenario: TURN username/credential pass through as ICE transport creds
  Given a TURN ICE entry is configured with username and credential
  When a client sends GET /api/config
  Then iceServers contains that entry with its username and credential
  And those values are the only credentials in the response
  And no field named username/password sits at the SIP level of the response
```

## ATC-104: Production rejects insecure `ws://`; loopback dev accepts it

| Field | Value |
| --- | --- |
| Requirement / risk | R-SEC-WSS; runtime-configuration "Configuration validation"; task 2.1 |
| Priority | P0 |
| Dimension / level | negative, boundary / UT (settings validation) |
| Automation candidate | Yes |
| Preconditions | None |
| Test data | 3 settings variants (see steps) |
| Expected evidence | Validation result / raised error field name |

```gherkin
Scenario Outline: Browser enforces WebSocket scheme for user-entered endpoint
  Given the runtime config environment is <env>
  And the user enters SIP WebSocket URL <url> and a valid SIP domain
  When the user attempts to connect
  Then the client result is <outcome>
  And on rejection the UI shows a validation error that names the signaling URL and contains no secret

  Examples:
    | env         | url                    | outcome  |
    | production  | wss://fs.example:7443  | accepted |
    | production  | ws://fs.example:7443   | rejected |
    | development | ws://127.0.0.1:7443    | accepted |
    | development | ws://fs.example:7443   | rejected |
```

**Oracle notes:** Loopback exception requires BOTH development mode AND a
loopback host (design decision 2). Non-loopback `ws` in dev is rejected.

## ATC-105: Invalid ICE object / DTMF method / retry value is rejected

| Field | Value |
| --- | --- |
| Requirement / risk | runtime-configuration "Configuration validation" (updated); task 2.1 |
| Priority | P1 |
| Dimension / level | negative, boundary / UT |
| Automation candidate | Yes |
| Preconditions | None |
| Test data | Malformed variants |
| Expected evidence | Validation error naming the offending field |

```gherkin
Scenario Outline: Malformed settings are rejected with a safe field-scoped error
  Given a settings input with <bad_field>
  When settings are validated
  Then validation fails and names <bad_field> without exposing other values

  Examples:
    | bad_field                                   |
    | iceServers entry missing urls               |
    | dtmf.preferredMethod = "pulse"              |
    | registration.maxRetries = -1                |
    ```

## ATC-106: Liveness is independent; readiness reflects config validity

| Field | Value |
| --- | --- |
| Requirement / risk | runtime-configuration "Health and readiness reporting"; task 2.3 |
| Priority | P1 |
| Dimension / level | functional, negative / IT (API) |
| Automation candidate | Yes |
| Preconditions | Two backend instances: one valid, one misconfigured |
| Test data | Valid env; invalid env (bad `APP_ICE_SERVERS`) |
| Expected evidence | Status codes/bodies for `/health/live` and `/health/ready` |

```gherkin
Scenario: Live-and-configured
  Given a running backend with valid configuration
  When a client calls GET /health/live and GET /health/ready
  Then both succeed

Scenario: Live-but-misconfigured
  Given a running backend with invalid configuration
  When a client calls GET /health/live and GET /health/ready
  Then /health/live succeeds
  And /health/ready fails
  And the readiness failure body contains no secret values
```

## ATC-107: API failures are logged/returned with redaction

| Field | Value |
| --- | --- |
| Requirement / risk | R-SEC-CRED/R-SEC-CFG; task 2.4 |
| Priority | P0 |
| Dimension / level | security, observability / IT (API + log capture) |
| Automation candidate | Yes |
| Preconditions | Log capture enabled; env has SENTINEL markers |
| Test data | A request that triggers a handled error path |
| Expected evidence | Captured logs + error response body |

```gherkin
Scenario: Error handling never leaks secrets or stack internals
  Given the backend hits a handled configuration/API error
  When the error response and logs are captured
  Then neither contains SENTINEL_PW, SENTINEL_X, settings dumps, or raw traceback bodies
  And the client-facing error uses a safe category message
```

## ATC-108: Production static serving, SPA fallback, and security headers

| Field | Value |
| --- | --- |
| Requirement / risk | task 2.5, 6.1; design decision 8 |
| Priority | P1 |
| Dimension / level | functional, security / IT (API) |
| Automation candidate | Yes |
| Preconditions | `APP_FRONTEND_DIST_DIR` points at a built (or fixture) dist |
| Test data | index.html fixture + a known asset + an unknown `/api/*` path |
| Expected evidence | Response bodies, status codes, response headers |

```gherkin
Scenario: One-origin serving with security headers
  Given a production backend serving a built frontend
  When a client requests "/", a hashed asset, an unknown SPA route, and an unknown /api path
  Then "/" and the SPA route return index.html (SPA fallback)
  And the hashed asset returns its content
  And the unknown /api path returns 404 (not the SPA fallback)
  And responses include the designed CSP restricting connect-src to self and the configured WSS endpoint
  And responses include X-Content-Type-Options, Referrer-Policy, and frame-protection headers
```

---

## SIP registration (tasks 3.1-3.5)

## ATC-201: Calling stays disabled until validated config loads; retry recovers

| Field | Value |
| --- | --- |
| Requirement / risk | R-CFG-LOAD; runtime-configuration "Configuration load failure"; task 3.1 |
| Priority | P1 |
| Dimension / level | state, negative / UT (composable with fake fetch) |
| Automation candidate | Yes |
| Preconditions | Fake config client that fails once then succeeds |
| Test data | Failing response, then valid config |
| Expected evidence | Control enabled-state; config state value |

```gherkin
Scenario: Config load failure blocks calling then recovers on retry
  Given the runtime-config fetch fails
  Then registration and calling controls are disabled and a retry action is shown
  When the user retries and config loads successfully
  Then the config state is "ready" and connect becomes available
```

## ATC-202: Password is memory-only and never leaves the client

| Field | Value |
| --- | --- |
| Requirement / risk | R-SEC-CRED; sip-registration "SIP account session input"; task 3.3, 5.2 |
| Priority | P0 |
| Dimension / level | security / UT (SIP adapter with fake SIP port) |
| Automation candidate | Yes |
| Preconditions | Spies on backend client, localStorage/sessionStorage, logger, and built URLs |
| Test data | username "1001", password "SENTINEL_PW" |
| Expected evidence | Spy call arguments; storage contents; captured logs |

```gherkin
Scenario: SIP password never persists or transits to the backend
  Given the user enters username 1001 and password SENTINEL_PW and connects
  When registration is attempted through the fake SIP port
  Then SENTINEL_PW is passed only to the SIP UserAgent auth config
  And SENTINEL_PW does not appear in any backend request, URL, log line, localStorage, or sessionStorage
  When the user disconnects
  Then the stored password reference is cleared from the SIP service instance
```

**Oracle notes:** Also covers the reload scenario indirectly: after teardown the
password reference is null, so a reload starts with no password.

## ATC-203: Address-of-record is parsed, never string-concatenated

| Field | Value |
| --- | --- |
| Requirement / risk | R-XSS/injection; design decision 3; task 3.3, 4.1 |
| Priority | P0 |
| Dimension / level | security, negative / UT |
| Automation candidate | Yes |
| Preconditions | Fake SIP port capturing built URIs |
| Test data | username with control chars `10\r\n01`, domain from config |
| Expected evidence | The URI object handed to the SIP library / rejection |

```gherkin
Scenario: Malicious identity input is rejected by the URI parser
  Given a SIP username containing control characters
  When the adapter builds the address of record
  Then the input is rejected before any registration attempt
  And no raw-concatenated sip: string is produced
```

## ATC-204: Registration lifecycle exposes the six states and blocks duplicates

| Field | Value |
| --- | --- |
| Requirement / risk | R-CALL-DUP (reg side); sip-registration "Observable registration lifecycle"; task 3.2 |
| Priority | P1 |
| Dimension / level | state / UT (reducer/service) |
| Automation candidate | Yes |
| Preconditions | Fake SIP port with controllable transitions |
| Test data | Scripted event sequence |
| Expected evidence | Emitted state sequence; rejected duplicate command |

```gherkin
Scenario: Only legal registration transitions are accepted
  Given the registration state machine
  When events drive disconnected->connecting->registering->registered
  Then each state is emitted in order
  And a second connect command issued while connecting is rejected without changing state
  And every illegal transition in the transition table is rejected
```

## ATC-205: Authentication failure does not auto-retry

| Field | Value |
| --- | --- |
| Requirement / risk | R-RETRY-STORM; sip-registration "Authentication fails"; task 3.4 |
| Priority | P0 |
| Dimension / level | negative, recovery / UT (fake timer) |
| Automation candidate | Yes |
| Preconditions | Fake SIP port returns auth-reject; fake timer |
| Test data | 401/403-equivalent rejection |
| Expected evidence | Retry scheduler call count == 0; state == failed/disconnected |

```gherkin
Scenario: Auth rejection ends in a non-retrying failed state
  Given FreeSWITCH rejects the credentials
  When the adapter processes the rejection
  Then the state becomes disconnected with an authentication-specific error
  And no reconnection attempt is scheduled even after advancing the clock past max backoff
```

## ATC-206: Bounded jittered reconnect recovers, then exhausts to failed

| Field | Value |
| --- | --- |
| Requirement / risk | R-RETRY-STORM; sip-registration "Recover from transient signaling loss"; task 3.4; design decision 4 |
| Priority | P1 |
| Dimension / level | recovery, boundary / UT (fake timer) |
| Automation candidate | Yes |
| Preconditions | Fake timer; configurable maxRetries=3, base=1000, max=15000 |
| Test data | Transport-loss events |
| Expected evidence | Scheduled delay values; final state |

```gherkin
Scenario: Recovery within limit
  Given a registered session and maxRetries=3
  When transport is lost and the 2nd retry succeeds
  Then the session returns to registered
  And scheduled delays before success are within [0, min(base*2^(n-1), max)] for each attempt n

Scenario: Exhaustion beyond limit
  Given a registered session and maxRetries=3
  When all 3 retries fail
  Then the state becomes failed and a manual retry is offered
  And no 4th automatic attempt is scheduled

Scenario: Disconnect cancels pending retries
  Given a retry is pending
  When the user disconnects
  Then the pending retry is canceled before unregister/transport-stop and no further attempt fires
```

## ATC-207: Browser capability / secure-context preflight gates registration

| Field | Value |
| --- | --- |
| Requirement / risk | browser-media "Supported browser context"; task 3.5 |
| Priority | P1 |
| Dimension / level | negative, compatibility / UT + component |
| Automation candidate | Yes |
| Preconditions | Mocked capability probe |
| Test data | 3 variants |
| Expected evidence | Preflight result category; control gating |

```gherkin
Scenario Outline: Preflight distinguishes capability outcomes
  Given the browser environment is <context>
  When preflight runs before registration
  Then the outcome is <result> and calling is <gated>

  Examples:
    | context                         | result             | gated    |
    | missing RTCPeerConnection       | unsupported-api    | disabled |
    | http non-loopback (insecure)    | insecure-context   | disabled |
    | https or loopback with WebRTC   | supported          | enabled  |
```

## ATC-208: Idle disconnect leaves no registration/transport/media resource

| Field | Value |
| --- | --- |
| Requirement / risk | sip-registration "Registration cleanup"; task 3.3, 4.5 |
| Priority | P1 |
| Dimension / level | recovery, state / UT |
| Automation candidate | Yes |
| Preconditions | Registered idle session; spies on transport/media teardown |
| Test data | Disconnect command |
| Expected evidence | Teardown spy calls; final state |

```gherkin
Scenario: Clean disconnect
  Given a registered idle session
  When the user disconnects
  Then unregister is sent, the transport is closed, and no media resource remains
  And the state is disconnected
```

## ATC-209: Unsolicited MWI NOTIFY is accepted with 200

| Field | Value |
| --- | --- |
| Requirement / risk | sip-registration "Unsolicited out-of-dialog NOTIFY"; task 3.6 |
| Priority | P1 |
| Dimension / level | interop, negative / UT |
| Automation candidate | Yes |
| Preconditions | Connected SIP adapter; fake UserAgent delegate |
| Test data | Out-of-dialog NOTIFY (Event message-summary) |
| Expected evidence | accept() called; reject() not called; no NOTIFY body in logs |

```gherkin
Scenario: FreeSWITCH MWI NOTIFY does not produce 481
  Given the user has connected the SIP adapter
  When an out-of-dialog NOTIFY arrives
  Then the adapter accepts it with 200
  And registration and call state are unchanged
  And the NOTIFY body is not logged
```

---

## Audio calling (tasks 4.1-4.6)

## ATC-301: Outgoing call progresses dialing -> ringing -> active with two-way audio

| Field | Value |
| --- | --- |
| Requirement / risk | audio-calling "Place an outgoing audio call"; task 4.2 |
| Priority | P0 |
| Dimension / level | functional, state / UT (fake SIP + fake media) |
| Automation candidate | Yes |
| Preconditions | Registered; fake SIP port that answers |
| Test data | destination "2002" |
| Expected evidence | Emitted call-state sequence; local+remote track presence |

```gherkin
Scenario: Answered outgoing call reaches active
  Given a registered user calls 2002
  When the fake remote answers
  Then call state passes outgoing-dialing -> outgoing-ringing -> active
  And a local audio track is attached and a remote audio stream is present
```

## ATC-302: Invalid destination is rejected before any invitation

| Field | Value |
| --- | --- |
| Requirement / risk | R-XSS; audio-calling "Destination is invalid"; task 4.1 |
| Priority | P0 |
| Dimension / level | negative, boundary / UT |
| Automation candidate | Yes |
| Preconditions | Registered; spy on invite creation |
| Test data | `"20<script>"`, `"2\r\n2"`, empty string, `"sip:@"` |
| Expected evidence | Validation message; invite spy call count == 0 |

```gherkin
Scenario Outline: Disallowed destinations never dial
  Given a registered user
  When the user attempts to call <destination>
  Then no invitation is created
  And a validation message is shown

  Examples:
    | destination |
    | 20<script>  |
    | 2\r\n2      |
    | (empty)     |
    | sip:@       |
```

## ATC-303: SIP failure results map to user-safe categories

| Field | Value |
| --- | --- |
| Requirement / risk | audio-calling "Remote party declines or is unavailable"; task 4.1 |
| Priority | P1 |
| Dimension / level | negative, integration-contract / UT |
| Automation candidate | Yes |
| Preconditions | Fake SIP port emitting each failure code |
| Test data | busy, declined, not-found, unavailable, certificate, generic |
| Expected evidence | Mapped category; absence of raw protocol text in UI state |

```gherkin
Scenario Outline: Failure mapping without raw protocol leakage
  Given an outgoing call
  When FreeSWITCH returns <sip_result>
  Then the call ends with user-facing reason <category>
  And no raw SIP status line or header appears in the exposed state

  Examples:
    | sip_result           | category      |
    | 486 Busy Here        | busy          |
    | 603 Decline          | declined      |
    | 404 Not Found        | not-found     |
    | 480 Unavailable      | unavailable   |
    | TLS cert error       | certificate   |
    | 500 Server Error     | generic       |
```

## ATC-304: Incoming call presents sanitized identity; answer reaches active

| Field | Value |
| --- | --- |
| Requirement / risk | R-XSS; audio-calling "Receive an incoming audio call" + "Incoming identity contains markup"; task 4.2, 5.3 |
| Priority | P0 |
| Dimension / level | functional, security / component (Vue) |
| Automation candidate | Yes |
| Preconditions | Registered idle; fake inbound invitation |
| Test data | display name `<img src=x onerror=alert(1)>` |
| Expected evidence | Rendered DOM text; call state after answer |

```gherkin
Scenario: Malicious caller name renders as inert text
  Given a registered idle user receives an invitation with a markup display name
  Then the incoming card shows the name as plain text (no <img> element is created in the DOM)
  When the user answers
  Then the call becomes active with two-way audio
```

**Oracle notes:** Assert the DOM contains the literal string and contains no
injected element node — not merely that it "looks escaped".

## ATC-305: Reject an incoming call acquires no media

| Field | Value |
| --- | --- |
| Requirement / risk | browser-media "Incoming call is rejected"; audio-calling "User rejects"; task 4.3 |
| Priority | P1 |
| Dimension / level | negative / UT (fake media) |
| Automation candidate | Yes |
| Preconditions | Inbound invitation; spy on getUserMedia |
| Test data | Reject command |
| Expected evidence | getUserMedia call count == 0; state -> idle |

```gherkin
Scenario: Rejecting does not touch the microphone
  Given an incoming invitation while idle
  When the user rejects it
  Then getUserMedia is never called
  And the invitation is declined and state returns to idle
```

## ATC-306: One-call-at-a-time guard (second outgoing + incoming-while-busy)

| Field | Value |
| --- | --- |
| Requirement / risk | R-CALL-DUP; audio-calling "Enforce one call at a time"; task 4.2 |
| Priority | P0 |
| Dimension / level | state, concurrency / UT |
| Automation candidate | Yes |
| Preconditions | One active/pending call; single authoritative session ref |
| Test data | second call to "3003"; inbound invitation while busy |
| Expected evidence | Original session identifier unchanged; new invite rejected busy |

```gherkin
Scenario: Second outgoing call is blocked
  Given an active call session S1
  When the user starts a second outgoing call
  Then the attempt is blocked and S1's session identifier is unchanged

Scenario: Incoming while busy is rejected as busy
  Given an active call session S1
  When a new invitation arrives
  Then it is rejected as busy and S1 remains the authoritative session
```

## ATC-307: Deterministic termination for cancel, hangup, and mid-call failure

| Field | Value |
| --- | --- |
| Requirement / risk | audio-calling "Deterministic call lifecycle and termination"; task 4.2 |
| Priority | P0 |
| Dimension / level | state, recovery / UT |
| Automation candidate | Yes |
| Preconditions | Fake SIP + fake media; spies on media cleanup |
| Test data | 3 termination triggers |
| Expected evidence | Final state idle; end reason recorded; media released |

```gherkin
Scenario Outline: Every non-idle call returns to idle with media released
  Given a call in state <start_state>
  When <termination> occurs
  Then call media is stopped, a user-oriented end reason is recorded, and state returns to idle without page reload

  Examples:
    | start_state      | termination                 |
    | outgoing-ringing | user cancels before answer  |
    | active           | remote party hangs up       |
    | active           | signaling/negotiation fails |
```

## ATC-308: Stale session events are ignored

| Field | Value |
| --- | --- |
| Requirement / risk | design decision 4 (stale-session identifiers); task 3.2, 4.2 |
| Priority | P1 |
| Dimension / level | concurrency, state / UT |
| Automation candidate | Yes |
| Preconditions | Fake SIP port that can emit an event for a superseded session id |
| Test data | Event tagged with an old session identifier |
| Expected evidence | No state change from stale event |

```gherkin
Scenario: Out-of-order event from a superseded session is dropped
  Given a new call session S2 replaced ended session S1
  When a late "active" event tagged S1 arrives
  Then it is ignored and S2's state is unchanged
```

## ATC-309: DTMF sends only valid digits via the configured method, with fallback

| Field | Value |
| --- | --- |
| Requirement / risk | R-DTMF; audio-calling "User sends DTMF" + "Control unavailable outside active call"; task 4.6; design decision 5 |
| Priority | P1 |
| Dimension / level | functional, negative, integration-contract / UT |
| Automation candidate | Yes |
| Preconditions | Active call; fake SIP port recording DTMF mechanism used |
| Test data | valid `0-9 * #`; invalid `A`, `+`, space; dtmf.preferredMethod variants |
| Expected evidence | Recorded mechanism + digit; rejection of invalid; disabled when idle |

```gherkin
Scenario: Valid digit uses the configured RTP method
  Given an active call with dtmf.preferredMethod="rtp" and negotiated telephone-event
  When the user sends "5"
  Then the RTP (RFC 4733) mechanism receives digit "5"

Scenario: RTP-to-INFO fallback when telephone-event is not negotiated
  Given dtmf.preferredMethod="rtp" but the negotiated media lacks telephone-event
  When the user sends "5"
  Then the SIP INFO mechanism receives "5" and a fallback event is recorded

Scenario: Invalid digit and idle gating
  Given an active call
  When the user attempts "A"
  Then no DTMF is sent
  And when no call is active, mute and DTMF controls are disabled
```

---

## Browser media (tasks 4.3-4.5)

## ATC-401: Audio-only, just-in-time microphone acquisition

| Field | Value |
| --- | --- |
| Requirement / risk | browser-media "Audio-only local media"; task 4.3 |
| Priority | P1 |
| Dimension / level | functional / UT (fake media) |
| Automation candidate | Yes |
| Preconditions | Spy on getUserMedia constraints |
| Test data | Registration event; then an outgoing call |
| Expected evidence | getUserMedia constraints and call timing |

```gherkin
Scenario: Microphone requested only at call time, audio only
  Given the user has just registered
  Then getUserMedia has not been called
  When the user starts an outgoing call
  Then getUserMedia is called with audio:true and video:false (no camera request)
```

## ATC-402: Microphone permission/device failures block activation with distinct categories

| Field | Value |
| --- | --- |
| Requirement / risk | R-MEDIA-LEAK; browser-media "Microphone permission and device failures"; task 4.3 |
| Priority | P0 |
| Dimension / level | negative, recovery / UT |
| Automation candidate | Yes |
| Preconditions | Fake media rejects with each error type |
| Test data | NotAllowedError, NotFoundError, generic error |
| Expected evidence | Category; call not active; no live tracks |

```gherkin
Scenario Outline: Media acquisition failure prevents an active call
  Given the user starts/answers a call
  When getUserMedia fails with <error>
  Then the call does not become active and the user sees <category>
  And no local media track remains live

  Examples:
    | error           | category            |
    | NotAllowedError | permission-denied   |
    | NotFoundError   | missing-device      |
    | generic error   | acquisition-failed  |
```

## ATC-403: Remote audio autoplay success and blocked-playback recovery

| Field | Value |
| --- | --- |
| Requirement / risk | R-AUTOPLAY; browser-media "Remote audio playback"; task 4.4, 5.1 |
| Priority | P1 |
| Dimension / level | functional, recovery / UT + component |
| Automation candidate | Yes |
| Preconditions | Fake audio element whose play() resolves or rejects |
| Test data | resolving play(); rejecting play() |
| Expected evidence | Attachment; enable-audio action presence; call stays active |

```gherkin
Scenario: Autoplay permitted
  Given an active call and play() resolves
  Then the remote stream is attached and audible with no extra action

Scenario: Autoplay blocked
  Given an active call and play() rejects
  Then the call remains active
  And an "Enable audio" gesture is presented that starts playback when invoked
```

## ATC-404: Idempotent media cleanup on normal, failed, and disposed paths

| Field | Value |
| --- | --- |
| Requirement / risk | R-MEDIA-LEAK; browser-media "Media resource cleanup"; task 4.5 |
| Priority | P0 |
| Dimension / level | recovery, state / UT |
| Automation candidate | Yes |
| Preconditions | Spy counting track.stop() and detach calls |
| Test data | normal end; negotiation failure after acquisition; component dispose |
| Expected evidence | stop() called exactly once per track; remote detached; mute reset |

```gherkin
Scenario Outline: Every terminal path releases media exactly once
  Given a call that acquired local media
  When <path> occurs (and cleanup is invoked again redundantly)
  Then each local track is stopped exactly once
  And remote media is detached and mute state is reset

  Examples:
    | path                         |
    | normal call end             |
    | negotiation failure         |
    | component disposal          |
```

## ATC-405: Mute reflects actual track state

| Field | Value |
| --- | --- |
| Requirement / risk | audio-calling "User toggles mute"; task 4.5 |
| Priority | P1 |
| Dimension / level | state / UT |
| Automation candidate | Yes |
| Preconditions | Active call with local audio track |
| Test data | mute then unmute |
| Expected evidence | track.enabled value; displayed mute state |

```gherkin
Scenario: Mute toggles and verifies before UI update
  Given an active call with a local audio track
  When the user mutes
  Then the track is disabled and the UI shows muted only after the track state is confirmed
  When the user unmutes
  Then the track is enabled and the UI shows unmuted
```

---

## UI, build, and interoperability (tasks 5.x, 6.x)

## ATC-451: Call-console control gating follows finite states

| Field | Value |
| --- | --- |
| Requirement / risk | R-CFG-LOAD/R-CALL-DUP; task 5.1-5.3 |
| Priority | P1 |
| Dimension / level | state / component (Vue) |
| Automation candidate | Yes |
| Preconditions | Mounted console with injected fake services |
| Test data | Each registration/call state |
| Expected evidence | Enabled/disabled controls and status text per state |

```gherkin
Scenario Outline: Controls derive from finite state, never raw SIP objects
  Given the console is in <state>
  Then <enabled_controls> are enabled and others disabled
  And no raw SIP response or exception string appears in the template

  Examples:
    | state             | enabled_controls          |
    | config-failed     | retry-config              |
    | disconnected      | connect                   |
    | registered idle   | dial                      |
    | incoming-ringing  | answer, reject            |
    | active            | mute, dtmf, hangup        |
```

## ATC-452: Accessibility and responsive smoke (keyboard/focus/announcements)

| Field | Value |
| --- | --- |
| Requirement / risk | task 5.4 |
| Priority | P2 |
| Dimension / level | accessibility, compatibility / E2E (Playwright, mocked signaling/media) |
| Automation candidate | Partial - manual confirmation of screen-reader semantics |
| Preconditions | Playwright with fake signaling/media |
| Test data | Keyboard-only navigation across primary controls |
| Expected evidence | Focus order, visible focus, aria status region updates |

```gherkin
Scenario: Core flow is keyboard operable
  Given the app is loaded with mocked signaling and media
  When the user navigates and operates connect/dial with keyboard only
  Then focus is visible and ordered, and status changes are announced via a live region
  And the layout remains usable at a narrow viewport
```

## ATC-453: Production build serves SPA + config + health from one origin

| Field | Value |
| --- | --- |
| Requirement / risk | task 6.1; ATC-108 (integrated) |
| Priority | P1 |
| Dimension / level | integration / IT (build + API) |
| Automation candidate | Yes |
| Preconditions | Real `vite build` output consumed by FastAPI |
| Test data | Built dist |
| Expected evidence | 200s from `/`, `/api/config`, `/health/*` on one origin |

```gherkin
Scenario: Same-origin production serving
  Given the frontend is built and FastAPI serves it
  When a browser loads the app and it fetches /api/config and /health/ready
  Then all are served from the same origin without CORS errors
```

## ATC-454: Browser smoke suite runs offline with fakes

| Field | Value |
| --- | --- |
| Requirement / risk | task 6.2 |
| Priority | P1 |
| Dimension / level | E2E (Playwright, fakes) |
| Automation candidate | Yes |
| Preconditions | No network access; fake signaling/media |
| Test data | Scripted startup/register/outgoing/incoming/autoplay/disconnect |
| Expected evidence | Suite passes with zero real network calls or credentials |

```gherkin
Scenario: Offline end-to-end UI smoke
  Given fake signaling and media and no network access
  When the suite runs startup, register, outgoing call, incoming call, autoplay recovery, and disconnect
  Then all steps pass and no real credential or network call occurs
```

## ATC-455: Interop harness skips safely and never prints secrets when unset

| Field | Value |
| --- | --- |
| Requirement / risk | R-INTEROP/R-SEC-CRED; task 6.4 |
| Priority | P1 |
| Dimension / level | security, integration / IT (harness self-check) |
| Automation candidate | Yes |
| Preconditions | Interop env vars unset |
| Test data | Empty protected-env inputs |
| Expected evidence | Skip status; no credential/header/SDP in output |

```gherkin
Scenario: Interop harness is safe when unconfigured
  Given the interop extension/endpoint env vars are unset
  When the harness runs
  Then it skips with a clear "not configured" status
  And it prints no credentials, Authorization headers, or SDP
```

## ATC-460: Real FreeSWITCH interoperability checklist (opt-in, manual/gated)

| Field | Value |
| --- | --- |
| Requirement / risk | R-INTEROP; task 6.3, 6.4, 7.3 |
| Priority | P0 (for production release) / NOT RUN in inner loop |
| Dimension / level | integration, compatibility, security / IT-real (operator FreeSWITCH) |
| Automation candidate | Partial - some steps require human observation of audio |
| Preconditions | Non-production WebRTC FreeSWITCH; two test extensions; WSS cert; credentials only from protected env (A4) |
| Test data | Two operator-supplied extensions |
| Expected evidence | Pass/fail per step with NO credentials/headers/SDP recorded |

```gherkin
Scenario: Two-user real interoperability
  Given two test extensions registered against an operator FreeSWITCH over WSS
  When they perform registration, outgoing and incoming calls, cancel, reject, hangup, mute, DTMF, a forced reconnect, and an untrusted-certificate attempt
  Then registration succeeds for both
  And bidirectional audio is confirmed on connected calls
  And cancel/reject/hangup return both endpoints to idle
  And mute stops transmitted audio and DTMF is received by the peer/IVR
  And reconnect restores registration within the retry budget
  And the untrusted-certificate attempt is refused with secure-connection guidance
  And evidence contains no credentials, Authorization headers, or SDP
```

**Oracle notes:** This is the release-gating interop case. It CANNOT run in the
greenfield inner loop; status stays `NOT RUN` until an operator FreeSWITCH and
approved baseline exist. Do not mark PASS from unit fakes.

---

## Traceability Matrix

| Requirement / risk | Priority | ATC / check | Verification mechanism | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| runtime-config: browser-safe config | P0 | ATC-101 | IT (API) | QA | DRAFT |
| R-SEC-CFG: no secret leak in config | P0 | ATC-102 | IT (API) | QA | DRAFT |
| runtime-config: ICE transport creds only | P1 | ATC-103 | IT (API) | QA | DRAFT |
| R-SEC-WSS: production WSS enforcement | P0 | ATC-104 | UT | QA | DRAFT |
| runtime-config: validation (ICE/DTMF/retry) | P1 | ATC-105 | UT | QA | DRAFT |
| runtime-config: health/readiness | P1 | ATC-106 | IT (API) | QA | DRAFT |
| R-SEC-CRED: redacted API errors | P0 | ATC-107 | IT (API+logs) | QA | DRAFT |
| static serving + security headers | P1 | ATC-108, ATC-453 | IT | QA | DRAFT |
| R-CFG-LOAD: gate calling on config | P1 | ATC-201 | UT | QA | DRAFT |
| R-SEC-CRED: memory-only password | P0 | ATC-202 | UT | QA | DRAFT |
| R-XSS/injection: parsed AOR | P0 | ATC-203 | UT | QA | DRAFT |
| reg lifecycle + duplicate guard | P1 | ATC-204 | UT | QA | DRAFT |
| R-RETRY-STORM: no auth retry | P0 | ATC-205 | UT | QA | DRAFT |
| reg recovery: bounded backoff | P1 | ATC-206 | UT | QA | DRAFT |
| supported browser context | P1 | ATC-207 | UT+component | QA | DRAFT |
| registration cleanup | P1 | ATC-208 | UT | QA | DRAFT |
| unsolicited MWI NOTIFY 200 | P1 | ATC-209 | UT | QA | DRAFT |
| outgoing call happy path | P0 | ATC-301, ATC-460 | UT + IT-real | QA | DRAFT |
| R-XSS/invalid destination | P0 | ATC-302 | UT | QA | DRAFT |
| SIP failure categories | P1 | ATC-303 | UT | QA | DRAFT |
| R-XSS/incoming identity + answer | P0 | ATC-304 | component | QA | DRAFT |
| reject acquires no media | P1 | ATC-305 | UT | QA | DRAFT |
| R-CALL-DUP: one call at a time | P0 | ATC-306 | UT | QA | DRAFT |
| deterministic termination | P0 | ATC-307, ATC-460 | UT + IT-real | QA | DRAFT |
| stale-event handling | P1 | ATC-308 | UT | QA | DRAFT |
| R-DTMF: valid digits + fallback | P1 | ATC-309, ATC-460 | UT + IT-real | QA | DRAFT |
| audio-only JIT mic | P1 | ATC-401 | UT | QA | DRAFT |
| R-MEDIA-LEAK: mic failure blocks call | P0 | ATC-402 | UT | QA | DRAFT |
| R-AUTOPLAY: remote playback recovery | P1 | ATC-403 | UT+component | QA | DRAFT |
| R-MEDIA-LEAK: idempotent cleanup | P0 | ATC-404, ATC-460 | UT + IT-real | QA | DRAFT |
| mute reflects track state | P1 | ATC-405 | UT | QA | DRAFT |
| UI control gating | P1 | ATC-451 | component | QA | DRAFT |
| accessibility/responsive | P2 | ATC-452 | E2E (partial) | QA | DRAFT |
| offline browser smoke | P1 | ATC-454 | E2E | QA | DRAFT |
| R-INTEROP/R-SEC-CRED: harness safe-skip | P1 | ATC-455 | IT | QA | DRAFT |
| R-INTEROP: real FreeSWITCH interop | P0 | ATC-460 | IT-real | QA | NOT RUN |

### Coverage notes and gaps

- Every P0 risk maps to at least one deterministic inner-loop case; the two
  release-gating P0s that need a real PBX (call happy path, termination, DTMF,
  media leak) are additionally bound to ATC-460 and stay `NOT RUN` until an
  operator environment and approved baseline exist.
- Dimensions marked `N/A` for this MVP: **performance/stress** (no NFR budget in
  the test basis — `NEEDS DECISION` if one is later required); **migration**
  (change creates no persistent data or schema, per proposal Impact).
- `partial` automation on ATC-452 and ATC-460 requires a named human reviewer at
  execution time (screen-reader semantics; audible-audio confirmation).
