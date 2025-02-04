import os

# Set the target folder (use "." for the current folder)
folder = "../worlds/alttp"

# Output file
output_file = "alttpFileList.txt"

# Get relative file paths, skipping __pycache__ directories
with open(output_file, "w", encoding="utf-8") as f:
    for root, _, files in os.walk(folder):
        if "__pycache__" in root:  # Skip __pycache__ directories
            continue
        for file in files:
            rel_path = os.path.relpath(os.path.join(root, file), folder)
            f.write(rel_path + "\n")

print(f"File list saved to {output_file} (excluding __pycache__)")
