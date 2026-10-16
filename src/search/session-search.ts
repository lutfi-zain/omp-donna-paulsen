import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Database } from "bun:sqlite";

export interface SessionMatch {
  sessionId: string;
  project: string;
  role: string;
  timestamp: string;
  snippet: string;
  fullTextPreview: string;
}

export class SessionSearchEngine {
  private db: Database;
  private dbPath: string;
  private sessionsDir: string;

  constructor(customDbPath?: string, customSessionsDir?: string) {
    this.dbPath =
      customDbPath ||
      path.join(os.homedir(), ".donna", "sessions.db");
    this.sessionsDir =
      customSessionsDir ||
      path.join(os.homedir(), ".omp", "agent", "sessions");

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run(`
      CREATE TABLE IF NOT EXISTS indexed_files (
        path TEXT PRIMARY KEY,
        mtime INTEGER,
        size INTEGER,
        indexed_at INTEGER
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS session_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        session_file TEXT,
        project TEXT,
        timestamp TEXT,
        role TEXT,
        content TEXT
      );
    `);

    // Create FTS5 virtual table if it doesn't exist
    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS session_messages_fts USING fts5(
        session_id UNINDEXED,
        session_file UNINDEXED,
        project,
        role,
        content,
        tokenize = 'unicode61 remove_diacritics 1'
      );
    `);
  }

  /**
   * Incrementally index session files.
   * Only parses files that have changed or are new.
   */
  public indexSessions(maxFiles: number = 100): { indexed: number; skipped: number } {
    if (!fs.existsSync(this.sessionsDir)) {
      return { indexed: 0, skipped: 0 };
    }

    const files = this.discoverSessionFiles(this.sessionsDir);
    // Sort newest first
    files.sort((a, b) => b.mtime - a.mtime);

    const checkStmt = this.db.query<{ mtime: number; size: number }, [string]>(
      "SELECT mtime, size FROM indexed_files WHERE path = ?"
    );
    const insertFileStmt = this.db.query(
      "INSERT OR REPLACE INTO indexed_files (path, mtime, size, indexed_at) VALUES (?, ?, ?, ?)"
    );
    const insertMsgStmt = this.db.query(
      "INSERT INTO session_messages (session_id, session_file, project, timestamp, role, content) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const insertFtsStmt = this.db.query(
      "INSERT INTO session_messages_fts (session_id, session_file, project, role, content) VALUES (?, ?, ?, ?, ?)"
    );

    let indexedCount = 0;
    let skippedCount = 0;

    const filesToProcess = files.slice(0, maxFiles);

    for (const f of filesToProcess) {
      const existing = checkStmt.get(f.path);
      if (existing && existing.mtime === f.mtime && existing.size === f.size) {
        skippedCount++;
        continue;
      }

      // Delete existing messages for this file if re-indexing
      if (existing) {
        this.db.run("DELETE FROM session_messages WHERE session_file = ?", [f.path]);
        this.db.run("DELETE FROM session_messages_fts WHERE session_file = ?", [f.path]);
      }

      const messages = this.parseSessionFile(f.path);
      if (messages.length > 0) {
        const sessionId = f.sessionId;
        const project = f.project;

        this.db.transaction(() => {
          for (const m of messages) {
            insertMsgStmt.run(sessionId, f.path, project, m.timestamp, m.role, m.content);
            insertFtsStmt.run(sessionId, f.path, project, m.role, m.content);
          }
          insertFileStmt.run(f.path, f.mtime, f.size, Date.now());
        })();
        indexedCount++;
      } else {
        insertFileStmt.run(f.path, f.mtime, f.size, Date.now());
        skippedCount++;
      }
    }

    return { indexed: indexedCount, skipped: skippedCount };
  }

  /**
   * Search across past session messages.
   */
  public search(query: string, limit: number = 8, projectFilter?: string): SessionMatch[] {
    const cleanQuery = query
      .replace(/[^\p{L}\p{N}\s"-]/gu, " ")
      .trim();

    if (!cleanQuery) return [];

    // Format FTS5 query: wrap unquoted words with wildcards or quotes
    const ftsQuery = this.buildFtsQuery(cleanQuery);

    try {
      let sql = `
        SELECT 
          session_id,
          project,
          role,
          content,
          snippet(session_messages_fts, 4, '<b>', '</b>', '...', 25) as snippet
        FROM session_messages_fts
        WHERE session_messages_fts MATCH ?
      `;
      const params: (string | number)[] = [ftsQuery];

      if (projectFilter) {
        sql += " AND project = ?";
        params.push(projectFilter);
      }

      sql += " ORDER BY rank LIMIT ?";
      params.push(limit);

      const rows = this.db.query<{
        session_id: string;
        project: string;
        role: string;
        content: string;
        snippet: string;
      }, typeof params>(sql).all(...params);

      return rows.map((r) => ({
        sessionId: r.session_id,
        project: r.project,
        role: r.role,
        timestamp: "",
        snippet: r.snippet,
        fullTextPreview: r.content.slice(0, 300),
      }));
    } catch {
      // Fallback: simple token AND match
      return this.fallbackSearch(cleanQuery, limit, projectFilter);
    }
  }

  private fallbackSearch(rawQuery: string, limit: number, projectFilter?: string): SessionMatch[] {
    const tokens = rawQuery.split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length === 0) return [];

    const ftsFallback = tokens.map((t) => `"${t}"`).join(" OR ");
    try {
      const sql = `
        SELECT 
          session_id,
          project,
          role,
          content,
          snippet(session_messages_fts, 4, '<b>', '</b>', '...', 25) as snippet
        FROM session_messages_fts
        WHERE session_messages_fts MATCH ?
        ORDER BY rank LIMIT ?
      `;
      const rows = this.db.query<{
        session_id: string;
        project: string;
        role: string;
        content: string;
        snippet: string;
      }, [string, number]>(sql).all(ftsFallback, limit);

      return rows.map((r) => ({
        sessionId: r.session_id,
        project: r.project,
        role: r.role,
        timestamp: "",
        snippet: r.snippet,
        fullTextPreview: r.content.slice(0, 300),
      }));
    } catch {
      return [];
    }
  }

  private buildFtsQuery(query: string): string {
    const words = query.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 1) {
      return `"${words[0]}"*`;
    }
    // Match words close to each other or all words
    return words.map((w) => `"${w}"`).join(" AND ");
  }

  private discoverSessionFiles(dir: string): Array<{ path: string; sessionId: string; project: string; mtime: number; size: number }> {
    const results: Array<{ path: string; sessionId: string; project: string; mtime: number; size: number }> = [];

    const walk = (currentDir: string) => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
            const stat = fs.statSync(fullPath);
            const rel = path.relative(this.sessionsDir, fullPath);
            const parts = rel.split(path.sep);
            const project = parts.length > 1 ? parts[0] : "global";
            const base = path.basename(entry.name, ".jsonl");
            const sessionId = base.includes("_") ? base.split("_")[1] : base;

            results.push({
              path: fullPath,
              sessionId,
              project,
              mtime: stat.mtimeMs,
              size: stat.size,
            });
          }
        }
      } catch {
        // Ignore read errors
      }
    };

    walk(dir);
    return results;
  }

  private parseSessionFile(filePath: string): Array<{ role: string; content: string; timestamp: string }> {
    const messages: Array<{ role: string; content: string; timestamp: string }> = [];

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const lines = raw.split("\n");

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          const msg = entry.message;
          if (!msg) continue;

          const role = msg.role;
          if (role !== "user" && role !== "assistant") continue;

          let text = "";
          if (typeof msg.content === "string") {
            text = msg.content;
          } else if (Array.isArray(msg.content)) {
            for (const b of msg.content) {
              if (b && b.type === "text" && typeof b.text === "string") {
                text += b.text + "\n";
              }
            }
          }

          text = text.trim();
          if (text.length > 15) {
            // Cap very large texts
            if (text.length > 4000) {
              text = text.slice(0, 4000);
            }
            messages.push({
              role,
              content: text,
              timestamp: entry.timestamp || "",
            });
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    } catch {
      // Ignore file read errors
    }

    return messages;
  }
}
