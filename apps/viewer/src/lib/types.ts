export interface OKFConcept {
  id: string;
  slug: string;
  path: string;
  title: string;
  type: string;
  description?: string;
  tags?: string[];
  status?: string;
  stale_after?: string;
  sources?: unknown;
  body: string;
  raw: string;
  links?: string[];
  backlinks?: string[];
  metadata?: Record<string, unknown>;
}

export interface VaultTreeNode {
  id: string;
  name: string;
  path: string;
  type: "directory" | "file";
  conceptId?: string;
  conceptType?: string;
  title?: string;
  count?: number;
  children?: VaultTreeNode[];
}

export interface OKFEdge {
  source: string;
  target: string;
  type?: string;
}

export interface OKFGraphStats {
  concepts: number;
  edges: number;
  types: string[];
}

export interface OKFGraph {
  nodes: OKFConcept[];
  edges: OKFEdge[];
  stats: OKFGraphStats;
  tree?: VaultTreeNode[];
}

export interface UserSession {
  email: string;
  name: string;
  picture: string;
  issuedAt: number;
  expiresAt: number;
}

export interface TTSRequest {
  text: string;
  voice?: string;
  rate?: string;
}

export interface SSEEvent {
  type: string;
  data?: unknown;
}

export interface VaultInfo {
  id: string;
  name: string;
  path: string;
  conceptCount: number;
  isDefault?: boolean;
}
