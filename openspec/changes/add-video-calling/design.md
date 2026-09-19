## Context

See `proposal.md` for motivation and `specs/video-calling/spec.md` for observable behavior. The frontend currently exposes one call lifecycle, uses `{ audio: true, video: false }`, renders remote audio through a dedicated element, and keeps SIP.js inside `SipJsAdapter`. `CallService` acquires microphone media before `SipJsAdapter` asks SIP.js to create its session media, so extending that pattern directly could open the camera twice or preview a stream different from the one transmitted.

The change must preserve the current one-session state machine, existing audio calls, memory-only credentials, direct browser-to-FreeSWITCH signaling/media path, and exact `/api/config` contract. Video codec, ICE, and DTLS-SRTP negotiation remain between the browser, SIP.js, and the operator-managed FreeSWITCH deployment.

## Goals / Non-Goals

**Goals:**

- Use one local `MediaStream` per call for SIP negotiation, local preview, mute, and cleanup.
- Add outbound audio/video calling without changing lifecycle states or coupling Vue to SIP.js.
- Treat absence of negotiated remote video as an explicit audio-only outcome, not a failed call.
- Keep media acquisition errors and stale media events deterministic and testable through the existing ports and fakes.

**Non-Goals:**

- Renegotiating media after the initial offer, including camera on/off or audio-to-video upgrades.
- Accepting incoming video offers, selecting cameras, constraining resolution/frame rate, screen sharing, or recording.
- SDP munging or application-level codec preference; operators configure compatible FreeSWITCH video codecs.
- Adding backend media handling, configuration fields, dependencies, or a second call state machine.

## Decisions

### 1. Represent the initial media choice as a small application type

Add `MediaMode = "audio" | "video"` and derive constraints in one place:

- audio: `{ audio: true, video: false }`
- video: `{ audio: true, video: true }`

Pass the mode from the call console to `CallService.dial`, then through `SipPort.invite`. Store the mode plus local- and remote-video statuses (`not-applicable`, `waiting`, `available`, or `unavailable`) as metadata on the current call state. The existing call lifecycle states remain unchanged.

Boolean arguments were rejected because `dial(destination, true)` is unclear at call sites. A configurable media-profile object, device IDs, and quality presets were rejected because this change has only two fixed modes and no device-selection requirement.

### 2. Let SIP.js request one stream through the browser-media adapter

Construct the SIP.js session-description-handler factory with a media-stream factory backed by `BrowserMediaAdapter.acquire(constraints)`. `SipJsAdapter.invite` supplies the selected constraints in `sessionDescriptionHandlerOptions`; incoming answers continue to supply audio-only constraints. Remove the separate preflight microphone acquisition from `CallService` so SIP.js uses the same application-owned stream that the media adapter retains for preview, mute, and cleanup.

SIP.js creates the offer before sending the INVITE, so a rejected media-stream factory prevents the invitation from being sent. `CallService` still owns failure cleanup, and `BrowserMediaAdapter.release()` remains idempotent for overlapping SIP termination and component disposal.

Allowing SIP.js and `CallService` to call `getUserMedia` separately was rejected because it can prompt twice, select different devices, and retain an untransmitted stream. Manually adding tracks to `RTCPeerConnection` was rejected because SIP.js already owns sender and SDP lifecycle.

### 3. Expose streams, never SIP.js media objects, across the adapter boundary

Extend normalized SIP events so the current session can receive its local and remote `MediaStream` values. `SipJsAdapter` reads the public session-description-handler `localMediaStream` and `remoteMediaStream`, emits them with the generated session ID, and observes remote `addtrack` events so late video tracks update the same session. No SIP.js type crosses the port.

`CallService` ignores a media event unless its session ID is current. It updates remote-video status from usable video tracks and delegates DOM attachment to the media port. The adapter does not parse or rewrite SDP to detect video.

Passing `RTCPeerConnection`, senders, receivers, or session-description-handler instances to Vue was rejected because it would break the existing library boundary. Reading SDP was rejected because track presence is the user-visible result and avoids exposing protocol data in feature diagnostics.

