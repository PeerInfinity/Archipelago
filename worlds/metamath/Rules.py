from typing import List, Dict, Set, Optional, Tuple
from BaseClasses import MultiWorld, CollectionState
from worlds.generic.Rules import add_rule
import metamathpy.database as md
from metamathpy.proof import verify_proof
import os
import urllib.request
from collections import defaultdict, deque

class ProofStatement:
    """Represents a single statement in a metamath proof."""

    def __init__(self, index: int, label: Optional[str], expression: str, dependencies: List[int], full_text: Optional[str] = None, instantiated_expression: Optional[str] = None):
        self.index = index  # Statement number (1-based)
        self.label = label  # Optional theorem/axiom name
        self.expression = expression  # The mathematical expression
        self.dependencies = dependencies  # List of statement indices this depends on
        self.full_text = full_text  # Full text description of the statement (if available)
        self.instantiated_expression = instantiated_expression  # Concrete expression from proof verification

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

def set_metamath_rules(world, proof_structure: ProofStructure, entrance_rule_mode: int = 1):
    """Set access rules for metamath regions based on proof dependencies.

    entrance_rule_mode is a 2-bit field (bit 0 = relaxed items, bit 1 = relaxed events):
        0 (strict):         All events + all items required for every entrance.
        1 (relaxed_items):  All events required, but only source step's item.
        2 (relaxed_events): All items required, but only source step's event.
        3 (fully_relaxed):  Only source step's event and item required.
    """
    player = world.player
    relax_items = bool(entrance_rule_mode & 1)
    relax_events = bool(entrance_rule_mode & 2)

    # Use the world's reverse lookup to map region names back to statement indices
    region_name_to_index = getattr(world, '_region_name_to_index', {})

    # Set access rules on entrances based on dependencies
    for region in world.multiworld.get_regions(player):
        stmt_num = region_name_to_index.get(region.name)
        if stmt_num is None:
            continue

        if stmt_num in proof_structure.dependency_graph:
            dependencies = proof_structure.dependency_graph[stmt_num]

            if dependencies:
                if not relax_items and not relax_events:
                    # Strict: one shared rule with all events + all items
                    required_names = frozenset(
                        name
                        for d in dependencies
                        for name in (world.get_item_name(d), f"Proved Statement {d}")
                    )
                    access_rule = lambda state, p=player, items=required_names: state.has_all(items, p)
                    for entrance in region.entrances:
                        add_rule(entrance, access_rule)
                else:
                    # Per-entrance rules based on source node
                    for entrance in region.entrances:
                        source_index = region_name_to_index.get(entrance.parent_region.name)
                        is_valid_source = source_index is not None and source_index in dependencies

                        required_names = set()

                        # Events: source only if relaxed, all otherwise
                        if relax_events and is_valid_source:
                            required_names.add(f"Proved Statement {source_index}")
                        else:
                            for d in dependencies:
                                required_names.add(f"Proved Statement {d}")

                        # Items: source only if relaxed, all otherwise
                        if relax_items and is_valid_source:
                            required_names.add(world.get_item_name(source_index))
                        else:
                            for d in dependencies:
                                required_names.add(world.get_item_name(d))

                        required_names = frozenset(required_names)
                        access_rule = lambda state, p=player, items=required_names: state.has_all(items, p)
                        add_rule(entrance, access_rule)

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
        os.path.join(os.path.dirname(__file__), '../../metamath_data/set.mm')
    ]

    for path in possible_paths:
        if os.path.exists(path):
            return md.parse(path), path  # Return both database and path

    # If not found and auto_download is enabled, download it
    if auto_download:
        download_path = os.path.join(os.path.dirname(__file__), '../../metamath_data/set.mm')
        if download_metamath_database(download_path):
            return md.parse(download_path), download_path

    raise FileNotFoundError(
        "Could not find set.mm database. Please download from https://us.metamath.org/metamath/set.mm "
        "or enable auto_download_database in options."
    )

