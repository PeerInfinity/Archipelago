"""
Binary operation preprocessing and optimization.

This module handles preprocessing of binary operations, list operations,
and function calls that can be computed at analysis time for optimization.
"""

import logging
from typing import Dict, Any, Optional, List


class BinaryOpProcessor:
    """
    Handles preprocessing of binary operations for optimization.

    This class attempts to compute binary operations, list multiplications,
    and other operations at analysis time when possible, avoiding runtime computation.
    """

    def __init__(self, expression_resolver, game_handler=None):
        """
        Initialize the binary operation processor.

        Args:
            expression_resolver: An ExpressionResolver instance for resolving values
            game_handler: Optional game handler for collection data/lengths
        """
        self.resolver = expression_resolver
        self.game_handler = game_handler

    def try_preprocess_binary_op(self, left_result: Dict, op_symbol: str,
                                 right_result: Dict) -> Optional[Dict]:
        """
        Try to pre-process binary operations that can be computed during export.
        Returns the processed result or None if it can't be pre-processed.

        Args:
            left_result: The left operand result dict
            op_symbol: The operation symbol ('+', '*', etc.)
            right_result: The right operand result dict

        Returns:
            Processed result dict, or None if pre-processing failed
        """
        try:
            # Handle list multiplication: [player] * constant_value
            if (op_symbol == '*' and
                    left_result and left_result.get('type') == 'list' and
                    right_result and right_result.get('type') == 'constant'):

                # Extract the list being multiplied
                left_list = left_result.get('value', [])

                # Extract the constant value
                multiplier = right_result.get('value')
                if isinstance(multiplier, int) and multiplier > 0:
                    # Compute [player] * length = [player, player, player, ...]
                    result_list = left_list * multiplier
                    logging.debug(f"Pre-processed list multiplication: {left_list} * {multiplier} = {result_list}")
                    return {'type': 'list', 'value': result_list}

            # Handle list addition: list1 + list2
            # Supports both 'name' types (resolved via game handler) and 'constant' types (directly resolved lists)
            elif op_symbol == '+':
                left_data = None
                right_data = None

                # Try to get left list data
                if left_result and left_result.get('type') == 'name':
                    left_data = self.try_resolve_list_data(left_result)
                elif left_result and left_result.get('type') == 'constant' and isinstance(left_result.get('value'), list):
                    left_data = left_result.get('value')

                # Try to get right list data
                if right_result and right_result.get('type') == 'name':
                    right_data = self.try_resolve_list_data(right_result)
                elif right_result and right_result.get('type') == 'constant' and isinstance(right_result.get('value'), list):
                    right_data = right_result.get('value')

                if left_data is not None and right_data is not None:
                    combined_list = left_data + right_data
                    logging.debug(f"Pre-processed list addition: {left_data} + {right_data} = {combined_list}")
                    return {'type': 'constant', 'value': combined_list}

            # Handle list multiplication: [player] * len(some_list) (legacy case)
            elif (op_symbol == '*' and
                  left_result and left_result.get('type') == 'list' and
                  right_result and right_result.get('type') == 'helper' and
                  right_result.get('name') == 'len'):

                # Extract the list being multiplied
                left_list = left_result.get('value', [])

                # Extract the argument to len() function
                len_args = right_result.get('args', [])
                if len(len_args) == 1:
                    len_arg = len_args[0]

                    # Check if we can resolve the length
                    resolved_length = self.try_resolve_list_length(len_arg)
                    if resolved_length is not None:
                        # Compute [player] * length = [player, player, player, ...]
                        result_list = left_list * resolved_length
                        logging.debug(f"Pre-processed list multiplication: {left_list} * {resolved_length} = {result_list}")
                        return {'type': 'list', 'value': result_list}

            return None  # Can't pre-process
        except Exception as e:
            logging.warning(f"Error during binary operation pre-processing: {e}")
            return None

    def try_resolve_list_length(self, list_ref: Dict) -> Optional[int]:
        """
        Try to resolve the length of a list reference during export.
        Returns the length or None if it can't be resolved.

        Args:
            list_ref: The list reference dict

        Returns:
            The list length, or None if it can't be resolved
        """
        try:
            # Handle constant lists directly
            if list_ref and list_ref.get('type') == 'constant':
                constant_value = list_ref.get('value')
                if isinstance(constant_value, list):
                    length = len(constant_value)
                    logging.debug(f"Resolved length of constant list to {length}")
                    return length

            # Handle direct name references to known collections
            if list_ref and list_ref.get('type') == 'name':
                name = list_ref.get('name')

                # Check if we have game handler with known collections
                if self.game_handler and hasattr(self.game_handler, 'get_collection_length'):
                    length = self.game_handler.get_collection_length(name)
                    if length is not None:
                        logging.debug(f"Resolved length of '{name}' to {length}")
                        return length

                # Fallback to hardcoded known lengths for common ALTTP collections
                known_lengths = {
                    'randomizer_room_chests': 4,
                    'compass_room_chests': 5,
                    'back_chests': 5
                }

                if name in known_lengths:
                    logging.debug(f"Resolved length of '{name}' to {known_lengths[name]} (hardcoded)")
                    return known_lengths[name]

            return None  # Can't resolve
        except Exception as e:
            logging.warning(f"Error resolving list length: {e}")
            return None

    def try_preprocess_zip(self, args: List[Dict]) -> Optional[Dict]:
        """
        Try to pre-process zip() function calls during export.
        zip(list1, list2) -> combined list of tuples as constants

        Args:
            args: List of argument dicts for the zip call

        Returns:
            Processed result dict, or None if pre-processing failed
        """
        try:
            if len(args) != 2:
                return None  # Only handle 2-argument zip for now

            list1_ref = args[0]
            list2_ref = args[1]

            # Try to resolve both lists
            list1_data = self.try_resolve_list_data(list1_ref)
            list2_data = self.try_resolve_list_data(list2_ref)

            # Handle the case where list2 is a binary_op that needs resolving
            if list1_data is not None and list2_data is None and list2_ref.get('type') == 'binary_op':
                # Try to resolve the binary operation first
                binary_op_result = self.try_resolve_binary_op_data(list2_ref)
                if binary_op_result is not None:
                    list2_data = binary_op_result

            if list1_data is not None and list2_data is not None:
                # Compute zip result
                zipped_result = []
                for item1, item2 in zip(list1_data, list2_data):
                    zipped_result.append([item1, item2])

                logging.debug(f"Pre-processed zip({list1_data}, {list2_data}) to {zipped_result}")
                return {'type': 'constant', 'value': zipped_result}

            return None  # Can't pre-process
        except Exception as e:
            logging.warning(f"Error during zip pre-processing: {e}")
            return None

    def try_preprocess_len(self, list_ref: Dict) -> Optional[Dict]:
        """
        Try to pre-process len() function calls during export.

        Args:
            list_ref: The list reference dict

        Returns:
            Processed result dict with the length, or None if pre-processing failed
        """
        try:
            # First try to resolve length via named references
            resolved_length = self.try_resolve_list_length(list_ref)
            if resolved_length is not None:
                logging.debug(f"Pre-processed len() to {resolved_length}")
                return {'type': 'constant', 'value': resolved_length}

            # Also handle constant lists directly
            if list_ref and list_ref.get('type') == 'constant':
                constant_list = list_ref.get('value')
                if isinstance(constant_list, list):
                    length = len(constant_list)
                    logging.debug(f"Pre-processed len() of constant list to {length}")
                    return {'type': 'constant', 'value': length}

            # Handle binary_op type (list concatenation like list1 + list2)
            if list_ref and list_ref.get('type') == 'binary_op' and list_ref.get('op') == '+':
                # Try to resolve the combined list
                left_data = None
                right_data = None

                left_ref = list_ref.get('left')
                right_ref = list_ref.get('right')

                # Try to resolve left operand
                if left_ref and left_ref.get('type') == 'name':
                    left_data = self.try_resolve_list_data(left_ref)
                elif left_ref and left_ref.get('type') == 'constant' and isinstance(left_ref.get('value'), list):
                    left_data = left_ref.get('value')

                # Try to resolve right operand
                if right_ref and right_ref.get('type') == 'name':
                    right_data = self.try_resolve_list_data(right_ref)
                elif right_ref and right_ref.get('type') == 'constant' and isinstance(right_ref.get('value'), list):
                    right_data = right_ref.get('value')

                if left_data is not None and right_data is not None:
                    combined_length = len(left_data) + len(right_data)
                    logging.debug(f"Pre-processed len() of list concatenation to {combined_length}")
                    return {'type': 'constant', 'value': combined_length}

            return None  # Can't pre-process
        except Exception as e:
            logging.warning(f"Error during len pre-processing: {e}")
            return None

    def try_resolve_list_data(self, list_ref: Dict) -> Optional[List]:
        """
        Try to resolve the actual data of a list reference during export.
        Returns the list data or None if it can't be resolved.

        Args:
            list_ref: The list reference dict

        Returns:
            The list data, or None if it can't be resolved
        """
        try:
            # Handle direct name references to known collections
            if list_ref and list_ref.get('type') == 'name':
                name = list_ref.get('name')

                # Check if we have game handler with known collections
                if self.game_handler and hasattr(self.game_handler, 'get_collection_data'):
                    data = self.game_handler.get_collection_data(name)
                    if data is not None:
                        logging.debug(f"Resolved data of '{name}' to {data}")
                        return data

            # Handle constant lists and lists with name references
            elif list_ref and list_ref.get('type') == 'list':
                # Extract the actual values from the list structure
                list_values = []
                for item in list_ref.get('value', []):
                    if item.get('type') == 'constant':
                        list_values.append(item.get('value'))
                    elif item.get('type') == 'name':
                        # Try to resolve name references within the list
                        name = item.get('name')
                        if name == 'player':
                            # Use the actual player number from context if available
                            player_num = self.resolver._get_current_player_number()
                            list_values.append(player_num)
                        else:
                            # Can't resolve, return None
                            return None
                    else:
                        # Can't resolve complex items
                        return None
                return list_values

            # Handle constant values directly (for pre-processed constant lists)
            elif list_ref and list_ref.get('type') == 'constant':
                constant_value = list_ref.get('value')
                if isinstance(constant_value, list):
                    return constant_value

            return None  # Can't resolve
        except Exception as e:
            logging.warning(f"Error resolving list data: {e}")
            return None

    def try_resolve_binary_op_data(self, binary_op_ref: Dict) -> Optional[List]:
        """
        Try to resolve a binary operation to its computed result data.
        Returns the computed list or None if it can't be resolved.

        Args:
            binary_op_ref: The binary operation reference dict

        Returns:
            The computed result, or None if it can't be resolved
        """
        try:
            if binary_op_ref.get('type') != 'binary_op':
                return None

            op = binary_op_ref.get('op')
            left = binary_op_ref.get('left')
            right = binary_op_ref.get('right')

            # Handle list multiplication: [player] * constant_value
            if (op == '*' and
                    left and left.get('type') == 'list' and
                    right and right.get('type') == 'constant'):

                left_data = self.try_resolve_list_data(left)
                multiplier = right.get('value')

                if left_data is not None and isinstance(multiplier, int) and multiplier > 0:
                    result = left_data * multiplier
                    logging.debug(f"Resolved binary_op: {left_data} * {multiplier} = {result}")
                    return result

            # Handle list multiplication: [player] * len(constant_list)
            elif (op == '*' and
                  left and left.get('type') == 'list' and
                  right and right.get('type') == 'helper' and
                  right.get('name') == 'len'):

                left_data = self.try_resolve_list_data(left)
                len_args = right.get('args', [])

                if left_data is not None and len(len_args) == 1:
                    len_arg = len_args[0]

                    # Handle constant lists in len() argument
                    if len_arg.get('type') == 'constant':
                        constant_list = len_arg.get('value')
                        if isinstance(constant_list, list):
                            multiplier = len(constant_list)
                            result = left_data * multiplier
                            logging.debug(f"Resolved binary_op: {left_data} * len({len(constant_list)}) = {result}")
                            return result

            # Handle list addition: list1 + list2
            elif (op == '+' and
                  left and left.get('type') == 'name' and
                  right and right.get('type') == 'name'):

                left_data = self.try_resolve_list_data(left)
                right_data = self.try_resolve_list_data(right)

                if left_data is not None and right_data is not None:
                    result = left_data + right_data
                    logging.debug(f"Resolved binary_op: {left_data} + {right_data} = {result}")
                    return result

            return None
        except Exception as e:
            logging.warning(f"Error resolving binary operation data: {e}")
            return None
