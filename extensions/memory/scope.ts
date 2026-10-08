/** Explicit admission boundary; no wildcard, parent, preset, or cwd inheritance. */
export function isClawbotMemorySession(session: unknown, sessionId: string): boolean {
  if (!sessionId.trim() || !session || typeof session !== "object") return false;
  const id = (session as { id?: unknown }).id;
  return typeof id === "string" && id === sessionId;
}

export interface ClawbotMemoryConfig {
  memosEnabled: boolean;
  memosRecall: boolean;
  memosCapture: boolean;
}

export const MEMORY_FIELDS = ["memosEnabled", "memosRecall", "memosCapture"] as const;
export const DEFAULT_MEMORY: ClawbotMemoryConfig = {
  memosEnabled: false, memosRecall: true, memosCapture: true,
};
export function normalizeMemory(raw: Record<string, unknown>): ClawbotMemoryConfig {
  return {
    memosEnabled: raw.memosEnabled === true,
    memosRecall: raw.memosRecall !== false,
    memosCapture: raw.memosCapture !== false,
  };
}
