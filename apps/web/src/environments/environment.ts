/**
 * Document 19 §2 (dev environment). Local/dev config — points at the Firebase
 * Emulator Suite. `projectId` must match `.firebaserc`'s default project so the
 * emulated Auth/Firestore/Functions instances line up.
 *
 * apiKey/appId are placeholders: the Auth/Firestore/Functions emulators do not
 * validate them against a real backend. Once a real Firebase project exists
 * (Document 19 §1's `insightai-dev`/`insightai-prod`), replace this file's values
 * with the real web app config from the Firebase Console, and set `useEmulators:
 * false` for the prod build (a `environment.prod.ts` + angular.json fileReplacement
 * is the natural next step once that project exists).
 */
export const environment = {
  production: false,
  useEmulators: true,
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'insightai-dev.firebaseapp.com',
    projectId: 'insightai-dev',
    storageBucket: 'insightai-dev.appspot.com',
    appId: 'demo-app-id',
  },
  /** Local emulator host for the sendMessage HTTPS function (ADR-0003) — the
   *  Functions emulator serves HTTPS functions at this predictable URL shape. */
  sendMessageUrl: 'http://127.0.0.1:5001/insightai-dev/us-central1/sendMessage',
};
