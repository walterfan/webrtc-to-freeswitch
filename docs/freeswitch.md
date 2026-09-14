# FreeSWITCH and deployment guide

This client talks **directly** to an existing WebRTC-ready FreeSWITCH instance.
The FastAPI process is not a SIP proxy and never sees SIP usernames or passwords.

## Required FreeSWITCH setup

1. **Sofia WSS profile**  
   Enable SIP over WebSocket on a dedicated profile (commonly port `7443`).
   Production browsers require `wss://` with a certificate the browser already
   trusts. Self-signed certificates fail with a secure-connection error.

2. **Trusted certificate**  
   Terminate TLS on FreeSWITCH or on a reverse proxy in front of the Sofia WSS
   listener. The certificate hostname must match the WSS URL entered in the UI.

3. **WebRTC codecs and DTLS-SRTP**  
   Offer Opus and/or PCMU/PCMA. Enable DTLS-SRTP on the media path. The client
   is audio-only (`audio: true`, `video: false`).

4. **ICE / NAT**  
   Advertise reachable candidates. If callers are behind restrictive NAT, provide
   STUN and/or TURN in `APP_ICE_SERVERS` as `RTCIceServer` objects. TURN
   `username`/`credential` values are ICE transport credentials only.

5. **Test users**  
   Create at least two local extensions for interoperability. Do not commit
   their passwords. Supply them only through a protected environment when
   running the opt-in harness.

6. **Restricted dialplan**  
   Limit the test extensions to each other (or a documented IVR) so the browser
   client cannot reach PSTN or unrelated tenants.

7. **DTMF**  
   Prefer RFC 4733 `telephone-event`. The client default is `APP_DTMF_PREFERRED_METHOD=rtp`
   and falls back to SIP INFO `application/dtmf-relay` when `telephone-event`
   is not negotiated, or when the preferred method is `info`.

## Application environment

Copy `backend/.env.example` to `backend/.env`. Recognized keys:

| Key | Purpose |
| --- | --- |
| `APP_ENVIRONMENT` | `development` or `production` (WSS enforcement) |
| _(UI)_ SIP WebSocket URL | Sofia WS(S) URL entered in the registration form; `ws://` only for loopback development |
| _(UI)_ SIP domain | SIP domain / AOR host entered in the registration form |
| `APP_ICE_SERVERS` | JSON array of `{ "urls": [...], "username"?, "credential"? }` |
| `APP_FRONTEND_DIST_DIR` | Built SPA directory served in production |
| `APP_REGISTRATION_MAX_RETRIES` | Client reconnect budget (default 5) |
| `APP_REGISTRATION_BASE_DELAY_MS` | Backoff base (default 1000) |
| `APP_REGISTRATION_MAX_DELAY_MS` | Backoff ceiling (default 15000) |
| `APP_DTMF_PREFERRED_METHOD` | `rtp` or `info` (default `rtp`) |

Never set a SIP password as an environment variable.

## HTTPS deployment

Serve the Vite production build from FastAPI (or an equivalent reverse proxy)
on one HTTPS origin. FastAPI adds:

- `Content-Security-Policy` with `connect-src 'self'` plus the configured WSS
  signaling origin
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `X-Frame-Options: DENY`

The browser then fetches `/api/config` and `/health/*` from that same origin.

## Diagnostics (safe)

| Symptom | Check |
| --- | --- |
| `/health/live` ok, `/health/ready` 503 | Validate `APP_*` fields named in the reason |
| Config load retry in the UI | Backend not reachable or `/api/config` failing |
| Authentication error | Extension/password rejected; no automatic retry |
| Certificate / secure-connection guidance | WSS cert untrusted or hostname mismatch |
| Registered but no audio | ICE/TURN, codec, or autoplay block (“Enable audio”) |

Do not log SIP Authorization headers, SDP, or passwords.

## Operator fabfile (SSH + docker)

From this laptop, Fabric tasks SSH to the FreeSWITCH host and run
`docker exec` / host `tcpdump`. Dependencies are managed with root-level `uv`
(separate from `backend/`).

```bash
cp ops.env.example .env   # set FS_HOST, FS_USER, FS_SSH_KEY or FS_SSH_PASSWORD
uv sync
uv run fab --list
uv run fab usage
uv run fab fs-cli --cmd='sofia status'
uv run fab fs-log --pattern='Call-ID: ...' --context=10
uv run fab fs-config --path=sip_profiles/internal.xml
uv run fab pcap-start
uv run fab pcap-stop
uv run fab pcap-pull --remote=/tmp/fs-....pcap
```

Or via Make: `make ops-sync`, `make ops-usage`, `make ops-fab ARGS='fs-cli --cmd=status'`.


