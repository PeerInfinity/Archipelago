from dataclasses import dataclass
from Options import Choice, Range, TextChoice, Toggle, PerGameCommonOptions, OptionGroup
from typing import Dict

class RandomizeItems(Toggle):
    """
    Enable item randomization. When disabled, all items will remain in their original locations
    (proof statements will be at their corresponding theorem locations).
    """
    display_name = "Randomize Items"
    default = True

class TheoremSelection(TextChoice):
    """
    The theorem to prove. Can be a theorem name from the metamath database
    or a URL to a proof on metamath website (e.g., https://us.metamath.org/mpeuni/2p2e4.html)
    Common theorems: 2p2e4, 1p1e2, 3p3e6, ax-mp, pm2.21
    """
    display_name = "Theorem to Prove"
    default = "2p2e4"

class ProofComplexity(Choice):
    """
    Controls how complex the proof randomization can be.
    Simple: Only basic statement reordering
    Moderate: Some statements may require proving out of order
    Complex: Full randomization with multi-world dependencies
    """
    display_name = "Proof Complexity"
    option_simple = 0
    option_moderate = 1
    option_complex = 2
    default = 1

class StartingStatements(Range):
    """
    Percentage of proof statements that are pre-unlocked at the start.
    Higher values make the proof easier to complete.
    """
    display_name = "Starting Statements %"
    range_start = 0
    range_end = 50
    default = 10

class HintFrequency(Range):
    """
    Frequency of hint items in the item pool (percentage).
    """
    display_name = "Hint Frequency %"
    range_start = 0
    range_end = 30
    default = 10

class AutoDownloadDatabase(Toggle):
    """
    Automatically download the metamath database (set.mm) if it's not found locally.
    The file is about 50MB and will be cached for future use.
    """
    display_name = "Auto-Download Database"
    default = 1

@dataclass
class MetamathOptions(PerGameCommonOptions):
    randomize_items: RandomizeItems
    theorem: TheoremSelection
    complexity: ProofComplexity
    starting_statements: StartingStatements
    hint_frequency: HintFrequency
    auto_download_database: AutoDownloadDatabase

metamath_option_groups = [
    OptionGroup("Proof Settings", [
        RandomizeItems,
        TheoremSelection,
        ProofComplexity,
        StartingStatements,
        HintFrequency,
        AutoDownloadDatabase
    ])
]