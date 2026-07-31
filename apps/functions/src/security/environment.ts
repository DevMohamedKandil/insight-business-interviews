/**
 * ADR-0014: App Check enforcement is mandatory for any real deployment (Document 6
 * §3), but is skipped when running under the Firebase Functions Emulator — detected
 * via the `FUNCTIONS_EMULATOR` env var the emulator sets automatically — because
 * wiring a real reCAPTCHA site key/App Check emulator into a local walking-skeleton
 * demo (Document 12 Phase 1) is disproportionate before there's any real public URL
 * or real spend at risk. Evaluated once per process start, not per-request, so this
 * can never flip mid-deployment.
 */
export const isRunningInEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
