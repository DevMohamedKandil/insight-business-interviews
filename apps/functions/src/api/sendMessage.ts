import { onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { getServices, openRouterApiKey } from '../composition-root';
import {
  SessionAccessDeniedError,
  SessionNotActiveError,
  SessionNotFoundError,
  TemplateUnavailableError,
} from '../services/interview.service';
import { isRunningInEmulator } from '../security/environment';

/**
 * Document 9 §2.2 / ADR-0003. The one HTTPS (not Callable) function in the codebase,
 * specifically because Callable Functions cannot stream. Auth + App Check verification
 * is therefore manual here (Callable Functions do this automatically) — the direct
 * cost of choosing this transport, paid deliberately for the streaming requirement.
 */
export const sendMessage = onRequest(
  { secrets: [openRouterApiKey], cors: true, timeoutSeconds: 60, memory: '512MiB' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const authHeader = req.headers.authorization;
    const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
    const appCheckToken = req.header('X-Firebase-AppCheck');

    if (!idToken) {
      res.status(401).json({ error: 'Missing Authorization bearer token' });
      return;
    }
    // ADR-0014: App Check is mandatory in any real deployment (Document 6 §3) but
    // skipped under the emulator — see security/environment.ts for the full rationale.
    if (!appCheckToken && !isRunningInEmulator) {
      res.status(401).json({ error: 'Missing App Check token' });
      return;
    }

    let uid: string;
    try {
      const decoded = await getAuth().verifyIdToken(idToken);
      uid = decoded.uid;
      if (appCheckToken && !isRunningInEmulator) {
        await getAppCheck().verifyToken(appCheckToken);
      }
    } catch {
      res.status(401).json({ error: 'Invalid auth or App Check token' });
      return;
    }

    const { sessionId, text } = req.body ?? {};
    if (typeof sessionId !== 'string' || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'sessionId and text are required' });
      return;
    }

    const { interviewService, sendMessageLimiter } = getServices();
    if (!sendMessageLimiter.check(uid)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const result = await interviewService.processTurn(sessionId, uid, text, (value) => {
        res.write(JSON.stringify({ type: 'token', value }) + '\n');
      });
      res.write(
        JSON.stringify({
          type: 'done',
          turnCount: result.turnCount,
          sessionStatus: result.sessionStatus,
          ...(result.closingMessage ? { closingMessage: result.closingMessage } : {}),
        }) + '\n'
      );
      res.end();
    } catch (err) {
      // Document 9 §2.2's mid-stream error case: never silently truncate — always
      // send an explicit error event so the client shows a retry affordance
      // (Document 8's "connection lost, one moment" state) instead of a hang.
      const code =
        err instanceof SessionNotFoundError
          ? 404
          : err instanceof SessionAccessDeniedError
            ? 403
            : err instanceof SessionNotActiveError
              ? 409
              : err instanceof TemplateUnavailableError
                ? 404
                : 500;
      res.write(JSON.stringify({ type: 'error', code, message: 'Something went wrong.' }) + '\n');
      res.end();
    }
  }
);
