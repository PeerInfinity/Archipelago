import { describe, it, expect } from 'vitest';
import {
  proposedLinearReduction,
  proposedLinearFinalCost,
  levelFromXP,
  totalXPForLevel,
  xpForNextLevel,
  calculateXPGain,
  idleLoopsCostReduction,
  idleLoopsFinalCost,
} from './xpFormulas.js';

describe('xpFormulas', () => {
  describe('proposedLinearReduction', () => {
    it('returns 1 for level 0 (no reduction)', () => {
      expect(proposedLinearReduction(0)).toBe(1);
    });

    it('returns 1.05 for level 1 (5% reduction)', () => {
      expect(proposedLinearReduction(1)).toBe(1.05);
    });

    it('returns 1.5 for level 10 (50% reduction)', () => {
      expect(proposedLinearReduction(10)).toBe(1.5);
    });

    it('returns 2 for level 20 (100% reduction)', () => {
      expect(proposedLinearReduction(20)).toBe(2);
    });
  });

  describe('proposedLinearFinalCost', () => {
    it('returns base cost when level is 0', () => {
      expect(proposedLinearFinalCost(100, 0)).toBe(100);
    });

    it('reduces cost by ~4.76% at level 1', () => {
      const cost = proposedLinearFinalCost(100, 1);
      expect(cost).toBeCloseTo(95.24, 1);
    });

    it('halves cost at level 20', () => {
      expect(proposedLinearFinalCost(100, 20)).toBe(50);
    });

    it('reduces explore action cost (50 base) correctly', () => {
      expect(proposedLinearFinalCost(50, 0)).toBe(50);
      expect(proposedLinearFinalCost(50, 10)).toBeCloseTo(33.33, 1);
    });

    it('reduces check location cost (100 base) correctly', () => {
      expect(proposedLinearFinalCost(100, 0)).toBe(100);
      expect(proposedLinearFinalCost(100, 5)).toBeCloseTo(80, 0);
    });
  });

  describe('levelFromXP', () => {
    it('returns 0 for 0 XP', () => {
      expect(levelFromXP(0)).toBe(0);
    });

    it('returns 0 for 99 XP (just under level 1)', () => {
      expect(levelFromXP(99)).toBe(0);
    });

    it('returns 1 for 100 XP (exactly level 1)', () => {
      expect(levelFromXP(100)).toBe(1);
    });

    it('returns 1 for 219 XP (just under level 2)', () => {
      expect(levelFromXP(219)).toBe(1);
    });

    it('returns 2 for 220 XP (exactly level 2)', () => {
      expect(levelFromXP(220)).toBe(2);
    });

    it('returns 3 for 360 XP (exactly level 3)', () => {
      expect(levelFromXP(360)).toBe(3);
    });

    it('handles large XP values correctly', () => {
      // Level 10 requires 10*100 + 90*10 = 1000 + 900 = 1900 XP
      expect(levelFromXP(1900)).toBe(10);
    });
  });

  describe('totalXPForLevel', () => {
    it('returns 0 for level 0', () => {
      expect(totalXPForLevel(0)).toBe(0);
    });

    it('returns 100 for level 1', () => {
      expect(totalXPForLevel(1)).toBe(100);
    });

    it('returns 220 for level 2', () => {
      expect(totalXPForLevel(2)).toBe(220);
    });

    it('returns 360 for level 3', () => {
      expect(totalXPForLevel(3)).toBe(360);
    });

    it('returns 1900 for level 10', () => {
      expect(totalXPForLevel(10)).toBe(1900);
    });

    it('is consistent with levelFromXP', () => {
      for (let level = 0; level <= 20; level++) {
        const xp = totalXPForLevel(level);
        expect(levelFromXP(xp)).toBe(level);
      }
    });
  });

  describe('xpForNextLevel', () => {
    it('returns 100 for level 0 -> 1', () => {
      expect(xpForNextLevel(0)).toBe(100);
    });

    it('returns 120 for level 1 -> 2', () => {
      expect(xpForNextLevel(1)).toBe(120);
    });

    it('returns 140 for level 2 -> 3', () => {
      expect(xpForNextLevel(2)).toBe(140);
    });

    it('returns 300 for level 10 -> 11', () => {
      expect(xpForNextLevel(10)).toBe(300);
    });

    it('increases by 20 each level', () => {
      for (let level = 0; level < 10; level++) {
        expect(xpForNextLevel(level + 1) - xpForNextLevel(level)).toBe(20);
      }
    });
  });

  describe('calculateXPGain', () => {
    it('returns base cost as XP for normal actions', () => {
      expect(calculateXPGain('customAction', 50)).toBe(50);
      expect(calculateXPGain('locationCheck', 100)).toBe(100);
      expect(calculateXPGain('regionMove', 10)).toBe(10);
    });

    it('returns 4x XP for explore in farming mode', () => {
      expect(calculateXPGain('customAction', 50, false, true)).toBe(200);
    });

    it('does not apply farming multiplier to non-explore actions', () => {
      expect(calculateXPGain('locationCheck', 100, false, true)).toBe(100);
      expect(calculateXPGain('regionMove', 10, false, true)).toBe(10);
    });

    it('ignores isFirstTime parameter (returns same XP)', () => {
      expect(calculateXPGain('customAction', 50, true, false)).toBe(50);
      expect(calculateXPGain('customAction', 50, false, false)).toBe(50);
    });
  });

  describe('idleLoopsCostReduction', () => {
    it('returns 1 for stat level 0', () => {
      expect(idleLoopsCostReduction(0)).toBe(1);
    });

    it('returns 1.01 for stat level 1', () => {
      expect(idleLoopsCostReduction(1)).toBe(1.01);
    });

    it('returns 2 for stat level 100', () => {
      expect(idleLoopsCostReduction(100)).toBe(2);
    });

    it('returns 1.5 for stat level 50', () => {
      expect(idleLoopsCostReduction(50)).toBe(1.5);
    });
  });

  describe('idleLoopsFinalCost', () => {
    it('returns base cost when stat level is 0', () => {
      expect(idleLoopsFinalCost(100, 0)).toBe(100);
    });

    it('halves cost at stat level 100', () => {
      expect(idleLoopsFinalCost(100, 100)).toBe(50);
    });

    it('reduces cost correctly at stat level 50', () => {
      expect(idleLoopsFinalCost(100, 50)).toBeCloseTo(66.67, 1);
    });
  });

  describe('formula consistency', () => {
    it('total XP equals sum of XP for each level', () => {
      for (let targetLevel = 1; targetLevel <= 10; targetLevel++) {
        let sumXP = 0;
        for (let level = 0; level < targetLevel; level++) {
          sumXP += xpForNextLevel(level);
        }
        expect(sumXP).toBe(totalXPForLevel(targetLevel));
      }
    });

    it('levelFromXP correctly identifies level boundaries', () => {
      for (let level = 1; level <= 10; level++) {
        const exactXP = totalXPForLevel(level);
        const justUnder = exactXP - 1;

        expect(levelFromXP(exactXP)).toBe(level);
        expect(levelFromXP(justUnder)).toBe(level - 1);
      }
    });
  });
});
