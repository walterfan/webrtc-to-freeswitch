# AGENTS.md - webrtc-to-freeswitch

<!-- Follows https://agents.md. Operating map for coding agents, not the manual. -->

Browser WebRTC audio client that registers with an existing FreeSWITCH over SIP
WSS and handles one audio call at a time; a FastAPI backend serves validated
config and static assets only.

Read this before editing. Deep architecture, the config/API contract, and env
vars live in the OpenSpec change docs linked below — do not restate them here.

## Context Map

- README: [README.md](README.md) — human overview and status.
- Spec-driven source of truth: `openspec/changes/build-webrtc-freeswitch-client/`
  - `proposal.md` (why/what), `design.md` (decisions, `/api/config` contract,
    `APP_*` env vars, pinned toolchain), `tasks.md` (implementation checklist),
    `acceptance-cases.md` (QA cases `ATC-*` + traceability).
  - `specs/` capabilities: `runtime-configuration`, `sip-registration`,
    `audio-calling`, `browser-media`.

Repo layout:

- `openspec/` — spec-driven workflow; the authoritative behavior definition.
- `frontend/` — Vue 3 + TS + Vite + `sip.js` SPA.
- `backend/` — `uv`-managed FastAPI service.

Status: implementation in progress via `openspec/changes/build-webrtc-freeswitch-client`.

## Commands

```bash
# Spec workflow
openspec validate build-webrtc-freeswitch-client --strict
openspec show build-webrtc-freeswitch-client

# Root (Makefile)
make backend-sync
make backend-dev          # FastAPI on http://127.0.0.1:8000
make backend-test         # uv run pytest
make backend-lint         # ruff check/format + mypy
make frontend-install
make frontend-dev         # Vite on http://127.0.0.1:5173
make frontend-test        # vitest + playwright
make frontend-lint
make frontend-typecheck
make test
make lint

# Backend workspace
cd backend && uv sync --group dev
cd backend && uv run pytest
cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy
cd backend && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Frontend workspace
cd frontend && npm install
cd frontend && npm run test
cd frontend && npm run test:e2e
cd frontend && npm run typecheck
cd frontend && npm run lint
cd frontend && npm run dev -- --host 127.0.0.1 --port 5173
```

## Harness Rules

- Never fabricate paths, APIs, commands, tests, or results; inspect the repo or
  run the command first.
- Ask when ambiguity changes the output; otherwise resolve uncertainty by
  reading the specs and existing patterns.
- Think before coding: state assumptions, tradeoffs, and success criteria before
  non-trivial edits.
- Keep it simple: solve the requested problem without speculative features or
  future-proofing beyond the documented media/session seam.
- Make surgical changes: every changed line should trace to a task or spec
  requirement; leave unrelated code and formatting alone.
- Verify before reporting done; a plausible diff is not proof.

## Project Rules

- Spec-driven: behavior changes go through OpenSpec. Update the change docs and
  keep `openspec validate --strict` green; keep `tasks.md` and
  `acceptance-cases.md` aligned when scope shifts.
- Follow `design.md` contracts exactly: the `/api/config` JSON shape (camelCase
  keys `environment`, `sipWebSocketUrl`, `sipDomain`, `iceServers`, `registration`, `dtmf`), the `APP_*` env-var names, and the pinned toolchain
  versions. Do not rename fields or invent new config keys.
- Keep `sip.js` usage confined to the single SIP adapter; UI/state code must not
  import SIP.js types. Model registration and call state as the documented
  discriminated unions, not scattered booleans.
- Build SIP URIs via the library URI parser after rejecting control characters;
  never string-concatenate a `sip:` address.
- Do not: persist or transmit the SIP password (memory-only; cleared on
  disconnect), log SIP authorization headers/SDP/raw protocol, or accept plain
  `ws://` outside loopback development.
- Security: `/api/config` returns only allowlisted values; TURN creds are ICE
  transport creds only; remote display names render as text (never HTML).
- Do not run deploys, migrations, or connect to a real FreeSWITCH without
  explicit approval. `ATC-460` interoperability is opt-in and operator-supplied;
  never embed credentials in the repo or CI.

## AI Tooling

Primary tools: Claude Code, Cursor, and OpenCode (repo has `.claude/`,
`.cursor/`, `.opencode/`).

- Cursor / OpenCode: read `AGENTS.md` at the repo root.
- Claude Code: reads `CLAUDE.md`, a symlink to `AGENTS.md`.

## Keeping Current

Update this file when commands, layout, guardrails, or the design contracts
move. When a user corrects a project-specific mistake, add or tighten one
concrete rule here, then prune obsolete rules later.

<!-- last_updated: 2026-09-11 -->
