## Purpose

Allow a registered browser user to start a single outbound audio/video call through FreeSWITCH while keeping camera use visible, failure-safe, and compatible with existing audio calling.

## ADDED Requirements

### Requirement: Select an outbound call media mode
The system SHALL let a registered, idle user start either an audio call or a video call to a valid destination, and a video call SHALL request both microphone and camera media.

#### Scenario: User starts a video call
- **WHEN** a registered, idle user selects video call for a valid destination
- **THEN** the system requests microphone and camera access and sends an offer for audio and video

#### Scenario: User starts an audio call
- **WHEN** a registered, idle user selects audio call for a valid destination
- **THEN** the system requests microphone access without requesting camera access and preserves the existing audio-call behavior

#### Scenario: Another call is already in progress
- **WHEN** the user attempts to start a video call while a call is pending or active
- **THEN** the system blocks the new attempt and leaves the existing session unchanged

### Requirement: Present local video before or during dialing
The system SHALL display the local camera stream for an outbound video call without transmitting or persisting a recording outside the negotiated call.

#### Scenario: Camera acquisition succeeds
- **WHEN** the browser provides a usable camera track for a video call
- **THEN** the interface shows a muted local preview using the same local stream selected for the call

#### Scenario: Audio call is selected
- **WHEN** the user starts or participates in an audio-only call
- **THEN** the interface does not show a local video preview

### Requirement: Handle camera acquisition failures
The system SHALL NOT send a video-call invitation when required camera media cannot be acquired, and SHALL distinguish permission denial, missing-device, and other media failures using user-oriented messages.

#### Scenario: Camera permission is denied
- **WHEN** the user starts a video call and the browser denies camera access
- **THEN** no video-call invitation is sent, acquired media is released, and the interface explains how to restore camera permission

#### Scenario: No camera is available
- **WHEN** the user starts a video call and no usable video input device exists
- **THEN** no video-call invitation is sent, acquired media is released, and the interface identifies the missing camera condition

### Requirement: Present negotiated remote video
The system SHALL render a negotiated remote video track for the current video call while preserving remote-audio playback and its browser autoplay recovery behavior.

#### Scenario: Remote party sends video
- **WHEN** the video call is active and a remote video track is received
- **THEN** the interface displays the remote video and plays remote audio

#### Scenario: Peer accepts audio only
- **WHEN** the destination accepts the call but does not negotiate a usable remote video track
- **THEN** the call remains active with audio and the interface identifies that remote video is unavailable

#### Scenario: Stale session emits media
- **WHEN** remote media arrives for a session that is no longer current
- **THEN** the system ignores that media and does not replace the current call presentation

### Requirement: Clean up video resources
The system MUST stop application-owned camera tracks, clear the local preview, detach remote video, and reset video status after every completed or failed video-call attempt.

#### Scenario: Video call ends normally
- **WHEN** either party ends an active video call
- **THEN** local camera use stops and both local and remote video elements are detached before the client returns to idle

#### Scenario: Video signaling or negotiation fails
- **WHEN** a video-call attempt fails after local media was acquired
- **THEN** the system releases all acquired audio and video tracks and returns to a state that permits another call

#### Scenario: Cleanup is requested more than once
- **WHEN** overlapping termination and component-disposal paths request cleanup for the same call
- **THEN** cleanup remains safe and no media resource is retained
