# Acceptance Case Catalog: Outbound Video Calling

**Plan:** TP-VIDEO-001 v0.1  
**Baseline state:** AWAITING APPROVAL  
**Execution state:** BLOCKED — no approved baseline or implemented video target  
**Status vocabulary:** PASS, FAIL, BLOCKED, NOT RUN, N/A; no case below has been executed.

## ATC-501: Registered user selects audio or video call explicitly

| Field | Value |
| --- | --- |
| Requirement / risk | video-calling “Select an outbound call media mode”; R-V-AUDIO-REGRESSION |
| Priority | P0 |
| Dimension / level | functional, state / component + E2E-fake |
| Automation candidate | Yes — fake signaling exposes deterministic mode/constraints |
| Preconditions | Valid runtime config; registered and idle browser client |
| Test data | Destination `1002`; modes `audio`, `video` |
| Expected evidence | Accessible button state; recorded invite mode and constraints; call-state sequence |

```gherkin
Scenario: Video call action requests audio and video
  Given the user is registered and idle with destination 1002
  When the user activates "Video call"
  Then one outgoing session starts for 1002
  And its media constraints are exactly audio:true and video:true
  And the call follows the existing outgoing dialing and ringing lifecycle

Scenario: Audio call action remains audio-only
  Given the user is registered and idle with destination 1002
  When the user activates "Audio call"
  Then one outgoing session starts for 1002
  And its media constraints are exactly audio:true and video:false
  And no local video preview is shown

Scenario: Dial actions are gated outside registered-idle state
  Given the client is disconnected, registering, or already in a call
  Then both outbound dial actions are disabled or rejected
  And no new session replaces the current session
```

**Oracle notes:** This case preserves the existing call lifecycle; media mode is session metadata, not a second state machine.

## ATC-502: Preview and SIP negotiation share one acquired stream

| Field | Value |
| --- | --- |
| Requirement / risk | video-calling “Present local video”; design decisions 1-3; R-V-STREAM |
| Priority | P0 |
| Dimension / level | architecture fitness, privacy, integration-contract / UT |
| Automation candidate | Yes — inject one stream with stable track IDs |
| Preconditions | Media factory spy; local stream contains `local-audio` and `local-video` tracks |
| Test data | One video dial to `1002` |
| Expected evidence | Acquisition count `1`; exact stream/track identity at SIP and preview seams |

```gherkin
Scenario: One local stream is acquired and reused
  Given getUserMedia will return stream L with audio track local-audio and video track local-video
  When the user starts a video call
  Then getUserMedia is called exactly once with audio:true and video:true
  And SIP.js session media receives stream L
  And the muted local preview receives stream L
  And no second application-owned local stream exists
```

**Oracle notes:** Equal constraints are insufficient; the evidence must prove object or track identity so a second hidden acquisition cannot pass.

## ATC-503: Camera acquisition failures prevent INVITE and release media

| Field | Value |
| --- | --- |
| Requirement / risk | video-calling “Handle camera acquisition failures”; R-V-PERMISSION, R-V-LEAK |
| Priority | P1 |
| Dimension / level | negative, recovery, boundary / UT + component |
| Automation candidate | Yes — reject the media factory with named browser errors |
| Preconditions | Registered idle client; invite spy starts at zero |
| Test data | `NotAllowedError`, `NotFoundError`, generic `Error` |
| Expected evidence | Invite count `0`; error category/message; zero live owned tracks; idle/retryable state |

```gherkin
Scenario Outline: Required camera media fails before signaling
  Given a registered idle user starts a video call
  When media acquisition fails with <error>
  Then no SIP INVITE is sent
  And no application-owned media track remains live
  And the client permits a later call attempt
  And the interface reports <outcome> without raw exception, SIP, or SDP text

  Examples:
    | error           | outcome                                      |
    | NotAllowedError | camera/microphone permission guidance         |
    | NotFoundError   | missing camera/device guidance                 |
    | generic Error   | general camera/microphone acquisition failure  |
```

## ATC-504: Active video call presents remote video and one audible stream

| Field | Value |
| --- | --- |
| Requirement / risk | video-calling “Present negotiated remote video”; R-V-AUDIO-SINK |
| Priority | P0 |
| Dimension / level | functional, integration-contract / component + E2E-fake |
| Automation candidate | Yes — emit a tagged mixed remote stream |
| Preconditions | Current outgoing video session `S1`; remote stream has one live audio and one live video track; audio `play()` resolves |
| Test data | Tracks `remote-audio`, `remote-video` |
| Expected evidence | Active state; visible remote video; audio element playback; muted video element with no audio track |

