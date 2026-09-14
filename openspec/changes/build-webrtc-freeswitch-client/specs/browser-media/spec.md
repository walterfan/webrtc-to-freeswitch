## Purpose

Manage browser microphone and remote-audio behavior safely so call state remains accurate when permissions, playback, or media negotiation fail.

## ADDED Requirements

### Requirement: Audio-only local media
The system SHALL request microphone audio without requesting camera access for the initial release, and SHALL acquire it only when needed for a call action.

#### Scenario: Outgoing call requests microphone
- **WHEN** the user initiates an outgoing call without an existing usable microphone stream
- **THEN** the browser requests microphone permission and does not request camera permission

#### Scenario: Incoming call is rejected
- **WHEN** the user rejects an incoming call before answering
- **THEN** the system does not request microphone or camera permission

### Requirement: Microphone permission and device failures
The system SHALL prevent a call from becoming active when usable local audio cannot be acquired and SHALL distinguish permission denial, missing device, and general acquisition failure for the user.

#### Scenario: Microphone permission is denied
- **WHEN** the browser denies microphone access for a call
- **THEN** the call attempt is terminated or the incoming call remains unanswered and the user sees instructions to restore permission

#### Scenario: No microphone is available
- **WHEN** no audio input device is available
- **THEN** the system does not establish the call and identifies the missing-device condition

### Requirement: Remote audio playback
The system SHALL attach negotiated remote audio to an audio output element and attempt playback when the session becomes active.

#### Scenario: Browser permits autoplay
- **WHEN** a remote audio track is received and browser policy permits playback
- **THEN** the remote party is audible without an additional action

#### Scenario: Browser blocks autoplay
- **WHEN** remote audio is available but browser policy blocks playback
- **THEN** the call remains active and the system presents a user gesture that starts playback

### Requirement: Media resource cleanup
The system SHALL stop owned local media tracks, detach remote media, and reset mute state after every completed or failed call.

#### Scenario: Call ends normally
- **WHEN** an active call ends
- **THEN** the application releases its local tracks, detaches remote media, and resets media controls before the next call

#### Scenario: Negotiation fails
- **WHEN** media negotiation fails after local media was acquired
- **THEN** the application releases the acquired media and reports the failure without leaving the microphone active

### Requirement: Supported browser context
The system SHALL detect whether required WebRTC and secure-context capabilities are available before allowing registration or calling.

#### Scenario: Required browser capability is missing
- **WHEN** the browser lacks required WebRTC APIs or the deployed page is not in an allowed secure context
- **THEN** the system disables calling and identifies the unsupported capability

