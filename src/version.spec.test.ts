/**
 * Specification tests for version behavior.
 *
 * These cover workspace range preservation, annotated release tags, pnpm lockfile refresh, and
 * the CLI no-change guard. They use real temporary git fixtures.
 */

import { execSync, spawnSync } from "node:child_process";
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

/**
 * Records package-manager commands instead of running them. The optional callback can simulate
 * a lockfile rewrite or a failure.
 */
class RecordingLockstep extends Lockstep {
    calls: Array<{ cmd: string; cwd: string }> = [];
    onCommand?: (cmd: string, cwd: string) => void;

    protected override execCommand(cmd: string, cwd: string): void {
        this.calls.push({ cmd, cwd });
        this.onCommand?.(cmd, cwd);
    }
}

/** Creates a single-package repository with a v1.0.0 tag and one fix commit after it. */
function makeSinglePackageRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lockstep-version-"));
    dirs.push(dir);
    git(dir, "init -q");
    git(dir, "config user.email t@e.com");
    git(dir, "config user.name T");
    git(dir, "config commit.gpgsign false");

    fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "solo", version: "1.0.0" }, null, 2)
    );
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, "src/index.ts"), "export const x = 1;\n");
    git(dir, "add -A");
    git(dir, "commit -q -m \"chore: init\"");
    git(dir, "tag -a v1.0.0 -m v1.0.0");

    fs.writeFileSync(path.join(dir, "src/index.ts"), "export const x = 2;\n");
    git(dir, "add -A");
    git(dir, "commit -q -m \"fix: bump x\"");
    return dir;
}

/** Creates a repository whose HEAD is already tagged and has no changes since that tag. */
function makeUnchangedRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lockstep-nochange-"));
    dirs.push(dir);
    git(dir, "init -q");
    git(dir, "config user.email t@e.com");
    git(dir, "config user.name T");
    git(dir, "config commit.gpgsign false");

    fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "solo", version: "1.0.0" }, null, 2)
    );
    git(dir, "add -A");
    git(dir, "commit -q -m \"chore: init\"");
    git(dir, "tag -a v1.0.0 -m v1.0.0");
    return dir;
}

describe("workspace range preservation", () => {
    const lockstep = new Lockstep();

    it("should leave workspace protocol ranges untouched", () => {
        expect(lockstep.preserveOperator("workspace:*", "1.0.1")).toBe("workspace:*");
        expect(lockstep.preserveOperator("workspace:^", "1.0.1")).toBe("workspace:^");
        expect(lockstep.preserveOperator("workspace:~", "1.0.1")).toBe("workspace:~");
        expect(lockstep.preserveOperator("workspace:^1.0.0", "1.0.1")).toBe("workspace:^1.0.0");
    });

    it("should still rewrite plain ranges", () => {
        expect(lockstep.preserveOperator("^1.0.0", "1.0.1")).toBe("^1.0.1");
        expect(lockstep.preserveOperator("~1.0.0", "1.0.1")).toBe("~1.0.1");
        expect(lockstep.preserveOperator("1.0.0", "1.0.1")).toBe("1.0.1");
    });
});

describe("release tags", () => {
    it("should create an annotated tag that --follow-tags can push", async () => {
        const dir = makeSinglePackageRepo();

        await new Lockstep({ root: dir }).version({ type: "patch", noChangelog: true });

        const tagType = execSync("git cat-file -t v1.0.1", { cwd: dir }).toString().trim();
        expect(tagType).toBe("tag");
    });
});

describe("pnpm lockfile refresh", () => {
    it("should refresh and commit pnpm-lock.yaml after a version bump", async () => {
        const dir = makeSinglePackageRepo();
        fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9\n");

        const lockstep = new RecordingLockstep({ root: dir });
        lockstep.onCommand = (cmd, cwd) => {
            if (cmd.startsWith("pnpm install")) {
                fs.appendFileSync(path.join(cwd, "pnpm-lock.yaml"), "# refreshed\n");
            }
        };

        await lockstep.version({ type: "patch", noChangelog: true });

        expect(lockstep.calls.map((c) => c.cmd)).toContain("pnpm install --lockfile-only");
        const committed = execSync("git show HEAD:pnpm-lock.yaml", { cwd: dir }).toString();
        expect(committed).toContain("# refreshed");
    });

    it("should skip the refresh when pnpm-lock.yaml does not exist", async () => {
        const dir = makeSinglePackageRepo();
        const lockstep = new RecordingLockstep({ root: dir });

        await lockstep.version({ type: "patch", noChangelog: true });

        expect(lockstep.calls).toEqual([]);
    });

    it("should skip the refresh when lockfileRefresh is false", async () => {
        const dir = makeSinglePackageRepo();
        fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
        const lockstep = new RecordingLockstep({ root: dir });

        await lockstep.version({ type: "patch", noChangelog: true, lockfileRefresh: false });

        expect(lockstep.calls).toEqual([]);
    });

    it("should fail the version bump when the lockfile refresh fails", async () => {
        const dir = makeSinglePackageRepo();
        fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
        const lockstep = new RecordingLockstep({ root: dir });
        lockstep.onCommand = (cmd) => {
            if (cmd.startsWith("pnpm install")) throw new Error("pnpm not available");
        };

        await expect(lockstep.version({ type: "patch", noChangelog: true })).rejects.toThrow(
            /Failed to refresh pnpm-lock\.yaml/
        );

        const tags = execSync("git tag", { cwd: dir }).toString();
        expect(tags).not.toContain("v1.0.1");
        const subject = execSync("git log -1 --pretty=%s", { cwd: dir }).toString().trim();
        expect(subject).toBe("fix: bump x");
    });
});

describe("no-change guard", () => {
    it("should exit 1 with --fail-on-no-changes and 0 without it", () => {
        const dir = makeUnchangedRepo();
        const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
        const cli = path.join(process.cwd(), "src", "cli.ts");
        const runCli = (args: string[]) =>
            spawnSync(process.execPath, [tsxCli, cli, ...args], {
                cwd: dir,
                encoding: "utf8"
            });

        const withFlag = runCli(["version", "--type", "auto", "--fail-on-no-changes"]);
        expect(withFlag.status).toBe(1);
        expect(withFlag.stdout).toContain("No changes since last tag");

        const withoutFlag = runCli(["version", "--type", "auto"]);
        expect(withoutFlag.status).toBe(0);
    });
});
