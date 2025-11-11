#!/bin/bash
# cleanup-fork-merge.sh
# Run this after merging from Archipelago-CC fork to remove fork-specific files
#
# Usage: bash scripts/utils/cleanup-fork-merge.sh

echo "=========================================="
echo "Cleaning up Archipelago-CC fork merge"
echo "=========================================="
echo ""

# Remove CC directory (fork-specific documentation)
if git diff --cached --name-only | grep -q "^CC/"; then
    git reset HEAD CC/ 2>/dev/null
    echo "✓ Unstaged CC/ directory"
elif [ -d "CC" ]; then
    echo "✓ CC/ directory exists but not staged (ignored by .gitignore)"
else
    echo "- CC/ directory not present"
fi

# Remove fork-specific GitHub workflow (check both staged and untracked)
WORKFLOW_FILE=".github/workflows/deploy-gh-pages.yml"
if git diff --cached --name-only | grep -q "^${WORKFLOW_FILE}"; then
    git reset HEAD "${WORKFLOW_FILE}" 2>/dev/null
    rm -f "${WORKFLOW_FILE}"
    echo "✓ Removed deploy-gh-pages.yml workflow (was staged)"
elif [ -f "${WORKFLOW_FILE}" ]; then
    rm -f "${WORKFLOW_FILE}"
    echo "✓ Removed deploy-gh-pages.yml workflow (was untracked)"
else
    echo "- deploy-gh-pages.yml not present"
fi

# Restore our version of README.md if it was changed
if git diff --cached --name-only | grep -q "^README.md"; then
    git checkout HEAD -- README.md
    git add README.md
    echo "✓ Restored our README.md"
else
    echo "- README.md unchanged (already using ours)"
fi

echo ""
echo "=========================================="
echo "Cleanup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Review changes: git status"
echo "  2. Review diffs: git diff --cached"
echo "  3. Commit when ready: git commit"
echo ""
