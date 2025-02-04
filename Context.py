import sys
from pathlib import Path
import shlex

def process_settings_file(settings_path, output_path):
    """
    Read settings file and compile specified files into one output file.
    Each line in the settings file should be: "filename" [start_line end_line]
    If line numbers are provided, the heading for that file will be:
        "# File: filename (Lines X to Y of Z)"
    Lines in the settings file that begin with '#' are skipped.
    """
    with open(output_path, 'w', encoding='utf-8') as outfile:
        with open(settings_path, 'r', encoding='utf-8') as settings:
            for line in settings:
                # Skip empty lines and comments
                if not line.strip() or line.strip().startswith('#'):
                    continue
                    
                try:
                    # Parse the settings line using shlex to handle quoted strings
                    parts = shlex.split(line.strip())
                    filename = parts[0]
                    start_line = int(parts[1]) if len(parts) > 1 else None
                    end_line = int(parts[2]) if len(parts) > 2 else None

                    with open(filename, 'r', encoding='utf-8') as infile:
                        # Read all lines to compute total_lines
                        lines = infile.readlines()
                        total_lines = len(lines)

                        # Determine effective start and end values
                        effective_start = start_line if start_line is not None else 1
                        effective_end = end_line if end_line is not None else total_lines

                        # Write header based on whether line numbers were provided
                        if start_line is not None or end_line is not None:
                            header = f"\n\n# File: {filename} (Lines {effective_start} to {effective_end} of {total_lines})\n\n"
                        else:
                            header = f"\n\n# File: {filename}\n\n"
                        outfile.write(header)

                        # Write the selected lines
                        # Adjust for 0-based indexing
                        selected_lines = lines[effective_start - 1: effective_end]
                        outfile.write("".join(selected_lines))
                except FileNotFoundError:
                    outfile.write(f"\n\nError: Could not find file {filename}\n")
                except Exception as e:
                    outfile.write(f"\n\nError processing file {filename}: {str(e)}\n")

def main():
    if len(sys.argv) != 3:
        print("Usage: python script.py settings.txt output.txt")
        sys.exit(1)
    
    settings_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    
    if not settings_path.exists():
        print(f"Error: Settings file {settings_path} not found")
        sys.exit(1)
        
    process_settings_file(settings_path, output_path)
    print(f"Combined file created at {output_path}")

if __name__ == "__main__":
    main()
