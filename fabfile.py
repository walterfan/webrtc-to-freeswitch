"""FreeSWITCH operator tasks (SSH → docker / tcpdump).

Setup:
  cp ops.env.example .env   # fill FS_HOST / auth
  uv sync
  uv run fab --list
  uv run fab usage
"""

from __future__ import annotations

import os
import shlex
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fabric import Connection, task

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

LOCAL_CAPTURE_DIR = ROOT / "captures"
DEFAULT_HOSTS = ["localhost"]


@dataclass(frozen=True)
class FsSettings:
    host: str
    user: str
    ssh_key: str | None
    ssh_password: str | None
    container: str
    cli: str
    log: str
    conf: str
    pcap_dir: str
    capture_iface: str
    capture_filter: str

    @property
    def pcap_pid_file(self) -> str:
        return f"{self.pcap_dir.rstrip('/')}/fs-tcpdump.pid"

    def pcap_path(self, name: str | None = None) -> str:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        filename = name or f"fs-{stamp}.pcap"
        return f"{self.pcap_dir.rstrip('/')}/{filename}"


def settings() -> FsSettings:
    key = os.getenv("FS_SSH_KEY", "").strip() or None
    if key:
        key = str(Path(key).expanduser())
    return FsSettings(
        host=os.getenv("FS_HOST", "10.20.30.40").strip(),
        user=os.getenv("FS_USER", "walter").strip(),
        ssh_key=key,
        ssh_password=os.getenv("FS_SSH_PASSWORD") or None,
        container=os.getenv("FS_DOCKER_CONTAINER", "freeswitch").strip(),
        cli=os.getenv("FS_CLI", "/usr/local/freeswitch/bin/fs_cli").strip(),
        log=os.getenv("FS_LOG", "/usr/local/freeswitch/log/freeswitch.log").strip(),
        conf=os.getenv("FS_CONF", "/usr/local/freeswitch/conf").strip(),
        pcap_dir=os.getenv("FS_PCAP_DIR", "/tmp").strip(),
        capture_iface=os.getenv("FS_CAPTURE_IFACE", "any").strip(),
        capture_filter=os.getenv(
            "FS_CAPTURE_FILTER",
            "port 5060 or port 5066 or port 7443",
        ).strip(),
    )


def build_connection(cfg: FsSettings | None = None) -> Connection:
    cfg = cfg or settings()
    connect_kwargs: dict[str, object] = {}
    if cfg.ssh_key and Path(cfg.ssh_key).is_file():
        connect_kwargs["key_filename"] = cfg.ssh_key
    elif cfg.ssh_password:
        connect_kwargs["password"] = cfg.ssh_password
    else:
        raise SystemExit(
            "Set FS_SSH_KEY to an existing key file, or set FS_SSH_PASSWORD "
            "(see ops.env.example)."
        )
    return Connection(host=cfg.host, user=cfg.user, connect_kwargs=connect_kwargs)


def docker_exec(conn: Connection, cfg: FsSettings, *argv: str, warn: bool = False):
    remote = " ".join(shlex.quote(part) for part in ("docker", "exec", cfg.container, *argv))
    return conn.run(remote, pty=False, warn=warn)


def fs_cli_x(conn: Connection, cfg: FsSettings, command: str, warn: bool = False):
    return docker_exec(conn, cfg, cfg.cli, "-x", command, warn=warn)


def _print_stdout(result) -> None:
    if result.stdout:
        print(result.stdout, end="" if result.stdout.endswith("\n") else "\n")


def _validate_sip_call_id(call_id: str) -> str:
    call_id = call_id.strip()
    if not call_id or len(call_id) > 256 or any(ord(char) < 32 for char in call_id):
        raise SystemExit("call_id must be 1-256 characters without control characters")
    return call_id


