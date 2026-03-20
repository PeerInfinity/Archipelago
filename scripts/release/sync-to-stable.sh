#!/bin/bash
#
# sync-to-stable.sh
#
# Syncs files from the dev repository (Archipelago-CC) to the stable
# repository (PeerInfinity/Archipelago @ JSONExport).
#
# The stable repo has no shared git history with the dev repo — it's a
# flat snapshot updated by rsync. This script handles the copy and
# preserves the stable repo's own .git, .github, README.md, and .gitignore.
#
# Usage:
#   bash scripts/release/sync-to-stable.sh <dest_dir>
#
# Example:
#   bash scripts/release/sync-to-stable.sh /home/user/projects/Archipelago
#

set -e

# Source is always the project root (parent of scripts/release/)
SOURCE_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

# Destination from argument
if [ -z "$1" ]; then
    echo "Usage: $0 <destination_directory>"
    echo "Example: $0 /home/user/projects/Archipelago"
    exit 1
fi
DEST_DIR="$1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Syncing to stable repository ===${NC}"
echo "Source: $SOURCE_DIR"
echo "Destination: $DEST_DIR"
echo ""

# Verify source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo -e "${RED}Error: Source directory does not exist: $SOURCE_DIR${NC}"
    exit 1
fi

# Verify destination directory exists and is a git repo
if [ ! -d "$DEST_DIR/.git" ]; then
    echo -e "${RED}Error: Destination is not a git repository: $DEST_DIR${NC}"
    exit 1
fi

# Step 1: Update .gitignore
echo -e "${GREEN}Step 1: Updating .gitignore...${NC}"
cat "$SOURCE_DIR/.gitignore" > "$DEST_DIR/.gitignore"
echo -e "\nCC/" >> "$DEST_DIR/.gitignore"
echo "  .gitignore updated (dev version + CC/)"

# Step 2: Delete all files except preserved ones
echo -e "${GREEN}Step 2: Deleting files (preserving .git, README.md, .gitignore, .claude, .github)...${NC}"
cd "$DEST_DIR"
find . -maxdepth 1 ! -name '.' ! -name '.git' ! -name '.gitignore' ! -name 'README.md' ! -name '.claude' ! -name '.github' -exec rm -rf {} +
echo "  Files deleted"

# Step 3: Copy files from source
echo -e "${GREEN}Step 3: Copying files from dev repository...${NC}"
rsync -a \
    --exclude='.git' \
    --exclude='.github' \
    --exclude='README.md' \
    --exclude='.gitignore' \
    "$SOURCE_DIR/" "$DEST_DIR/"
echo "  Files copied"

# Step 4: Restore non-root README.md and .gitignore files
echo -e "${GREEN}Step 4: Restoring non-root README.md and .gitignore files...${NC}"
cd "$SOURCE_DIR"
find . \( -name "README.md" -o -name ".gitignore" \) -not -path "./README.md" -not -path "./.gitignore" -print0 | \
    xargs -0 -I {} sh -c 'dest="'"$DEST_DIR"'/{}"; mkdir -p "$(dirname "$dest")"; cp "{}" "$dest"'

# Count files restored
SOURCE_COUNT=$(find "$SOURCE_DIR" \( -name "README.md" -o -name ".gitignore" \) -not -path "$SOURCE_DIR/README.md" -not -path "$SOURCE_DIR/.gitignore" | wc -l)
DEST_COUNT=$(find "$DEST_DIR" \( -name "README.md" -o -name ".gitignore" \) -not -path "$DEST_DIR/README.md" -not -path "$DEST_DIR/.gitignore" | wc -l)
echo "  Restored $DEST_COUNT of $SOURCE_COUNT files"

if [ "$SOURCE_COUNT" -ne "$DEST_COUNT" ]; then
    echo -e "${YELLOW}  Warning: File counts don't match!${NC}"
fi

echo ""
echo -e "${GREEN}=== Sync complete ===${NC}"
echo ""
echo "Next steps:"
echo "  1. cd $DEST_DIR"
echo "  2. Review changes: git status"
echo "  3. Stage changes: git add -A"
echo "  4. Commit: git commit -m 'Sync from Archipelago-CC'"
echo "  5. Push: git push"