```gherkin
Scenario: Negotiated audio and video are presented without duplicate sound
  Given video session S1 is current and becomes active
  When S1 emits a remote stream containing remote-audio and remote-video
  Then the remote video element displays remote-video
  And the dedicated audio element plays remote-audio
  And the video presentation is muted and contains no audible audio track
  And the call remains active with the existing mute, DTMF, and hang-up controls
```

## ATC-505: Audio-only answer degrades visibly and accepts a late current video track

| Field | Value |
| --- | --- |
| Requirement / risk | video-calling “Peer accepts audio only”; design decision 3; R-V-FALLBACK |
| Priority | P1 |
| Dimension / level | recovery, state, boundary / UT + component |
| Automation candidate | Yes — control established/addtrack events |
| Preconditions | Current outgoing video session `S1` with local camera active |
| Test data | Initial remote stream with audio only; later `remote-video` track for S1 |
| Expected evidence | Status transitions `waiting` → `unavailable` → `available`; call remains active |

```gherkin
Scenario: Destination negotiates audio only
  Given video session S1 becomes active with a live remote audio track and no live remote video track
  Then S1 remains active with remote audio
  And the interface announces that remote video is unavailable
  And it does not show a stale or blank video frame as available

Scenario: Initial remote video track arrives after establishment
  Given active video session S1 currently reports remote video unavailable
  When a live video track tagged S1 is added
  Then the remote video status becomes available
  And the remote video element displays that track without starting a second session
```

**Oracle notes:** This baseline assumes a live current-session track may revise the initial unavailable status; no renegotiation is performed.

## ATC-506: Mixed audio/video attempts still enforce one authoritative call

| Field | Value |
| --- | --- |
| Requirement / risk | video-calling “Another call is already in progress”; existing audio-calling one-call invariant; R-V-CALL-DUP |
| Priority | P0 |
| Dimension / level | concurrency, state / UT + component |
| Automation candidate | Yes — fake SIP port records session and rejection |
| Preconditions | Pending or active session `S1` |
| Test data | Second audio call, second video call, incoming invitation |
| Expected evidence | Session ID remains `S1`; no second local acquisition; incoming invite rejected busy |

```gherkin
Scenario Outline: A second outgoing mode cannot replace the current session
  Given <first_mode> session S1 is pending or active
  When the user attempts a new <second_mode> call
  Then the attempt is blocked
  And S1 remains authoritative
  And no additional local media stream is acquired

  Examples:
    | first_mode | second_mode |
    | audio      | video       |
    | video      | audio       |
    | video      | video       |

Scenario: Incoming invitation while video call is busy
  Given video session S1 is pending or active
  When an incoming invitation arrives
  Then the new invitation is rejected busy
  And S1 and its media presentation remain unchanged
```

## ATC-507: Media from a stale session cannot replace the current presentation

| Field | Value |
| --- | --- |
| Requirement / risk | video-calling “Stale session emits media”; R-V-STALE |
| Priority | P1 |
| Dimension / level | concurrency, state / UT |
| Automation candidate | Yes — deliver events in controlled order |
| Preconditions | Session `S1` ended; session `S2` is current |
| Test data | Late local stream, remote audio stream, and remote video track tagged `S1` |
| Expected evidence | S2 state and element `srcObject` identities remain unchanged |

```gherkin
Scenario: Late media events from S1 are ignored
  Given ended session S1 has been replaced by current session S2
  When S1 emits late local or remote media events
  Then S2 call state and video status are unchanged
  And no media element replaces its S2 source with an S1 stream or track
```

## ATC-508: Every video terminal path releases media idempotently

| Field | Value |
| --- | --- |
| Requirement / risk | video-calling “Clean up video resources”; R-V-LEAK |
| Priority | P0 |
| Dimension / level | recovery, state, privacy / UT + component |
| Automation candidate | Yes — track stop/detach counters and final DOM/state |
| Preconditions | Video call has acquired local audio/video and may have attached remote video/audio |
| Test data | Cancel, acquisition/negotiation failure, local hangup, remote termination, component disposal, repeated cleanup |
| Expected evidence | Every owned track ended; all `srcObject` values null; video status reset; no double-stop failure |

