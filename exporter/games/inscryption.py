"""Inscryption game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class InscryptionGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Inscryption'
    """Inscryption game handler with special handling for helper functions."""

    def __init__(self, world=None):
        """Initialize with world object to access game-specific data."""
        super().__init__()
        self.world = world

    def _expand_common_helper(self, helper_name, args):
        """Override to expand Inscryption helpers to their actual item checks."""
        # Get the required epitaph pieces count from world if available
        required_epitaph_count = 9
        if self.world:
            required_epitaph_count = getattr(self.world, 'required_epitaph_pieces_count', 9)

        # Expand specific Inscryption helpers to their actual item requirements
        if helper_name == 'has_camera_and_meat':
            logger.debug("Expanding has_camera_and_meat to actual items")
            return {
                'type': 'and',
                'conditions': [
                    {'type': 'item_check', 'item': 'Camera Replica'},
                    {'type': 'item_check', 'item': 'Pile Of Meat'}
                ]
            }
        elif helper_name == 'has_all_epitaph_pieces':
            logger.debug("Expanding has_all_epitaph_pieces to actual count check")
            return {
                'type': 'item_check',
                'item': 'Epitaph Piece',
                'count': {'type': 'constant', 'value': required_epitaph_count}
            }
        elif helper_name == 'has_act2_bridge_requirements':
            logger.debug("Expanding has_act2_bridge_requirements")
            return {
                'type': 'or',
                'conditions': [
                    {
                        'type': 'and',
                        'conditions': [
                            {'type': 'item_check', 'item': 'Camera Replica'},
                            {'type': 'item_check', 'item': 'Pile Of Meat'}
                        ]
                    },
                    {
                        'type': 'item_check',
                        'item': 'Epitaph Piece',
                        'count': {'type': 'constant', 'value': required_epitaph_count}
                    }
                ]
            }
        elif helper_name == 'has_tower_requirements':
            logger.debug("Expanding has_tower_requirements")
            return {
                'type': 'and',
                'conditions': [
                    {'type': 'item_check', 'item': 'Monocle'},
                    {
                        'type': 'or',
                        'conditions': [
                            {
                                'type': 'and',
                                'conditions': [
                                    {'type': 'item_check', 'item': 'Camera Replica'},
                                    {'type': 'item_check', 'item': 'Pile Of Meat'}
                                ]
                            },
                            {
                                'type': 'item_check',
                                'item': 'Epitaph Piece',
                                'count': {'type': 'constant', 'value': required_epitaph_count}
                            }
                        ]
                    }
                ]
            }
        elif helper_name == 'has_monocle':
            return {'type': 'item_check', 'item': 'Monocle'}
        elif helper_name == 'has_inspectometer_battery':
            return {'type': 'item_check', 'item': 'Inspectometer Battery'}
        elif helper_name == 'has_gems_and_battery':
            return {
                'type': 'and',
                'conditions': [
                    {'type': 'item_check', 'item': 'Gems Module'},
                    {'type': 'item_check', 'item': 'Inspectometer Battery'}
                ]
            }
        elif helper_name == 'has_act2_requirements':
            return {'type': 'item_check', 'item': 'Film Roll'}
        elif helper_name == 'has_act3_requirements':
            return {
                'type': 'and',
                'conditions': [
                    {'type': 'item_check', 'item': 'Film Roll'},
                    {
                        'type': 'item_check',
                        'item': 'Epitaph Piece',
                        'count': {'type': 'constant', 'value': required_epitaph_count}
                    },
                    {'type': 'item_check', 'item': 'Camera Replica'},
                    {'type': 'item_check', 'item': 'Pile Of Meat'},
                    {'type': 'item_check', 'item': 'Monocle'}
                ]
            }
        elif helper_name == 'has_transcendence_requirements':
            return {
                'type': 'and',
                'conditions': [
                    {'type': 'item_check', 'item': 'Quill'},
                    {'type': 'item_check', 'item': 'Gems Module'},
                    {'type': 'item_check', 'item': 'Inspectometer Battery'}
                ]
            }

        # For other helpers, use the default behavior
        return super()._expand_common_helper(helper_name, args)

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Override to handle Inscryption-specific rules."""
        if not rule:
            return rule

        # List of Inscryption helper functions
        inscryption_helpers = {
            'has_act2_requirements',
            'has_act2_bridge_requirements',
            'has_act3_requirements',
            'has_all_epitaph_pieces',
            'has_camera_and_meat',
            'has_gems_and_battery',
            'has_inspectometer_battery',
            'has_monocle',
            'has_tower_requirements',
            'has_transcendence_requirements'
        }

        # Handle item_check with attribute reference to self.world.required_epitaph_pieces_name
        if rule.get('type') == 'item_check':
            item = rule.get('item', {})
            # Check if item is self.world.required_epitaph_pieces_name
            if (isinstance(item, dict) and
                item.get('type') == 'attribute' and
                item.get('attr') == 'required_epitaph_pieces_name' and
                item.get('object', {}).get('type') == 'attribute' and
                item['object'].get('attr') == 'world'):

                # Replace with constant value "Epitaph Piece"
                logger.debug("Converting self.world.required_epitaph_pieces_name to 'Epitaph Piece'")
                rule = rule.copy()
                rule['item'] = {
                    'type': 'constant',
                    'value': 'Epitaph Piece'
                }
                return rule

            # Handle pseudo-items created by the generic exporter
            # These should be expanded to their actual implementations
            if isinstance(item, str):
                if item == "Camera_And_Meat" or item == "Camera And Meat":
                    logger.debug("Expanding Camera_And_Meat pseudo-item to actual items")
                    return {
                        'type': 'and',
                        'conditions': [
                            {'type': 'item_check', 'item': 'Camera Replica'},
                            {'type': 'item_check', 'item': 'Pile Of Meat'}
                        ]
                    }
                elif item == "All_Epitaph_Pieces" or item == "All Epitaph Pieces":
                    logger.debug("Expanding All_Epitaph_Pieces pseudo-item to actual count check")
                    # Get the required count from world if available, otherwise default to 9
                    required_count = 9
                    if self.world:
                        required_count = getattr(self.world, 'required_epitaph_pieces_count', 9)
                    return {
                        'type': 'item_check',
                        'item': 'Epitaph Piece',
                        'count': {'type': 'constant', 'value': required_count}
                    }
                elif item == "Tower_Requirements" or item == "Tower Requirements":
                    logger.debug("Expanding Tower_Requirements pseudo-item")
                    return {
                        'type': 'and',
                        'conditions': [
                            {'type': 'item_check', 'item': 'Monocle'},
                            {
                                'type': 'or',
                                'conditions': [
                                    {
                                        'type': 'and',
                                        'conditions': [
                                            {'type': 'item_check', 'item': 'Camera Replica'},
                                            {'type': 'item_check', 'item': 'Pile Of Meat'}
                                        ]
                                    },
                                    {
                                        'type': 'item_check',
                                        'item': 'Epitaph Piece',
                                        'count': {'type': 'constant', 'value': 9}
                                    }
                                ]
                            }
                        ]
                    }
                elif item == "Act2_Bridge_Requirements" or item == "Act2 Bridge Requirements":
                    logger.debug("Expanding Act2_Bridge_Requirements pseudo-item")
                    return {
                        'type': 'or',
                        'conditions': [
                            {
                                'type': 'and',
                                'conditions': [
                                    {'type': 'item_check', 'item': 'Camera Replica'},
                                    {'type': 'item_check', 'item': 'Pile Of Meat'}
                                ]
                            },
                            {
                                'type': 'item_check',
                                'item': 'Epitaph Piece',
                                'count': {'type': 'constant', 'value': 9}
                            }
                        ]
                    }

        # Handle function_call with self.method pattern
        if (rule.get('type') == 'function_call' and
            rule.get('function') and
            rule['function'].get('type') == 'attribute'):

            func = rule['function']
            # Check if it's self.method_name
            if (func.get('object', {}).get('type') == 'name' and
                func['object'].get('name') == 'self' and
                func.get('attr') in inscryption_helpers):

                method_name = func['attr']
                args = rule.get('args', [])

                logger.debug(f"Converting Inscryption self.{method_name} to helper node")
                return {
                    'type': 'helper',
                    'name': method_name,
                    'args': args
                }

        # Recursively expand conditions in and/or rules
        if rule.get('type') in ['and', 'or']:
            rule = rule.copy()
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]
            return rule

        # Otherwise use parent class handling
        return super().expand_rule(rule)