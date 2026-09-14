## Purpose

Show operators an in-memory, filterable list of SIP messages the browser client sends and receives so they can debug signaling without a server-side capture.

## ADDED Requirements

### Requirement: Right-hand SIP message pane
The system SHALL present a scrollable SIP message pane to the right of the call console on viewports wide enough for two columns, and SHALL stack the pane below the console on narrow viewports.

#### Scenario: Wide layout
- **WHEN** the page is shown on a viewport wide enough for two columns
- **THEN** the call console remains on the left and the SIP message pane is on the right

#### Scenario: Narrow layout
- **WHEN** the page is shown on a narrow viewport
- **THEN** the SIP message pane appears below the call console and remains scrollable

#### Scenario: Resize panes
- **WHEN** the user drags the divider between the call console and SIP message pane on a wide viewport
- **THEN** the relative pane widths change within usable minimum and maximum bounds
- **WHEN** the divider is focused
- **THEN** Left and Right arrow keys adjust the call-console width

### Requirement: Capture sent and received SIP messages
The system SHALL record every SIP message the client sends or receives on the signaling transport, including the full raw text (Authorization headers and SDP included), a send or receive direction, and a capture timestamp.

#### Scenario: Outgoing REGISTER
- **WHEN** the client sends a SIP REGISTER
- **THEN** the pane lists a send entry whose raw text is that REGISTER

#### Scenario: Incoming response
- **WHEN** FreeSWITCH sends a SIP response or request to the client
- **THEN** the pane lists a receive entry whose raw text is that message

### Requirement: Direction icons and one-line summary
The system SHALL prefix each list row with a send icon in green or a receive icon in red, and SHALL show a one-line summary (the SIP start line) until the user expands the row.

#### Scenario: Collapsed send row
- **WHEN** a sent message is listed and not expanded
- **THEN** the row starts with a green send icon and shows only the start line

#### Scenario: Collapsed receive row
- **WHEN** a received message is listed and not expanded
- **THEN** the row starts with a red receive icon and shows only the start line

### Requirement: Sort order
The system SHALL order the visible list by capture time, newest first by default, and SHALL let the user toggle oldest first.

#### Scenario: Default newest first
- **WHEN** two messages are captured
- **THEN** the later message appears above the earlier message

#### Scenario: Toggle oldest first
- **WHEN** the user chooses oldest-first order
- **THEN** the earlier message appears above the later message

### Requirement: Header and value filter
The system SHALL filter the list by a header name and value. A filter of the form `Header: value` SHALL keep messages whose matching header value contains that value, compared without regard to case. An empty filter SHALL show every retained message.

#### Scenario: Filter by Call-ID
- **WHEN** the user enters `Call-ID: 8295890a`
- **THEN** only messages whose Call-ID header contains `8295890a` remain visible

#### Scenario: Clear filter
- **WHEN** the filter is emptied
- **THEN** every retained message is visible again

### Requirement: Expand a message
The system SHALL expand a clicked row from the one-line summary into a full-message view that renders the raw SIP text as text, not HTML, and SHALL collapse it when the same row is clicked again.

#### Scenario: Expand then collapse
- **WHEN** the user clicks a collapsed row
- **THEN** the full raw message is shown
- **WHEN** the user clicks the same row again
- **THEN** only the one-line summary remains

### Requirement: Memory-only retention
The system SHALL keep at most the 200 most recent messages in memory, SHALL keep them after disconnect, SHALL clear them when the user chooses Clear or the page reloads, and MUST NOT persist messages, transmit them to the backend, or write raw SIP (including Authorization or SDP) to application logs.

#### Scenario: Survive disconnect
- **WHEN** the user disconnects after messages were captured
- **THEN** the pane still lists those messages

#### Scenario: Clear
- **WHEN** the user chooses Clear
- **THEN** the pane is empty

#### Scenario: Cap
- **WHEN** a 201st message is captured
- **THEN** the oldest message is dropped
