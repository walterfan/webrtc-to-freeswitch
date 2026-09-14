## Purpose

Provide predictable single-session incoming and outgoing audio calling between the browser and destinations routable by FreeSWITCH.

## ADDED Requirements

### Requirement: Place an outgoing audio call
The system SHALL let a registered user enter a destination permitted by the client input policy and start an audio-only call through FreeSWITCH.

#### Scenario: Outgoing call is answered
- **WHEN** a registered user calls a valid destination and the remote party answers
- **THEN** the call progresses through dialing and ringing to an active state with two-way audio

#### Scenario: Destination is invalid
- **WHEN** the user enters a destination containing disallowed characters or an invalid SIP address
- **THEN** the call is not attempted and the user receives a validation message

#### Scenario: Remote party declines or is unavailable
- **WHEN** FreeSWITCH returns a busy, declined, not-found, or temporarily unavailable result
- **THEN** the call ends and the interface presents a user-oriented reason without exposing raw protocol data

### Requirement: Receive an incoming audio call
The system SHALL notify a registered user of an incoming audio call, present a safe display identity, and allow the user to answer or reject it.

#### Scenario: User answers an incoming call
- **WHEN** an incoming invitation arrives while the user is registered and idle and the user chooses answer
- **THEN** the call becomes active with two-way audio

#### Scenario: User rejects an incoming call
- **WHEN** an incoming invitation arrives while the user is idle and the user chooses reject
- **THEN** the invitation is declined and no media is acquired

#### Scenario: Incoming identity contains markup
- **WHEN** the remote display name contains markup or control characters
- **THEN** the interface displays it as sanitized plain text

### Requirement: Enforce one call at a time
The system MUST maintain at most one pending or active call session per browser client.

#### Scenario: User starts a second call
- **WHEN** a call is pending or active and the user attempts another outgoing call
- **THEN** the system blocks the second attempt and keeps the original session unchanged

#### Scenario: Incoming call arrives while busy
- **WHEN** an invitation arrives while another call is pending or active
- **THEN** the system rejects the new invitation as busy and keeps the existing session unchanged

### Requirement: Deterministic call lifecycle and termination
The system SHALL expose idle, incoming-ringing, outgoing-dialing, outgoing-ringing, active, terminating, and ended call states and SHALL provide the valid termination action for each non-idle state.

#### Scenario: Caller cancels before answer
- **WHEN** the user cancels an outgoing call before it is answered
- **THEN** the pending invitation is canceled and the system returns to idle

#### Scenario: Either party hangs up an active call
- **WHEN** the local or remote party terminates an active call
- **THEN** the system stops call media, records a user-oriented end reason for the current view, and returns to idle without requiring a page reload

#### Scenario: Signaling fails during a call
- **WHEN** signaling or session negotiation fails during a pending or active call
- **THEN** the system ends the local session, releases media resources, and presents an actionable failure state

### Requirement: Audio call controls
During an active call, the system SHALL let the user mute or unmute the local microphone, send valid DTMF digits, and hang up.

#### Scenario: User toggles mute
- **WHEN** the user mutes or unmutes an active call
- **THEN** local audio transmission changes accordingly and the displayed mute state matches the media state

#### Scenario: User sends DTMF
- **WHEN** the user selects a digit from `0-9`, `*`, or `#` during an active call
- **THEN** the system sends that digit through the negotiated call using the configured interoperable DTMF method

#### Scenario: Control is unavailable outside active call
- **WHEN** no call is active
- **THEN** mute and DTMF actions are disabled

