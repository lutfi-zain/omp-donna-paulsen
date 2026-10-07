export interface DonnaConfig {
  bundlePath: string;
  globalVaultPath: string;
  scope: "project" | "global";
  personaName: string;
  principalName: string;
  contextPulling: boolean;
  maxContextTokens: number;
  entityMatching: "exact" | "fuzzy" | "hybrid";
  autoConsolidate: boolean;
  autoJournal: boolean;
  autoGitCommit: boolean;
  consolidationDelayMs: number;
}

export interface OKFConcept {
  path: string;
  slug: string;
  type: string;
  title: string;
  description?: string;
  tags: string[];
  relationship?: string;
  status?: string;
  frontmatter: Record<string, unknown>;
  contentSummary: string;
  rawContent: string;
  mtime: number;
}

export interface CommitmentConcept extends OKFConcept {
  dueDate?: string;
  state: "open" | "fulfilled" | "cancelled";
}

export interface IngressContextResult {
  matchedConcepts: OKFConcept[];
  activeCommitments: CommitmentConcept[];
  xmlContext: string;
  tokenEstimate: number;
}