### 4. Keep remote audio and video presentation separate

Add two video elements to the call console:

- a muted, inline, autoplay local preview using the transmitted local stream;
- a muted, inline, autoplay remote video element using only the remote video tracks.

Continue routing remote audio tracks through the existing audio element so there is one audible sink and one existing “Enable audio” recovery path. The media adapter attaches derived audio-only and video-only streams, clears all element `srcObject` values during cleanup, and hides the video stage for audio calls. For a video call with no negotiated remote video, the stage shows a plain status while the audio call continues.

Using one unmuted remote video element for both media kinds was rejected because it would duplicate or replace the established audio playback/autoplay handling. A canvas renderer was rejected because native video elements are sufficient and would add copying and privacy-sensitive capture surface.

### 5. Add two explicit dial actions and no mid-call video controls

Keep the existing destination input and replace its ambiguous Call action with `Audio call` and `Video call` actions governed by the same registration, destination, and idle checks. During a video call, render remote video as the primary surface and local preview as a smaller inset on wide screens and a stacked preview on narrow screens. Existing mute, DTMF, cancel, and hang-up actions remain shared.

Buttons retain visible text, video elements receive accessible labels, and the audio-only fallback is announced through the existing live status region. A pre-call preview and camera picker were rejected because they add persistent camera use and new state without being required to start a video call.

### 6. Reuse existing media error categories with mode-specific messages

Continue mapping browser `NotAllowedError`, `NotFoundError`, and other acquisition failures to `permission`, `missing-device`, and `media`. Format the user message using the requested mode so a video call names camera/microphone access while an audio call preserves its microphone wording. Do not add raw exception text, SDP, device labels, or new protocol logging.

A separate video error hierarchy was rejected because browser acquisition failures already share stable categories and the mode supplies the missing context.

### 7. Verify behavior at current seams plus one real interoperability run

Update the fake media and SIP ports to record media mode/constraints and emit local or remote streams. Unit tests cover the two dial modes, one acquisition per call, camera failures before INVITE, audio-only negotiation, stale stream rejection, and idempotent cleanup. Component tests cover action availability, video-stage visibility, local preview, remote video, and fallback status. The existing browser smoke mode remains fake-based.

Run an opt-in real call against operator-supplied FreeSWITCH extensions to verify compatible video codec configuration, two-way audio/video, audio-only fallback, ICE behavior, and camera release. No credentials or real endpoint enter the repository or CI.

## Risks / Trade-offs

- [FreeSWITCH or the destination rejects every offered video codec] → Keep the accepted audio session active, show remote video as unavailable, and document compatible codec configuration in the interoperability checklist.
- [Browser camera permission succeeds but the video track ends during the call] → Observe track state, mark remote/local video unavailable as applicable, and keep audio active; full renegotiation is outside scope.
- [Attaching one mixed stream to multiple elements duplicates audio] → Build audio-only and video-only presentation streams and keep video elements muted.
- [Media callbacks arrive after termination] → Tag every stream event with the session ID and ignore non-current sessions; cleanup remains idempotent.
- [Video increases bandwidth and exposes more ICE/codec interoperability failures] → Reuse configured ICE servers, avoid fixed quality constraints, and require an opt-in real FreeSWITCH check before broad rollout.
- [The existing in-memory SIP trace can display SDP by design] → Add no video-specific logging or persistence and retain the trace feature's existing explicit operator-visible policy.

## Migration Plan

1. Extend ports, fakes, and call-state metadata while keeping audio as the default behavior.
2. Route SIP.js media creation through the browser-media adapter and verify existing audio unit/component tests before enabling video UI.
3. Add the two dial actions and video presentation, then run frontend lint, typecheck, unit tests, and browser smoke tests.
4. Run the opt-in interoperability checklist against a non-production FreeSWITCH endpoint with compatible video codecs before production exposure.
5. Roll back by reverting the frontend change; there is no backend, persistent-data, configuration, or FreeSWITCH schema migration.
