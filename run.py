#!/usr/bin/env python3
"""
run.py — Entry point for Ecosystem Radar

Usage examples:
    # Full run (requires ANTHROPIC_API_KEY env var)
    python run.py

    # Dry run with mock data (no API key needed — good for testing/demo)
    python run.py --dry-run

    # Output specific formats
    python run.py --formats markdown json slack

    # Adjust how many signals to include in the digest
    python run.py --top-n 5

    # Print the digest to stdout instead of saving to file
    python run.py --dry-run --print markdown
"""

import sys
import os
import argparse

# Add src/ to path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from orchestrator import run_pipeline
from output.formatter import format_digest


def main():
    parser = argparse.ArgumentParser(
        description="Ecosystem Radar — Partner Signal-to-Pipeline Agent"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run with mock data (no API key required)"
    )
    parser.add_argument(
        "--top-n",
        type=int,
        default=7,
        help="Max number of signals to include in the digest (default: 7)"
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.5,
        help="Minimum signal confidence score 0.0–1.0 (default: 0.5)"
    )
    parser.add_argument(
        "--formats",
        nargs="+",
        default=["markdown", "json"],
        choices=["markdown", "email", "json", "slack"],
        help="Output formats to write (default: markdown json)"
    )
    parser.add_argument(
        "--print",
        dest="print_fmt",
        default=None,
        choices=["markdown", "email", "json", "slack"],
        help="Also print this format to stdout"
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress progress output"
    )

    args = parser.parse_args()

    digest = run_pipeline(
        top_n=args.top_n,
        min_confidence=args.min_confidence,
        dry_run=args.dry_run,
        output_formats=args.formats,
        verbose=not args.quiet
    )

    if args.print_fmt:
        print("\n" + "="*60)
        print(format_digest(digest, fmt=args.print_fmt))


if __name__ == "__main__":
    main()