```gherkin
Scenario Outline: Terminal path returns to idle with no retained media
  Given a video call has acquired application-owned audio and video tracks
  When <termination> occurs
  Then every owned local track is stopped
  And local preview, remote video, and remote audio elements are detached
  And video mode/status and mute state are reset before the next call
  And the client can start another call without reload

  Examples:
    | termination                                      |
    | user cancels before answer                       |
    | signaling or negotiation fails                   |
    | local user hangs up                              |
    | remote party terminates                          |
    | component is disposed                            |
    | termination and disposal both request cleanup   |
```

**Oracle notes:** Repeated cleanup must be safe; each owned track reaches `ended` and no media object remains attached. An exception or retained live track is FAIL.

## ATC-509: Video-track ending does not destroy viable audio

| Field | Value |
| --- | --- |
| Requirement / risk | Design risk “video track ends during the call”; R-V-TRACK-END |
| Priority | P1 |
| Dimension / level | recovery, state / UT + manual browser check |
| Automation candidate | Partial — track events automate; physical camera removal is manual per browser |
| Preconditions | Active video call with live two-way audio and video |
| Test data | End local video track; end remote video track |
| Expected evidence | Audio/call state remains active; affected video becomes unavailable; no frozen source retained |

```gherkin
Scenario Outline: Video loss degrades without ending audio
  Given an active call has working two-way audio and video
  When the <side> video track ends
  Then the call remains active with two-way audio
  And the affected video presentation reports unavailable
  And no ended track is presented as live video

  Examples:
    | side   |
    | local  |
    | remote |
```

## ATC-510: Existing audio and incoming-call behavior remains unchanged

| Field | Value |
| --- | --- |
| Requirement / risk | Proposal compatibility promise; R-V-AUDIO-REGRESSION; base ATC-301, ATC-304, ATC-305, ATC-401, ATC-403, ATC-404 |
| Priority | P0 |
| Dimension / level | regression, compatibility / automated suite + component |
| Automation candidate | Yes — existing tests and fakes |
| Preconditions | Video implementation enabled; registered client |
| Test data | Outgoing audio to `1002`; incoming audio from `1003`; autoplay resolve/reject |
| Expected evidence | Existing ATCs remain passing; camera acquisition count zero; video stage absent |

```gherkin
Scenario: Outgoing audio call never requests camera
  Given the registered user starts an audio call to 1002
  Then media constraints are exactly audio:true and video:false
  And no camera track or video stage is created
  And the established call retains mute, DTMF, autoplay recovery, and hang-up behavior

Scenario: Incoming call remains audio-only
  Given the registered idle user receives and answers an incoming invitation from 1003
  Then only microphone audio is requested
  And no local or remote video presentation is shown
  And reject still acquires no media
```

## ATC-511: Remote audio autoplay recovery survives video presentation

| Field | Value |
| --- | --- |
| Requirement / risk | video-calling remote-video requirement plus base browser-media playback; R-V-AUDIO-SINK |
| Priority | P1 |
| Dimension / level | recovery, integration / UT + component |
| Automation candidate | Yes — fake `play()` resolve/reject |
| Preconditions | Current active video call with remote audio/video |
| Test data | Dedicated audio element `play()` rejects once, then resolves on gesture |
| Expected evidence | Call/video stay active; one enable-audio action; audio begins after gesture; video never emits audio |

```gherkin
Scenario: Browser blocks remote audio while video remains available
  Given an active video call has remote audio and video tracks
  When automatic audio playback is rejected
  Then the call remains active and remote video remains visible
  And one "Enable audio" action is presented
  When the user activates it and playback succeeds
  Then remote audio is audible through the dedicated audio element only
```

## ATC-512: Video flow is keyboard-operable, announced, and responsive

| Field | Value |
| --- | --- |
| Requirement / risk | Design decision 5; R-V-A11Y |
| Priority | P1 |
| Dimension / level | accessibility, compatibility / E2E-fake + human review |
| Automation candidate | Partial — keyboard, roles, labels, and overflow automate; visual semantics need review |
| Preconditions | Fake-signaling browser; wide and `375x720` viewports |
| Test data | Keyboard-only registration and video dial; audio-only fallback event |
| Expected evidence | Focus/action assertions, accessible names, live-region update, screenshots without sensitive media, no horizontal overflow |

