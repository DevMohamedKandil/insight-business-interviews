import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getServices, openRouterApiKey } from '../composition-root';
import { ResumeTokenInvalidError } from '../services/interview.service';
import { isRunningInEmulator } from '../security/environment';

/** Document 9 §2.3 / ADR-0012. Same auth/App-Check/rate-limit posture as startSession
 *  (Document 6 §8A — a resume attempt is exactly as scriptable as a session start). */
export const resumeSession = onCall(
  { secrets: [openRouterApiKey], enforceAppCheck: !isRunningInEmulator, cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Anonymous auth required.');
    }
    const resumeToken = request.data?.resumeToken;
    if (typeof resumeToken !== 'string' || !resumeToken) {
      throw new HttpsError('invalid-argument', 'resumeToken is required.');
    }

    const { interviewService, startSessionLimiter } = getServices();
    if (!startSessionLimiter.check(request.auth.uid)) {
      throw new HttpsError('not-found', 'This link is no longer valid.');
    }

    try {
      return await interviewService.resumeSession(resumeToken, request.auth.uid);
    } catch (err) {
      if (err instanceof ResumeTokenInvalidError) {
        // Document 9 §2.3: identical message whether the token never existed or expired.
        throw new HttpsError('not-found', 'This link is no longer valid.');
      }
      throw err;
    }
  }
);
