#!/usr/bin/env python3
"""
Utility functions for working with Archipelago seeds.

This module provides functions to compute seed IDs directly from seed numbers
without needing to run Generate.py.
"""

import random
from typing import Optional


def get_seed_id(seed: Optional[int] = None) -> str:
    """
    Compute the seed ID (AP_xxxx) for a given seed number.
    
    This replicates the logic from Archipelago's Generate.py:
    1. Seeds the random number generator with the given seed
    2. Generates a 20-digit number using that seeded random
    3. Returns it with the AP_ prefix
    
    Args:
        seed: The seed number (e.g., 1, 2, 3). If None, generates a random seed.
    
    Returns:
        The seed ID string (e.g., "AP_14089154938208861744")
    """
    seeddigits = 20  # From BaseClasses.py
    
    if seed is None:
        random.seed(None)
        seed = random.randint(0, pow(10, seeddigits) - 1)
    
    # Seed the random number generator with the given seed
    random.seed(seed)
    
    # Generate the seed name (20-digit number)
    seed_name = f"{random.randint(0, pow(10, seeddigits) - 1)}".zfill(seeddigits)
    
    return f"AP_{seed_name}"


def main():
    """Test function to demonstrate seed ID generation."""
    print("Seed ID computation (matching Archipelago's internal logic):")
    print("-" * 60)
    
    # Test known seeds
    test_seeds = [1, 2, 3, 4, 5, 10, 100, 1000]
    
    for seed in test_seeds:
        seed_id = get_seed_id(seed)
        print(f"Seed {seed:4} -> {seed_id}")
    
    print("-" * 60)
    print("\nVerification against known values:")
    print(f"Seed 1 should be AP_14089154938208861744: {get_seed_id(1)}")
    print(f"Seed 2 should be AP_01043188731678011336: {get_seed_id(2)}")
    print(f"Seed 3 should be AP_84719271504320872445: {get_seed_id(3)}")


if __name__ == "__main__":
    main()