import type { IAIProvider } from '@insightai/shared-types';

/**
 * ADR-0002: business logic depends only on `IAIProvider`, never on a concrete class.
 * ADR-0011: Phase 1 registers exactly one implementation (OpenRouter); adding
 * Claude/Gemini-direct or a local-model provider later means registering another
 * entry here — zero changes anywhere else in the codebase.
 */
export class AIProviderFactory {
  constructor(private readonly providers: Record<string, IAIProvider>) {}

  resolve(providerKey: string): IAIProvider {
    if (!providerKey) {
      // ADR-0020 root cause: an empty key here means the AI_PROVIDER config param
      // resolved to nothing — almost always a missing apps/functions/.env, not a
      // registration problem. Distinct message so this is diagnosable in seconds.
      throw new Error(
        'AI_PROVIDER is not configured (resolved to an empty value). ' +
          'Check that apps/functions/.env exists and defines AI_PROVIDER.'
      );
    }
    const provider = this.providers[providerKey];
    if (!provider) {
      throw new Error(
        `No AI provider registered for key "${providerKey}". Registered keys: ${Object.keys(this.providers).join(', ') || '(none)'}`
      );
    }
    return provider;
  }
}
