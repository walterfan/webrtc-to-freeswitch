## Purpose

Provide the browser with validated deployment settings and expose service health without distributing SIP account secrets through the backend.

## ADDED Requirements

### Requirement: Browser-safe runtime configuration
The system SHALL expose ICE servers, environment label, and browser behavior knobs (registration retry budget and preferred DTMF method) needed to initialize the browser client. The SIP WebSocket URL and SIP domain MAY be supplied as optional backend defaults (`APP_SIP_WEBSOCKET_URL`, `APP_SIP_DOMAIN`) that prefill the registration form; the user can override them. They MUST NOT be required for service readiness when empty. ICE servers SHALL be returned as `RTCIceServer`-shaped objects (each with `urls` and optional `username`/`credential`) rather than bare URL strings, so TURN credentials can be carried when a TURN service is provisioned. The response MUST NOT contain SIP usernames, SIP passwords, private keys, or server-side environment values that are not explicitly allowlisted.

#### Scenario: Valid configuration is returned
- **WHEN** the browser requests runtime configuration from a correctly configured service
- **THEN** the service returns the allowlisted settings in the documented JSON shape, including `environment`, `sipWebSocketUrl`, `sipDomain`, `iceServers`, `registration`, and `dtmf`

#### Scenario: ICE servers carry only transport credentials
- **WHEN** a TURN server is configured and its entry includes `username` and `credential`
- **THEN** those values are ICE transport credentials only and no SIP account username or password appears anywhere in the response

#### Scenario: Secrets are not returned
- **WHEN** the service environment contains SIP credentials or unrelated secret values
- **THEN** those values are absent from the runtime-configuration response and application logs

### Requirement: Configuration validation
The system MUST validate runtime settings before declaring the service ready, including ICE server object syntax (each entry has at least one valid `urls` value), a preferred DTMF method within the allowed set, and non-negative registration retry values.

#### Scenario: Valid ICE and behavior knobs
- **WHEN** a configuration uses valid ICE server objects and registration/DTMF knobs
- **THEN** the configuration is accepted and made available to the browser

#### Scenario: Invalid ICE server object
- **WHEN** an ICE server entry is missing `urls` or uses invalid syntax
- **THEN** the service rejects the configuration and reports a safe diagnostic that identifies the invalid field without exposing secrets

### Requirement: Health and readiness reporting
The system SHALL expose a liveness result independent of external FreeSWITCH reachability and a readiness result that succeeds only when runtime configuration is valid.

#### Scenario: Service is live and configured
- **WHEN** the process is running and its runtime configuration is valid
- **THEN** liveness and readiness checks both succeed

#### Scenario: Service is live but misconfigured
- **WHEN** the process is running but runtime configuration is invalid
- **THEN** liveness succeeds, readiness fails, and the failure response contains no secret values

### Requirement: Configuration load failure in the browser
The browser SHALL prevent SIP connection attempts until runtime configuration has loaded successfully and SHALL offer a retry after a load failure.

#### Scenario: Configuration endpoint is unavailable
- **WHEN** the browser cannot load runtime configuration
- **THEN** calling and registration controls remain unavailable and the user sees an actionable retry option

