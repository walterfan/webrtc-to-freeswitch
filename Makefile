.DEFAULT_GOAL := help

HOST := 127.0.0.1
PORT := 9527
PID_FILE := .run/uvicorn.pid
LOG_FILE := .run/uvicorn.log

.PHONY: help start stop backend-sync backend-dev backend-test backend-lint \
	frontend-install frontend-dev frontend-test frontend-lint frontend-typecheck \
	frontend-build build production-serve test lint \
	ops-sync ops-fab ops-usage

help: ## Show this help
	@printf "Usage: make <target>\n\n"
	@awk 'BEGIN {FS = ":.*## "; printf "Targets:\n"} \
		/^[a-zA-Z0-9_.-]+:.*## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

start: ## Start FastAPI serving the built SPA (background)
	@mkdir -p $(CURDIR)/.run
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		echo "already running (pid $$(cat $(PID_FILE))) at http://$(HOST):$(PORT)"; \
		exit 0; \
	fi; \
	if lsof -ti tcp:$(PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "already running on http://$(HOST):$(PORT)"; \
		exit 0; \
	fi; \
	sh -c 'nohup env APP_FRONTEND_DIST_DIR="$(CURDIR)/frontend/dist" \
		uv --directory "$(CURDIR)/backend" run uvicorn app.main:app --host $(HOST) --port $(PORT) \
		> "$(CURDIR)/$(LOG_FILE)" 2>&1 & echo $$! > "$(CURDIR)/$(PID_FILE)"'; \
	for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do \
		if lsof -ti tcp:$(PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
			echo "started http://$(HOST):$(PORT) (pid $$(cat $(CURDIR)/$(PID_FILE)))"; \
			exit 0; \
		fi; \
		sleep 0.2; \
	done; \
	echo "failed to start; see $(LOG_FILE)"; \
	exit 1

stop: ## Stop the FastAPI server
	@stopped=0; \
	if [ -f $(PID_FILE) ]; then \
		pid=$$(cat $(PID_FILE)); \
		if kill $$pid 2>/dev/null; then stopped=1; fi; \
		pkill -P $$pid 2>/dev/null || true; \
		rm -f $(PID_FILE); \
	fi; \
	if pids=$$(lsof -ti tcp:$(PORT) -sTCP:LISTEN 2>/dev/null); then \
		kill $$pids 2>/dev/null && stopped=1 || true; \
	fi; \
	if [ $$stopped -eq 1 ]; then echo "stopped"; else echo "not running"; fi

backend-sync: ## Install backend dependencies with uv
	cd backend && uv sync --group dev

backend-dev: ## Run FastAPI on http://127.0.0.1:8000
	cd backend && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

backend-test: ## Run backend pytest
	cd backend && uv run pytest

backend-lint: ## Run backend ruff and mypy
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy

frontend-install: ## Install frontend npm dependencies
	cd frontend && npm install

frontend-dev: ## Run Vite on http://127.0.0.1:5173
	cd frontend && npm run dev -- --host 127.0.0.1 --port 5173

frontend-test: ## Run Vitest and Playwright
	cd frontend && npm run test && npm run test:e2e

frontend-lint: ## Run frontend eslint and prettier
	cd frontend && npm run lint

frontend-typecheck: ## Run vue-tsc
	cd frontend && npm run typecheck

build: frontend-build ## Build the frontend for production

frontend-build: ## Build the production frontend
	cd frontend && npm run build

production-serve: ## Serve the built SPA and API from FastAPI (foreground)
	cd backend && APP_FRONTEND_DIST_DIR=../frontend/dist uv run uvicorn app.main:app --host $(HOST) --port $(PORT)

test: backend-test frontend-test ## Run backend and frontend tests

lint: backend-lint frontend-lint frontend-typecheck ## Run backend and frontend lint/typecheck

ops-sync: ## Install Fabric ops deps with uv (root pyproject)
	uv sync

ops-usage: ## Show FreeSWITCH fab task examples
	uv run fab usage

ops-fab: ## Run a fab task: make ops-fab ARGS='fs-cli --cmd="sofia status"'
	uv run fab $(ARGS)
