## Why

Operators debugging FreeSWITCH registration and calls currently have to capture SIP on the server. The browser client already sees every sent and received signaling message; exposing that stream in a local trace pane makes REGISTER, INVITE, and MWI NOTIFY failures inspectable without extra tools.

## What Changes

- Add a right-hand SIP message pane beside the existing call console and widen the page so both columns fit.
- Capture every SIP message the client sends or receives on the WebSocket transport.
- List messages newest-first by default, with a toggle to oldest-first, send/receive icons, scrolling, header/value filtering, click-to-expand, and an explicit Clear action.
- Keep the captured raw text in memory only (including `Authorization`); never persist it, never send it to the backend, and never write it to application logs.

## Capabilities

### New Capabilities

- `sip-message-trace`: Display an in-memory, filterable list of SIP messages the browser client sends and receives.

### Modified Capabilities

None.

## Impact

- Frontend SIP adapter, SIP port events, a small in-memory trace service, and the call-console layout/styles.
- No backend, `/api/config`, or FreeSWITCH configuration changes.
- No new runtime dependencies.