```gherkin
Scenario: Keyboard-only user starts a video call
  Given the app is usable without a pointing device
  When the user tabs to the destination and activates "Video call" with the keyboard
  Then the call starts and focus remains in a predictable interactive flow
  And local and remote video elements have distinct accessible labels

Scenario: Audio-only fallback is announced
  Given an active requested video call
  When no remote video is negotiated
  Then the unavailable-video status is exposed through an existing live status region

Scenario: Narrow layout remains usable
  Given a 375x720 viewport with remote and local video presentation
  Then primary controls remain visible and keyboard reachable
  And the page has no unintended horizontal overflow
  And remote and local video do not obscure call termination controls
```

## ATC-513: Video adds no sensitive persistence, protocol telemetry, backend contract, or library leak

| Field | Value |
| --- | --- |
| Requirement / risk | Proposal impact; design non-goals/decisions 3 and 6; R-V-PRIVACY, R-V-ARCH |
| Priority | P0 |
| Dimension / level | security/privacy, architecture fitness / automated checks + review |
| Automation candidate | Partial — imports/storage/log assertions automate; final focused diff review is human |
| Preconditions | Implemented target diff against approved base; sentinel device/error/protocol strings |
| Test data | Sentinels `SENTINEL_DEVICE`, `SENTINEL_MEDIA_ERROR`, `v=0`, `a=fingerprint:` |
| Expected evidence | Focused diff/import scan; storage/log/backend assertions; unchanged dependency and `/api/config` shape |

```gherkin
Scenario: Video media remains ephemeral and frontend-only
  Given a video call starts and ends
  Then no local or remote media is recorded or persisted
  And no device label, raw media exception, credential, SDP, or raw SIP body is sent to the backend or telemetry logger
  And no video field is added to /api/config

Scenario: Architecture boundaries remain intact
  Given the implemented change
  Then SIP.js imports and types remain confined to the SIP adapter
  And UI and state consume only application port/domain types
  And package dependencies are unchanged

Scenario: Existing diagnostic trace policy is not silently expanded
  Given the existing operator-visible in-memory SIP trace remains enabled
  Then the video change adds no new persistence, export, backend copy, or telemetry path for trace or SDP data
  And acceptance evidence contains no raw protocol body
```

**Oracle notes:** The existing explicitly operator-visible in-memory trace is outside the “no new telemetry” assertion and remains subject to human approval of TP-VIDEO-001’s privacy assumption.

## ATC-514: Real FreeSWITCH outbound video interoperability (opt-in)

| Field | Value |
| --- | --- |
| Requirement / risk | End-to-end video-calling capability; R-V-INTEROP, R-V-LEAK, R-V-FALLBACK |
| Priority | P0 |
| Dimension / level | integration, compatibility, recovery / IT-real manual-gated |
| Automation candidate | Partial — preflight/safe skip automate; media judgment requires consenting lab participants/operator |
| Preconditions | Explicit approval; non-production FreeSWITCH; trusted WSS; ICE path; compatible enabled video codec; protected users A/B; consenting video-capable peer; audio-only peer/route; no production data |
| Test data | Operator-supplied protected `INTEROP_*` values; non-sensitive test image/scene; no recorded participant media |
| Expected evidence | Sanitized checklist tied to target SHA/browser/FreeSWITCH config revision; observed two-way A/V and cleanup; no credentials, Authorization, SDP, or captured media |

```gherkin
Scenario: Browser A starts a real video call through FreeSWITCH
  Given users A and B are registered over trusted WSS in the approved lab
  And FreeSWITCH and B share at least one configured WebRTC video codec
  When A starts a video call to B and B answers
  Then both parties have two-way audio
  And A displays live remote video and its muted local preview
  And the operator confirms expected video is received at B
  When either party hangs up
  Then A returns idle and its camera and microphone indicators turn off

Scenario: Real destination accepts audio but no video
  Given A calls the approved audio-only peer or route using "Video call"
  When the destination answers with audio and no usable video
  Then A remains in an active audio call
  And A reports remote video unavailable
  And hangup releases A's camera and microphone
```

**Oracle notes:** This case cannot be replaced by mocks. It remains BLOCKED until the baseline, lab, accounts, browser, and operator action are explicitly approved.

## ATC-515: Approved browser matrix produces equivalent video behavior

