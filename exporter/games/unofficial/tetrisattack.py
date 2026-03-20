"""Tetris Attack game-specific export handler.

Tetris Attack uses lambda closures with captured variables that the standard
AST analyzer cannot properly extract. Variables like `difficulty`, `r`, `s`, `l`
are captured from the enclosing scope rather than passed as default arguments.

This handler extracts closure variables directly from the lambda functions and
constructs appropriate rules based on the actual world options.
"""

import logging
import re
from typing import Dict, Any, Optional, Callable, List, Tuple

from ..base import GenericGameExportHandler

logger = logging.getLogger(__name__)


class TetrisAttackGameExportHandler(GenericGameExportHandler):
    """Tetris Attack export handler.

    Handles the closure variable issues in all rule types by extracting
    closure variables directly and constructing rules based on world options.
    """

    GAME_NAME = 'Tetris Attack'

    # Constants from the apworld
    VERSUS_STAGE_NAMES = [
        "BREEZE STAGE - Lakitu and Goonie",
        "GLACIAL STAGE - Bumpty and Dr Freezegood",
        "FOREST STAGE - Poochy and Grinder",
        "FLOWER STAGE - Flying Wiggler and Eggo-Dil",
        "WATER STAGE - Froggy and Clawdaddy",
        "BLAZE STAGE - Gargantua Blargg and Flamer Guy",
        "SEA STAGE - Lunge Fish and Flopsy Fish",
        "LUNAR STAGE - Raphael the Raven and Shy-Guy",
        "CAVE OF WICKEDNESS - Hookbill The Koopa!",
        "CAVE OF WICKEDNESS - Naval Piranha!!",
        "CAVE OF WICKEDNESS - Kamek and Kamek's Toadies!!!",
        "LAST STAGE Bowser!!!!"
    ]

    VERSUS_FREE_NAMES = [
        "Free Lakitu and Goonie",
        "Free Bumpty and Dr Freezegood",
        "Free Poochy and Grinder",
        "Free Flying Wiggler and Eggo-Dil",
        "Free Froggy and Clawdaddy",
        "Free Gargantua Blargg and Flamer Guy",
        "Free Lunge Fish and Flopsy Fish",
        "Free Raphael the Raven and Shy-Guy"
    ]

    VERSUS_UNLOCK_NAMES = [
        "Vs. Breeze Stage Unlock",
        "Vs. Glacial Stage Unlock",
        "Vs. Forest Stage Unlock",
        "Vs. Flower Stage Unlock",
        "Vs. Water Stage Unlock",
        "Vs. Blaze Stage Unlock",
        "Vs. Sea Stage Unlock",
        "Vs. Lunar Stage Unlock",
        "Vs. Cave of Wickedness 1 Unlock",  # Stage 9 (Hookbill)
        "Vs. Cave of Wickedness 2 Unlock",  # Stage 10 (Naval Piranha)
        "Vs. Cave of Wickedness 3 Unlock",  # Stage 11 (Kamek)
        "Vs. Last Stage Unlock"             # Stage 12 (Bowser)
    ]

    def __init__(self, world=None):
        """Initialize the handler."""
        super().__init__(world)
        self._versus_location_to_stage: Dict[str, int] = {}
        self._setup_location_mappings()

    def _setup_location_mappings(self):
        """Set up mapping from location names to stage numbers."""
        for i, name in enumerate(self.VERSUS_STAGE_NAMES):
            self._versus_location_to_stage[name] = i + 1
        for i, name in enumerate(self.VERSUS_FREE_NAMES):
            self._versus_location_to_stage[name] = i + 1

    @staticmethod
    def _extract_closure_vars(func: Callable) -> Dict[str, Any]:  # type: ignore[override]
        """Extract closure variables from a function."""
        closure_vars = {}
        if hasattr(func, '__closure__') and func.__closure__:
            code = func.__code__
            freevars = code.co_freevars
            for i, cell in enumerate(func.__closure__):
                try:
                    if i < len(freevars):
                        closure_vars[freevars[i]] = cell.cell_contents
                except ValueError:
                    pass  # Empty cell
        return closure_vars

    def _extract_default_args(self, func: Callable) -> Dict[str, Any]:
        """Extract default arguments from a function."""
        defaults = {}
        if hasattr(func, '__code__') and hasattr(func, '__defaults__') and func.__defaults__:
            code = func.__code__
            # varnames includes args first, then local vars
            arg_count = code.co_argcount
            arg_names = code.co_varnames[:arg_count]
            # defaults apply to the last N args
            default_count = len(func.__defaults__)
            for i, default in enumerate(func.__defaults__):
                arg_idx = arg_count - default_count + i
                if arg_idx < len(arg_names):
                    defaults[arg_names[arg_idx]] = default
        return defaults

    def _create_versus_stage_rule(self, stage_number: int) -> Dict[str, Any]:
        """Create a rule for completing a versus stage."""
        conditions: List[Dict[str, Any]] = []

        # Progressive unlock check
        conditions.append({
            'type': 'item_check',
            'item': "Vs. Progressive Stage Unlock",
            'count': stage_number
        })

        # Individual unlock check (alternative)
        if stage_number <= len(self.VERSUS_UNLOCK_NAMES):
            conditions.append({
                'type': 'item_check',
                'item': self.VERSUS_UNLOCK_NAMES[stage_number - 1]
            })

        access_rule = {'type': 'or', 'conditions': conditions}

        # If stage > 8, also need Mt. Wickedness Gate
        if stage_number > 8:
            access_rule = {
                'type': 'and',
                'conditions': [
                    {'type': 'item_check', 'item': "Mt. Wickedness Gate"},
                    access_rule
                ]
            }

        return access_rule

    def _create_stage_clear_rule(self, round_number: int, stage_number: int, world) -> Dict[str, Any]:
        """Create a rule for Stage Clear stage completability based on world options."""
        # Check the stage_clear_mode option
        mode = getattr(world.options, 'stage_clear_mode', None)
        mode_value = mode.value if mode else 0

        # First check round accessibility
        round_accessible = self._create_stage_clear_round_accessible_rule(round_number, mode_value)

        # Then check stage completability based on mode
        # StageClearMode options from the apworld:
        # 0 = whole_rounds, 1 = individual_stages, 2 = incremental,
        # 3 = incremental_with_round_gate, 4 = skippable, 5 = skippable_with_round_gate

        if mode_value in (0, 1):  # whole_rounds, individual_stages
            # Always completable if round is accessible
            return round_accessible

        elif mode_value in (2, 3):  # incremental, incremental_with_round_gate
            # Need Progressive Round X Unlock >= stage_number
            stage_rule = {
                'type': 'item_check',
                'item': f"Stage Clear Progressive Round {round_number} Unlock",
                'count': stage_number
            }
            return {'type': 'and', 'conditions': [round_accessible, stage_rule]}

        elif mode_value in (4, 5):  # skippable, skippable_with_round_gate
            # Need individual stage unlock
            stage_rule = {
                'type': 'item_check',
                'item': f"Stage Clear {round_number}-{stage_number} Unlock"
            }
            return {'type': 'and', 'conditions': [round_accessible, stage_rule]}

        return round_accessible

    def _create_stage_clear_round_accessible_rule(self, round_number: int, mode_value: int) -> Dict[str, Any]:
        """Create a rule for Stage Clear round accessibility."""
        if mode_value in (0, 3, 5):  # whole_rounds, incremental_with_round_gate, skippable_with_round_gate
            return {'type': 'item_check', 'item': f"Stage Clear Round {round_number} Gate"}

        elif mode_value == 1:  # individual_stages
            return {
                'type': 'item_check',
                'item': f"Stage Clear Progressive Round {round_number} Unlock",
                'count': 5
            }

        # modes 2, 4: always accessible
        return {'type': 'constant', 'value': True}

    def _create_stage_clear_able_to_win_rule(self, world) -> Dict[str, Any]:
        """Create a rule for stage_clear_able_to_win.

        If starter_pack is stage_clear_round_6, requires "Stage Clear Last Stage" item.
        Otherwise, requires completing round 6.
        """
        starter_pack = getattr(world.options, 'starter_pack', None)
        # StarterPack.option_stage_clear_round_6 = 5
        if starter_pack and starter_pack.value == 5:
            return {'type': 'item_check', 'item': "Stage Clear Last Stage"}
        else:
            return self._create_stage_clear_round_rule(6, world)

    def _create_stage_clear_round_rule(self, round_number: int, world) -> Dict[str, Any]:
        """Create a rule for Stage Clear round completability."""
        mode = getattr(world.options, 'stage_clear_mode', None)
        mode_value = mode.value if mode else 0

        round_accessible = self._create_stage_clear_round_accessible_rule(round_number, mode_value)

        if mode_value == 0:  # whole_rounds
            return round_accessible

        elif mode_value in (1, 2, 3):  # individual_stages, incremental, incremental_with_round_gate
            stage_rule = {
                'type': 'item_check',
                'item': f"Stage Clear Progressive Round {round_number} Unlock",
                'count': 5
            }
            return {'type': 'and', 'conditions': [round_accessible, stage_rule]}

        elif mode_value in (4, 5):  # skippable, skippable_with_round_gate
            # Need all 5 individual stage unlocks
            stage_rules = [
                {'type': 'item_check', 'item': f"Stage Clear {round_number}-{s} Unlock"}
                for s in range(1, 6)
            ]
            return {'type': 'and', 'conditions': [round_accessible] + stage_rules}

        return round_accessible

    def _create_puzzle_rule(self, level_number: int, stage_number: int, is_extra: bool, world) -> Dict[str, Any]:
        """Create a rule for Puzzle/Extra Puzzle stage completability."""
        mode = getattr(world.options, 'puzzle_mode', None)
        mode_value = mode.value if mode else 0

        base_name = "Extra Puzzle" if is_extra else "Puzzle"
        display_level = level_number - 6 if is_extra else level_number

        # First check level accessibility
        level_accessible = self._create_puzzle_level_accessible_rule(display_level, mode_value, base_name)

        # PuzzleMode options: 0=whole_levels, 1=individual_stages, 2=incremental,
        # 3=incremental_with_level_gate, 4=skippable, 5=skippable_with_level_gate

        if mode_value in (0, 1):  # whole_levels, individual_stages
            return level_accessible

        elif mode_value in (2, 3):  # incremental, incremental_with_level_gate
            stage_rule = {
                'type': 'item_check',
                'item': f"{base_name} Progressive Level {display_level} Unlock",
                'count': stage_number
            }
            return {'type': 'and', 'conditions': [level_accessible, stage_rule]}

        elif mode_value in (4, 5):  # skippable, skippable_with_level_gate
            stage_str = f"{stage_number:02d}" if stage_number < 10 else str(stage_number)
            stage_rule = {
                'type': 'item_check',
                'item': f"{base_name} {display_level}-{stage_str} Unlock"
            }
            return {'type': 'and', 'conditions': [level_accessible, stage_rule]}

        return level_accessible

    def _create_puzzle_level_accessible_rule(self, level_number: int, mode_value: int, base_name: str) -> Dict[str, Any]:
        """Create a rule for Puzzle level accessibility."""
        if mode_value in (0, 3, 5):  # whole_levels, incremental_with_level_gate, skippable_with_level_gate
            return {'type': 'item_check', 'item': f"{base_name} Level {level_number} Gate"}

        elif mode_value == 1:  # individual_stages
            return {
                'type': 'item_check',
                'item': f"{base_name} Progressive Level {level_number} Unlock",
                'count': 10
            }

        # modes 2, 4: always accessible
        return {'type': 'constant', 'value': True}

    def _create_puzzle_level_completable_rule(self, level_number: int, is_extra: bool, world) -> Dict[str, Any]:
        """Create a rule for Puzzle/Extra Puzzle level completability (for Round Clear locations)."""
        mode = getattr(world.options, 'puzzle_mode', None)
        mode_value = mode.value if mode else 0

        base_name = "Extra Puzzle" if is_extra else "Puzzle"

        # First check level accessibility
        level_accessible = self._create_puzzle_level_accessible_rule(level_number, mode_value, base_name)

        # PuzzleMode options: 0=whole_levels, 1=individual_stages, 2=incremental,
        # 3=incremental_with_level_gate, 4=skippable, 5=skippable_with_level_gate

        if mode_value == 0:  # whole_levels: just need level accessibility
            return level_accessible

        elif mode_value in (1, 2, 3):  # individual_stages, incremental, incremental_with_level_gate
            # Need 10 progressive unlocks for this level
            completion_rule = {
                'type': 'item_check',
                'item': f"{base_name} Progressive Level {level_number} Unlock",
                'count': 10
            }
            if level_accessible.get('type') == 'constant' and level_accessible.get('value') == True:
                return completion_rule
            return {'type': 'and', 'conditions': [level_accessible, completion_rule]}

        elif mode_value in (4, 5):  # skippable, skippable_with_level_gate
            # Need all 10 individual stage unlocks
            stage_rules = []
            for s in range(1, 11):
                stage_str = f"{s:02d}" if s < 10 else str(s)
                stage_rules.append({
                    'type': 'item_check',
                    'item': f"{base_name} {level_number}-{stage_str} Unlock"
                })
            completion_rule = {'type': 'and', 'conditions': stage_rules}
            if level_accessible.get('type') == 'constant' and level_accessible.get('value') == True:
                return completion_rule
            return {'type': 'and', 'conditions': [level_accessible, completion_rule]}

        return level_accessible

    def _create_shock_panel_rule(self, group_count: int, world) -> Dict[str, Any]:
        """Create a rule for clearing shock panels (! Panels locations).

        Need: has("Stage Clear ! Panels", count) AND can complete at least one stage.
        The "can complete at least one stage" check depends on stage_clear_mode.
        """
        panel_rule = {
            'type': 'item_check',
            'item': "Stage Clear ! Panels",
            'count': group_count
        }

        mode = getattr(world.options, 'stage_clear_mode', None)
        mode_value = mode.value if mode else 0

        # Create a condition for "can complete at least one stage"
        # StageClearMode options: 0=whole_rounds, 1=individual_stages, 2=incremental,
        # 3=incremental_with_round_gate, 4=skippable, 5=skippable_with_round_gate

        can_complete_stage = None

        if mode_value == 0:  # whole_rounds: any round gate means you can complete all its stages
            round_or_conditions = [
                {'type': 'item_check', 'item': f"Stage Clear Round {r} Gate"}
                for r in range(1, 7)
            ]
            can_complete_stage = {'type': 'or', 'conditions': round_or_conditions}

        elif mode_value == 1:  # individual_stages: need 5 progressive unlocks for any round
            round_or_conditions = [
                {'type': 'item_check', 'item': f"Stage Clear Progressive Round {r} Unlock", 'count': 5}
                for r in range(1, 7)
            ]
            can_complete_stage = {'type': 'or', 'conditions': round_or_conditions}

        elif mode_value == 2:  # incremental: need at least 1 progressive unlock for any round
            round_or_conditions = [
                {'type': 'item_check', 'item': f"Stage Clear Progressive Round {r} Unlock", 'count': 1}
                for r in range(1, 7)
            ]
            can_complete_stage = {'type': 'or', 'conditions': round_or_conditions}

        elif mode_value == 3:  # incremental_with_round_gate: need gate AND 1 progressive for any round
            round_or_conditions = []
            for r in range(1, 7):
                condition = {'type': 'and', 'conditions': [
                    {'type': 'item_check', 'item': f"Stage Clear Round {r} Gate"},
                    {'type': 'item_check', 'item': f"Stage Clear Progressive Round {r} Unlock", 'count': 1}
                ]}
                round_or_conditions.append(condition)
            can_complete_stage = {'type': 'or', 'conditions': round_or_conditions}

        elif mode_value == 4:  # skippable: need ANY stage unlock for any round
            # In skippable mode, you can complete any stage if you have its unlock
            stage_or_conditions = []
            for r in range(1, 7):
                for s in range(1, 6):
                    stage_or_conditions.append(
                        {'type': 'item_check', 'item': f"Stage Clear {r}-{s} Unlock"}
                    )
            can_complete_stage = {'type': 'or', 'conditions': stage_or_conditions}

        elif mode_value == 5:  # skippable_with_round_gate: need gate AND any stage unlock
            # Need any round gate with any stage unlock for that round
            round_or_conditions = []
            for r in range(1, 7):
                # For round r, need gate AND any stage unlock
                stage_unlocks = [
                    {'type': 'item_check', 'item': f"Stage Clear {r}-{s} Unlock"}
                    for s in range(1, 6)
                ]
                condition = {'type': 'and', 'conditions': [
                    {'type': 'item_check', 'item': f"Stage Clear Round {r} Gate"},
                    {'type': 'or', 'conditions': stage_unlocks}
                ]}
                round_or_conditions.append(condition)
            can_complete_stage = {'type': 'or', 'conditions': round_or_conditions}

        # If we have a can_complete_stage condition, AND it with the panel rule
        if can_complete_stage:
            return {'type': 'and', 'conditions': [panel_rule, can_complete_stage]}
        else:
            # Should not happen, but fall back to just the panel rule
            return panel_rule

    def _parse_location_name(self, name: str) -> Optional[Tuple[str, int, int]]:
        """Parse a location name to extract type, round/level, and stage numbers.

        Returns tuple of (type, round_or_level, stage) or None if not parseable.
        Type is one of: 'stage_clear_stage', 'stage_clear_round', 'stage_clear_special',
                        'puzzle', 'extra_puzzle', 'shock_panel'
        """
        # Stage Clear X-Y Clear or Special
        match = re.match(r'Stage Clear (\d)-(\d) (Clear|Special)', name)
        if match:
            return ('stage_clear_stage', int(match.group(1)), int(match.group(2)))

        # Stage Clear Round X Clear or Special
        match = re.match(r'Stage Clear Round (\d) (Clear|Special)', name)
        if match:
            return ('stage_clear_round', int(match.group(1)), 0)

        # Stage Clear Last Stage Clear
        if name == "Stage Clear Last Stage Clear":
            return ('stage_clear_last', 0, 0)

        # Stage Clear ! Panels #N
        match = re.match(r'Stage Clear ! Panels #(\d+)', name)
        if match:
            return ('shock_panel', int(match.group(1)), 0)

        # Puzzle L-SS Clear
        match = re.match(r'Puzzle (\d)-(\d{2}) Clear', name)
        if match:
            return ('puzzle', int(match.group(1)), int(match.group(2)))

        # Extra Puzzle L-SS Clear
        match = re.match(r'Extra Puzzle (\d)-(\d{2}) Clear', name)
        if match:
            return ('extra_puzzle', int(match.group(1)), int(match.group(2)))

        # Puzzle Round X Clear
        match = re.match(r'Puzzle Round (\d) Clear', name)
        if match:
            return ('puzzle_round', int(match.group(1)), 0)

        # Extra Puzzle Round X Clear
        match = re.match(r'Extra Puzzle Round (\d) Clear', name)
        if match:
            return ('extra_puzzle_round', int(match.group(1)), 0)

        return None

    def get_custom_location_access_rule(self, location, world) -> Optional[Dict[str, Any]]:
        """Override location rule analysis for all problematic locations.

        This handles locations with closure variable issues by extracting
        the parameters from the rule function and constructing appropriate rules.
        """
        location_name = location.name if hasattr(location, 'name') else str(location)

        # Check versus stage locations
        if location_name in self._versus_location_to_stage:
            stage_number = self._versus_location_to_stage[location_name]
            return self._create_versus_stage_rule(stage_number)

        # Check for "All Friends Normal Again"
        if location_name == "All Friends Normal Again":
            conditions = [self._create_versus_stage_rule(s) for s in range(1, 9)]
            return {'type': 'and', 'conditions': conditions}

        # Try to parse the location name
        parsed = self._parse_location_name(location_name)
        if parsed:
            loc_type, num1, num2 = parsed

            if loc_type == 'stage_clear_stage':
                return self._create_stage_clear_rule(num1, num2, world)
            elif loc_type == 'stage_clear_round':
                return self._create_stage_clear_round_rule(num1, world)
            elif loc_type == 'stage_clear_last':
                # Stage Clear Last Stage Clear uses stage_clear_able_to_win
                return self._create_stage_clear_able_to_win_rule(world)
            elif loc_type == 'shock_panel':
                return self._create_shock_panel_rule(num1, world)
            elif loc_type == 'puzzle':
                return self._create_puzzle_rule(num1, num2, False, world)
            elif loc_type == 'extra_puzzle':
                return self._create_puzzle_rule(num1 + 6, num2, True, world)
            elif loc_type == 'puzzle_round':
                return self._create_puzzle_level_completable_rule(num1, False, world)
            elif loc_type == 'extra_puzzle_round':
                return self._create_puzzle_level_completable_rule(num1, True, world)

        # Fall back to standard analysis
        return None

    def handle_complex_entrance_rule(self, entrance_name: str, rule: Any) -> Optional[Dict[str, Any]]:
        """Override entrance rule analysis for Mt Wickedness entrance."""
        if entrance_name == "Enter Mt Wickedness":
            return {'type': 'item_check', 'item': "Mt. Wickedness Gate"}
        return None

    def expand_helper(self, helper_name: str, args: Optional[List[Any]] = None) -> Optional[Dict[str, Any]]:
        """Expand Tetris Attack helper functions."""
        if helper_name == 'versus_stage_completable':
            if args and len(args) >= 3:
                stage_arg = args[2]
                if isinstance(stage_arg, dict) and stage_arg.get('type') == 'constant':
                    stage_number = stage_arg.get('value', 1)
                elif isinstance(stage_arg, int):
                    stage_number = stage_arg
                else:
                    stage_number = 1
                return self._create_versus_stage_rule(stage_number)

        if helper_name == 'cave_of_wickedness_accessible':
            return {'type': 'item_check', 'item': "Mt. Wickedness Gate"}

        return super().expand_helper(helper_name, args)
