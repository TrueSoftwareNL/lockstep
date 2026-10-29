/**
 * Implementation tests for publish edge cases.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Lockstep } from "./lockstep.js";

const dirs: string[] = [];

afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** Runs a git command in a fixture repository. */
function git(dir: string, cmd: string): void {
    execSync(`git ${cmd}`, { cwd: dir, stdio: "pipe" });
}

/** Records publish commands instead of invoking a registry client. */
class RecordingLockstep extends Lockstep {
    calls: Array<{ cmd: string; cwd: string }> = [];

    protected override execCommand(cmd: string, cwd: string): void {
        this.calls.push({ cmd, cwd });
    }
}

/** Creates a committed monorepo fixture with a private root package. */
function makeMonorepo(packages: Record<string, Record<string, unknown>>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lockstep-publish-impl-"));
    dirs.push(dir);
    git(dir, "init -q");
    git(dir, "config user.email t@e.com");
    git(dir, "config user.name T");
    git(dir, "config commit.gpgsign false");

    fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "root", version: "1.0.0", private: true }, null, 2)
    );

    for (const [rel, data] of Object.entries(packages)) {
        const pkgDir = path.join(dir, "packages", rel);
        fs.mkdirSync(pkgDir, { recursive: true });
        fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify(data, null, 2));
    }

    git(dir, "add -A");
    git(dir, "commit -q -m \"chore: init\"");
    return dir;
}

describe("publish input validation", () => {
    it("should reject a dist-tag that contains unsafe characters", async () => {
        const dir = makeMonorepo({ a: { name: "a", version: "1.0.0" } });
        const lockstep = new RecordingLockstep({ root: dir });

        await expect(lockstep.publish({ tag: "bad tag" })).rejects.toThrow(/Invalid npm dist-tag/);
        expect(lockstep.calls).toEqual([]);
    });

    it("should reject an unknown access level", async () => {
        const dir = makeMonorepo({ a: { name: "a", version: "1.0.0" } });
        const lockstep = new RecordingLockstep({ root: dir });

        await expect(lockstep.publish({ tag: "latest", access: "private" })).rejects.toThrow(
            /--access must be/
        );
        expect(lockstep.calls).toEqual([]);
    });

    it("should refuse branch-derived tags in detached HEAD but allow exact mode", async () => {
        const dir = makeMonorepo({ a: { name: "a", version: "1.0.0" } });
        git(dir, "checkout -q --detach");
        const lockstep = new RecordingLockstep({ root: dir });

        await expect(lockstep.publish({ tag: "next" })).rejects.toThrow(/detached HEAD/);

        await lockstep.publish({ tag: "next", tagMode: "exact" });
        expect(lockstep.calls[0]!.cmd).toContain("--tag next");
    });

    it("should allow latest in detached HEAD because no branch prefix is needed", async () => {
        const dir = makeMonorepo({ a: { name: "a", version: "1.0.0" } });
        git(dir, "checkout -q --detach");
        const lockstep = new RecordingLockstep({ root: dir });

        await lockstep.publish({ tag: "latest" });

        expect(lockstep.calls[0]!.cmd).toContain("--tag latest");
    });
});

describe("publish provenance and private packages", () => {
    it("should not require a repository field from skipped private packages", async () => {
        const dir = makeMonorepo({
            a: { name: "a", version: "1.0.0", repository: "https://github.com/example/repo" },
            internal: { name: "internal", version: "1.0.0", private: true }
        });
        const previous = process.env.GITHUB_ACTIONS;
        process.env.GITHUB_ACTIONS = "true";
        try {
            const lockstep = new RecordingLockstep({ root: dir });

            await lockstep.publish({ tag: "latest", provenance: true });

            expect(lockstep.calls).toHaveLength(1);
            expect(lockstep.calls[0]!.cmd).toContain("--provenance");
        } finally {
            if (previous === undefined) delete process.env.GITHUB_ACTIONS;
            else process.env.GITHUB_ACTIONS = previous;
        }
    });
});
