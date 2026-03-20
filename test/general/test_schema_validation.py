import glob
import json
import os
import unittest

try:
    import jsonschema
    HAS_JSONSCHEMA = True
except ImportError:
    HAS_JSONSCHEMA = False


@unittest.skipUnless(HAS_JSONSCHEMA, "jsonschema package not installed")
class TestSchemaValidation(unittest.TestCase):
    """Validate exported rules.json files against the JSON Schema."""

    schema = None
    schema_path = os.path.join("frontend", "schema", "rules.schema.json")
    presets_pattern = os.path.join("frontend", "presets", "*", "AP_*", "AP_*_rules.json")

    @classmethod
    def setUpClass(cls):
        with open(cls.schema_path) as f:
            cls.schema = json.load(f)

    def test_schema_is_valid(self):
        """The schema itself should be valid JSON Schema draft-07."""
        jsonschema.Draft7Validator.check_schema(self.schema)

    def test_rules_json_validates_against_schema(self):
        """All existing rules.json files should validate against the schema."""
        files = sorted(glob.glob(self.presets_pattern))
        self.assertGreater(len(files), 0, "No rules.json files found in frontend/presets/")

        for path in files:
            with self.subTest(path=path):
                with open(path) as f:
                    data = json.load(f)
                jsonschema.validate(instance=data, schema=self.schema)
