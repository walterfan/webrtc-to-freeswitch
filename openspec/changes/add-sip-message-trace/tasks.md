## 1. Capture and retention

- [x] 1.1 Add the `onSipMessage` port event and wire `createSipEventHub` plus `FakeSipPort`; verify hub/fake tests emit `{ id, direction, at, raw }` without SIP.js types.
- [x] 1.2 Implement `SipTraceService` (cap 200, default desc sort, `Header: value` filter, Clear, survive disconnect); verify unit tests cover sort, filter, cap, and clear.
- [x] 1.3 Tap SIP.js `transport.send` and `transport.onMessage` after `UserAgent.start()` and emit `onSipMessage` without logging raw SIP; verify adapter tests cover send, receive, and no raw text in logs.

## 2. Call-console pane

- [x] 2.1 Widen the page into a two-column layout with a scrollable right-hand SIP pane (stack on narrow viewports); verify styles keep the existing console usable.
- [x] 2.2 Render the list with green send / red receive icons, one-line start-line summaries, click-to-expand full raw text, sort toggle, filter input, and Clear; verify component tests cover those interactions and text-not-HTML rendering.
- [x] 2.3 Subscribe the console to the trace service from `createAppServices`; verify disconnect leaves messages and Clear empties the pane.
- [x] 2.4 Add a bounded draggable and keyboard-adjustable pane divider; verify wide-layout resizing and narrow-layout stacking in browser tests.
- [x] 2.5 Add an Export control beside Clear that downloads the currently displayed SIP messages as Markdown in display order; verify formatter and pane download tests.
