import typing
from BaseClasses import Location


class LocData(typing.NamedTuple):
    id: int
    region: str


class MetamathLocation(Location):
    game: str = "Metamath"

    def __init__(self, player: int, name: str, address: typing.Optional[int],
                 dependencies: typing.List[int], parent):
        super().__init__(player, name, address, parent)
        self.dependencies = dependencies  # List of statement indices this proof step depends on


def statement_location_name(label, expression, prefix="Prove", max_expr_length=50):
    """Build a meaningful location name from a proof statement's label and expression."""
    if label:
        expr = expression
        if len(expr) > max_expr_length:
            expr = expr[:max_expr_length - 3] + "..."
        return f"{prefix} {label}: {expr}"
    return f"{prefix} {expression}"


def generate_location_table(max_statements: int = 1000):
    """Generate a generic location table with numbered names (for class-level registration)."""
    location_table = {}
    for i in range(1, max_statements + 1):
        location_table[f"Prove Statement {i}"] = LocData(234790000 + i, "Proof")
    return location_table


def generate_location_table_from_proof(proof_structure):
    """Generate a location table with meaningful names from a proof structure.

    Each location is named after its metamath label and expression,
    e.g. "Prove df-2: |- 2 = ( 1 + 1 )" instead of "Prove Statement 4".
    """
    location_table = {}

    for index, stmt in sorted(proof_structure.statements.items()):
        name = statement_location_name(stmt.label, stmt.expression)
        location_table[name] = LocData(234790000 + index, "Proof")

    return location_table


# Default location table (will be overridden when proof is loaded)
location_table = generate_location_table(100)