/**
 * Security specification tests for command construction and repository data handling.
 *
 * Tag names are repository-controlled data, not shell syntax. These tests use a deliberately
 * malicious tag that would run `touch PWNED` if it were interpolated into a shell command.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Lockstep } from "./lockstep.js";
import {
    getChangedFiles,
    getCommitsSinceRef,
    getLastReleaseRef
} from "./changelog/change-detection.js";

const dirs: string[] = [];

afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** Runs a git command without a shell. */
function git(dir: string, args: string[]): void {
    execFileSync("git", args, { cwd: dir, stdio: "pipe" });
}

/**
 * Creates a repository whose nearest tag contains shell metacharacters. In a shell-interpolated
 * command the tag would execute `touch PWNED`; in an argument-vector command it is inert data.
 */
function makeRepoWithMaliciousTag(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lockstep-security-"));
    dirs.push(dir);
    git(dir, ["init", "-q"]);
    git(dir, ["config", "user.email", "t@e.com"]);
    git(dir, ["config", "user.name", "T"]);
    git(dir, ["config", "commit.gpgsign", "false"]);

    fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "solo", version: "1.0.0" }, null, 2)
    );
    fs.writeFileSync(path.join(dir, "index.ts"), "export const x = 1;\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "chore: init"]);
    git(dir, ["tag", "-a", "v1.0.0", "-m", "v1.0.0"]);

    fs.writeFileSync(path.join(dir, "index.ts"), "export const x = 2;\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "fix: bump"]);

    // Valid git ref name. The `#` comments out the `..HEAD` suffix in a shell command.
    git(dir, ["tag", "-a", "v1;touch${IFS}PWNED;#", "-m", "evil"]);
    return dir;
}

describe("repository tag handling", () => {
    it("should treat a tag name as data, never as shell syntax", () => {
        const dir = makeRepoWithMaliciousTag();
        const lockstep = new Lockstep({ root: dir });

        // The malicious tag is the nearest tag, so every path below actually consumes it.
        expect(getLastReleaseRef(dir)).toBe("v1;touch${IFS}PWNED;#");

        expect(() => lockstep.changedSinceLastTag()).not.toThrow();
        expect(lockstep.changedSinceLastTag()).toBe(false);
        expect(lockstep.determineVersionType()).toBe("patch");

        const ref = getLastReleaseRef(dir);
        expect(() => getChangedFiles(ref, dir)).not.toThrow();
        expect(getChangedFiles(ref, dir)).toEqual([]);
        expect(() => getCommitsSinceRef(ref, dir)).not.toThrow();
        expect(getCommitsSinceRef(ref, dir)).toEqual([]);

        expect(fs.existsSync(path.join(dir, "PWNED"))).toBe(false);
    });
});
