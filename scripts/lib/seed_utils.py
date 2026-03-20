#!/usr/bin/env python3
"""
Utility functions for working with Archipelago seeds.

This module provides functions to compute seed IDs directly from seed numbers
without needing to run Generate.py.
"""

import random
from typing import Optional


# Precomputed reverse mapping for common seeds (1-100)
# Maps seed ID -> seed number for quick reverse lookups
SEED_ID_TO_NUMBER = {
    "AP_14089154938208861744": 1,
    "AP_01043188731678011336": 2,
    "AP_84719271504320872445": 3,
    "AP_05594871498841892311": 4,
    "AP_96945849220684217413": 5,
    "AP_00679259829289197625": 6,
    "AP_35931773795037525048": 7,
    "AP_20777137877808592492": 8,
    "AP_48205312626925217390": 9,
    "AP_55941320597534372051": 10,
    "AP_89757102641179993453": 11,
    "AP_97195801408842856158": 12,
    "AP_97597253031866294651": 13,
    "AP_85815028503973011889": 14,
    "AP_03855006904931195900": 15,
    "AP_63995860912159113643": 16,
    "AP_54611489483343604102": 17,
    "AP_94499266122763165639": 18,
    "AP_09600906052635305867": 19,
    "AP_39682733307390651924": 20,
    "AP_99944342256591970567": 21,
    "AP_35184644806190904767": 22,
    "AP_74101984014322865112": 23,
    "AP_21814969940699053273": 24,
    "AP_15558846181041901063": 25,
    "AP_35173002093838367478": 26,
    "AP_54547889238144698858": 27,
    "AP_32140757851607581388": 28,
    "AP_38297580643225274305": 29,
    "AP_51799879832263802842": 30,
    "AP_08662188719499160259": 31,
    "AP_35537607521190668771": 32,
    "AP_95319007568278391608": 33,
    "AP_80373793998305251124": 34,
    "AP_50678864083171197547": 35,
    "AP_16142130104969173985": 36,
    "AP_11211133176964962779": 37,
    "AP_63108654277841947722": 38,
    "AP_60130183190245068718": 39,
    "AP_19034207958950154781": 40,
    "AP_24575209652760515169": 41,
    "AP_02053695854357871005": 42,
    "AP_97511042024992573589": 43,
    "AP_83379661168092499624": 44,
    "AP_63045274676531667076": 45,
    "AP_56749254662246730086": 46,
    "AP_56493618142060386465": 47,
    "AP_24265836188415562305": 48,
    "AP_61691997546595962621": 49,
    "AP_52678281861948935777": 50,
    "AP_89254393219550490127": 51,
    "AP_04949574385455691461": 52,
    "AP_82207679211979622047": 53,
    "AP_36515032057174589818": 54,
    "AP_32228988295179457917": 55,
    "AP_89435585338682014409": 56,
    "AP_80570807191215642165": 57,
    "AP_22083647774579785850": 58,
    "AP_72786122495301905959": 59,
    "AP_79015168349821496447": 60,
    "AP_77138845379797105287": 61,
    "AP_29058487837992737532": 62,
    "AP_45088070671021679844": 63,
    "AP_94536814605032063512": 64,
    "AP_42221728163192154531": 65,
    "AP_61095366416706603173": 66,
    "AP_73272195380648081610": 67,
    "AP_09237779852147034097": 68,
    "AP_00688148579456019026": 69,
    "AP_39078201404776948485": 70,
    "AP_83166434849143750617": 71,
    "AP_88216189822537832159": 72,
    "AP_76041361860426071207": 73,
    "AP_85051013956300646858": 74,
    "AP_66127857642912781861": 75,
    "AP_56313591512416288517": 76,
    "AP_41555505422141674301": 77,
    "AP_03461691193933538260": 78,
    "AP_44963998659509534765": 79,
    "AP_81053897361236979995": 80,
    "AP_70828534877143781258": 81,
    "AP_69533072447337424883": 82,
    "AP_20082863724807672101": 83,
    "AP_56028848136365545840": 84,
    "AP_86723797500716138203": 85,
    "AP_14348273317312557454": 86,
    "AP_32058874510704462648": 87,
    "AP_36408758234589025460": 88,
    "AP_87950898316991159193": 89,
    "AP_13163541349651431189": 90,
    "AP_29341579621450226128": 91,
    "AP_83309001409869485178": 92,
    "AP_71004341707224339869": 93,
    "AP_03367587046284275663": 94,
    "AP_83598047105414459734": 95,
    "AP_13997096091808600838": 96,
    "AP_10594847131540570025": 97,
    "AP_61840470958143918126": 98,
    "AP_25470390492155550569": 99,
    "AP_63817042129706456211": 100,
}



def get_seed_number(seed_id: str) -> Optional[int]:
    """
    Return the seed number for a known seed ID.

    This uses a precomputed reverse mapping for seeds 1-100.
    Returns None if the seed ID is not in the known mapping.

    Args:
        seed_id: The seed ID string (e.g., "AP_14089154938208861744")

    Returns:
        The seed number (e.g., 1) or None if unknown
    """
    return SEED_ID_TO_NUMBER.get(seed_id)


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
    """Test function to demonstrate seed ID generation and reverse lookup."""
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

    print("-" * 60)
    print("\nReverse lookup (seed ID -> seed number):")
    test_ids = [
        "AP_14089154938208861744",  # Seed 1
        "AP_55941320597534372051",  # Seed 10
        "AP_99999999999999999999",  # Unknown
    ]
    for seed_id in test_ids:
        seed_num = get_seed_number(seed_id)
        if seed_num is not None:
            print(f"{seed_id} -> Seed {seed_num}")
        else:
            print(f"{seed_id} -> Unknown")


if __name__ == "__main__":
    main()