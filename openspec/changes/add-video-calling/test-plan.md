# Test Plan: Outbound Video Calling

## Document Control

| Field | Value |
| --- | --- |
| Plan ID / version | TP-VIDEO-001 / v0.1 |
| Target release/build | Not yet available; implementation tasks are unchecked |
| Test basis | `proposal.md`, `design.md`, `specs/video-calling/spec.md`, and `tasks.md` under `openspec/changes/add-video-calling/`; current repository commit `1a65409b0a2976d9e9627ac0da449a15f1939112`; existing draft audio acceptance catalog under `openspec/changes/build-webrtc-freeswitch-client/acceptance-cases.md` |
| Owner / reviewers | Baseline approver: project owner (human); execution: QA/engineering after approval; real interop: authorized FreeSWITCH operator |
| Baseline state | AWAITING APPROVAL |
| Mode | `full`; execution is BLOCKED at the approval gate |

## Scope and Objectives

- **Objective:** Determine whether the browser can start one outbound audio/video call through FreeSWITCH without weakening audio calling, single-session safety, privacy, accessibility, or deterministic media cleanup.
- **In scope:** Audio/video dial choice, exact media constraints, one-stream acquisition, local preview, remote video plus existing audio playback, audio-only negotiation, camera/media errors, stale events, call exclusivity, camera-track ending, cleanup, responsive/accessibility behavior, architecture boundaries, and opt-in FreeSWITCH interoperability.
- **Out of scope:** Incoming video, camera selection, fixed resolution/frame-rate targets, mid-call video enable/disable or renegotiation, screen sharing, recording, conferencing, multiple calls, backend/API changes, FreeSWITCH provisioning, load testing, and production deployment.

## Facts, Assumptions, and Open Decisions

| Type | Item | Impact / owner |
| --- | --- | --- |
| Fact | Video is outbound only and includes audio; incoming calls remain audio-only. | New proposal/spec/design |
| Fact | A video call that negotiates no usable remote video remains active as audio-only and exposes that status. | `video-calling` spec |
| Fact | The implementation must use one local stream for SIP negotiation, preview, mute, and cleanup; SIP.js remains confined to one adapter. | Design decisions 2-3 |
| Fact | No backend, `/api/config`, dependency, credential, or persistent-data change is planned. | Proposal impact and design non-goals |
| Fact | Real FreeSWITCH access is opt-in and requires explicit approval plus operator-supplied protected credentials. | `AGENTS.md`, existing ATC-460, `docs/interop-checklist.md` |
| Assumption | A usable video track has `kind="video"` and has not ended; absence of such a track when the session becomes active yields `unavailable`, and a later current-session `addtrack` event may change it to `available`. | Must be accepted with this baseline or revised in the design |
| Assumption | “No SDP/raw SIP leak” means no new error text, telemetry, persistence, test evidence, or backend transmission; the existing explicit in-memory SIP trace remains unchanged and may display protocol bodies to its operator. | Human privacy/security approval required |
| Open decision | Supported browser and version matrix for release acceptance is not defined. | Project owner must define before ATC-515 execution |
| Open decision | Non-production FreeSWITCH target, enabled video codecs, video-capable peer, audio-only peer/route, and authorized test accounts are not available. | Operator must supply before ATC-514 execution |
| Open decision | Exploratory session time box and participating browser/device combinations are not assigned. | QA owner before exploratory execution |
| Source tension | `README.md` and `AGENTS.md` describe video as out of the current audio release, while this new change adds it. | Expected pre-implementation drift; task 4.1 must update those documents before release |
| Source tension | The repository rule forbids logging SDP/raw SIP, while the existing trace feature permits operator-visible, memory-only raw display. | ATC-513 treats persistence/telemetry/evidence as forbidden and existing explicit UI display as allowed pending baseline approval |

## HLD Testability Assessment

| Area | Observable contract | Testability / gap |
| --- | --- | --- |
| Actor and entry | Registered, idle browser user chooses `Audio call` or `Video call` for a valid destination. | Deterministic with component/E2E fakes. |
| Data flow | Mode → fixed constraints → one application-owned stream → SIP.js offer → tagged local/remote stream events → audio/video elements. | Deterministic at port/adapter boundaries; real negotiation requires ATC-514. |
| State | Existing lifecycle remains idle, dialing/ringing, active, terminating, ended; mode and remote-video status are session metadata. | Reducer and service event sequences are observable. |
| Invariants | At most one call; one acquisition per call; no stale stream replacement; no camera retained after terminal paths. | Deterministic counters, stream identity, session IDs, and track state. |
| Failure/recovery | Permission/missing-device/general errors prevent INVITE; no-video answer falls back to audio; ended camera track does not end audio; cleanup is idempotent. | Deterministic with fakes; hardware/browser behavior needs compatibility run. |
| Security/privacy | No recording, persistence, backend media, raw exception text, or new protocol telemetry. | Code/architecture checks plus UI/storage/log assertions; existing trace policy requires human acceptance. |
| Compatibility | Browser ↔ SIP.js 0.21.2 ↔ FreeSWITCH codecs/ICE/DTLS-SRTP. | Browser matrix and lab configuration are NEEDS DECISION. |
| Performance | No latency, frame rate, resolution, CPU, or bandwidth target exists. | No release threshold can be asserted; observe qualitatively only. |

