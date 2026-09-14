## Why

The project needs a browser-based reference client that can register with an existing FreeSWITCH server and make or receive secure WebRTC audio calls without requiring a native softphone. Establishing a small, observable audio-first foundation now also creates a clean path to add video later without coupling the user interface directly to SIP.js internals.

## What Changes

- Add a Vue 3 and TypeScript single-page calling interface built with Vite.
- Add SIP-over-secure-WebSocket registration to FreeSWITCH through SIP.js, including explicit connection and registration states, retry behavior, and actionable errors.
- Add single-session audio call handling for outgoing calls and incoming calls, with answer, reject, cancel, hang up, mute, and DTMF controls.
- Add microphone permission handling and remote-audio playback with clear user feedback when browser media or autoplay policies block a call.
- Add a small FastAPI service, managed with `uv`, that supplies validated non-secret runtime configuration and exposes health/readiness information; SIP passwords remain client-supplied and memory-only.
- Add local-development configuration, automated tests, and operator documentation for connecting the app to an existing WebRTC-ready FreeSWITCH deployment.
- Keep video, transfer, hold, conferencing, call history, recording, PSTN provisioning, and FreeSWITCH server provisioning outside the initial scope while preserving an extensible media/session boundary.

## Capabilities

### New Capabilities

- `runtime-configuration`: Deliver validated browser-safe SIP/WebRTC runtime settings and backend health/readiness status without exposing SIP credentials.
- `sip-registration`: Configure a SIP identity, connect to FreeSWITCH over WSS, register and unregister, and expose recoverable lifecycle states and failures.
- `audio-calling`: Make and receive one WebRTC audio call at a time and provide the core in-call controls and deterministic call-state behavior.
- `browser-media`: Acquire and release microphone media, attach remote audio, report permission/playback failures, and keep the media abstraction ready for a future video extension.

### Modified Capabilities

None.

## Impact

- Introduces a frontend workspace using Vue 3, TypeScript, Vite, and SIP.js.
- Introduces a Python FastAPI service and `uv`-managed dependency/test workflow.
- Establishes browser-to-FreeSWITCH dependencies on HTTPS/WSS, a trusted signaling certificate, SIP user credentials, ICE negotiation, and DTLS-SRTP-compatible FreeSWITCH media configuration.
- Adds browser, unit, backend API, and integration testing surfaces plus environment and FreeSWITCH interoperability documentation.
- Does not change or provision the target FreeSWITCH instance, dialplan, users, gateways, certificates, DNS, TURN infrastructure, or PSTN routes.