# Positional arguments passed by docker exec: $1=log, $2=call_id, $3=context.
FS_CALL_LOG_SCRIPT = """
set -eu
log=$1
call_id=$2
context=$3
matches=$(grep -Fi -C "$context" -- "call-id: $call_id" "$log" || true)
uuids=$(printf '%s\\n' "$matches" | grep -oE '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}' | sort -u || true)
if [ -z "$uuids" ]; then
  matches=$(grep -Fi -C "$context" -- "variable_sip_call_id: $call_id" "$log" || true)
  uuids=$(printf '%s\\n' "$matches" | grep -oE '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}' | sort -u || true)
fi
if [ -z "$uuids" ]; then
  echo "No FreeSWITCH UUID found for SIP Call-ID: $call_id" >&2
  exit 1
fi
printf 'SIP Call-ID: %s\\nUUID(s):\\n%s\\n\\n' "$call_id" "$uuids"
awk -v call_id="$call_id" -v uuids="$uuids" '
  BEGIN { count = split(uuids, uuid, "\\n") }
  {
    match_line = index(tolower($0), "call-id: " tolower(call_id)) > 0
    for (i = 1; i <= count; i++) match_line = match_line || index($0, uuid[i]) > 0
    if (match_line) print NR ":" $0
  }
' "$log"
""".strip()


@task(hosts=DEFAULT_HOSTS)
def usage(c):
    """Print common fab invocations."""
    print(
        """
FreeSWITCH ops (uv + Fabric)

  cp ops.env.example .env    # edit FS_HOST / FS_USER / auth
  uv sync
  uv run fab --list

Examples:
  uv run fab fs-cli -c 'global_getvar'
  uv run fab fs-cli --cmd='sofia status'
  uv run fab fs-log --pattern='Call-ID: nk5a1knch6ubimge6hbi' --context=10
  uv run fab fs-call-log --call-id='nk5a1knch6ubimge6hbi'
  uv run fab fs-config --path=sip_profiles/internal.xml
  uv run fab fs-sofia
  uv run fab fs-sofia --profile=internal
  uv run fab fs-reloadxml
  uv run fab pcap-start
  uv run fab pcap-stop
  uv run fab pcap-pull --remote=/tmp/fs-YYYYMMDD-HHMMSS.pcap
  uv run fab log-pull --lines=500
  uv run fab fs-restart
""".strip()
    )


@task(hosts=DEFAULT_HOSTS)
def fs_cli(c, cmd: str = "status"):
    """Run fs_cli -x <cmd> inside the FreeSWITCH container."""
    cfg = settings()
    with build_connection(cfg) as conn:
        _print_stdout(fs_cli_x(conn, cfg, cmd))


@task(hosts=DEFAULT_HOSTS)
def fs_log(c, pattern: str, context: int = 10):
    """Search FreeSWITCH log inside the container (grep -n -C)."""
    cfg = settings()
    with build_connection(cfg) as conn:
        result = docker_exec(
            conn,
            cfg,
            "grep",
            "-n",
            "-C",
            str(context),
            pattern,
            cfg.log,
            warn=True,
        )
        _print_stdout(result)
        if result.exited not in (0, 1):
            raise SystemExit(result.exited)


@task(hosts=DEFAULT_HOSTS)
def fs_call_log(c, call_id: str, context: int = 200):
    """Find UUID(s) for a SIP Call-ID, then print related FreeSWITCH log lines."""
    call_id = _validate_sip_call_id(call_id)
    if context < 1 or context > 2000:
        raise SystemExit("context must be between 1 and 2000")

    cfg = settings()
    with build_connection(cfg) as conn:
        result = docker_exec(
            conn,
            cfg,
            "sh",
            "-c",
            FS_CALL_LOG_SCRIPT,
            "sh",
            cfg.log,
            call_id,
            str(context),
            warn=True,
        )
        _print_stdout(result)
        if result.exited != 0:
            raise SystemExit(result.exited)


@task(hosts=DEFAULT_HOSTS)
def fs_config(c, path: str = "sip_profiles/internal.xml"):
    """Print a FreeSWITCH config file from FS_CONF."""
    cfg = settings()
    remote_path = path if path.startswith("/") else f"{cfg.conf.rstrip('/')}/{path}"
    with build_connection(cfg) as conn:
        _print_stdout(docker_exec(conn, cfg, "cat", remote_path))


@task(hosts=DEFAULT_HOSTS)
def fs_sofia(c, profile: str = ""):
    """Show Sofia status (optional profile name)."""
    command = f"sofia status profile {profile}" if profile else "sofia status"
    fs_cli(c, cmd=command)


