# Concept templates — Donna Second Brain

Copy the matching block, fill it, delete unused optional keys. `type` is the only
hard requirement (OKF §11); everything else makes the note trustworthy.

Shared rules:
- `generated.by`: `donna/<model-id>` (e.g. `donna/gemini-3.8-flash`). Script-made skeletons: `process:donna-brain` — replace with your own actor once you write content.
- `generated.at`: UTC ISO 8601 with `Z`, from `date -u +%Y-%m-%dT%H:%M:%SZ`.
- `verified`: add `{ by: human:lutfi, at: ... }` ONLY when Lutfi explicitly confirms/corrects the content.
- `sources[].resource` for things Lutfi said: `conversation:<channel>/<YYYY-MM-DD>` (channel = `telegram` | `terminal`), `author: human:lutfi`.
- `memory_sync: pending` only when the Hindsight retain for this note failed; remove after a successful retain.
- Links: bundle-absolute, e.g. `[Budi](/people/budi-santoso.md)`.

## Person — `people/<first>-<last>.md`

```markdown
---
type: Person
title: <Nama lengkap / panggilan>
description: <Siapa dia bagi Lutfi, satu kalimat.>
tags: [people, <keluarga|kantor|teman|klien|recruiter|...>]
relationship: <atasan | rekan | keluarga | teman | ...>
organization: /organizations/<org>.md
generated: { by: donna/<model-id>, at: <ISO> }
sources:
  - { id: chat-<YYYYMMDD>, resource: conversation:telegram/<YYYY-MM-DD>, author: human:lutfi }
---

# Siapa

# Hubungan dengan Lutfi

# Preferensi & Detail Penting
<!-- ulang tahun, makanan, gaya komunikasi, sensitivitas -->

# Riwayat Interaksi
- <YYYY-MM-DD> — <apa yang terjadi> ([jurnal](/journal/<YYYY>/<MM>/<YYYY-MM-DD>.md))

# Follow-up Terbuka
```

## Journal Entry — `journal/<YYYY>/<MM>/<YYYY-MM-DD>.md`

Create with `brain.py today`; append bullets under the headings it scaffolds.

```markdown
# Aktivitas
- <HH:MM WIB> <apa yang dikerjakan> — [proyek](/projects/<slug>.md)

# Keinginan & Rencana
# Perasaan
- <HH:MM WIB> <sinyal emosi + pemicunya, kata-kata Lutfi sendiri bila ada>
# Orang
- [<nama>](/people/<slug>.md) — <konteks>
# Catatan Donna
<!-- pola yang Donna lihat, hal yang perlu diangkat besok -->
```

Set frontmatter `mood:` to a short word (`fokus`, `capek`, `kesal`, `senang`, `cemas`, ...) only from explicit signals.

## Project — `projects/<slug>.md`

```markdown
---
type: Project
title: <Nama proyek>
description: <Apa dan kenapa, satu kalimat.>
resource: <URL repo / Jira / folder — omit jika abstrak>
tags: [project, <domain>]
status: stable          # deprecated saat proyek selesai/ditinggal
project_state: <aktif | tertahan | selesai>
generated: { by: donna/<model-id>, at: <ISO> }
---

# Tujuan
# Status Terkini
# Orang Terlibat
# Keputusan
# Log Kerja
- <YYYY-MM-DD> — <progress> ([jurnal](/journal/...))
```

## Goal — `goals/<slug>.md` (keinginan, target, wishlist)

```markdown
---
type: Goal
title: <Keinginan>
description: <Apa yang Lutfi mau, dengan kata-katanya.>
tags: [goal, <karier|finansial|kesehatan|personal|...>]
horizon: <minggu ini | bulan ini | tahun ini | suatu hari>
goal_state: <aktif | tercapai | dilepas>
generated: { by: donna/<model-id>, at: <ISO> }
---

# Kenapa Ini Penting
# Langkah Berikutnya
# Progress
```

## Commitment — `commitments/<YYYY-MM-DD>-<slug>.md` (janji, deadline, follow-up)

```markdown
---
type: Commitment
title: <Apa yang dijanjikan / harus dilakukan>
description: <Siapa ke siapa, kapan.>
tags: [commitment]
owner: <lutfi | /people/<slug>.md>
counterparty: /people/<slug>.md
due: <YYYY-MM-DD>
commitment_state: <open | done | dropped>
generated: { by: donna/<model-id>, at: <ISO> }
---

# Detail
# Konteks
```

## Decision — `decisions/<YYYY-MM-DD>-<slug>.md`

```markdown
---
type: Decision
title: <Keputusan>
description: <Apa yang diputuskan, satu kalimat.>
tags: [decision, <domain>]
generated: { by: donna/<model-id>, at: <ISO> }
---

# Konteks
# Opsi yang Dipertimbangkan
# Keputusan & Alasan
# Konsekuensi
```

## Organization — `organizations/<slug>.md`

```markdown
---
type: Organization
title: <Nama>
description: <Hubungannya dengan Lutfi.>
resource: <website>
tags: [organization, <employer|client|prospect|vendor|...>]
generated: { by: donna/<model-id>, at: <ISO> }
---

# Apa Ini
# Orang
# Riwayat dengan Lutfi
```

## Preference — `profile/preferences/<slug>.md`

For rules stable enough to change Donna's behavior ("jangan pernah X", "selalu Y").

```markdown
---
type: Preference
title: <Aturan singkat>
description: <Aturan lengkap satu kalimat.>
tags: [preference, <domain>]
generated: { by: donna/<model-id>, at: <ISO> }
verified: { by: human:lutfi, at: <ISO> }   # only after Lutfi confirms the written rule
sources:
  - { id: chat-<YYYYMMDD>, resource: conversation:telegram/<YYYY-MM-DD>, author: human:lutfi }
---

# Aturan
# Kenapa
```

## Skill — `toolbox/<skill-name>.md`

One per skill forged into `.agents/skills/`.

```markdown
---
type: Skill
title: <skill-name>
description: <Kapan dipakai.>
resource: ../../.agents/skills/<skill-name>/SKILL.md
tags: [skill, <domain>]
generated: { by: donna/<model-id>, at: <ISO> }
---

# Kegunaan
# Cara Pakai
# Lahir Dari
<!-- workflow/percakapan yang memicu skill ini, link jurnal -->
```
