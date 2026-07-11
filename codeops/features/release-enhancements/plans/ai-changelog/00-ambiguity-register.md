## Ambiguity Register: ai-changelog (plan)

> **Status**: ✅ GATE PASSED — all 4 items resolved
> **Last Updated**: 2026-07-12 00:54

Plan for `release-enhancements/RD-01` (AI-Based Changelog & Release Notes Generation). The
**feature-level** decisions are inherited resolved from the requirements register
(`../../requirements/00-ambiguity-register.md`, AR #2, #3, #4, #9–#13) and RD-03; they are not
re-litigated here. This register captures only **new implementation-level** ambiguities surfaced
during planning.

| # | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|---|----------|-----------------|-------------------|---------------|--------|
| PA-1 | Technical / Tooling | Project verify command for the Verify lines | `npm run type-check && npm test` (established for this project) / other | User chose: `npm run type-check && npm test` | ✅ Resolved |
| PA-2 | Technical / Packaging | How to declare the LLM SDK dependencies (`openai`, `@anthropic-ai/sdk`), given RD-03 wants a minimal install surface and dynamic import | optionalDependencies (auto-installed, non-fatal; best out-of-box UX) / optional peerDependencies (not auto-installed; user opts in) / undeclared + documented manual install (leanest) | User chose: optionalDependencies | ✅ Resolved |
| PA-3 | Behavioral / Data | Commit→package attribution rule for a generic monorepo (the reference hardcodes `packages/`, `@blendsdk/`, and a cross-package scope set) | Scope match against each discovered package's directory basename / unscoped name, else attribute by changed-file paths — no hardcoded cross-package scope list / Other | User chose: scope-match (dir basename / unscoped name) or file-diff, via generic discovery | ✅ Resolved |
| PA-4 | Technical / Testing | How to unit-test the LLM provider without real API calls or network | Provider exposes protected `callOpenAI`/`callAnthropic` seams that tests stub via a subclass (mirrors the reference); test provider selection, fallback ordering, and the never-throw path / Mock the dynamic SDK imports | User chose: protected-method seams stubbed via subclass | ✅ Resolved |
| PA-5 (runtime) | Technical / Correctness | Discovered while writing ST-25: `version()`/`publish()` git operations in `lockstep.ts` ran in `process.cwd()` instead of the configured repository root, so the fixture test executed git commands against the tool's own repo | Route every git operation through `this.config.root` (no-op in production since root already defaults to `process.cwd()`; fixes non-default-root correctness and test isolation) / Make the spec test `chdir` into the fixture (global-state hack, leaves the latent bug) | Routed all git operations through `this.config.root` — the implementation was wrong, not the spec | ✅ Resolved |

### Resolution Notes

**Inherited (feature-level):** AR #2 (new `changelog` command + auto-run in `version`, opt-out),
AR #3 (per-package `CHANGELOG.md` + root `RELEASE_NOTES.md`), AR #4 (OpenAI primary, Anthropic
fallback, env-configured), AR #9 (never block a release; fallback entry), AR #10 (base ref = the
`vX.Y.Z` tag scheme), AR #11 (file-diff + scope attribution via generic discovery), AR #12 (bump →
generate → commit ordering), AR #13 (current-generation default models, env-overridable) — all
✅ Resolved in the requirements register. RD-03 owns the non-blocking, secrets, and
optional-dependency contract.

**PA-1 … PA-4:** New plan-level decisions. Recommendations shown; presented to the user. Gate
remains BLOCKED until confirmed.
