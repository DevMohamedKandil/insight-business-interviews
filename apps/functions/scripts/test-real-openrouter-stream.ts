/** Real-network smoke test for the streaming interview-turn path (ADR-0013/0018),
 *  the second half of OpenRouterProvider not covered by test-real-openrouter-call.ts. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OpenRouterProvider } from '../src/providers/openrouter.provider';
import type { StreamEvent } from '@insightai/shared-types';

function loadSecretLocal(): string {
  const raw = readFileSync(join(__dirname, '..', '.secret.local'), 'utf8');
  const match = raw.match(/^OPENROUTER_API_KEY=(.+)$/m);
  if (!match) throw new Error('OPENROUTER_API_KEY not found in .secret.local');
  return match[1].trim();
}

async function main() {
  const provider = new OpenRouterProvider(loadSecretLocal());
  let streamedText = '';
  let tokenCount = 0;

  const output = await provider.generateInterviewTurnStreaming(
    {
      systemPrompt: 'You are a warm researcher interviewing doctors in Egypt about patient no-shows. Ask one short question.',
      history: [],
      remainingConversationObjectives: [{ id: 'example', description: 'A specific recent no-show example' }],
      activeHypotheses: [{ id: 'h1', text: 'Doctors would pay for an automated reminder system' }],
      model: 'openai/gpt-4o-mini',
      temperature: 0.8,
      maxTokens: 200,
    },
    (event: StreamEvent) => {
      if (event.type === 'token') {
        tokenCount += 1;
        streamedText += event.value;
      }
    }
  );

  console.log(`Streamed ${tokenCount} chunks, ${streamedText.length} chars: "${streamedText.trim()}"`);
  console.log('replyText matches streamed text:', output.replyText === streamedText.trim());
  console.log('extraction:', JSON.stringify(output.extraction, null, 2));
  console.log('usage:', output.usage);

  if (tokenCount < 2) throw new Error('FAIL: expected multiple streamed chunks, got ' + tokenCount);
  if (!output.replyText) throw new Error('FAIL: replyText empty');

  console.log('\n✔ Streaming interview-turn path verified against real OpenRouter.');
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
