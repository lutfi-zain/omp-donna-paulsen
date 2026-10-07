# Protokol ACP (Agent Client Protocol) OMP

Spesifikasi dan mekanisme komunikasi antar-agent OMP menggunakan protokol ACP over stdio (JSON-RPC 2.0).

---

## 1. Arsitektur Komunikasi

OMP mengimplementasikan protokol **Agent Client Protocol (ACP)** yang distandarisasi untuk komunikasi antar agent AI dan host editor (seperti Zed, IDE, atau orkestrator multi-agent).

Ketika perintah `omp acp` dijalankan di suatu direktori:
1. Proses berjalan sebagai server headless berbasis **JSON-RPC 2.0**.
2. Transport komunikasi menggunakan **stdio** (standard input/output) dengan *newline-delimited JSON* (`ndjson`).
3. Seluruh tools, rules, memory, dan konfigurasi lokal pada direktori kerja (`cwd`) diaktifkan secara otomatis.

```
+-------------------------------------------------------------+
|                     Donna Paulsen                           |
|       (Asisten Eksekutif / Second Brain / Orkestrator)      |
+-------------------------------------------------------------+
                              |
                     stdio (JSON-RPC 2.0)
                              |
       +----------------------+----------------------+
       |                      |                      |
       v                      v                      v
+--------------+      +--------------+      +--------------+
|   omp acp    |      |   omp acp    |      |   omp acp    |
|  (CWD: zoom) |      | (CWD: maniyy)|      | (CWD: finn)  |
+--------------+      +--------------+      +--------------+
| Asisten      |      | Frontend     |      | Financial    |
| Kuliah       |      | Dev Agent    |      | Planner      |
+--------------+      +--------------+      +--------------+
```

---

## 2. Alur Pesan (Message Lifecycle)

### A. Inisialisasi (`initialize`)
Klien mengirim negosiasi kemampuan awal:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientCapabilities": {},
    "clientInfo": { "name": "donna-acp", "version": "1.0.0" }
  }
}
```
*Catatan penting*: Kosongkan `clientCapabilities` (`{}`) agar agent menggunakan built-in tool file reader/writer internalnya sendiri, bukan mendelegasikan I/O file kembali ke klien.

Server merespons:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": 1,
    "agentInfo": { "name": "omp", "version": "18.6.0" },
    "agentCapabilities": {
      "loadSession": true,
      "sessionCapabilities": { "list": {}, "resume": {}, "close": {} }
    }
  }
}
```

### B. Pembuatan / Pemuatan Sesi (`session/new` atau `session/load`)
1. **Sesi Baru**:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "session/new",
  "params": { "cwd": "/home/ubuntu/projects/zoom", "mcpServers": [] }
}
```
Respons:
```json
{ "jsonrpc": "2.0", "id": 2, "result": { "sessionId": "<uuid>" } }
```

2. **Muat Sesi Lama**:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "session/load",
  "params": { "sessionId": "<existing-uuid>", "cwd": "/home/ubuntu/projects/omp-finnplan", "mcpServers": [] }
}
```

### C. Pengiriman Prompt (`session/prompt`)
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "session/prompt",
  "params": {
    "sessionId": "<uuid>",
    "prompt": [{ "type": "text", "text": "Apa status ringkasan kuliah hari ini?" }]
  }
}
```

### D. Streaming Notifikasi (`session/update`)
Selama proses berpikir dan eksekusi tool, server mengirim notifikasi:
- `sessionUpdate: "agent_message_chunk"`: teks balasan incremental.
- `sessionUpdate: "tool_call"`: informasi tool yang sedang dipanggil.

### E. Penanganan Izin Tool (`session/request_permission`)
Jika agent target memanggil tool yang membutuhkan konfirmasi (seperti `bash`, `edit`, `delete`), server mengirim *request* ke klien:
```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "session/request_permission",
  "params": {
    "sessionId": "<uuid>",
    "toolCall": { "title": "$ ls -la", "kind": "execute" },
    "options": [
      { "optionId": "allow_once", "name": "Allow once", "kind": "allow_once" },
      { "optionId": "allow_always", "name": "Always allow", "kind": "allow_always" }
    ]
  }
}
```
Klien **wajib** merespons request ini dengan opsi persetujuan:
```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "result": {
    "outcome": { "outcome": "selected", "optionId": "allow_always" }
  }
}
```
*Script `acp.py` menangani auto-approval ini secara otomatis sehingga tidak terjadi deadlock/hang.*

---

## 3. Perbandingan ACP vs Headless Print CLI

| Aspek | OMP ACP (`omp acp`) | OMP Print (`omp -p`) |
|---|---|---|
| **Protokol** | Standar JSON-RPC 2.0 dua arah | One-shot CLI stdout |
| **Interaktivitas** | Mendukung multi-turn dalam satu proses | Satu kali jalan lalu exit |
| **Penanganan Izin** | Interaktif via `session/request_permission` | Bergantung flag `--auto-approve` |
| **Streaming** | Event granular (`session/update`, tokens, tool calls) | Streaming teks biasa |
| **Session Control** | Dapat inspect, list, switch, dan load session ID spesifik | Hanya `--continue` atau `--resume` |
