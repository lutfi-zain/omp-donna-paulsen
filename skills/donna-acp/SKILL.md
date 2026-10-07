---
name: donna-acp
description: >
  Cross-agent communication bridge using OMP ACP (Agent Client Protocol) over
  stdio. Use when Donna needs to query, command, or coordinate with other OMP
  sessions in their respective project workspaces: "cek kuliah di zoom", "tanya
  agent zoom", "tanya finnplan", "cek posisi kas di finnplan", "status frontend
  maniyy", "cek mcp reedrich", "kirim prompt ke agent lain", or "hubungi session
  lain".
license: MIT
---

# Donna ACP — Cross-Agent Communication Bridge

## When to Use
- Donna needs real-time context from other workspaces without switching her own root context.
- Querying lecture recordings, summaries, or class schedules in `zoom` (`/home/ubuntu/projects/zoom`).
- Checking financial state, active budgets, or recording transactions via `finnplan` (`/home/ubuntu/projects/omp-finnplan`).
- Checking frontend progress, tests, or UI build status in `maniyy` (`/home/ubuntu/projects/lz-maniyy-v2`).
- Inspecting backend API contracts, D1 migrations, or tools in `mcp` (`/home/ubuntu/projects/finnplan-mcp`).
- Listing past sessions across any workspace to inspect discussion history.

## Inputs
- **Target Workspace**: Alias (`zoom`, `maniyy`, `finnplan`, `mcp`) atau path folder absolut/relatif.
- **Prompt**: Pertanyaan atau perintah spesifik yang ingin diajukan ke agent di folder tersebut.
- **Session ID (Opsional)**: ID sesi lama jika ingin melanjutkan percakapan yang sudah ada.

## Output Structure
Output teks langsung dari agent target, atau struktur JSON bila memakai flag `--json`.

## Process
1. **Pilih Target**: Tentukan alias target workspace menggunakan `python3 .agents/skills/donna-acp/scripts/acp.py catalog`.
2. **Kirim Instruksi**: Jalankan query ACP:
   ```bash
   python3 .agents/skills/donna-acp/scripts/acp.py ask <target> "<prompt>" --quiet
   ```
3. **Lanjutkan Sesi (Bila Perlu)**: Gunakan flag `--session <sessionId>` untuk resume sesi sebelumnya. Cek daftar sesi dengan:
   ```bash
   python3 .agents/skills/donna-acp/scripts/acp.py list <target>
   ```
4. **Sintesis Bergaya Donna**: Olah jawaban teknis dari agent target menjadi bahasa ringkas, percaya diri, dan solutif untuk Lutfi.
5. **Catat ke OKF**: Jika informasi bernilai tahan lama (misal: ringkasan materi kuliah atau status rilis fitur), catat ke jurnal atau konsep proyek terkait di `.okf/`.

## Critical Rules
- Selalu tangani izin tool (`session/request_permission`) agar komunikasi tidak terhenti (*auto-approved oleh script `acp.py`*).
- Jangan ubah konteks root kerja Donna; selalu delegasikan tugas domain spesifik ke workspace aslinya via ACP.
- Jangan tampilkan pesan raw JSON-RPC ke Lutfi kecuali diminta untuk debugging.
- Konversi data teknis dari sub-agent ke dalam gaya bicara Donna: kesimpulan di depan, jelas, dan tanpa bertele-tele.
