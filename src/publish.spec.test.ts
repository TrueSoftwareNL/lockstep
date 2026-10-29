/**
 * Specification tests for publish behavior.
 *
 * These cover the publish contract: exact versus branch-derived dist-tags, private-package
 * skipping, dependency-ordered publishing, preflight dry runs, and pushing release tags.
 * They use real temporary git fixtures and a recording subclass instead of publishing to npm.
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

/**
 * Records publish commands instead of invoking a registry client.
 * `onCommand` can simulate a failure for a specific command.
 */
class RecordingLockstep extends Lockstep {
    calls: Array<{ cmd: string; cwd: string }> = [];
    onCommand?: (cmd: string, cwd: string) => void;

    protected override execCommand(cmd: string, cwd: string): void {
        this.calls.push({ cmd, cwd });
        this.onCommand?.(cmd, cwd);
    }
}

/**
 * Creates a monorepo fixture with a private root package and the supplied packages under
 * `packages/<dir>`. The repository is committed so branch resolution works.
 */
function makeMonorepo(packages: Record<string, Record<string, unknown>>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lockstep-publish-"));
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

/** Creates a repository whose current branch is `main` and whose origin is a local bare repo. */
function makePushedRepo(): { dir: string; remote: string } {
    const dir = makeMonorepo({ a: { name: "a", version: "1.0.0" } });
    git(dir, "branch -M main");

    const remoteParent = fs.mkdtempSync(path.join(os.tmpdir(), "lockstep-remote-"));
    dirs.push(remoteParent);
    const remote = path.join(remoteParent, "remote.git");
    execSync(`git init --bare -q "${remote}"`);
    git(dir, `remote add origin "${remote}"`);
    git(dir, "push -q -u origin main");

    git(dir, "tag -a v1.0.0 -m v1.0.0");

    // An unrelated annotated tag on a branch that is not being pushed.
    git(dir, "checkout -q -b other");
    fs.writeFileSync(path.join(dir, "other.txt"), "other\n");
    git(dir, "add -A");
    git(dir, "commit -q -m \"chore: other\"");
    git(dir, "tag -a v0.9.0 -m v0.9.0");
    git(dir, "checkout -q main");

    return { dir, remote };
}

describe("resolveDistTag", () => {
    const lockstep = new Lockstep();

    it("should use latest verbatim in branch mode", () => {
        expect(lockstep.resolveDistTag("latest", "branch", "main")).toBe("latest");
    });

    it("should use the supplied tag verbatim in exact mode", () => {
        expect(lockstep.resolveDistTag("next", "exact", "main")).toBe("next");
        expect(lockstep.resolveDistTag("beta", "exact", "feature-x")).toBe("beta");
    });

    it("should prefix non-latest tags with the branch in branch mode", () => {
        expect(lockstep.resolveDistTag("next", "branch", "main")).toBe("main-next");
        expect(lockstep.resolveDistTag("next", "branch", "feature-x")).toBe("feature-x-next");
    });
});

describe("publish dist-tags", () => {
    it("should publish the exact tag when tag mode is exact", async () => {
        const dir = makeMonorepo({ a: { name: "a", version: "1.0.0" } });
        const lockstep = new RecordingLockstep({ root: dir });

        await lockstep.publish({ tag: "next", tagMode: "exact" });

        expect(lockstep.calls).toHaveLength(1);
        expect(lockstep.calls[0]!.cmd).toContain("--tag next");
        expect(lockstep.calls[0]!.cmd).not.toContain("master-next");
    });

    it("should keep branch-prefixed tags as the default", async () => {
        const dir = makeMonorepo({ a: { name: "a", version: "1.0.0" } });
        git(dir, "checkout -q -b feature-x");
        const lockstep = new RecordingLockstep({ root: dir });

        await lockstep.publish({ tag: "next" });

        expect(lockstep.calls[0]!.cmd).toContain("--tag feature-x-next");
    });

    it("should keep latest unprefixed", async () => {
        const dir = makeMonorepo({ a: { name: "a", version: "1.0.0" } });
        const lockstep = new RecordingLockstep({ root: dir });

        await lockstep.publish({ tag: "latest" });

        expect(lockstep.calls[0]!.cmd).toContain("--tag latest");
    });
});

describe("publish package selection", () => {
    it("should skip private packages and keep the public topological order", async () => {
        const dir = makeMonorepo({
            a: { name: "@scope/a", version: "1.0.0" },
            internal: { name: "@scope/internal", version: "1.0.0", private: true },
            b: { name: "@scope/b", version: "1.0.0", dependencies: { "@scope/a": "^1.0.0" } }
        });
        const lockstep = new RecordingLockstep({ root: dir });

        await lockstep.publish({ tag: "latest" });

        expect(lockstep.calls.map((c) => path.basename(c.cwd))).toEqual(["a", "b"]);
    });

    it("should publish nothing when every package is private", async () => {
        const dir = makeMonorepo({
            internal: { name: "@scope/internal", version: "1.0.0", private: true }
        });
        const lockstep = new RecordingLockstep({ root: dir });

        await lockstep.publish({ tag: "latest" });

        expect(lockstep.calls).toEqual([]);
    });
});

describe("publish preflight", () => {
    it("should dry-run every package before publishing any of them", async () => {
        const dir = makeMonorepo({
            a: { name: "a", version: "1.0.0" },
            b: { name: "b", version: "1.0.0", dependencies: { a: "^1.0.0" } }
        });
        const lockstep = new RecordingLockstep({ root: dir });

        await lockstep.publish({ tag: "latest", preflight: true });

        expect(lockstep.calls.map((c) => c.cmd.includes("--dry-run"))).toEqual([
            true,
            true,
            false,
            false
        ]);
    });

    it("should publish nothing when a preflight dry run fails", async () => {
        const dir = makeMonorepo({
            a: { name: "a", version: "1.0.0" },
            b: { name: "b", version: "1.0.0" }
        });
        const lockstep = new RecordingLockstep({ root: dir });
        lockstep.onCommand = (cmd, cwd) => {
            if (cmd.includes("--dry-run") && path.basename(cwd) === "b") {
                throw new Error("simulated preflight failure");
            }
        };

        await expect(lockstep.publish({ tag: "latest", preflight: true })).rejects.toThrow(
            "simulated preflight failure"
        );
        expect(lockstep.calls.length).toBeGreaterThan(0);
        expect(lockstep.calls.every((c) => c.cmd.includes("--dry-run"))).toBe(true);
    });
});

describe("publish git push", () => {
    it("should push the release tag without pushing unrelated tags", async () => {
        const { dir, remote } = makePushedRepo();
        const lockstep = new RecordingLockstep({ root: dir });

        await lockstep.publish({ tag: "latest", gitPush: true });

        const remoteTags = execSync(`git ls-remote --tags "${remote}"`).toString();
        expect(remoteTags).toContain("refs/tags/v1.0.0");
        expect(remoteTags).not.toContain("refs/tags/v0.9.0");
    });
});
