import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getServices, openRouterApiKey } from '../composition-root';
import { TemplateUnavailableError } from '../services/interview.service';
import { isRunningInEmulator } from '../security/environment';

/** Document 9 §2.1. API Layer: validate input shape + auth, delegate immediately to
 *  the Service Layer (Architecture §2 — no business logic here). */
export const startSession = onCall(
  { secrets: [openRouterApiKey], enforceAppCheck: !isRunningInEmulator, cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Anonymous auth required.');
    }
    const templateSlug = request.data?.templateSlug;
    if (typeof templateSlug !== 'string' || !templateSlug) {
      throw new HttpsError('invalid-argument', 'templateSlug is required.');
    }

    const { interviewService, startSessionLimiter } = getServices();

    if (!startSessionLimiter.check(request.auth.uid)) {
      // Document 9 §2.1: RESOURCE_EXHAUSTED deliberately looks identical to NOT_FOUND
      // to the client (Document 6 §4's "don't leak operator-side state" principle).
      throw new HttpsError('not-found', 'This interview is not available.');
    }

    try {
      const result = await interviewService.startSession(templateSlug, request.auth.uid);
      return {
        sessionId: result.sessionId,
        resumeToken: result.resumeToken,
        welcomeMessage: result.welcomeMessage,
        language: result.language,
      };
    } catch (err) {
      if (err instanceof TemplateUnavailableError) {
        throw new HttpsError('not-found', 'This interview is not available.');
      }
      throw err;
    }
  }
);
