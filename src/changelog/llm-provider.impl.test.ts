/**
 * Implementation tests for the LLM provider and prompt builders — defaults and formatting internals.
 */

import { describe, expect, it } from 'vitest';
import { LLMProvider } from './llm-provider.js';
import { buildChangelogPrompt } from './prompts.js';
import type { LLMConfig, LLMResult, PackageChangeSummary } from './types.js';

class CapturingProvider extends LLMProvider {
    lastMaxTokens = 0;
    lastTimeout = 0;
    protected override async callOpenAI(_s: string, _u: string, maxTokens: number, timeout: number): Promise<LLMResult> {
        this.lastMaxTokens = maxTokens;
        this.lastTimeout = timeout;
        return { content: 'x', provider: 'openai', model: 'm', tokensUsed: { input: 0, output: 0 } };
    }
}

const config = (over: Partial<LLMConfig> = {}): LLMConfig => ({ openaiModel: 'gpt', anthropicModel: 'claude', ...over });

function summaryWith(over: Partial<PackageChangeSummary>): PackageChangeSummary {
    return {
        packageName: 'a', shortName: 'a', packageDir: '/repo/packages/a', packagePath: 'packages/a',
        commits: [], changedFiles: [], ...over
    };
}

describe('generate defaults', () => {
    it('should pass default max tokens and timeout to the provider seam', async () => {
        const p = new CapturingProvider(config({ openaiApiKey: 'x' }));
        await p.generate('sys', 'user');
        expect(p.lastMaxTokens).toBe(2048);
        expect(p.lastTimeout).toBe(30_000);
    });

    it('should pass through overrides', async () => {
        const p = new CapturingProvider(config({ openaiApiKey: 'x' }));
        await p.generate('sys', 'user', { maxTokens: 100, timeout: 5000 });
        expect(p.lastMaxTokens).toBe(100);
        expect(p.lastTimeout).toBe(5000);
    });
});

describe('buildChangelogPrompt formatting', () => {
    it('should truncate a long commit body', () => {
        const longBody = 'y'.repeat(500);
        const { user } = buildChangelogPrompt(
            summaryWith({ commits: [{ hash: 'h', type: 'fix', scope: '', subject: 's', body: longBody, files: [] }] })
        );
        expect(user).toContain('…');
        expect(user).not.toContain('y'.repeat(300));
    });

    it('should cap the number of files listed per commit', () => {
        const files = Array.from({ length: 15 }, (_, i) => `packages/a/f${i}.ts`);
        const { user } = buildChangelogPrompt(
            summaryWith({ commits: [{ hash: 'h', type: 'fix', scope: '', subject: 's', body: '', files }] })
        );
        expect(user).toContain('+5 more');
    });
});
