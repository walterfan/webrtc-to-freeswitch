## 1. Media Contracts and State

- [x] 1.1 Add the `audio`/`video` media-mode type and current-session video metadata to the call state, preserving existing lifecycle transitions; verify reducer tests cover outgoing video start, audio-only fallback, reset, and stale-session events.
- [x] 1.2 Extend the SIP and media ports plus their fakes for mode-aware invites and normalized local/remote streams; verify TypeScript typecheck passes and fake-based tests can assert constraints without importing SIP.js types outside the adapter.

## 2. Single-Stream Media Integration

- [x] 2.1 Route SIP.js session media creation through the browser-media adapter and pass `{ audio: true, video: false }` or `{ audio: true, video: true }` as session-description-handler constraints; verify adapter tests prove one acquisition per call and no INVITE on acquisition failure.
- [x] 2.2 Emit session-tagged local and remote streams, including late remote tracks, from the SIP adapter without parsing SDP; verify adapter tests cover audio/video tracks and ignore or remove listeners during termination.
- [x] 2.3 Add local-preview attachment, separate remote audio/video attachment, mode-specific media errors, and idempotent release/detach behavior to the browser-media adapter; verify unit tests cover permission denial, missing camera, blocked audio playback, track stopping, and repeated cleanup.

## 3. Call Service and User Interface

- [x] 3.1 Make `CallService` initiate the selected media mode, attach only current-session streams, preserve audio controls, report audio-only negotiation, and clean up every failure/end path; verify service tests cover audio, video, stale media, fallback, and cleanup.
- [x] 3.2 Add explicit `Audio call` and `Video call` actions plus accessible local-preview, remote-video, and unavailable-video presentation to the call console; verify component tests cover action enablement, stage visibility, fallback status, and unchanged incoming/audio-call behavior.
- [x] 3.3 Add the minimal responsive video-stage styling with remote video primary and local preview inset/stacked; verify the fake-signaling browser smoke test shows usable layouts at desktop and narrow viewport sizes.

## 4. Documentation and Verification

- [x] 4.1 Update the README and interoperability checklist with browser permission behavior, FreeSWITCH video-codec prerequisites, audio-only fallback, cleanup checks, and the opt-in two-party video procedure; verify no endpoint or credential is committed.
- [x] 4.2 Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run test:e2e` in `frontend/`, then run `openspec validate add-video-calling --strict`; verify every command passes before marking the change implemented.
