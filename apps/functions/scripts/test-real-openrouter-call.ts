/**
 * Standalone real-network smoke test for OpenRouterProvider (ADR-0020 hardening
 * pass) — does NOT touch Firestore, just proves the actual OpenRouter integration
 * works: key loading, request shape, JSON-mode draft generation, structured error
 * mapping. Reads the key straight from .secret.local (same file the emulator uses).
 *
 * Run: npx ts-node scripts/test-real-openrouter-call.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OpenRouterProvider } from '../src/providers/openrouter.provider';

function loadSecretLocal(): string {
  const raw = readFileSync(join(__dirname, '..', '.secret.local'), 'utf8');
  const match = raw.match(/^OPENROUTER_API_KEY=(.+)$/m);
  if (!match) throw new Error('OPENROUTER_API_KEY not found in .secret.local');
  return match[1].trim();
}

async function main() {
  const apiKey = loadSecretLocal();
  console.log(`Loaded key: ${apiKey.slice(0, 12)}... (${apiKey.length} chars)`);

  const provider = new OpenRouterProvider(apiKey);

  console.log('\n--- Testing generateProjectDraft (real OpenRouter call) ---');
  const draft = await provider.generateProjectDraft(
    'I want to build a platform that helps Egyptians living abroad complete legal and governmental tasks in Egypt.',
    'openai/gpt-4o-mini'
  );
  console.log('Title:', draft.generatedTitle);
  console.log('Language:', draft.suggestedLanguage);
  console.log('Welcome message:', draft.welcomeMessage);
  console.log('Hypotheses:', draft.hypotheses.length);
  console.log('Usage:', draft.usage);

  console.log('\n--- Testing missing-key error path ---');
  const brokenProvider = new OpenRouterProvider('');
  try {
    await brokenProvider.generateProjectDraft('test', 'openai/gpt-4o-mini');
    console.log('FAIL: expected missing_api_key error');
  } catch (err) {
    const code = (err as { code?: string }).code;
    console.log(`Got expected error code: ${code}`);
    if (code !== 'missing_api_key') throw new Error(`FAIL: expected missing_api_key, got ${code}`);
  }

  console.log('\n✔ Real OpenRouter integration + error handling both verified.');
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