def extract_statement_descriptions(db_path: str) -> Dict[str, str]:
    """
    Extract comment descriptions from the raw metamath database file.

    Args:
        db_path: Path to the .mm file

    Returns:
        Dictionary mapping statement labels to their descriptions
    """
    descriptions = {}

    try:
        with open(db_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Pattern to find comments followed by statements
        # $( comment $) label $a |- expression $.
        import re
        pattern = r'\$\((.*?)\$\)\s*(\S+)\s+\$[aefp]'

        matches = re.finditer(pattern, content, re.DOTALL)
        for match in matches:
            comment = match.group(1).strip()
            label = match.group(2)

            # Clean up the comment - remove contributor info if present
            # Keep the main description part
            lines = comment.split('\n')
            description_lines = []
            for line in lines:
                line = line.strip()
                if line and not line.startswith('(Contributed') and not line.startswith('(Revised'):
                    description_lines.append(line)

            if description_lines:
                descriptions[label] = ' '.join(description_lines)

    except Exception as e:
        print(f"Warning: Could not extract descriptions from {db_path}: {e}")

    return descriptions

def topological_sort_proof(ordered_steps: List[str], dependencies: Dict[str, Set[str]]) -> List[str]:
    """
    Reorder proof steps using topological sort so dependencies come before dependents.
    This provides a more logical ordering where base definitions come first.

    Args:
        ordered_steps: Original list of proof step labels
        dependencies: Dictionary mapping each step to its dependencies

    Returns:
        Topologically sorted list of step labels
    """
    # Create adjacency list and in-degree count
    graph = defaultdict(list)
    in_degree = defaultdict(int)

    # Initialize all steps
    for step in ordered_steps:
        if step not in in_degree:
            in_degree[step] = 0

    # Build graph (dependency -> dependent)
    for step, deps in dependencies.items():
        for dep in deps:
            graph[dep].append(step)
            in_degree[step] += 1

    # Find all nodes with no incoming edges (no dependencies)
    queue = deque([step for step in ordered_steps if in_degree[step] == 0])
    result = []

    while queue:
        # Sort queue to ensure consistent ordering among steps at same level
        current = sorted(queue)[0]
        queue.remove(current)
        result.append(current)

        # Remove edges from this node
        for neighbor in sorted(graph[current]):  # Sort for consistency
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    # Return sorted order if successful, otherwise original order
    return result if len(result) == len(ordered_steps) else ordered_steps

def extract_proof_dependencies(db, theorem_name: str) -> Tuple[List[str], Dict[str, List[str]], Dict[str, str]]:
    """
    Extract proof steps and dependencies using metamath-py's proof verification.

    Args:
        db: Metamath database
        theorem_name: Name of the theorem to analyze

    Returns:
        Tuple of (ordered list of proof steps, dependency dictionary, conclusions dictionary)
        The conclusions dict maps label -> instantiated expression string from proof verification.
    """
    if theorem_name not in db.rules:
        print(f"Warning: Theorem {theorem_name} not found in database")
        return [], {}, {}

    rule = db.rules[theorem_name]

    try:
        # Verify the proof and get the proof tree
        root_step, proof_steps_dict = verify_proof(db, rule)

        # Extract all unique steps from the proof tree
        all_steps = root_step.all_steps()

        # Build dependency graph
        dependencies = {}
        conclusions = {}
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

                    # Extract dependencies for this step (preserving duplicates)
                    deps = []
                    for dep_label, dep_step in step.dependencies.items():
                        if hasattr(dep_step.rule, 'consequent'):
                            dep_name = dep_step.rule.consequent.label
                            # Only include non-constant, non-hypothesis dependencies
                            if not dep_name.startswith('c') and not dep_name.startswith('w'):
                                deps.append(dep_name)

                    dependencies[label] = deps

                    # Capture instantiated expression from proof verification
                    if hasattr(step, 'conclusion') and step.conclusion:
                        conclusions[label] = ' '.join(step.conclusion)

        return ordered_steps, dependencies, conclusions

    except Exception as e:
        print(f"Error verifying proof for {theorem_name}: {e}")
        return [], {}, {}

def parse_proof_from_database(db, theorem_name: str, descriptions: Dict[str, str] = None) -> ProofStructure:
    """
    Parse a proof from the metamath database into a ProofStructure.
    Uses metamath-py's proof verification for accurate dependency extraction.
    """
    structure = ProofStructure()

    # Extract dependencies using proof verification
    ordered_steps, dependencies, conclusions = extract_proof_dependencies(db, theorem_name)

    if not ordered_steps:
        # Fallback: create a single-step proof if extraction failed
        if theorem_name in db.statements:
            stmt = db.statements[theorem_name]
            expression = ' '.join(stmt.tokens)
            full_text = None
            if descriptions and theorem_name in descriptions:
                full_text = f"{theorem_name}: {descriptions[theorem_name]}"
            else:
                full_text = f"{theorem_name}: {expression}"
            structure.add_statement(ProofStatement(
                index=1,
                label=theorem_name,
                expression=expression,
                dependencies=[],
                full_text=full_text
            ))
        return structure

    # Apply topological sort for more logical ordering
    ordered_steps = topological_sort_proof(ordered_steps, dependencies)

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

        # Get full text description if available
        full_text = None
        if descriptions and label in descriptions:
            full_text = f"{label}: {descriptions[label]}"
        elif label in db.statements:
            # If no description, use label and expression
            full_text = f"{label}: {expression}"

        # Convert label dependencies to index dependencies
        label_deps = dependencies.get(label, [])
        index_deps = [label_to_index[dep] for dep in label_deps if dep in label_to_index]

        # Get instantiated expression from proof verification (if available)
        inst_expr = conclusions.get(label)

        structure.add_statement(ProofStatement(
            index=i,
            label=label,
            expression=expression,
            dependencies=index_deps,
            full_text=full_text,
            instantiated_expression=inst_expr
        ))

    return structure

def get_hardcoded_2p2e4_proof() -> ProofStructure:
    """
    Returns a hardcoded proof structure for 2 + 2 = 4.
    This serves as a fallback when the database is not available.
    """
    structure = ProofStructure()

    # The actual 2p2e4 proof structure based on metamath with descriptions
    steps = [
        (1, 'df-2', '2 = (1 + 1)', [], 'df-2: Define the number 2.'),
        (2, 'df-3', '3 = (2 + 1)', [], 'df-3: Define the number 3.'),
        (3, 'df-4', '4 = (3 + 1)', [], 'df-4: Define the number 4.'),
        (4, 'ax-1cn', '1 ∈ ℂ', [], 'ax-1cn: 1 is a complex number.'),
        (5, '2cn', '2 ∈ ℂ', [], '2cn: 2 is a complex number.'),
        (6, 'oveq2i', '(2 + 2) = (2 + (1 + 1))', [1], 'oveq2i: Equality of operation value.'),  # Depends on df-2
        (7, 'oveq1i', '(3 + 1) = ((2 + 1) + 1)', [2], 'oveq1i: Equality of operation value.'),  # Depends on df-3
        (8, 'addassi', '((2 + 1) + 1) = (2 + (1 + 1))', [5, 4, 4], 'addassi: Associative law for addition.'),  # Depends on 2cn, ax-1cn, ax-1cn
        (9, '3eqtri', '4 = (2 + (1 + 1))', [3, 7, 8], '3eqtri: Transitive equality.'),  # Depends on df-4, oveq1i, addassi
        (10, 'eqtr4i', '(2 + 2) = 4', [6, 9], 'eqtr4i: Transitive equality.')  # Final step depends on oveq2i and 3eqtri
    ]

    for index, label, expression, dependencies, full_text in steps:
        structure.add_statement(ProofStatement(index, label, expression, dependencies, full_text))

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
        db, db_path = get_metamath_database(auto_download)

        # Extract descriptions from the raw file
        descriptions = extract_statement_descriptions(db_path)

        # Check if the theorem exists
        if theorem_name not in db.statements and theorem_name not in db.rules:
            print(f"Theorem {theorem_name} not found in database, trying fallbacks")
        else:
            # Parse the proof with full dependency extraction
            structure = parse_proof_from_database(db, theorem_name, descriptions)

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