## Risk Assessment

| Risk ID | Failure impact | Likelihood | Priority | Mitigation / test focus |
| --- | --- | --- | --- | --- |
| R-V-STREAM | Preview differs from transmitted media or the browser opens devices twice. | Medium | P0 | Assert one acquisition and identical stream/track identity at adapter boundaries. |
| R-V-LEAK | Camera/microphone remains live after cancel, failure, hangup, remote end, or disposal. | Medium | P0 | Terminal-path cleanup matrix and idempotency evidence. |
| R-V-AUDIO-REGRESSION | Existing outgoing/incoming audio behavior or autoplay recovery breaks. | Medium | P0 | Preserve existing ATC-301/304/401/403/404 plus focused regression case. |
| R-V-CALL-DUP | A second video/audio or incoming call replaces the authoritative session. | Low | P0 | Mixed-mode one-call guard and session-ID assertions. |
| R-V-PRIVACY | Video/device data, raw failures, SDP, or credentials enter logs, persistence, backend, or retained evidence. | Low | P0 | Architecture review, sentinel checks, storage/log assertions, evidence hygiene. |
| R-V-INTEROP | Browser offer succeeds in fakes but real FreeSWITCH codec/ICE handling fails. | High | P0 | Mandatory opt-in real interoperability acceptance before release. |
| R-V-PERMISSION | Camera denial/missing device still sends INVITE or gives an unsafe/vague error. | Medium | P1 | Error-class matrix; assert INVITE count zero and all tracks stopped. |
| R-V-FALLBACK | Audio-only answer incorrectly ends the call or falsely claims video. | Medium | P1 | No-video and late-video-track scenarios. |
| R-V-STALE | Late media from an old session replaces current video or status. | Low | P1 | Tagged-event ordering cases. |
| R-V-AUDIO-SINK | Mixed streams cause duplicate audio or lose autoplay recovery. | Medium | P1 | Separate audio/video element assertions and blocked-play recovery. |
| R-V-TRACK-END | Camera track ends mid-call and leaves stale preview/status or terminates audio. | Medium | P1 | Track-ended recovery case. |
| R-V-A11Y | Users cannot distinguish/operate call modes or receive fallback/error status. | Medium | P1 | Keyboard, accessible-name, live-region, and narrow-layout checks. |
| R-V-ARCH | SIP.js types leak into UI/state, backend contract changes, or dependencies grow unnecessarily. | Low | P1 | Typecheck, dependency/diff review, and architecture fitness checks. |
| R-V-COMPAT | Behavior differs across supported browsers/devices. | Medium | P1 | Execute approved compatibility matrix; currently BLOCKED pending decision. |

## Coverage Applicability

| Dimension | Applicable? | Rationale / target |
| --- | --- | --- |
| Functional | Yes | Audio/video choice, preview, remote video, fallback, controls. |
| Boundary/equivalence | Yes | Audio vs video, zero/one video track, valid/invalid device results. |
| State/sequence | Yes | Dial, establish, late track, terminate, reset, repeated cleanup. |
| Negative/error | Yes | Permission, missing device, generic acquisition, negotiation failure. |
| Integration | Yes | Media adapter ↔ SIP.js and real browser ↔ FreeSWITCH boundaries. |
| Concurrency | Yes | Logical event races and one authoritative session; no load concurrency. |
| Recovery/resilience | Yes | Audio-only degradation, ended track, autoplay recovery, cleanup. |
| Compatibility/migration | Yes | Existing audio behavior, supported browsers, frontend-only rollback. |
| Security/privacy | Yes | Camera lifetime, no recording/persistence/backend transmission, safe evidence. |
| Accessibility | Yes | Named controls/media, keyboard path, live status, responsive presentation. |
| Performance/stress | No release gate | Single-session feature and no requirement-backed numeric target; qualitative observation only. |
| Observability | Yes | User-safe mode, unavailable-video, and failure status without new sensitive telemetry. |

## Test Approach

| Layer/type | Scope | Method / real command | Evidence |
| --- | --- | --- | --- |
| Maintainability | Formatting, lint, TypeScript contracts | `make frontend-lint`; `make frontend-typecheck` | Complete command output tied to target commit |
| Architecture Fitness | OpenSpec validity, SIP.js boundary, one stream, unchanged backend/config/dependencies, privacy invariants | `openspec validate add-video-calling --strict`; focused diff/import/storage/log review; automated adapter assertions | Validation output, review checklist, focused test output |
| Behavior | Reducer, adapters, service, component, fake-browser flows | `make frontend-test` after implementation | Vitest and Playwright output; failure traces/screenshots only when they contain no secrets/protocol bodies |
| Regression | Existing audio calling and media lifecycle | Existing automated suite plus ATC-511 and referenced base ATCs | Test output and mapped case results |
| Specialized | Accessibility/responsive | Playwright keyboard/narrow viewport plus human visual/live-region review | Screenshots/notes without faces, credentials, or raw SIP |
| Specialized | Real interoperability | Approved non-production browser/FreeSWITCH run using protected `INTEROP_*` data and updated checklist | Sanitized checklist, browser version, codec names, call/result timestamps; no credentials, Authorization, SDP, or participant media capture |

