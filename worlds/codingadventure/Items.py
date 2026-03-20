from typing import Optional, Dict
from BaseClasses import ItemClassification, Item

base_item_id = 400100000

class CodingAdventureItem(Item):
    game = "Coding Adventure"

    def __init__(self, name: str, classification: ItemClassification, code: Optional[int], player: int):
        super().__init__(name, classification, code, player)

class ItemData:
    def __init__(self, id: int, classification: ItemClassification, display_name: str = None):
        self.classification = classification
        self.id = None if id is None else id
        self.table_index = id
        self.display_name = display_name

item_table: Dict[str, ItemData] = {
    "HTML": ItemData(400100001, ItemClassification.progression, "HTML"),
    "CSS": ItemData(400100002, ItemClassification.progression, "CSS"),
    "Design Systems": ItemData(400100003, ItemClassification.progression, "Design Systems"),
    "JavaScript Basics": ItemData(400100004, ItemClassification.progression, "JavaScript Basics"),
    "DOM Manipulation": ItemData(400100005, ItemClassification.progression, "DOM Manipulation"),
    "Algorithms": ItemData(400100006, ItemClassification.progression, "Algorithms"),
    "Server Basics": ItemData(400100007, ItemClassification.progression, "Server Basics"),
    "File I/O": ItemData(400100008, ItemClassification.progression, "File I/O"),
    "HTTP Basics": ItemData(400100009, ItemClassification.progression, "HTTP Basics"),
    "Git": ItemData(400100010, ItemClassification.progression, "Git"),
    "Command Line": ItemData(400100011, ItemClassification.progression, "Command Line"),
    "Package Managers": ItemData(400100012, ItemClassification.progression, "Package Managers"),
    "Static Website Complete": ItemData(400100013, ItemClassification.progression, "Static Website Complete"),
    "React": ItemData(400100014, ItemClassification.progression, "React"),
    "Vue": ItemData(400100015, ItemClassification.progression, "Vue"),
    "Frontend Framework": ItemData(400100016, ItemClassification.progression, "Frontend Framework"),
    "State Management": ItemData(400100017, ItemClassification.progression, "State Management"),
    "Express": ItemData(400100018, ItemClassification.progression, "Express"),
    "Django": ItemData(400100019, ItemClassification.progression, "Django"),
    "Flask": ItemData(400100020, ItemClassification.progression, "Flask"),
    "REST APIs": ItemData(400100021, ItemClassification.progression, "REST APIs"),
    "Database Integration": ItemData(400100022, ItemClassification.progression, "Database Integration"),
    "UI/UX": ItemData(400100023, ItemClassification.progression, "UI/UX"),
    "Responsive Design": ItemData(400100024, ItemClassification.progression, "Responsive Design"),
    "Accessibility": ItemData(400100025, ItemClassification.progression, "Accessibility"),
    "SQL": ItemData(400100026, ItemClassification.progression, "SQL"),
    "NoSQL": ItemData(400100027, ItemClassification.progression, "NoSQL"),
    "Database Basics": ItemData(400100028, ItemClassification.progression, "Database Basics"),
    "Query Optimization": ItemData(400100029, ItemClassification.progression, "Query Optimization"),
    "Interactive App Complete": ItemData(400100030, ItemClassification.progression, "Interactive App Complete"),
    "Sessions": ItemData(400100031, ItemClassification.progression, "Sessions"),
    "JWT": ItemData(400100032, ItemClassification.progression, "JWT"),
    "Authentication": ItemData(400100033, ItemClassification.progression, "Authentication"),
    "Caching": ItemData(400100034, ItemClassification.progression, "Caching"),
    "CDN": ItemData(400100035, ItemClassification.progression, "CDN"),
    "Performance": ItemData(400100036, ItemClassification.progression, "Performance"),
    "Unit Tests": ItemData(400100037, ItemClassification.progression, "Unit Tests"),
    "Integration Tests": ItemData(400100038, ItemClassification.progression, "Integration Tests"),
    "Testing": ItemData(400100039, ItemClassification.progression, "Testing"),
    "Docker": ItemData(400100040, ItemClassification.progression, "Docker"),
    "CI/CD": ItemData(400100041, ItemClassification.progression, "CI/CD"),
    "DevOps": ItemData(400100042, ItemClassification.progression, "DevOps"),
    "Full-Stack Complete": ItemData(400100043, ItemClassification.progression, "Full-Stack Complete"),
    "HTTPS": ItemData(400100044, ItemClassification.progression, "HTTPS"),
    "CORS": ItemData(400100045, ItemClassification.progression, "CORS"),
    "Security Complete": ItemData(400100046, ItemClassification.progression, "Security Complete"),
    "Horizontal Scaling": ItemData(400100047, ItemClassification.progression, "Horizontal Scaling"),
    "Scaling Complete": ItemData(400100048, ItemClassification.progression, "Scaling Complete"),
    "Cloud Provider": ItemData(400100049, ItemClassification.progression, "Cloud Provider"),
    "Domain": ItemData(400100050, ItemClassification.progression, "Domain"),
    "Deployment Complete": ItemData(400100051, ItemClassification.progression, "Deployment Complete"),
    "Victory": ItemData(None, ItemClassification.progression, "Victory"),
}