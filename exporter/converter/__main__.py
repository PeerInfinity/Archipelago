"""
Allow running the converter as a module: python -m exporter.converter
"""

from .cli import main

if __name__ == '__main__':
    main()
