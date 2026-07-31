import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';

/**
 * Document 6 §6. Admin auth is never weakened, including under the emulator
 * (unlike App Check, ADR-0014 — bot-detection convenience vs. an actual access
 * boundary are different risk categories). A real admin custom claim must be set
 * via the Auth emulator (see scripts/create-admin-user.ts for local testing) even
 * in development.
 */
export function requireAdmin(request: CallableRequest): string {
  if (!request.auth || request.auth.token['admin'] !== true) {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }
  return request.auth.uid;
}
