import type { Firestore } from 'firebase-admin/firestore';
import type { GlobalConfiguration, AuditLogEntry } from '@insightai/shared-types';

const GLOBAL_CONFIG_DEFAULTS: GlobalConfiguration = {
  globalDailySpendCapUsd: 10,
  defaultAiProvider: 'openrouter',
  resumeTokenTtlDays: 7,
  featureFlags: {},
};

/** Document 5 §8. Read-mostly, cached per Functions instance (Architecture §7 —
 *  "read once per cold start"). */
export class ConfigurationRepository {
  private cached: GlobalConfiguration | null = null;

  constructor(private readonly db: Firestore) {}

  async getGlobal(): Promise<GlobalConfiguration> {
    if (this.cached) return this.cached;
    const doc = await this.db.collection('configurations').doc('global').get();
    this.cached = doc.exists ? { ...GLOBAL_CONFIG_DEFAULTS, ...(doc.data() as GlobalConfiguration) } : GLOBAL_CONFIG_DEFAULTS;
    return this.cached;
  }
}

/** Document 5 §9. */
export class AuditLogRepository {
  constructor(private readonly db: Firestore) {}

  async log(entry: AuditLogEntry): Promise<void> {
    await this.db.collection('auditLogs').add(entry);
  }
}
