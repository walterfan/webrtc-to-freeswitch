## Context

The call console is a single centered column (`max-width: 52rem`). SIP.js owns the WebSocket transport; Vue must not import SIP.js types. Application logs already forbid raw SIP, Authorization headers, and SDP. See `proposal.md` for why the pane exists.

## Goals / Non-Goals

**Goals:**
- Intercept every transport-level SIP message after `UserAgent.start()`.
- Keep capture, filter, sort, and retention out of Vue; the pane only renders a domain list.
- Show full raw text in the UI (operator chose an unredacted diagnostic dump) while never logging or persisting it.

**Non-Goals:**
- Parsing SIP into a structured protocol tree, export/download, or server-side storage.
- Subscribing to MWI or other event packages.
- Changing `/api/config` or FreeSWITCH.

## Decisions

1. **Tap `userAgent.transport` after start, not a custom Transport subclass.**  
   Wrap `transport.send` and chain `transport.onMessage` so REGISTER, responses, NOTIFY, and in-dialog messages are all visible. A custom Transport would couple upgrades more tightly. Method-level delegates (`onInvite` / `onNotify`) miss most traffic.

2. **Emit a plain `onSipMessage` event on the SIP port.**  
   Shape: `{ id, direction: "send" | "receive", at, raw }`. UI and the trace service stay free of SIP.js types. The fake SIP port can emit the same event in tests.

3. **In-memory `SipTraceService` owns the ring buffer (200), sort, filter, and Clear.**  
   Default order is newest-first. Filter `Header: value` matches the first `:` split: header name compared case-insensitively, value as a case-insensitive substring of that header's line value. Disconnect does not clear the buffer.

4. **Two-column layout: existing console left, trace pane right.**  
   Widen the page shell (~90rem). A keyboard-focusable vertical divider changes the left column width by mouse drag or Left/Right arrows, bounded so both panes remain usable. The pane is sticky with an independently scrolling list. Below a narrow breakpoint the pane stacks under the console and the divider is hidden.

5. **Unredacted UI, redacted telemetry.**  
   The expanded view shows the raw string via text interpolation (`<pre>`). The adapter MUST NOT pass `raw` to the existing logger.

## Risks / Trade-offs

- [Authorization appears on screen] → Memory-only, no persistence, no logs, no backend copy; Clear and reload drop it. This is an explicit operator choice for local debugging.
- [Wrapping `onMessage` could drop SIP.js delivery if the original callback is replaced later] → Attach after `start()`, keep a reference to the previous `onMessage`, and call it first.
- [A busy call can produce many messages] → Hard cap of 200, drop oldest.

## Migration Plan

1. Ship with the pane always visible; no config flag.
2. Rollback is a frontend revert; no stored data and no server migration.

## Open Questions

None.
