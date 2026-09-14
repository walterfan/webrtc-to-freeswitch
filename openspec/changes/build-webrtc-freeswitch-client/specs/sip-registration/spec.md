## Purpose

Let a browser user securely establish and manage a registered SIP endpoint against an existing WebRTC-enabled FreeSWITCH deployment.

## ADDED Requirements

### Requirement: SIP account session input
The system SHALL let the user provide the SIP WebSocket URL, SIP domain, username, and password, SHALL keep the password in memory only, and MUST NOT place credentials or endpoint secrets in URLs, persistent browser storage, telemetry, or logs.

#### Scenario: User supplies valid endpoint and credentials
- **WHEN** the user enters a SIP WebSocket URL, SIP domain, username, and password and chooses to connect
- **THEN** the system uses that endpoint and those credentials for the current in-memory SIP session

#### Scenario: Browser reloads
- **WHEN** the browser document is reloaded after credentials were entered
- **THEN** the SIP password is no longer available and must be entered again

### Requirement: Secure SIP connection and registration
The system SHALL connect to the user-entered FreeSWITCH endpoint over SIP WebSocket transport and register the user's address of record before enabling calling. Outside the explicit loopback development exception, the system MUST require WSS.

#### Scenario: Insecure production signaling URL is rejected in the browser
- **WHEN** the environment is production and the user enters a `ws` signaling URL
- **THEN** the system does not connect and displays a validation error that identifies the insecure URL

#### Scenario: Registration succeeds
- **WHEN** the signaling connection succeeds and FreeSWITCH accepts the supplied credentials
- **THEN** the system reaches a registered state and enables eligible calling actions

#### Scenario: Authentication fails
- **WHEN** FreeSWITCH rejects the registration credentials
- **THEN** the system returns to a disconnected state, displays an authentication-specific error, and does not retry until the user changes credentials or explicitly retries

#### Scenario: Signaling certificate is not trusted
- **WHEN** the browser cannot establish WSS because the certificate is untrusted or invalid
- **THEN** the system remains unregistered and displays guidance that identifies the secure-connection problem

### Requirement: Observable registration lifecycle
The system SHALL present distinct disconnected, connecting, registering, registered, reconnecting, and failed states, and SHALL prevent concurrent connect or disconnect operations that conflict with the current state.

#### Scenario: Connection is in progress
- **WHEN** a connection or registration attempt is pending
- **THEN** the user sees the current state and cannot start a duplicate attempt

#### Scenario: User disconnects
- **WHEN** a registered user chooses to disconnect while no call is active
- **THEN** the system unregisters, closes the signaling transport, and reaches the disconnected state

### Requirement: Recover from transient signaling loss
The system SHALL make bounded reconnection attempts after an unexpected transport loss and SHALL preserve enough state to restore registration without persisting the password.

#### Scenario: Transport recovers within retry limit
- **WHEN** signaling is lost transiently and a retry succeeds within the configured limit
- **THEN** the system reconnects, restores registration, and reports the registered state

#### Scenario: Retry limit is exhausted
- **WHEN** signaling cannot be restored within the configured retry limit
- **THEN** the system reaches a failed state and offers an explicit manual retry

### Requirement: Registration cleanup
The system SHALL terminate registration and signaling resources when the user disconnects and SHALL make a best-effort cleanup when the browser page exits.

#### Scenario: Explicit disconnect
- **WHEN** the user disconnects from an idle registered session
- **THEN** no active registration, signaling transport, or media resource remains in the application

### Requirement: Unsolicited out-of-dialog NOTIFY
The system SHALL accept an unsolicited out-of-dialog SIP NOTIFY, including FreeSWITCH message-summary MWI after REGISTER, with 200. The system MUST NOT create a subscription, MUST NOT change registration or call state from the notification, and MUST NOT render, persist, or log the NOTIFY body or event payload.

#### Scenario: FreeSWITCH sends message-summary after register
- **WHEN** a registered session receives an out-of-dialog NOTIFY with Event message-summary
- **THEN** the SIP adapter answers 200 and remains in the current registration and call states

