#!/usr/bin/env python3
"""OMP ACP (Agent Client Protocol) Bridge for Donna.

Allows Donna to communicate with other OMP agents and sessions in their
respective workspaces (zoom, lz-maniyy-v2, omp-finnplan, finnplan-mcp, etc.)
using the standard ACP JSON-RPC 2.0 protocol over stdio.

Usage:
  python3 acp.py catalog
  python3 acp.py ping <target>
  python3 acp.py list <target>
  python3 acp.py ask <target> "<prompt>" [--session <id>] [--timeout <sec>] [--quiet]
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

# Default alias catalog mapping to known workspaces
WORKSPACE_CATALOG: Dict[str, Dict[str, str]] = {
    "zoom": {
        "path": "/home/ubuntu/projects/zoom",
        "title": "Asisten Kuliah & Zoom Bot",
        "description": "Mengelola rekaman Zoom, transkripsi materi kuliah, dan arsip perkuliahan OKF.",
    },
    "maniyy": {
        "path": "/home/ubuntu/projects/lz-maniyy-v2",
        "title": "Frontend Maniyy v2",
        "description": "Frontend Svelte 5 / dashboard personal financial planning (Ledger Studio & Planning).",
    },
    "maniyy-fe": {
        "path": "/home/ubuntu/projects/lz-maniyy-v2",
        "title": "Frontend Maniyy v2 (Alias)",
        "description": "Alias untuk lz-maniyy-v2.",
    },
    "finnplan": {
        "path": "/home/ubuntu/projects/omp-finnplan",
        "title": "Financial Planning Agent (Eve/Finnplan)",
        "description": "Agent konsultasi keuangan pribadi via Telegram @evefinn_bot dan ReedRich MCP.",
    },
    "omp-finnplan": {
        "path": "/home/ubuntu/projects/omp-finnplan",
        "title": "Financial Planning Agent (Alias)",
        "description": "Alias untuk omp-finnplan.",
    },
    "mcp": {
        "path": "/home/ubuntu/projects/finnplan-mcp",
        "title": "ReedRich MCP Server Backend",
        "description": "Backend Cloudflare Workers Edge MCP server, database schema Drizzle/Postgres, tools finansial.",
    },
    "finnplan-mcp": {
        "path": "/home/ubuntu/projects/finnplan-mcp",
        "title": "ReedRich MCP Server (Alias)",
        "description": "Alias untuk finnplan-mcp.",
    },
    "reedrich-mcp": {
        "path": "/home/ubuntu/projects/finnplan-mcp",
        "title": "ReedRich MCP Server (Alias)",
        "description": "Alias untuk reedrich-mcp.",
    },
    "donna": {
        "path": "/home/ubuntu/projects/donna-paulsen",
        "title": "Donna Paulsen Second Brain",
        "description": "Repositori Donna sendiri.",
    },
}


def resolve_target(target: str) -> Path:
    """Resolve an alias or filesystem path to an absolute Path."""
    key = target.strip().lower()
    if key in WORKSPACE_CATALOG:
        path = Path(WORKSPACE_CATALOG[key]["path"])
    else:
        path = Path(target).expanduser().resolve()

    if not path.exists() or not path.is_dir():
        raise ValueError(f"Target directory tidak ditemukan atau bukan folder: {path} (input: {target})")
    return path


class AcpClient:
    """Synchronous ACP client speaking JSON-RPC 2.0 with `omp acp` over stdio."""

    def __init__(self, cwd: Path, timeout: float = 180.0, debug: bool = False):
        self.cwd = cwd
        self.timeout = timeout
        self.debug = debug
        self.req_id = 0
        self.proc: Optional[subprocess.Popen] = None

    def start(self) -> None:
        """Spawn the `omp acp` server in the target workspace."""
        self.proc = subprocess.Popen(
            ["omp", "acp"],
            cwd=str(self.cwd),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

    def close(self) -> None:
        """Terminate the server process."""
        if self.proc:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=2.0)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
            self.proc = None

    def _send(self, method: str, params: Optional[Dict[str, Any]] = None) -> int:
        self.req_id += 1
        msg: Dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": self.req_id,
            "method": method,
        }
        if params is not None:
            msg["params"] = params
        line = json.dumps(msg)
        if self.debug:
            print(f">> {line}", file=sys.stderr)
        assert self.proc and self.proc.stdin
        self.proc.stdin.write(line + "\n")
        self.proc.stdin.flush()
        return self.req_id

    def _reply(self, req_id: int, result: Any) -> None:
        msg = {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": result,
        }
        line = json.dumps(msg)
        if self.debug:
            print(f">> (reply) {line}", file=sys.stderr)
        assert self.proc and self.proc.stdin
        self.proc.stdin.write(line + "\n")
        self.proc.stdin.flush()

    def _read_message(self, deadline: float) -> Optional[Dict[str, Any]]:
        assert self.proc and self.proc.stdout
        while time.time() < deadline:
            line = self.proc.stdout.readline()
            if not line:
                return None
            line = line.strip()
            if not line:
                continue
            if self.debug:
                print(f"<< {line}", file=sys.stderr)
            try:
                data = json.loads(line)
                return data
            except json.JSONDecodeError:
                continue
        return None

    def initialize(self) -> Dict[str, Any]:
        """Perform protocol initialization."""
        req_id = self._send(
            "initialize",
            {
                "protocolVersion": 1,
                "clientCapabilities": {},  # Leave empty so agent uses internal tools, not client bridge
                "clientInfo": {"name": "donna-acp", "version": "1.0.0"},
            },
        )
        deadline = time.time() + 15.0
        while time.time() < deadline:
            msg = self._read_message(deadline)
            if not msg:
                break
            if msg.get("id") == req_id:
                if "error" in msg:
                    raise RuntimeError(f"ACP initialize error: {msg['error']}")
                return msg.get("result", {})
        raise TimeoutError("Timeout waiting for ACP initialize response")

    def list_sessions(self) -> List[Dict[str, Any]]:
        """List past/active sessions in the workspace."""
        self.initialize()
        req_id = self._send("session/list", {"cwd": str(self.cwd)})
        deadline = time.time() + 15.0
        while time.time() < deadline:
            msg = self._read_message(deadline)
            if not msg:
                break
            if msg.get("id") == req_id:
                if "error" in msg:
                    raise RuntimeError(f"ACP session/list error: {msg['error']}")
                return msg.get("result", {}).get("sessions", [])
        return []

    def prompt(
        self,
        prompt_text: str,
        session_id: Optional[str] = None,
        quiet: bool = False,
    ) -> Dict[str, Any]:
        """Run a full prompt turn, handle auto-approvals, and return the agent response."""
        self.initialize()

        # Load or create session
        if session_id:
            req_id = self._send(
                "session/load",
                {"sessionId": session_id, "cwd": str(self.cwd), "mcpServers": []},
            )
            deadline = time.time() + 30.0
            loaded = False
            while time.time() < deadline:
                msg = self._read_message(deadline)
                if not msg:
                    break
                if msg.get("id") == req_id:
                    if "error" in msg:
                        raise RuntimeError(f"ACP session/load failed: {msg['error']}")
                    loaded = True
                    break
            if not loaded:
                raise TimeoutError("Timeout loading existing session")
        else:
            req_id = self._send(
                "session/new",
                {"cwd": str(self.cwd), "mcpServers": []},
            )
            deadline = time.time() + 30.0
            new_sid = None
            while time.time() < deadline:
                msg = self._read_message(deadline)
                if not msg:
                    break
                if msg.get("id") == req_id:
                    if "error" in msg:
                        raise RuntimeError(f"ACP session/new failed: {msg['error']}")
                    new_sid = msg.get("result", {}).get("sessionId")
                    break
            if not new_sid:
                raise TimeoutError("Timeout creating new session")
            session_id = new_sid

        # Send prompt
        prompt_req_id = self._send(
            "session/prompt",
            {
                "sessionId": session_id,
                "prompt": [{"type": "text", "text": prompt_text}],
            },
        )

        reply_chunks: List[str] = []
        tools_executed: List[str] = []
        deadline = time.time() + self.timeout

        while time.time() < deadline:
            msg = self._read_message(deadline)
            if not msg:
                break

            # Handle permission request from agent
            if "method" in msg and "id" in msg:
                if msg["method"] == "session/request_permission":
                    tool_info = msg.get("params", {}).get("toolCall", {})
                    tool_title = tool_info.get("title") or tool_info.get("kind") or "tool"
                    tools_executed.append(tool_title)
                    if not quiet:
                        print(f" [Donna ACP auto-approved: {tool_title}]", file=sys.stderr)
                    # Automatically select allow_always so sub-actions proceed without friction
                    self._reply(
                        msg["id"],
                        {"outcome": {"outcome": "selected", "optionId": "allow_always"}},
                    )
                    continue

            # Handle final response
            if msg.get("id") == prompt_req_id:
                if "error" in msg:
                    raise RuntimeError(f"ACP prompt error: {msg['error']}")
                return {
                    "sessionId": session_id,
                    "reply": "".join(reply_chunks).strip(),
                    "tools": tools_executed,
                    "usage": msg.get("result", {}).get("usage"),
                    "stopReason": msg.get("result", {}).get("stopReason"),
                }

            # Handle streaming updates
            if msg.get("method") == "session/update":
                upd = msg.get("params", {}).get("update", {})
                kind = upd.get("sessionUpdate")
                if kind == "agent_message_chunk":
                    txt = upd.get("content", {}).get("text", "")
                    reply_chunks.append(txt)
                    if not quiet and sys.stdout.isatty():
                        sys.stdout.write(txt)
                        sys.stdout.flush()
                elif kind == "tool_call":
                    title = upd.get("title", "")
                    if title and title not in tools_executed:
                        tools_executed.append(title)
                        if not quiet:
                            print(f" [Agent Tool: {title}]", file=sys.stderr)

        raise TimeoutError(f"ACP prompt timed out after {self.timeout} seconds")


# CLI Commands
def cmd_catalog(args: argparse.Namespace) -> int:
    print("Catalog Workspace Agent yang Dikelola Donna:")
    print("=" * 60)
    for alias, info in sorted(WORKSPACE_CATALOG.items()):
        print(f"• {alias:14} -> {info['path']}")
        print(f"  {info['title']}: {info['description']}")
    return 0


def cmd_ping(args: argparse.Namespace) -> int:
    path = resolve_target(args.target)
    client = AcpClient(path, timeout=15.0)
    try:
        client.start()
        res = client.initialize()
        agent_info = res.get("agentInfo", {})
        print(f"✓ ACP Server Aktif di {path}")
        print(f"  Agent: {agent_info.get('title', agent_info.get('name'))} v{agent_info.get('version')}")
        print(f"  Capabilities: {list(res.get('agentCapabilities', {}).keys())}")
        return 0
    finally:
        client.close()


def cmd_list(args: argparse.Namespace) -> int:
    path = resolve_target(args.target)
    client = AcpClient(path, timeout=20.0)
    try:
        client.start()
        sessions = client.list_sessions()
        if not sessions:
            print(f"Belum ada session tersimpan di {path}.")
            return 0
        print(f"Session di {path} ({len(sessions)} session):")
        print("-" * 75)
        for s in sessions:
            sid = s.get("sessionId", "")
            title = s.get("title") or "(Untitled)"
            updated = s.get("updatedAt", "")[:19]
            msg_count = s.get("_meta", {}).get("messageCount", "?")
            print(f"• {sid} | {updated} | {msg_count} msgs | {title}")
        return 0
    finally:
        client.close()


def cmd_ask(args: argparse.Namespace) -> int:
    path = resolve_target(args.target)
    client = AcpClient(path, timeout=float(args.timeout), debug=args.debug)
    try:
        client.start()
        result = client.prompt(
            prompt_text=args.prompt,
            session_id=args.session,
            quiet=args.quiet,
        )
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            if not sys.stdout.isatty() or args.quiet:
                print(result["reply"])
            elif not result["reply"]:
                print("(Agent tidak menghasilkan output teks)")
            else:
                print()  # newline after streaming
        return 0
    finally:
        client.close()


def main() -> int:
    ap = argparse.ArgumentParser(description="OMP ACP Bridge for Donna")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("catalog", help="Tampilkan daftar workspace agent yang dikenal")

    p_ping = sub.add_parser("ping", help="Ping agent di workspace target")
    p_ping.add_argument("target", help="Nama alias (zoom, maniyy, finnplan, mcp) atau path folder")

    p_list = sub.add_parser("list", help="List session di workspace target")
    p_list.add_argument("target", help="Nama alias atau path folder")

    p_ask = sub.add_parser("ask", help="Kirim prompt ke agent di workspace target")
    p_ask.add_argument("target", help="Nama alias atau path folder")
    p_ask.add_argument("prompt", help="Teks instruksi / pertanyaan")
    p_ask.add_argument("--session", default=None, help="Resume session ID tertentu (opsional)")
    p_ask.add_argument("--timeout", default=180, type=float, help="Timeout detik (default 180)")
    p_ask.add_argument("--quiet", action="store_true", help="Jangan tampilkan status auto-approval atau streaming")
    p_ask.add_argument("--json", action="store_true", help="Output format JSON lengkap")
    p_ask.add_argument("--debug", action="store_true", help="Print raw ACP wire messages ke stderr")

    args = ap.parse_args()
    if args.cmd == "catalog":
        return cmd_catalog(args)
    elif args.cmd == "ping":
        return cmd_ping(args)
    elif args.cmd == "list":
        return cmd_list(args)
    elif args.cmd == "ask":
        return cmd_ask(args)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
