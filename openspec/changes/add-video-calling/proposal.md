## Why

The browser client can currently start only audio calls, so users cannot use a camera when calling video-capable destinations through FreeSWITCH. The existing media-profile boundary was intentionally designed for this extension and can now support an outbound audio/video option without changing registration or backend configuration.

## What Changes

- Add a distinct action for starting an outbound video call while preserving the existing audio-call action.
- Acquire microphone and camera media just in time for a video call, show the local camera preview, and negotiate audio and video through the existing SIP.js session.
- Render negotiated remote video while continuing to use the existing remote-audio playback and recovery behavior.
- Report camera permission, missing-device, and video-negotiation outcomes without leaking SDP or raw SIP data.
- Release local camera tracks and detach video elements on every call completion or failure.
- Keep the existing single-session state machine and in-call audio controls; a video call whose peer accepts only audio remains active as an audio-only call with a visible status.
- Keep incoming-video handling, camera switching, video enable/disable renegotiation, screen sharing, conferencing, and multiple simultaneous calls outside this change.

## Capabilities

### New Capabilities

- `video-calling`: Start one outbound audio/video call through FreeSWITCH, present local and remote video safely, handle video-specific failures and audio-only negotiation, and clean up camera resources.

### Modified Capabilities

None.

## Impact

- Affects the frontend call console, call service, browser-media port and adapter, SIP adapter session options and remote-track extraction, fakes, and frontend tests.
- Reuses the installed SIP.js and native browser MediaStream APIs; no new dependency is required.
- Does not change the FastAPI backend, `/api/config` contract, SIP credential handling, registration state machine, or FreeSWITCH provisioning.
- Requires the target FreeSWITCH profile, dialplan, and destination to support a mutually compatible WebRTC video codec; real interoperability remains operator-supplied and opt-in.
