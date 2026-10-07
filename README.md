# Donna Paulsen Assistant (`omp-donna-paulsen`)

<p align="center">
  <strong>"I'm Donna. I know everything."</strong><br>
  <em>Executive AI Assistant, Second Brain & Agentic Context Engineering Runtime for Oh My Pi (<code>omp</code>).</em>
</p>

<p align="center">
  <a href="https://github.com/lutfi-zain/omp-donna-paulsen/releases"><img src="https://img.shields.io/badge/version-0.1.0-blue.svg?style=flat-square" alt="Version"></a>
  <a href="https://github.com/lutfi-zain/omp-donna-paulsen/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun%20%7C%20Node%2022+-f472b6.svg?style=flat-square" alt="Runtime"></a>
  <a href="https://omp.sh"><img src="https://img.shields.io/badge/ecosystem-Oh%20My%20Pi%20(omp)-orange.svg?style=flat-square" alt="OMP Ecosystem"></a>
  <a href="https://github.com/lutfi-zain/omp-donna-paulsen"><img src="https://img.shields.io/badge/architecture-Agentic%20Context%20Engineering-purple.svg?style=flat-square" alt="Architecture"></a>
</p>

---

## 🏛️ Executive Summary

**Donna Paulsen Assistant** is a high-performance runtime extension for **Oh My Pi (`omp`)**. It embodies the persona, instinct, and gatekeeping excellence of Donna Paulsen from *Suits*—serving as your chief of staff, personal second brain, and unapologetic truth-teller.

Unlike naive prompt-based assistants that clog execution with sequential file reading and manual note-taking, Donna Paulsen Assistant is built on **Agentic Context Engineering (ACE)**:
- **Instant Context Injection**: Surfaces personal knowledge, relationships, and active deadlines into the model prompt in **< 4 milliseconds**.
- **Zero Latency in the Hot Path**: The assistant responds immediately (< 1.5s). Memory updates, daily journaling, and git commits execute strictly in the background.
- **Strict Engine/Vault Decoupling**: The runtime code is 100% agnostic and stateless. User data lives exclusively in local user vaults (`.okf/`).

---

## ⚡ The Architecture: Fast Loop vs. Slow Loop

Conventional agentic memory suffers from the **Write-in-the-Hot-Path Anti-Pattern**, where the LLM executes 8–11 sequential tool calls (`glob` → `read` → `edit` → `check` → `commit`) *before* sending a response, forcing users to wait 40–75 seconds.

Donna Paulsen Assistant eliminates this by decoupling **Cognition** from **Memory Maintenance**:

```
[User Message Ingress]
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  1. Ingress Hook: before_agent_start (< 4ms)           │
│  • In-memory entity tokenizer & n-gram matcher         │
│  • Hybrid extraction across people, projects, decisions│
│  • Pre-injects <donna-context> directly into prompt   │
└────────────────────────┬───────────────────────────────┘
                         │ (Zero Disk I/O Blocking)
                         ▼
┌────────────────────────────────────────────────────────┐
│  2. Cognitive Fast Loop (LLM Generation - < 1.5s)      │
│  • Donna has full context on Token 0                   │
│  • Answers immediately with sharp, executive clarity   │
│  • Streams response directly to Telegram / Terminal    │
└────────────────────────┬───────────────────────────────┘
                         │ (User Already Has the Answer)
                         ▼
┌────────────────────────────────────────────────────────┐
│  3. Egress Cold Loop: agent_end (Asynchronous Worker)  │
│  • Isolated OMP managed timer (ctx.setTimeout)         │
│  • Daily interaction logging (Asia/Jakarta WIB)        │
│  • Atomic concept updates (.okf/)                      │
│  • Background Git commit & conformance verification    │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Quickstart: Setup on a Fresh Machine

Donna Paulsen Assistant is designed to be set up on a brand-new machine for any user in **under 10 seconds**.

### Prerequisites
- [Oh My Pi (`omp`)](https://omp.sh) installed
- Node.js $\ge 22$ or [Bun](https://bun.sh) $\ge 1.3$

### Step 1: Install the Plugin
Run a single command in your terminal:
```bash
omp plugin install github:lutfi-zain/omp-donna-paulsen
```
*(Or clone locally and link via `omp plugin link .`)*

### Step 2: Initialize a New User Vault
Navigate to any directory where you want to keep your personal second brain (e.g., `~/my-assistant`):
```bash
mkdir ~/my-assistant && cd ~/my-assistant
```

Launch `omp` and run the built-in scaffolding command:
```text
/donna init "Your Name"
```

**That's it.** Donna automatically scaffolds:
- `.okf/` complete knowledge bundle (profile, persona, people, projects, goals, commitments, decisions, journal).
- `AGENTS.md` tailored behavior contract for your name.
- Persona dossier of Donna Paulsen (`.okf/persona/donna-paulsen.md`).

---

## 🛠️ Built-in Native Tools

Donna Paulsen Assistant mounts native high-performance tools directly into the OMP session:

| Tool | Purpose |
|---|---|
| `donna_context_pull` | Deep multi-hop query into the OKF knowledge graph for on-demand research during complex tasks. |
| `donna_remember` | Atomically records a durable truth, person, or preference without manual multi-file editing. |

### Slash Commands
- `/donna` — Displays active bundle location, principal name, total indexed concepts, and active commitments.
- `/donna init <name>` — Scaffolds a clean, isolated vault for a new user.
- `/donna rescan` — Instantly re-indexes the in-memory concept cache.

---

## ⚙️ Configuration Reference

Customize Donna's runtime behavior in `~/.omp/agent/config.yml` or `<workspace>/.omp/config.yml`:

```yaml
donna:
  # Path to OKF bundle (defaults to <cwd>/.okf, then ~/.donna/brain)
  bundlePath: ".okf"

  # Identity Configuration
  personaName: "Donna"          # Persona name (default: "Donna")
  principalName: "auto"         # Auto-detected from .okf/profile/*.md, or string

  # Agentic Context Engineering
  contextPulling: true          # Enable zero-latency ingress prompt injection
  maxContextTokens: 2500        # Token budget for injected context
  entityMatching: "hybrid"      # "exact" | "fuzzy" | "hybrid" (with phonetic support)

  # Background Memory Worker
  autoConsolidate: true         # Enable non-blocking post-turn memory consolidation
  autoJournal: true             # Automatically log turn summaries in daily journal
  autoGitCommit: true           # Automatically commit vault changes to git
  consolidationDelayMs: 250     # Delay before background worker executes (ms)
```

---

## 🛡️ Privacy & Vault Isolation

- **Zero Leakage**: The engine package contains zero personal data, API tokens, or private notes.
- **Git-Tracked Truth**: All knowledge resides in human-readable Markdown files compliant with the [Open Knowledge Framework (OKF v0.2)](https://github.com/okf-spec).
- **Offline First**: All entity extraction and memory consolidation occurs locally on your machine.

---

## 👥 Persona & Philosophy

Donna Paulsen is not a passive conversational bot. She operates under four strict rules:

1. **Conclusion First**: The first sentence is the answer or verdict. Details follow only when necessary.
2. **Declarative & Direct**: No *"perhaps"*, *"maybe"*, or *"as an AI"*. If the evidence exists, Donna states it with conviction.
3. **Radical Candor**: Donna will tell you when a plan is bad, when a timeline is delusional, and when you are sabotaging yourself.
4. **Protective Gatekeeping**: She defends your focus, your energy, and your family above trivial distractions.

---

## 📜 License

MIT © [Lutfi Zain](https://github.com/lutfi-zain)
