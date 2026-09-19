# webrtc-to-freeswitch

A browser-based WebRTC calling client that registers with an existing
FreeSWITCH server over SIP-over-secure-WebSocket and makes or receives one
secure audio call at a time, with an outbound audio/video option — no native
softphone required.

> **Status: implementation in progress.** OpenSpec remains the source of
> behavior. The `frontend/` and `backend/` workspaces exist and can be started
> locally without SIP credentials.

## What it does (initial scope)

- SIP registration to FreeSWITCH over WSS with explicit connection/registration
  states, bounded reconnect, and actionable errors.
- One call at a time: outgoing and incoming audio, plus outbound audio/video,
  with answer, reject, cancel, hang up, mute, and DTMF.
- Just-in-time microphone/camera acquisition for outbound video calls, a muted
  local preview, remote-video presentation, and remote-audio autoplay recovery.
- A small FastAPI service that serves validated, non-secret runtime
  configuration and health/readiness — **not** a SIP proxy. SIP passwords are
  client-supplied and memory-only.

Out of scope: incoming video, camera switching, mid-call media renegotiation,
screen sharing, transfer, hold, conferencing, call history, recording, PSTN
provisioning, and any FreeSWITCH server provisioning.

## Architecture at a glance

Two workspaces, one production origin:

- `frontend/` — Vue 3 + TypeScript + Vite, with a pinned `sip.js` behind a
  single SIP adapter. SIP signaling and media go **directly** browser↔FreeSWITCH.
- `backend/` — Python + FastAPI + Pydantic settings, managed with `uv`. Exposes
  `GET /api/config`, `GET /health/live`, `GET /health/ready`, and in production
  serves the built frontend from the same origin.

The backend never sees SIP credentials. See
[`design.md`](openspec/changes/build-webrtc-freeswitch-client/design.md) for the
full decisions, the `/api/config` contract, and the `APP_*` environment
variables.

## Repository layout

```
openspec/            OpenSpec config and specs
  changes/build-webrtc-freeswitch-client/
    proposal.md          why + what
    design.md            technical decisions, config/API contract, env vars
    tasks.md             implementation checklist
    acceptance-cases.md  QA acceptance test cases + traceability matrix
    specs/               capability specs (runtime-configuration, sip-registration,
                         audio-calling, browser-media, video-calling)
frontend/            Vue 3 + TypeScript + Vite SPA
backend/             uv-managed FastAPI service
fabfile.py           Fabric tasks for FreeSWITCH SSH/docker diagnostics
ops.env.example      Env template for fab (copy to root .env)
pyproject.toml       uv project for Fabric ops deps (separate from backend/)
captures/            Local pcap/log downloads from fab tasks (gitignored)
Makefile             root development commands
```

## Getting started

### Prerequisites

