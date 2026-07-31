import type { Template } from '@insightai/shared-types';
import { AnalyticsRollupRepository } from '../repositories/analytics-rollup.repository';
import { ConfigurationRepository } from '../repositories/configuration.repository';

/** Document 6 §4. Runs BEFORE any AI provider call — this ordering is itself a
 *  security/cost control (Document 10 §2's explicit callout), not an implementation
 *  detail. Accepts the check-then-call race condition per Assumption A10 / ADR log. */
export class SpendGuardService {
  /** Conservative placeholder for "next turn's likely cost" used only to decide
   *  whether there's headroom to attempt the call at all — the real cost is recorded
   *  after the call actually completes (Document 10 §2 step 8). See Document 16 §3.1's
   *  per-turn estimate for why this order of magnitude is realistic. */
  private static readonly PROJECTED_NEXT_TURN_COST_USD = 0.01;

  constructor(
    private readonly rollupRepo: AnalyticsRollupRepository,
    private readonly configRepo: ConfigurationRepository
  ) {}

  async checkBudget(
    templateId: string,
    template: Template
  ): Promise<{ allowed: true } | { allowed: false; reason: 'template_cap' | 'global_cap' }> {
    const today = new Date().toISOString().slice(0, 10);
    const projected = SpendGuardService.PROJECTED_NEXT_TURN_COST_USD;

    const templateTodaySpend = await this.rollupRepo.getTodaySpend(templateId, today);
    if (templateTodaySpend + projected > template.dailySpendCapUsd) {
      return { allowed: false, reason: 'template_cap' };
    }

    const globalConfig = await this.configRepo.getGlobal();
    const globalTodaySpend = await this.rollupRepo.getGlobalTodaySpend(today);
    if (globalTodaySpend + projected > globalConfig.globalDailySpendCapUsd) {
      return { allowed: false, reason: 'global_cap' };
    }

    return { allowed: true };
  }
}