| Field | Value |
| --- | --- |
| Requirement / risk | Supported browser context plus video-calling capability; R-V-COMPAT |
| Priority | P1 |
| Dimension / level | compatibility, functional / E2E-real per approved matrix |
| Automation candidate | Partial — matrix automation depends on camera/media support; real-device checks may be manual |
| Preconditions | Human-approved browser/version/OS matrix; secure context; supported camera/microphone; authorized lab or deterministic virtual devices |
| Test data | Same video-capable and audio-only destinations for every matrix entry |
| Expected evidence | Per-entry result for ATC-501, 503, 504, 505, 508, 511, and 512; environment metadata |

```gherkin
Scenario Outline: Supported browser meets the same acceptance contract
  Given <browser_version> on <operating_system> is in the approved support matrix
  When the video happy path, permission denial, audio-only fallback, autoplay recovery, and cleanup checks run
  Then every required P0/P1 oracle has the same outcome defined in this catalog
  And any browser-specific limitation is recorded as a baseline decision rather than silently accepted
```

**Oracle notes:** The examples table is intentionally absent until the project owner defines the supported matrix; inventing browser/version claims would create false precision.

## Traceability Matrix

| Requirement / risk | Priority | ATC / check | Verification mechanism | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| Select outbound media mode | P0 | ATC-501, ATC-506, ATC-510, ATC-514 | Component/E2E-fake + IT-real | QA/operator | DRAFT |
| Present local video using call stream | P0 | ATC-502, ATC-508, ATC-514 | UT + component + IT-real | QA/operator | DRAFT |
| Handle camera failures before INVITE | P1 | ATC-503 | UT + component | QA | DRAFT |
| Present negotiated remote video | P0 | ATC-504, ATC-505, ATC-507, ATC-511, ATC-514, ATC-515 | Component/E2E + IT-real | QA/operator | DRAFT |
| Clean up video resources | P0 | ATC-508, ATC-509, ATC-514 | UT + component + IT-real | QA/operator | DRAFT |
| R-V-STREAM: duplicate/mismatched stream | P0 | ATC-502 | Adapter/service UT | QA | DRAFT |
| R-V-LEAK: retained camera/microphone | P0 | ATC-503, ATC-508, ATC-514 | UT + component + IT-real | QA/operator | DRAFT |
| R-V-AUDIO-REGRESSION | P0 | ATC-501, ATC-510; base ATC-301/304/305/401/403/404 | Existing suite + component | QA | DRAFT |
| R-V-CALL-DUP | P0 | ATC-506; base ATC-306 | Service/component UT | QA | DRAFT |
| R-V-PRIVACY | P0 | ATC-513, ATC-514 evidence review | Automated sentinel checks + human review | Security/QA | DRAFT |
| R-V-INTEROP | P0 | ATC-514 | IT-real manual-gated | Operator/QA | DRAFT |
| R-V-PERMISSION | P1 | ATC-503 | UT + component | QA | DRAFT |
| R-V-FALLBACK | P1 | ATC-505, ATC-514 | Component + IT-real | QA/operator | DRAFT |
| R-V-STALE | P1 | ATC-507 | Service/component UT | QA | DRAFT |
| R-V-AUDIO-SINK | P1 | ATC-504, ATC-511 | Media/component UT | QA | DRAFT |
| R-V-TRACK-END | P1 | ATC-509 | UT + manual device check | QA | DRAFT |
| R-V-A11Y | P1 | ATC-512 | E2E-fake + human review | QA/accessibility reviewer | DRAFT |
| R-V-ARCH | P1 | ATC-502, ATC-513; `npm run typecheck`; `openspec validate add-video-calling --strict` | UT + static checks + review | Engineering/QA | DRAFT |
| R-V-COMPAT | P1 | ATC-515 | Approved browser matrix | QA | DRAFT; NEEDS DECISION |
| Maintainability gate | P1 | `make frontend-lint`, `make frontend-typecheck` | Existing repo entrypoints | Engineering | NOT RUN |
| Behavior gate | P0 | `make frontend-test` | Existing repo entrypoint | Engineering/QA | NOT RUN |
| OpenSpec consistency | P1 | `openspec validate add-video-calling --strict` | Existing spec command | Engineering/QA | DRAFT |

## Approval Notes

- Human approval freezes ATC-501 through ATC-515 and their expected outcomes at TP-VIDEO-001 v0.1.
- Approval must explicitly accept or revise the usable-track and in-memory SIP-trace assumptions in `test-plan.md`.
- Browser matrix and real-lab details may be supplied after baseline approval, but ATC-514 and ATC-515 remain BLOCKED until they are available; they cannot be waived for a PASS verdict.
- No execution or release verdict is authorized by this draft.
