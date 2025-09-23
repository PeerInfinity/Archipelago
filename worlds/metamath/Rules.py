from typing import List, Dict, Set, Optional, Tuple
from BaseClasses import MultiWorld, CollectionState
from worlds.generic.Rules import set_rule
import metamathpy.database as md
from metamathpy.proof import verify_proof
import os
import urllib.request

class ProofStatement:
    """Represents a single statement in a metamath proof."""

    def __init__(self, index: int, label: Optional[str], expression: str, dependencies: List[int]):
        self.index = index  # Statement number (1-based)
        self.label = label  # Optional theorem/axiom name
        self.expression = expression  # The mathematical expression
        self.dependencies = dependencies  # List of statement indices this depends on

class ProofStructure:
    """
    Manages the dependency structure of a metamath proof.
    Similar to jigsaw's PuzzleBoard but for logical dependencies.
    """

    def __init__(self):
        self.statements: Dict[int, ProofStatement] = {}
        self.dependency_graph: Dict[int, Set[int]] = {}
        self.reverse_dependencies: Dict[int, Set[int]] = {}
        self.label_to_index: Dict[str, int] = {}  # Map labels to indices

    def add_statement(self, statement: ProofStatement):
        """Add a statement to the proof structure."""
        self.statements[statement.index] = statement
        self.dependency_graph[statement.index] = set(statement.dependencies)

        if statement.label:
            self.label_to_index[statement.label] = statement.index

        # Build reverse dependency graph
        for dep in statement.dependencies:
            if dep not in self.reverse_dependencies:
                self.reverse_dependencies[dep] = set()
            self.reverse_dependencies[dep].add(statement.index)

    def can_prove_statement(self, statement_index: int, available_statements: Set[int]) -> bool:
        """Check if a statement can be proven given available statements."""
        if statement_index not in self.dependency_graph:
            return False
        required = self.dependency_graph[statement_index]
        return required.issubset(available_statements)

    def get_provable_statements(self, available_statements: Set[int]) -> Set[int]:
        """Get all statements that can be proven with available statements."""
        provable = set()
        for stmt_index in self.statements:
            if stmt_index not in available_statements:
                if self.can_prove_statement(stmt_index, available_statements):
                    provable.add(stmt_index)
        return provable

def set_metamath_rules(world, proof_structure: ProofStructure):
    """Set access rules for metamath locations based on proof dependencies."""

    for location in world.multiworld.get_locations(world.player):
        if location.name.startswith("Prove Statement "):
            # Extract statement number from location name
            stmt_num = int(location.name.split()[-1])

            if stmt_num in proof_structure.dependency_graph:
                dependencies = proof_structure.dependency_graph[stmt_num]

                # Create rule: player must have all dependent statements as items
                def make_rule(deps):
                    def rule(state: CollectionState) -> bool:
                        return all(
                            state.has(f"Statement {dep}", world.player)
                            for dep in deps
                        )
                    return rule

                if dependencies:  # Only set rule if there are dependencies
                    set_rule(location, make_rule(dependencies))

def download_metamath_database(target_path: str) -> bool:
    """Download the metamath database if it doesn't exist."""
    try:
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        print(f"Downloading metamath database to {target_path}...")
        urllib.request.urlretrieve('https://us.metamath.org/metamath/set.mm', target_path)
        print(f"Successfully downloaded metamath database")
        return True
    except Exception as e:
        print(f"Failed to download metamath database: {e}")
        return False

def get_metamath_database(auto_download: bool = True):
    """
    Load the metamath database file.

    Args:
        auto_download: If True, download the database if not found locally
    """
    # Try multiple possible locations for set.mm
    possible_paths = [
        'metamath_data/set.mm',
        os.path.join(os.path.dirname(__file__), 'metamath_data/set.mm'),
        os.path.join(os.path.dirname(__file__), '../../metamath_data/set.mm'),
        '/home/robert/tests/test2/archipelago-json/metamath_data/set.mm'
    ]

    for path in possible_paths:
        if os.path.exists(path):
            return md.parse(path)

    # If not found and auto_download is enabled, download it
    if auto_download:
        download_path = os.path.join(os.path.dirname(__file__), '../../metamath_data/set.mm')
        if download_metamath_database(download_path):
            return md.parse(download_path)

    raise FileNotFoundError(
        "Could not find set.mm database. Please download from https://us.metamath.org/metamath/set.mm "
        "or enable auto_download_database in options."
    )

def extract_proof_dependencies(db, theorem_name: str) -> Tuple[List[str], Dict[str, Set[str]]]:
    """
    Extract proof steps and dependencies using metamath-py's proof verification.

    Args:
        db: Metamath database
        theorem_name: Name of the theorem to analyze

    Returns:
        Tuple of (ordered list of proof steps, dependency dictionary)
    """
    if theorem_name not in db.rules:
        print(f"Warning: Theorem {theorem_name} not found in database")
        return [], {}

    rule = db.rules[theorem_name]

    try:
        # Verify the proof and get the proof tree
        root_step, proof_steps_dict = verify_proof(db, rule)

        # Extract all unique steps from the proof tree
        all_steps = root_step.all_steps()

        # Build dependency graph
        dependencies = {}
        ordered_steps = []
        seen = set()

        for step in all_steps:
            if step.rule and hasattr(step.rule, 'consequent'):
                label = step.rule.consequent.label

                # Skip constants, hypotheses, and duplicate entries
                if (not label.startswith('c') and
                    not label.startswith('w') and
                    label not in seen):

                    seen.add(label)
                    ordered_steps.append(label)

                    # Extract dependencies for this step
                    deps = set()
                    for dep_label, dep_step in step.dependencies.items():
                        if hasattr(dep_step.rule, 'consequent'):
                            dep_name = dep_step.rule.consequent.label
                            # Only include non-constant, non-hypothesis dependencies
                            if not dep_name.startswith('c') and not dep_name.startswith('w'):
                                deps.add(dep_name)

                    dependencies[label] = deps

        return ordered_steps, dependencies

    except Exception as e:
        print(f"Error verifying proof for {theorem_name}: {e}")
        return [], {}

