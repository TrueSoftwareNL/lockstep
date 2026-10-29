/**
 * Implementation tests for version and sync edge cases.
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

/** Records package-manager commands instead of running them. */
class RecordingLockstep extends Lockstep {
    calls: Array<{ cmd: string; cwd: string }> = [];
    onCommand?: (cmd: string, cwd: string) => void;

    protected override execCommand(cmd: string, cwd: string): void {
        this.calls.push({ cmd, cwd });
        this.onCommand?.(cmd, cwd);
    }
}

/**
 * Creates a monorepo with a private root and two packages at different versions, committed once.
 */
function makeDriftedMonorepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lockstep-sync-refresh-"));
    dirs.push(dir);
    git(dir, "init -q");
    git(dir, "config user.email t@e.com");
    git(dir, "config user.name T");
    git(dir, "config commit.gpgsign false");

    fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "root", version: "1.0.0", private: true }, null, 2)
    );
    fs.mkdirSync(path.join(dir, "packages", "a"), { recursive: true });
    fs.writeFileSync(
        path.join(dir, "packages", "a", "package.json"),
        JSON.stringify({ name: "@scope/a", version: "1.0.0" }, null, 2)
    );
    fs.mkdirSync(path.join(dir, "packages", "b"), { recursive: true });
    fs.writeFileSync(
        path.join(dir, "packages", "b", "package.json"),
        JSON.stringify(
            { name: "@scope/b", version: "1.0.1", dependencies: { "@scope/a": "^1.0.0" } },
            null,
            2
        )
    );

    git(dir, "add -A");
    git(dir, "commit -q -m \"chore: init\"");
    return dir;
}

/** Creates a single-package repository with a pnpm lockfile and one change after its tag. */
function makeSinglePackageRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lockstep-version-impl-"));
    dirs.push(dir);
    git(dir, "init -q");
    git(dir, "config user.email t@e.com");
    git(dir, "config user.name T");
    git(dir, "config commit.gpgsign false");

    fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "solo", version: "1.0.0" }, null, 2)
    );
    fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
    git(dir, "add -A");
    git(dir, "commit -q -m \"chore: init\"");
    git(dir, "tag -a v1.0.0 -m v1.0.0");

    fs.writeFileSync(path.join(dir, "index.ts"), "export const x = 2;\n");
    git(dir, "add -A");
    git(dir, "commit -q -m \"fix: bump x\"");
    return dir;
}

describe("sync lockfile refresh", () => {
    it("should refresh pnpm-lock.yaml after syncing drifted versions", async () => {
        const dir = makeDriftedMonorepo();
        fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
        const lockstep = new RecordingLockstep({ root: dir });
        lockstep.onCommand = (cmd, cwd) => {
            if (cmd.startsWith("pnpm install")) {
                fs.appendFileSync(path.join(cwd, "pnpm-lock.yaml"), "# refreshed\n");
            }
        };

        await lockstep.syncVersions();

        expect(lockstep.calls.map((c) => c.cmd)).toContain("pnpm install --lockfile-only");
        expect(fs.readFileSync(path.join(dir, "pnpm-lock.yaml"), "utf8")).toContain("# refreshed");
    });

    it("should not refresh during a sync dry run", async () => {
        const dir = makeDriftedMonorepo();
        fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
        const lockstep = new RecordingLockstep({ root: dir });

        await lockstep.syncVersions({ dryRun: true });

        expect(lockstep.calls).toEqual([]);
    });

    it("should skip the sync refresh when lockfileRefresh is false", async () => {
        const dir = makeDriftedMonorepo();
        fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
        const lockstep = new RecordingLockstep({ root: dir });

        await lockstep.syncVersions({ lockfileRefresh: false });

        expect(lockstep.calls).toEqual([]);
    });
});

describe("version lockfile refresh details", () => {
    it("should refresh even when git commit and tag are skipped", async () => {
        const dir = makeSinglePackageRepo();
        const lockstep = new RecordingLockstep({ root: dir });

        await lockstep.version({ type: "patch", noChangelog: true, noGitCommit: true });

        expect(lockstep.calls.map((c) => c.cmd)).toContain("pnpm install --lockfile-only");
    });

    it("should include recovery guidance in the refresh failure message", async () => {
        const dir = makeSinglePackageRepo();
        const lockstep = new RecordingLockstep({ root: dir });
        lockstep.onCommand = (cmd) => {
            if (cmd.startsWith("pnpm install")) throw new Error("pnpm missing");
        };

        await expect(lockstep.version({ type: "patch", noChangelog: true })).rejects.toThrow(
            /--no-lockfile-refresh/
        );
    });
});
