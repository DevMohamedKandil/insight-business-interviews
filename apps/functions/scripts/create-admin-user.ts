/**
 * Local-only helper: creates (or reuses) an Auth Emulator user and grants the
 * `admin` custom claim (Document 6 §6), so the Admin Panel / admin-only Callable
 * Functions (generateProjectDraft, approveProjectDraft, ...) can be exercised
 * before a real Admin Panel login UI exists.
 *
 * Run with both emulator hosts set:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     npx ts-node scripts/create-admin-user.ts you@example.com yourPassword123
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

async function main() {
  const email = process.argv[2] ?? 'founder@insightai.local';
  const password = process.argv[3] ?? 'insightai-local-dev';
  initializeApp({ projectId: 'insightai-dev' });
  const auth = getAuth();

  let user;
  try {
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password });
  } catch {
    user = await auth.createUser({ email, emailVerified: true, password });
  }

  await auth.setCustomUserClaims(user.uid, { admin: true });
  console.log(`Admin user ready: ${email} / ${password} (uid=${user.uid}), admin claim set.`);
  console.log('Sign in with these credentials at http://localhost:4310/admin/login');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