@task(hosts=DEFAULT_HOSTS)
def fs_reloadxml(c):
    """Run reloadxml via fs_cli."""
    fs_cli(c, cmd="reloadxml")


@task(hosts=DEFAULT_HOSTS)
def fs_restart(c):
    """Restart the FreeSWITCH docker container on the remote host."""
    cfg = settings()
    with build_connection(cfg) as conn:
        conn.run(f"docker restart {shlex.quote(cfg.container)}", pty=False)


@task(hosts=DEFAULT_HOSTS)
def pcap_start(c, name: str = "", iface: str = "", filter: str = ""):
    """Start remote tcpdump in the background; writes pid + pcap under FS_PCAP_DIR."""
    cfg = settings()
    capture_iface = iface or cfg.capture_iface
    capture_filter = filter or cfg.capture_filter
    pcap_file = cfg.pcap_path(name or None)
    pid_file = cfg.pcap_pid_file
    remote = (
        f"if [ -f {shlex.quote(pid_file)} ] && kill -0 $(cat {shlex.quote(pid_file)}) 2>/dev/null; "
        f"then echo already running pid=$(cat {shlex.quote(pid_file)}); exit 1; fi; "
        f"nohup sudo tcpdump -i {shlex.quote(capture_iface)} -s 0 -w {shlex.quote(pcap_file)} "
        f"{shlex.quote(capture_filter)} >/tmp/fs-tcpdump.out 2>&1 & "
        f"echo $! > {shlex.quote(pid_file)}; "
        f"echo started pcap={shlex.quote(pcap_file)} pid=$(cat {shlex.quote(pid_file)})"
    )
    with build_connection(cfg) as conn:
        conn.run(remote, pty=False)


@task(hosts=DEFAULT_HOSTS)
def pcap_stop(c):
    """Stop the background tcpdump started by pcap-start."""
    cfg = settings()
    pid_file = cfg.pcap_pid_file
    remote = (
        f"if [ ! -f {shlex.quote(pid_file)} ]; then echo no pid file; exit 1; fi; "
        f"pid=$(cat {shlex.quote(pid_file)}); "
        f"sudo kill \"$pid\" 2>/dev/null || true; "
        f"rm -f {shlex.quote(pid_file)}; "
        f"echo stopped pid=$pid"
    )
    with build_connection(cfg) as conn:
        conn.run(remote, pty=False)


@task(hosts=DEFAULT_HOSTS)
def pcap_pull(c, remote: str, local: str = ""):
    """Download a remote pcap into ./captures/."""
    cfg = settings()
    LOCAL_CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
    destination = Path(local) if local else LOCAL_CAPTURE_DIR / Path(remote).name
    with build_connection(cfg) as conn:
        conn.get(remote, str(destination))
    print(f"saved {destination}")


@task(hosts=DEFAULT_HOSTS)
def log_pull(c, lines: int = 0, local: str = ""):
    """Pull FreeSWITCH log (full file or last N lines) into ./captures/."""
    cfg = settings()
    LOCAL_CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    destination = Path(local) if local else LOCAL_CAPTURE_DIR / f"freeswitch-{stamp}.log"
    with build_connection(cfg) as conn:
        if lines and lines > 0:
            tmp = f"/tmp/freeswitch-tail-{stamp}.log"
            conn.run(
                "docker exec "
                + shlex.quote(cfg.container)
                + " tail -n "
                + shlex.quote(str(lines))
                + " "
                + shlex.quote(cfg.log)
                + " > "
                + shlex.quote(tmp),
                pty=False,
            )
            conn.get(tmp, str(destination))
            conn.run(f"rm -f {shlex.quote(tmp)}", pty=False, warn=True)
        else:
            tmp = f"/tmp/freeswitch-full-{stamp}.log"
            conn.run(
                "docker cp "
                + shlex.quote(f"{cfg.container}:{cfg.log}")
                + " "
                + shlex.quote(tmp),
                pty=False,
            )
            conn.get(tmp, str(destination))
            conn.run(f"rm -f {shlex.quote(tmp)}", pty=False, warn=True)
    print(f"saved {destination}")
