import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getServices, openRouterApiKey } from '../../composition-root';
import { requireAdmin } from '../../security/auth-guard';
import { isRunningInEmulator } from '../../security/environment';

/** Document 9 (Idea Intake amendment, this session). Admin-only — see ADR-0019 for
 *  why this still goes through the metered `IAIProvider` layer like every other
 *  LLM call in the system, admin-facing or not. */
export const generateProjectDraft = onCall(
  { secrets: [openRouterApiKey], enforceAppCheck: !isRunningInEmulator, cors: true },
  async (request) => {
    const uid = requireAdmin(request);
    const rawIdeaText = request.data?.rawIdeaText;
    if (typeof rawIdeaText !== 'string' || !rawIdeaText.trim()) {
      throw new HttpsError('invalid-argument', 'rawIdeaText is required.');
    }

    const { ideaIntakeService } = getServices();
    return ideaIntakeService.generateDraft(rawIdeaText.trim(), uid);
  }
);
