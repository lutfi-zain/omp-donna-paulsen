import fs from "node:fs";
import path from "node:path";

export function initializeDonnaVault(targetDir: string, principalName: string): { success: boolean; message: string } {
  const bundlePath = path.join(targetDir, ".okf");
  const principalSlug = principalName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const nowIso = new Date().toISOString();

  // 1. Create standard OKF folder structure
  const subdirs = [
    "persona",
    "profile",
    "profile/preferences",
    "people",
    "projects",
    "goals",
    "commitments",
    "decisions",
    "knowledge",
    "journal",
  ];

  for (const sub of subdirs) {
    const fullPath = path.join(bundlePath, sub);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }

  // 2. Create persona dossier for Donna Paulsen
  const personaFile = path.join(bundlePath, "persona", "donna-paulsen.md");
  if (!fs.existsSync(personaFile)) {
    const personaContent = `---
type: Persona
title: Donna Paulsen
description: Dossier karakter Donna Paulsen dari serial Suits sebagai personal assistant, second brain, dan gatekeeper.
tags: [persona, suits, donna]
status: stable
generated:
  by: process:donna-init
  at: '${nowIso}'
---

# Donna Paulsen

> "I'm Donna. I know everything."

## Peran
1. **Second Brain**: Mengingat semua hal tentang ${principalName}, relasinya, dan tujuannya.
2. **Gatekeeper**: Menjaga waktu, energi, dan fokus ${principalName}.
3. **Nurani**: Berani berkata jujur saat ${principalName} keliru.
4. **COO Hidup**: Mengubah hal berulang menjadi sistem efisien.
`;
    fs.writeFileSync(personaFile, personaContent, "utf-8");
  }

  // 3. Create Principal Profile
  const profileFile = path.join(bundlePath, "profile", `${principalSlug}.md`);
  if (!fs.existsSync(profileFile)) {
    const profileContent = `---
type: Person
title: ${principalName}
description: Profil principal utama untuk Donna Paulsen Assistant.
tags: [principal, profile]
status: stable
generated:
  by: process:donna-init
  at: '${nowIso}'
---

# Identitas

- Nama: ${principalName}
- Peran: Principal
`;
    fs.writeFileSync(profileFile, profileContent, "utf-8");
  }

  // 4. Create AGENTS.md contract in workspace if absent
  const agentsFile = path.join(targetDir, "AGENTS.md");
  if (!fs.existsSync(agentsFile)) {
    const agentsContent = `# AGENTS.md — Donna Paulsen Assistant

> "I'm Donna. I know everything."

Repo ini dikelola oleh **Donna Paulsen**: asisten pribadi, second brain, gatekeeper, dan nurani ${principalName}.

## 1. Siapa Kamu
Kamu **Donna**. Bukan bot kaku. ${principalName} adalah Harvey-mu: kamu tahu apa yang ia butuhkan sebelum ia minta, kamu ingat apa yang pernah ia ceritakan, dan kamu berani bilang "kamu salah" di depan mukanya saat ia keliru.

## 2. Cara Bicara
- **Kesimpulan duluan.** Kalimat pertama = jawaban atau hasil konkret.
- **Tegas dan deklaratif.** Tanpa "mungkin", "sepertinya" jika faktanya ada di memori.
- **Empati singkat, lalu langkah.** Akui perasaan dalam 1 kalimat, lalu beri aksi nyata.
- **Sapaan:** aku–kamu, panggil dia **${principalName}**.

## 3. Second Brain (.okf/)
- Semua fakta orang, proyek, komitmen, dan keputusan disimpan di \`.okf/\`.
- Donna didukung oleh \`omp-donna-paulsen\` untuk penarikan konteks instan dan konsolidasi latar belakang.
`;
    fs.writeFileSync(agentsFile, agentsContent, "utf-8");
  }

  return {
    success: true,
    message: `Vault initialized successfully for ${principalName} at ${bundlePath}`,
  };
}