## Environment and Test Data

- **Inner-loop environment:** Node.js 20 LTS, repository-locked frontend packages including SIP.js 0.21.2, Vitest/jsdom, and Playwright against the local Vite server with fake signaling/media.
- **Real environment:** Secure browser context, approved browser/version, camera and microphone, trusted WSS certificate, configured ICE path, non-production FreeSWITCH, two protected test extensions, and a consenting video-capable peer. An audio-only peer or route is also required for fallback validation.
- **Target build/configuration:** Record commit SHA and dirty/clean state at execution. Current video target is unavailable.
- **Deterministic test data:** Destination `1002`; modes `audio` and `video`; stream/track fixtures with stable IDs (`local-audio`, `local-video`, `remote-audio`, `remote-video`); session IDs `S1` and `S2`; `NotAllowedError`, `NotFoundError`, and generic media error; resolved/rejected audio `play()`.
- **Cleanup:** Stop every fake/real local track, hang up test calls, detach media elements, clear in-memory trace if used, and close the browser. Do not retain participant media.
- **Controls:** Fake SIP/media ports and explicit event delivery for inner-loop cases; no timing sleeps; record browser/device/codec context for real runs.
- **Safety boundaries:** No production FreeSWITCH, deployment, real credentials, packet capture, raw SIP/SDP export, or external participant call without explicit approval. Protected secrets never enter files, screenshots, command output, or CI.
- **Evidence retention:** Store command output and sanitized case notes with target SHA. Retain Playwright traces only for fake sessions and inspect them for sentinel credentials before sharing.

## Entry, Exit, and Interruption Rules

- **Entry criteria:** Human-approved baseline; identifiable implemented target; OpenSpec artifacts still current; video tasks complete; inner-loop dependencies installed; fake tests available; browser matrix chosen; explicit operator approval and lab data for ATC-514.
- **Exit criteria:** All P0/P1 ATCs and referenced existing audio acceptance checks pass; maintainability, architecture, and behavior gates pass; required browser matrix and real FreeSWITCH interoperability pass; no unresolved P0/P1 defect, blocker, or unapproved waiver remains.
- **Suspend when:** Baseline/design drifts; target is unidentified; media permissions or hardware make observations invalid; test lab is unsafe/unavailable; credentials/protocol data appear in evidence; a P0 failure makes later results unreliable.
- **Resume when:** Human approves the revised baseline, a new target SHA is recorded, environment preflight passes, sensitive evidence is removed safely, and the owning engineer/operator confirms the blocking condition is resolved.

## Cases and Traceability

See `acceptance-cases.md`. Case IDs and expected outcomes become frozen only after explicit human approval. Execution status is currently BLOCKED; no case has run against a video implementation.

## Responsibilities and Schedule

| Activity | Owner | Dependency / timing |
| --- | --- | --- |
| Baseline approval | Project owner / designated QA reviewer | Review TP-VIDEO-001 and ATC-501…ATC-515 |
| Automated execution | QA/engineering | Approved baseline and implemented target |
| Real interop execution | Authorized operator plus QA observer | Approved lab, browser matrix, protected accounts |
| Defect triage | Engineering owner plus QA | On any FAIL; oracle remains frozen |
| Waiver approval | Human release owner | P2/P3 only, owned and time-bounded; never P0/P1 failures |
| Release verdict | QA recommendation, human decision | Complete evidence and verdict rules |

## Exploratory Charter

- **Mission:** Discover video/media lifecycle failures not covered by deterministic checks, especially permission transitions, device removal, late tracks, layout changes, background/foreground behavior, network degradation, and repeated audio↔video calls.
- **Areas/data/personas:** Approved browsers and camera/microphone combinations; privacy-conscious user; keyboard-only user; constrained network; video-capable and audio-only destinations; repeated session sequences without reload.
- **Time box:** NEEDS DECISION by QA owner before execution.
- **Start condition:** Deterministic P0/P1 inner-loop checks are green and the test environment is authorized.
- **Evidence:** Sanitized session notes, browser/device metadata, timestamps, and defect IDs; no faces, recorded media, credentials, Authorization headers, or SDP.
- **Regression rule:** A confirmed defect becomes a proposed ATC and baseline revision only after human review.

## Approval Gate

- **Baseline:** AWAITING APPROVAL.
- **Execution:** BLOCKED by missing approval, implementation target, browser matrix, and real interop environment.
- **Release verdict:** Not issued. Passing known checks later will not prove the absence of unknown defects.
