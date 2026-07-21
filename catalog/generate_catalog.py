"""
Catalog Generator
─────────────────
Scans automations/*/manifest.yaml files.
Validates each manifest has required fields.
Writes catalog.json to the repo root.

Run manually:   python catalog/generate_catalog.py
Run in CI:      generate-catalog.yml triggers this on push
"""

import os
import sys
import json
import yaml
from datetime import datetime, timezone


# ─────────────────────────────────────────────
# REQUIRED FIELDS
# Every manifest must have these.
# Missing fields cause the automation to be
# skipped with a warning, not a hard failure.
# The catalog still generates with valid ones.
# ─────────────────────────────────────────────

REQUIRED_TOP_LEVEL = ["identity", "parameters", "execution", "permissions"]

REQUIRED_IDENTITY_FIELDS = [
    "name",
    "display_name",
    "description",
    "version",
    "owner",
]


def validate_manifest(manifest, folder_name):
    """
    Check that a manifest has all required fields.
    Returns a list of error strings.
    Empty list means the manifest is valid.
    """
    errors = []

    # Check top-level sections exist
    for field in REQUIRED_TOP_LEVEL:
        if field not in manifest:
            errors.append(f"Missing required section: '{field}'")

    # Check identity fields exist
    identity = manifest.get("identity", {})
    for field in REQUIRED_IDENTITY_FIELDS:
        if field not in identity:
            errors.append(f"identity section missing field: '{field}'")

    # Check parameters is a list
    parameters = manifest.get("parameters", [])
    if not isinstance(parameters, list):
        errors.append("'parameters' must be a list")

    return errors


def generate_catalog():
    """
    Main function. Scans automations/ folder.
    Builds catalog. Writes catalog.json.
    """

    # Find the repo root (one level up from catalog/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    automations_dir = os.path.join(repo_root, "automations")
    catalog_path = os.path.join(repo_root, "catalog.json")

    print(f"Scanning: {automations_dir}")
    print(f"Output:   {catalog_path}")
    print("-" * 50)

    # Initialize the catalog structure
    catalog = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "version": "1.0",
        "total": 0,
        "automations": [],
        "errors": [],
    }

    # Check the automations directory exists
    if not os.path.exists(automations_dir):
        print(f"ERROR: automations/ directory not found at {automations_dir}")
        sys.exit(1)

    # Walk through every subfolder in automations/
    folders = sorted(os.listdir(automations_dir))

    if not folders:
        print("WARNING: No automation folders found in automations/")

    for folder_name in folders:
        folder_path = os.path.join(automations_dir, folder_name)

        # Skip files (we only care about directories)
        if not os.path.isdir(folder_path):
            continue

        manifest_path = os.path.join(folder_path, "manifest.yaml")

        # Skip folders without a manifest
        if not os.path.exists(manifest_path):
            warning = f"{folder_name}: no manifest.yaml found — skipping"
            catalog["errors"].append(warning)
            print(f"  SKIP    {folder_name} (no manifest.yaml)")
            continue

        # Read and parse the manifest
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = yaml.safe_load(f)
        except yaml.YAMLError as e:
            error = f"{folder_name}: invalid YAML — {str(e)}"
            catalog["errors"].append(error)
            print(f"  ERROR   {folder_name} (invalid YAML)")
            continue

        # Validate required fields
        errors = validate_manifest(manifest, folder_name)
        if errors:
            for err in errors:
                catalog["errors"].append(f"{folder_name}: {err}")
                print(f"  WARN    {folder_name}: {err}")

        # Add to catalog even if there are warnings
        # Only skip on parse errors
        automation_name = manifest.get("identity", {}).get("name", folder_name)
        catalog["automations"].append(manifest)
        print(f"  ADDED   {automation_name}")

    # Update total count
    catalog["total"] = len(catalog["automations"])

    # Write catalog.json
    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2)

    print("-" * 50)
    print(f"Catalog written: {catalog_path}")
    print(f"Total automations: {catalog['total']}")
    print(f"Warnings: {len(catalog['errors'])}")

    if catalog["errors"]:
        print("\nWarnings:")
        for err in catalog["errors"]:
            print(f"  ⚠️  {err}")

    print("\nDone.")
    return catalog


if __name__ == "__main__":
    generate_catalog()