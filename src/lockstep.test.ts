import { describe, expect, it } from 'vitest';
import { Lockstep } from './lockstep.js';

describe('Lockstep', () => {
  describe('semverBump', () => {
    it('should bump patch version correctly', () => {
      const lockstep = new Lockstep();
      expect(lockstep.semverBump('1.2.3', 'patch')).toBe('1.2.4');
    });

    it('should bump minor version correctly', () => {
      const lockstep = new Lockstep();
      expect(lockstep.semverBump('1.2.3', 'minor')).toBe('1.3.0');
    });

    it('should bump major version correctly', () => {
      const lockstep = new Lockstep();
      expect(lockstep.semverBump('1.2.3', 'major')).toBe('2.0.0');
    });

    it('should handle pre-release versions', () => {
      const lockstep = new Lockstep();
      expect(lockstep.semverBump('1.2.3-alpha.1', 'patch')).toBe('1.2.4');
    });

    it('should throw error for invalid semver', () => {
      const lockstep = new Lockstep();
      expect(() => lockstep.semverBump('invalid', 'patch')).toThrow('Not a semver version');
    });
  });

  describe('preserveOperator', () => {
    it('should preserve caret operator', () => {
      const lockstep = new Lockstep();
      expect(lockstep.preserveOperator('^1.2.3', '1.2.4')).toBe('^1.2.4');
    });

    it('should preserve tilde operator', () => {
      const lockstep = new Lockstep();
      expect(lockstep.preserveOperator('~1.2.3', '1.2.4')).toBe('~1.2.4');
    });

    it('should preserve >= operator', () => {
      const lockstep = new Lockstep();
      expect(lockstep.preserveOperator('>=1.2.3', '1.2.4')).toBe('>=1.2.4');
    });

    it('should return exact version for no operator', () => {
      const lockstep = new Lockstep();
      expect(lockstep.preserveOperator('1.2.3', '1.2.4')).toBe('1.2.4');
    });
  });

  describe('detectPackageManager', () => {
    it('should detect package manager correctly', () => {
      const lockstep = new Lockstep();
      const pm = lockstep.detectPackageManager();
      expect(['npm', 'yarn', 'pnpm']).toContain(pm);
    });
  });
});
