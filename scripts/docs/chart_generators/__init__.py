"""
Chart generators package for generating test result markdown documents.

This package provides functions for extracting chart data from test results
and generating markdown tables for various test types.
"""

from .data_loaders import load_full_world_mapping, load_test_results
from .utils import format_file_size, get_rules_json_size
from .spoiler import extract_spoiler_chart_data, generate_spoiler_markdown
from .multiclient import extract_multiclient_chart_data, generate_multiclient_markdown
from .multiworld import extract_multiworld_chart_data, generate_multiworld_markdown
from .processing_times import extract_processing_times_data, generate_processing_times_markdown
from .summary import generate_summary_chart

__all__ = [
    # Data loaders
    'load_full_world_mapping',
    'load_test_results',
    # Utilities
    'format_file_size',
    'get_rules_json_size',
    # Spoiler tests
    'extract_spoiler_chart_data',
    'generate_spoiler_markdown',
    # Multiclient tests
    'extract_multiclient_chart_data',
    'generate_multiclient_markdown',
    # Multiworld tests
    'extract_multiworld_chart_data',
    'generate_multiworld_markdown',
    # Processing times
    'extract_processing_times_data',
    'generate_processing_times_markdown',
    # Summary
    'generate_summary_chart',
]
