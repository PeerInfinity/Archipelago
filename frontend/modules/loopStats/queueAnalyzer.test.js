/**
 * Unit tests for QueueAnalyzer
 * Uses Vitest for testing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QueueAnalyzer } from './queueAnalyzer.js';

describe('QueueAnalyzer', () => {
  let analyzer;
  let mockLoopState;

  beforeEach(() => {
    analyzer = new QueueAnalyzer();

    // Create mock loopState
    mockLoopState = {
      currentMana: 100,
      maxMana: 100,
      regionXP: new Map(),
      getRegionXP: function(regionName) {
        if (!this.regionXP.has(regionName)) {
          this.regionXP.set(regionName, { level: 0, xp: 0, xpForNextLevel: 100 });
        }
        return this.regionXP.get(regionName);
      },
      playerState: {
        isStartRegion: (region) => region === 'Menu',
      },
    };
  });

  describe('getBaseCost', () => {
    it('returns correct base cost for customAction (explore)', () => {
      expect(analyzer.getBaseCost('customAction')).toBe(50);
    });

    it('returns correct base cost for locationCheck action', () => {
      expect(analyzer.getBaseCost('locationCheck')).toBe(100);
    });

    it('returns correct base cost for regionMove action', () => {
      expect(analyzer.getBaseCost('regionMove')).toBe(50);
    });

    it('returns default cost for unknown action type', () => {
      expect(analyzer.getBaseCost('unknown')).toBe(50);
    });
  });

  describe('calculateActionCost', () => {
    it('calculates base cost without XP reduction at level 0', () => {
      const action = { type: 'customAction', actionName: 'explore', sourceRegion: 'TestRegion' };
      const result = analyzer.calculateActionCost(action, mockLoopState);

      expect(result.baseCost).toBe(50);
      expect(result.levelDiscount).toBeCloseTo(0, 1);
      expect(result.finalCost).toBe(50);
    });

    it('applies XP reduction at higher levels', () => {
      // Set region level to 10
      mockLoopState.regionXP.set('TestRegion', { level: 10, xp: 0, xpForNextLevel: 300 });

      const action = { type: 'customAction', actionName: 'explore', sourceRegion: 'TestRegion' };
      const result = analyzer.calculateActionCost(action, mockLoopState);

      // Level 10 = 1 + 10*0.05 = 1.5 reduction factor
      // Final cost = 50 / 1.5 = 33.33
      expect(result.baseCost).toBe(50);
      expect(result.finalCost).toBeLessThan(50);
      expect(result.levelDiscount).toBeGreaterThan(0);
    });
  });

  describe('getActionDescription', () => {
    it('returns correct description for explore action', () => {
      const action = { type: 'customAction', actionName: 'explore', sourceRegion: 'Forest' };
      expect(analyzer.getActionDescription(action)).toBe('Explore: Forest');
    });

    it('returns correct description for locationCheck action', () => {
      const action = { type: 'locationCheck', locationName: 'Chest 1', sourceRegion: 'Forest' };
      expect(analyzer.getActionDescription(action)).toBe('Check: Chest 1');
    });

    it('returns correct description for regionMove action', () => {
      const action = { type: 'regionMove', sourceRegion: 'Forest', destinationRegion: 'Village' };
      expect(analyzer.getActionDescription(action)).toBe('Move: Village');
    });
  });

  describe('truncateDescription', () => {
    it('does not truncate short strings', () => {
      expect(analyzer.truncateDescription('Short', 20)).toBe('Short');
    });

    it('truncates long strings with ellipsis', () => {
      const longString = 'This is a very long description that should be truncated';
      const result = analyzer.truncateDescription(longString, 20);
      expect(result.length).toBe(20);
      expect(result.endsWith('…')).toBe(true);
    });
  });

  describe('analyze', () => {
    it('returns empty analysis for null input', () => {
      const result = analyzer.analyze(null, null);
      expect(result.entries).toHaveLength(0);
      expect(result.totalCost).toBe(0);
    });

    it('analyzes a single action', () => {
      const queue = [
        { type: 'customAction', actionName: 'explore', sourceRegion: 'Forest' },
      ];

      const result = analyzer.analyze(queue, mockLoopState);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].type).toBe('customAction');
    });

    it('calculates mana correctly for multiple actions', () => {
      const queue = [
        { type: 'regionMove', sourceRegion: 'Menu', destinationRegion: 'Forest', exitUsed: 'Door', pathIndex: 0 },
        { type: 'customAction', actionName: 'explore', sourceRegion: 'Forest', pathIndex: 1 },
      ];

      const result = analyzer.analyze(queue, mockLoopState);

      // Move: 50 mana, Explore: 50 mana
      // Starting 100, after move: 50, after explore: 0
      expect(result.entries[0].manaAfterAction).toBe(50);
      expect(result.entries[1].manaAfterAction).toBe(0);
      expect(result.totalCost).toBe(100);
      expect(result.finalMana).toBe(0);
    });

    it('marks insufficient mana correctly', () => {
      const queue = [
        { type: 'customAction', actionName: 'explore', sourceRegion: 'Forest', pathIndex: 0 },
        { type: 'customAction', actionName: 'explore', sourceRegion: 'Forest', pathIndex: 1 },
        { type: 'customAction', actionName: 'explore', sourceRegion: 'Forest', pathIndex: 2 },
      ];

      // 3 explores at 50 each = 150, but maxMana is 100
      const result = analyzer.analyze(queue, mockLoopState);
      expect(result.entries[0].hasInsufficientMana).toBe(false);
      expect(result.entries[1].hasInsufficientMana).toBe(false);
      expect(result.entries[2].hasInsufficientMana).toBe(true);
    });

    it('handles completed actions correctly', () => {
      const queue = [
        { type: 'customAction', actionName: 'explore', sourceRegion: 'Forest', pathIndex: 0, completed: true },
        { type: 'customAction', actionName: 'explore', sourceRegion: 'Forest', pathIndex: 1 },
      ];

      const result = analyzer.analyze(queue, mockLoopState);

      // Completed actions still deduct mana for stable downstream values
      expect(result.entries[0].isCompleted).toBe(true);
      expect(result.entries[1].manaBeforeAction).toBe(50);
    });
  });

  describe('archiveCurrentAnalysis', () => {
    it('archives current analysis as previous', () => {
      const queue = [
        { type: 'customAction', actionName: 'explore', sourceRegion: 'Forest', pathIndex: 0 },
      ];

      analyzer.analyze(queue, mockLoopState);
      analyzer.archiveCurrentAnalysis();

      expect(analyzer.getPreviousAnalysis()).not.toBeNull();
      expect(analyzer.getPreviousAnalysis().entries).toHaveLength(1);
    });
  });

  describe('getSerializableState', () => {
    it('returns serializable state object', () => {
      const queue = [
        { type: 'customAction', actionName: 'explore', sourceRegion: 'Forest', pathIndex: 0 },
      ];

      analyzer.analyze(queue, mockLoopState);
      const state = analyzer.getSerializableState();

      expect(state).toHaveProperty('currentAnalysis');
      expect(state).toHaveProperty('previousAnalysis');
      expect(state).toHaveProperty('baseCosts');
      expect(state.baseCosts.customAction).toBe(50);
    });
  });
});
