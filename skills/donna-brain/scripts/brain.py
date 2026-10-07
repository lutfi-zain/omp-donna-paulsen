#!/usr/bin/env python3
"""Donna's second-brain helper for the OKF bundle at `.okf/`.

Subcommands:
  today      Ensure today's journal concept exists (Asia/Jakarta date); print its path.
  reindex    Regenerate every directory's `index.md` from concept frontmatter.
  pending    List concepts flagged `memory_sync: pending` (Hindsight retain not yet done).
  check      `reindex`, then run the OKF validator with --strict.

Run from the repository root:  python3 .agents/skills/donna-brain/scripts/brain.py <cmd>
Requires PyYAML.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

ROOT = Path(__file__).resolve().parents[4]
BUNDLE = ROOT / ".okf"
VALIDATOR = ROOT / ".agents/skills/validate/scripts/okf_validate.py"
LOCAL_TZ = ZoneInfo("Asia/Jakarta")
RESERVED = {"index.md", "log.md"}
OKF_VERSION = "0.2"


def read_frontmatter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end == -1:
        return {}
    meta = yaml.safe_load(text[4:end]) or {}
    return meta if isinstance(meta, dict) else {}


def is_dated(name: str) -> bool:
    return name[:1].isdigit()


def ordered(paths: list[Path]) -> list[Path]:
    """Dated entries (journal years/months/days) newest first; everything else A→Z."""
    dated = sorted((p for p in paths if is_dated(p.name)), key=lambda p: p.name, reverse=True)
    named = sorted((p for p in paths if not is_dated(p.name)), key=lambda p: p.name.lower())
    return named + dated


def count_concepts(directory: Path) -> int:
    return sum(1 for p in directory.rglob("*.md") if p.name not in RESERVED)


def entry(title: str, href: str, description: str) -> str:
    title = title.replace("[", "(").replace("]", ")")
    return f"* [{title}]({href}) - {description}" if description else f"* [{title}]({href})"


def build_index(directory: Path) -> str:
    concepts = ordered([p for p in directory.glob("*.md") if p.name not in RESERVED])
    subdirs = ordered([p for p in directory.iterdir() if p.is_dir() and count_concepts(p)])

    lines: list[str] = []
    if directory == BUNDLE:
        lines += ["---", f'okf_version: "{OKF_VERSION}"', "---", "", "# Donna Second Brain", ""]
    else:
        rel = directory.relative_to(BUNDLE).as_posix()
        lines += [f"# {rel}", ""]

    if subdirs:
        lines += ["# Directories", ""]
        for d in subdirs:
            n = count_concepts(d)
            lines.append(entry(f"{d.name}/", f"{d.name}/", f"{n} konsep"))
        lines.append("")

    if concepts:
        lines += ["# Concepts", ""]
        for c in concepts:
            meta = read_frontmatter(c)
            title = str(meta.get("title") or c.stem)
            desc = str(meta.get("description") or "").strip()
            status = meta.get("status")
            if status in ("draft", "deprecated"):
                desc = f"[{status}] {desc}".strip()
            lines.append(entry(title, c.name, desc))
        lines.append("")

    return "\n".join(lines)


def cmd_reindex(_: argparse.Namespace) -> int:
    dirs = [BUNDLE] + sorted(p for p in BUNDLE.rglob("*") if p.is_dir() and not p.name.startswith("."))
    written = 0
    for d in dirs:
        index = d / "index.md"
        if d != BUNDLE and count_concepts(d) == 0:
            if index.exists():
                index.unlink()
            continue
        content = build_index(d)
        if not index.exists() or index.read_text(encoding="utf-8") != content:
            index.write_text(content, encoding="utf-8")
            written += 1
    print(f"reindex: {written} index.md updated")
    return 0


def cmd_today(_: argparse.Namespace) -> int:
    now_local = datetime.now(LOCAL_TZ)
    day = now_local.date().isoformat()
    path = BUNDLE / "journal" / f"{now_local:%Y}" / f"{now_local:%m}" / f"{day}.md"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        meta = {
            "type": "Journal Entry",
            "title": f"Jurnal {day}",
            "description": f"Aktivitas, keinginan, perasaan, dan orang yang terlibat pada {day}.",
            "tags": ["journal"],
            "date": day,
            "mood": None,
            "generated": {"by": "process:donna-brain", "at": now_utc},
        }
        body = (
            "# Aktivitas\n\n"
            "# Keinginan & Rencana\n\n"
            "# Perasaan\n\n"
            "# Orang\n\n"
            "# Catatan Donna\n"
        )
        path.write_text("---\n" + yaml.safe_dump(meta, sort_keys=False, allow_unicode=True) + "---\n\n" + body,
                        encoding="utf-8")
    print(path.relative_to(ROOT).as_posix())
    return 0


def cmd_pending(_: argparse.Namespace) -> int:
    hits = [p for p in sorted(BUNDLE.rglob("*.md"))
            if p.name not in RESERVED and read_frontmatter(p).get("memory_sync") == "pending"]
    for p in hits:
        print(p.relative_to(ROOT).as_posix())
    print(f"pending: {len(hits)}", file=sys.stderr)
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    cmd_reindex(args)
    return subprocess.call([sys.executable, str(VALIDATOR), str(BUNDLE), "--strict"])


def main() -> int:
    ap = argparse.ArgumentParser(description="Donna second-brain helper (.okf bundle)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, fn in (("today", cmd_today), ("reindex", cmd_reindex), ("pending", cmd_pending), ("check", cmd_check)):
        sub.add_parser(name).set_defaults(fn=fn)
    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