- Node.js 20 LTS
- Python 3.11+ and [`uv`](https://docs.astral.sh/uv/)
- An existing WebRTC-ready FreeSWITCH deployment with a Sofia profile accepting
  SIP over WebSocket. This project does **not** provision FreeSWITCH.
- For fab diagnostics: SSH access to the FreeSWITCH host and Docker permission
  to exec into the FreeSWITCH container (plus `tcpdump`/`sudo` for packet capture)

### Explore the plan (works today)

```bash
openspec validate build-webrtc-freeswitch-client --strict
openspec show build-webrtc-freeswitch-client
```

### Run the app

No SIP username or password is required to start the local servers. Copy the
example environment file, then install and start each workspace (or use the
root `Makefile` targets).

```bash
cp backend/.env.example backend/.env

# backend — http://127.0.0.1:8000
make backend-sync
make backend-dev

# frontend — http://127.0.0.1:5173
make frontend-install
make frontend-dev
```

Equivalent workspace commands:

```bash
# backend
cd backend
uv sync --group dev
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# frontend
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Confirm liveness with `curl http://127.0.0.1:8000/health/live` (`{"status":"live"}`)
and open the Vite URL in a browser.

Operator FreeSWITCH setup is in [`docs/freeswitch.md`](docs/freeswitch.md).
The real-PBX checklist stays `NOT RUN` until you supply `INTEROP_*` values;
`python scripts/interop_harness.py` skips when they are unset.

For video, the browser and target FreeSWITCH route must share a WebRTC video
codec, and the caller must grant camera and microphone access. A destination
that accepts audio but no video remains an audio call and shows that remote
video is unavailable. The video interop checklist is opt-in and must use only
a non-production instance with operator-supplied protected credentials.

### FreeSWITCH fab diagnostics

From this laptop, Fabric tasks SSH to the FreeSWITCH host and run
`docker exec` / host `tcpdump`. Ops deps are managed with root-level `uv`
(separate from `backend/`).

```bash
cp ops.env.example .env   # set FS_HOST, FS_USER, FS_SSH_KEY or FS_SSH_PASSWORD
uv sync
uv run fab --list
uv run fab usage
```

Auth: prefer `FS_SSH_KEY` when the key file exists; otherwise use
`FS_SSH_PASSWORD`. Do not commit `.env`.

| Task | Purpose |
| --- | --- |
| `fs-cli` | Run `fs_cli -x "<cmd>"` in the container |
| `fs-log` | Grep FreeSWITCH log (`--pattern`, `--context`) |
| `fs-call-log` | Resolve SIP Call-ID to UUID and print related logs |
| `fs-config` | `cat` a conf file under `FS_CONF` |
| `fs-sofia` | `sofia status` (optional `--profile`) |
| `fs-reloadxml` | `reloadxml` |
| `fs-restart` | `docker restart` the FreeSWITCH container |
| `pcap-start` / `pcap-stop` | Remote background `tcpdump` |
| `pcap-pull` | Download a remote pcap into `./captures/` |
| `log-pull` | Pull log (full or `--lines=N`) into `./captures/` |

Examples:

```bash
uv run fab fs-cli --cmd='global_getvar'
uv run fab fs-cli --cmd='sofia status'
uv run fab fs-log --pattern='Call-ID: nk5a1knch6ubimge6hbi' --context=10
uv run fab fs-call-log --call-id='nk5a1knch6ubimge6hbi'
uv run fab fs-config --path=sip_profiles/internal.xml
uv run fab fs-sofia --profile=internal
uv run fab pcap-start
uv run fab pcap-stop
uv run fab pcap-pull --remote=/tmp/fs-YYYYMMDD-HHMMSS.pcap
uv run fab log-pull --lines=500
```

Make wrappers: `make ops-sync`, `make ops-usage`,
`make ops-fab ARGS='fs-cli --cmd="sofia status"'`.

More detail: [`docs/freeswitch.md`](docs/freeswitch.md).

Production one-origin serve (after `make frontend-build`):

```bash
cd backend
# APP_* from backend/.env, including APP_FRONTEND_DIST_DIR=../frontend/dist
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Configure the backend with `APP_*` environment variables from
`backend/.env.example`. The full list — `APP_ENVIRONMENT`,
`APP_ICE_SERVERS`, `APP_FRONTEND_DIST_DIR`, `APP_REGISTRATION_*`,
`APP_DTMF_PREFERRED_METHOD` — is documented in
[`design.md`](openspec/changes/build-webrtc-freeswitch-client/design.md).
Enter the FreeSWITCH WSS URL and SIP domain in the registration form.
Never put a SIP password in the env file.

### Check and test

```bash
make lint
make test
```

## Testing

Acceptance cases (`ATC-101`…`ATC-460`) and a traceability matrix live in
[`acceptance-cases.md`](openspec/changes/build-webrtc-freeswitch-client/acceptance-cases.md).
Deterministic inner-loop tests use fake SIP/media ports; real FreeSWITCH
interoperability (`ATC-460`) is an opt-in, operator-supplied checklist and stays
`NOT RUN` until a non-production FreeSWITCH instance and approved baseline exist.
Operator setup is in [`docs/freeswitch.md`](docs/freeswitch.md). The harness
`python scripts/interop_harness.py` skips when `INTEROP_*` variables are unset.

## Security notes

- SIP passwords are memory-only: never persisted, never sent to the backend,
  never placed in URLs or logs. They must be re-entered after a page reload.
- Production requires HTTPS and a trusted FreeSWITCH WSS endpoint; plain `ws://`
  is accepted only for loopback development.
- `GET /api/config` returns an allowlisted response only. TURN entries, when
  present, carry ICE transport credentials only — never SIP account credentials.

## Contributing

This project is spec-driven. Change behavior through the OpenSpec workflow:
update the change under `openspec/changes/`, keep
`openspec validate --strict` green, and align `tasks.md` and
`acceptance-cases.md`. See [`AGENTS.md`](AGENTS.md) for the operating map used by
coding agents.
