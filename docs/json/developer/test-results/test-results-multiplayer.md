# Archipelago Multiplayer Template Test Results Chart

**Generated:** 2025-10-08 11:15:47

**Test Timestamp:** None

**Test Type:** None

**Test Mode:** None

**Seed:** None

## Summary

- **Total Games:** 1
- **Passed:** 1 (100.0%)
- **Failed:** 0 (0.0%)

## Test Results

| Game Name | Test Result | Gen Errors | Locations Checked | Total Locations | Progress | Custom Exporter | Custom GameLogic |
|-----------|-------------|------------|-------------------|-----------------|----------|-----------------|------------------|
| adventure | ✅ Passed | 0 | 24 | 24 | 🟢 Complete | ✅ | ⚫ |

## Notes

- **Gen Errors:** Number of errors during world generation
- **Locations Checked:** Number of locations checked during the multiplayer test
- **Total Locations:** Total number of locations available in the game
- **Progress:** Percentage of locations checked
- **Custom Exporter:** ✅ Has custom Python exporter script, ⚫ Uses generic exporter
- **Custom GameLogic:** ✅ Has custom JavaScript game logic, ⚫ Uses generic logic

**Pass Criteria:** A test is marked as ✅ Passed only if:
- Generation errors = 0 (no errors during world generation)
- All locations checked (locations_checked == total_locations)
- Total locations > 0 (game has locations to check)
- Multiplayer test completed successfully

Progress indicators:
- 🟢 Complete - Test completely passed (all criteria met)
- 🟡 Yellow - Progress ≥ 75%
- 🟠 Orange - Progress ≥ 25% and < 75%
- 🔴 Red - Progress < 25%
- ❓ N/A - No location data available
