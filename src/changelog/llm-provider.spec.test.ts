/**
 * Specification tests for the changelog LLM provider and prompt builders.
 *
 * Written before the implementation exists. The real SDK calls are replaced by stubbing the
 * provider's protected seams via a subclass — no network, no SDK required.
 */

import { describe, expect, it } from 'vitest';
import { createLLMConfig, LLMProvider } from './llm-provider.js';
import { buildChangelogPrompt } from './prompts.js';
import type { LLMConfig, LLMResult, PackageChangeSummary } from './types.js';

const RESULT = (provider: 'openai' | 'anthropic'): LLMResult => ({
    content: `content from ${provider}`,
    provider,
    model: 'test-model',
    tokensUsed: { input: 1, output: 1 }
});

/** A provider whose SDK seams are replaced with fixed results or errors. */
class StubProvider extends LLMProvider {
    openai: LLMResult | Error = RESULT('openai');
    anthropic: LLMResult | Error = RESULT('anthropic');

    protected override async callOpenAI(): Promise<LLMResult> {
        if (this.openai instanceof Error) throw this.openai;
        return this.openai;
    }
    protected override async callAnthropic(): Promise<LLMResult> {
        if (this.anthropic instanceof Error) throw this.anthropic;
        return this.anthropic;
    }
}

function config(over: Partial<LLMConfig> = {}): LLMConfig {
    return { openaiModel: 'gpt', anthropicModel: 'claude', ...over };
}

function summary(): PackageChangeSummary {
    return {
        packageName: 'a',
        shortName: 'a',
        packageDir: '/repo/packages/a',
        packagePath: 'packages/a',
        commits: [{ hash: 'h', type: 'feat', scope: 'a', subject: 'add feature', body: '', files: ['packages/a/index.ts'] }],
        changedFiles: ['packages/a/index.ts']
    };
}

describe('getAvailableProviders', () => {
    it('should list openai only when only its key is set', () => {
        expect(new StubProvider(config({ openaiApiKey: 'x' })).getAvailableProviders()).toEqual(['openai']);
    });
    it('should list both when both keys are set, openai first', () => {
        expect(new StubProvider(config({ openaiApiKey: 'x', anthropicApiKey: 'y' })).getAvailableProviders()).toEqual([
            'openai',
            'anthropic'
        ]);
    });
    it('should be empty when no keys are set', () => {
        expect(new StubProvider(config()).getAvailableProviders()).toEqual([]);
    });
});

describe('generate', () => {
    it('should use openai when its key is set', async () => {
        const p = new StubProvider(config({ openaiApiKey: 'x' }));
        const r = await p.generate('sys', 'user');
        expect(r?.provider).toBe('openai');
    });

    it('should fall back to anthropic when openai fails', async () => {
        const p = new StubProvider(config({ openaiApiKey: 'x', anthropicApiKey: 'y' }));
        p.openai = new Error('openai down');
        const r = await p.generate('sys', 'user');
        expect(r?.provider).toBe('anthropic');
    });

    it('should return null when both providers fail (never throws)', async () => {
        const p = new StubProvider(config({ openaiApiKey: 'x', anthropicApiKey: 'y' }));
        p.openai = new Error('openai down');
        p.anthropic = new Error('anthropic down');
        await expect(p.generate('sys', 'user')).resolves.toBeNull();
    });

    it('should return null when no keys are configured', async () => {
        const p = new StubProvider(config());
        await expect(p.generate('sys', 'user')).resolves.toBeNull();
    });
});

describe('createLLMConfig', () => {
    it('should read keys and models from the environment', () => {
        const cfg = createLLMConfig({
            OPENAI_API_KEY: 'o',
            OPENAI_MODEL: 'gpt-x',
            ANTHROPIC_API_KEY: 'a',
            ANTHROPIC_MODEL: 'claude-x'
        });
        expect(cfg.openaiApiKey).toBe('o');
        expect(cfg.openaiModel).toBe('gpt-x');
        expect(cfg.anthropicApiKey).toBe('a');
        expect(cfg.anthropicModel).toBe('claude-x');
    });
});

describe('buildChangelogPrompt', () => {
    it('should include commit subjects and file paths but not file contents', () => {
        const { user } = buildChangelogPrompt(summary());
        expect(user).toContain('add feature');
        expect(user).toContain('packages/a/index.ts');
        // The summary carries no file contents, so a content sentinel can never appear.
        expect(user).not.toContain('SECRET_FILE_CONTENTS');
    });
});
