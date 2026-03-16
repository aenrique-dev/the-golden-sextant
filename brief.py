#!/usr/bin/env python3
"""
brief.py — Generate an Account Scout Brief for any company

Researches a company using 4 parallel Haiku agents and renders a
print-ready HTML brief to data/briefs/[slug]-scout-brief.html.

Usage:
    python brief.py "Snowflake"
    python brief.py "Sutherland Global" --url https://www.sutherlandglobal.com
    python brief.py "Palo Alto Networks" --open
"""

import sys
import os
import argparse
import subprocess

# Add src/ to path so agent imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

import anthropic
from agents.company_brief import run_company_brief


def main():
    parser = argparse.ArgumentParser(
        description="Ecosystem Radar — Account Scout Brief generator"
    )
    parser.add_argument(
        "company",
        help='Company name to research (e.g. "Snowflake" or "Sutherland Global")'
    )
    parser.add_argument(
        "--url",
        default=None,
        help="Company website URL — improves overview research accuracy"
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="Open the brief in your browser when done"
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Directory to save the HTML brief (default: data/briefs/)"
    )

    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY not set.")
        print("Export it in your shell: export ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    out_path = run_company_brief(
        client  = client,
        company = args.company,
        url     = args.url,
        output_dir = args.output_dir,
    )

    print(f"Brief → {out_path}")

    if args.open:
        subprocess.run(["open", str(out_path)])


if __name__ == "__main__":
    main()
