/**
 * Implementation tests for the sync command's version-precedence internals.
 *
 * `semverCompare` and `highestVersion` are pure helpers underpinning drift recovery; these cover
 * their ordering rules and boundary conditions directly, without a workspace fixture.
 */

import { describe, expect, it } from 'vitest';
import { Lockstep } from './lockstep.js';

describe('semverCompare', () => {
    const ls = new Lockstep();

    it('should return a positive number when the first version is higher', () => {
        expect(ls.semverCompare('2.0.0', '1.9.9')).toBeGreaterThan(0);
    });

    it('should return a negative number when the first version is lower', () => {
        expect(ls.semverCompare('1.0.0', '1.0.1')).toBeLessThan(0);
    });

    it('should return zero for versions equal in precedence', () => {
        expect(ls.semverCompare('1.2.3', '1.2.3')).toBe(0);
    });

    it('should compare the minor field numerically, not lexically', () => {
        // 1.9.0 vs 1.10.0: lexically "9" > "10", numerically 10 > 9 — the numeric order must win.
        expect(ls.semverCompare('1.10.0', '1.9.0')).toBeGreaterThan(0);
    });

    it('should rank a normal release above its own pre-release', () => {
        expect(ls.semverCompare('1.0.0', '1.0.0-alpha')).toBeGreaterThan(0);
    });

    it('should throw when either argument is not valid semver', () => {
        expect(() => ls.semverCompare('1.0', '1.0.0')).toThrow('Not a semver version');
    });
});

describe('highestVersion', () => {
    const ls = new Lockstep();

    it('should return the greatest version by numeric precedence', () => {
        expect(ls.highestVersion(['1.0.0', '1.10.0', '1.9.0'])).toBe('1.10.0');
    });

    it('should return the sole element for a single-item list', () => {
        expect(ls.highestVersion(['3.4.5'])).toBe('3.4.5');
    });

    it('should prefer a normal release over a competing pre-release of the same core', () => {
        expect(ls.highestVersion(['2.0.0-rc.1', '2.0.0'])).toBe('2.0.0');
    });

    it('should be independent of input order', () => {
        expect(ls.highestVersion(['1.9.0', '1.10.0'])).toBe(ls.highestVersion(['1.10.0', '1.9.0']));
    });

    it('should throw for an empty list', () => {
        expect(() => ls.highestVersion([])).toThrow('at least one');
    });

    it('should throw when any entry is not valid semver', () => {
        expect(() => ls.highestVersion(['1.0.0', 'nope'])).toThrow('Not a semver version');
    });
});