def parse_proof_from_database(db, theorem_name: str) -> ProofStructure:
    """
    Parse a proof from the metamath database into a ProofStructure.
    Uses metamath-py's proof verification for accurate dependency extraction.
    """
    structure = ProofStructure()

    # Extract dependencies using proof verification
    ordered_steps, dependencies = extract_proof_dependencies(db, theorem_name)

    if not ordered_steps:
        # Fallback: create a single-step proof if extraction failed
        if theorem_name in db.statements:
            stmt = db.statements[theorem_name]
            structure.add_statement(ProofStatement(
                index=1,
                label=theorem_name,
                expression=' '.join(stmt.tokens),
                dependencies=[]
            ))
        return structure

    # Convert to ProofStructure format
    label_to_index = {}

    for i, label in enumerate(ordered_steps, 1):
        # Get the expression for this label
        if label in db.statements:
            stmt = db.statements[label]
            expression = ' '.join(stmt.tokens)
        else:
            expression = label  # Fallback

        label_to_index[label] = i

    # Add statements with proper index-based dependencies
    for i, label in enumerate(ordered_steps, 1):
        # Get the expression
        if label in db.statements:
            stmt = db.statements[label]
            expression = ' '.join(stmt.tokens)
        else:
            expression = label

        # Convert label dependencies to index dependencies
        label_deps = dependencies.get(label, set())
        index_deps = [label_to_index[dep] for dep in label_deps if dep in label_to_index]

        structure.add_statement(ProofStatement(
            index=i,
            label=label,
            expression=expression,
            dependencies=index_deps
        ))

    return structure

def get_hardcoded_2p2e4_proof() -> ProofStructure:
    """
    Returns a hardcoded proof structure for 2 + 2 = 4.
    This serves as a fallback when the database is not available.
    """
    structure = ProofStructure()

    # The actual 2p2e4 proof structure based on metamath
    steps = [
        (1, 'df-2', '2 = (1 + 1)', []),
        (2, 'df-3', '3 = (2 + 1)', []),
        (3, 'df-4', '4 = (3 + 1)', []),
        (4, 'ax-1cn', '1 ∈ ℂ', []),
        (5, '2cn', '2 ∈ ℂ', []),
        (6, 'oveq2i', '(2 + 2) = (2 + (1 + 1))', [1]),  # Depends on df-2
        (7, 'oveq1i', '(3 + 1) = ((2 + 1) + 1)', [2]),  # Depends on df-3
        (8, 'addassi', '((2 + 1) + 1) = (2 + (1 + 1))', [4, 5]),  # Depends on ax-1cn and 2cn
        (9, '3eqtri', '4 = (2 + (1 + 1))', [3, 7, 8]),  # Depends on df-4, oveq1i, addassi
        (10, 'eqtr4i', '(2 + 2) = 4', [6, 9])  # Final step depends on oveq2i and 3eqtri
    ]

    for index, label, expression, dependencies in steps:
        structure.add_statement(ProofStatement(index, label, expression, dependencies))

    return structure

def parse_metamath_proof(theorem_name: str, auto_download: bool = True) -> ProofStructure:
    """
    Parse a metamath proof into a ProofStructure.

    Priority:
    1. Try to load from metamath-py database with full proof verification
    2. Fall back to hardcoded proofs for known theorems
    3. Fall back to hardcoded 2p2e4 if all else fails

    Args:
        theorem_name: The name of the theorem to parse (e.g., '2p2e4', 'pm2.21')
        auto_download: Whether to auto-download the database if not found

    Returns:
        ProofStructure containing the proof steps and dependencies
    """

    # First, try to load from the metamath database
    try:
        db = get_metamath_database(auto_download)

        # Check if the theorem exists
        if theorem_name not in db.statements and theorem_name not in db.rules:
            print(f"Theorem {theorem_name} not found in database, trying fallbacks")
        else:
            # Parse the proof with full dependency extraction
            structure = parse_proof_from_database(db, theorem_name)

            # If we got a valid structure with multiple steps, use it
            if len(structure.statements) > 1:
                print(f"Successfully parsed {theorem_name} from database: {len(structure.statements)} steps")
                return structure
            elif len(structure.statements) == 1:
                print(f"Warning: Only got 1 step for {theorem_name}, trying fallbacks")

    except FileNotFoundError as e:
        print(f"Metamath database not found: {e}")
    except Exception as e:
        print(f"Error parsing proof from database: {e}")

    # Second, fall back to hardcoded proofs for known theorems
    known_proofs = {
        '2p2e4': get_hardcoded_2p2e4_proof,
        # Add more hardcoded proofs here as needed
    }

    if theorem_name in known_proofs:
        print(f"Using hardcoded proof for {theorem_name}")
        return known_proofs[theorem_name]()

    # Finally, fall back to 2p2e4 if nothing else works
    print(f"Warning: Could not load proof for {theorem_name}, falling back to 2p2e4")
    return get_hardcoded_2p2e4_proof()