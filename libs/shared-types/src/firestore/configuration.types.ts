/** Firestore schema types for `configurations` (Document 5 §8, amended §9A) and `auditLogs` (§9). */

export interface GlobalConfiguration {
  globalDailySpendCapUsd: number;
  defaultAiProvider: 'openrouter';
  resumeTokenTtlDays: number;
  featureFlags: Record<string, boolean>;
}

export type AuditLogType = 'llm_call' | 'admin_action' | 'abuse_flag';

export interface AuditLogEntry {
  type: AuditLogType;
  actorUid: string | null;
  templateId: string | null;
  sessionId: string | null;
  details: Record<string, unknown>;
  createdAt: number;
}
