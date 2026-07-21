import os
import json
import random
import time
from datetime import datetime

# ─────────────────────────────────────────────
# READ INPUTS FROM ENVIRONMENT VARIABLES
# GitHub Actions passes workflow inputs
# to the Docker container as env vars.
# ─────────────────────────────────────────────

build_a = os.environ.get("BUILD_A")
build_b = os.environ.get("BUILD_B")
taxonomy = os.environ.get("TAXONOMY")

# Validate inputs are present
if not build_a or not build_b or not taxonomy:
    print("ERROR: BUILD_A, BUILD_B, and TAXONOMY are required.")
    exit(1)

print(f"Starting performance comparison")
print(f"Build A:  {build_a}")
print(f"Build B:  {build_b}")
print(f"Taxonomy: {taxonomy}")
print(f"Started:  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("-" * 60)

# ─────────────────────────────────────────────
# TRACK SCRIPT EXECUTION TIME
# We measure how long the script itself takes.
# This becomes a metric in metrics.json.
# ─────────────────────────────────────────────

script_start = time.time()

# ─────────────────────────────────────────────
# GENERATE SYNTHETIC PERFORMANCE DATA
# In the real automation, this section would
# connect to the platform and fetch real data.
# For the demo, we generate realistic synthetic
# data so the output looks real.
#
# We use a seeded random number generator so
# the same build always produces the same numbers.
# This makes the demo predictable and repeatable.
# ─────────────────────────────────────────────

def generate_build_metrics(build_version, taxonomy_version):
    """
    Generate synthetic but realistic performance metrics
    for a given build version and taxonomy.
    
    Uses the build version string as a seed so the
    same build always gets the same numbers.
    """
    seed = hash(f"{build_version}-{taxonomy_version}") % (2**32)
    rng = random.Random(seed)
    
    return {
        "build": build_version,
        "taxonomy": taxonomy_version,
        "execution_time_minutes": round(rng.uniform(45, 90), 1),
        "memory_usage_gb": round(rng.uniform(2.0, 8.0), 1),
        "reports_generated": rng.randint(200, 400),
        "validation_rules_passed": rng.randint(800, 1200),
        "validation_rules_failed": rng.randint(0, 5),
        "cells_calculated": rng.randint(50000, 150000),
        "warnings": rng.randint(0, 10),
    }

print("Fetching metrics for Build A...")
time.sleep(1)  # Simulate network/platform call
metrics_a = generate_build_metrics(build_a, taxonomy)
print(f"  Execution time: {metrics_a['execution_time_minutes']}m")
print(f"  Memory usage:   {metrics_a['memory_usage_gb']} GB")
print(f"  Reports:        {metrics_a['reports_generated']}")

print("Fetching metrics for Build B...")
time.sleep(1)
metrics_b = generate_build_metrics(build_b, taxonomy)
print(f"  Execution time: {metrics_b['execution_time_minutes']}m")
print(f"  Memory usage:   {metrics_b['memory_usage_gb']} GB")
print(f"  Reports:        {metrics_b['reports_generated']}")

print("-" * 60)

# ─────────────────────────────────────────────
# COMPUTE DELTAS
# For each metric, calculate the percentage
# difference from build_a to build_b.
# Negative delta = build_b is better (smaller).
# Positive delta = build_b produced more (bigger).
# ─────────────────────────────────────────────

def compute_delta(value_a, value_b):
    """
    Compute percentage change from a to b.
    Returns a float. Negative means b is lower.
    """
    if value_a == 0:
        return 0.0
    return round(((value_b - value_a) / value_a) * 100, 1)

def format_delta(delta, lower_is_better=True):
    """
    Format delta as a string with direction indicator.
    lower_is_better: True for time, memory, failures.
                     False for reports, rules passed.
    """
    if delta == 0:
        return "  0.0%  (no change)"
    
    arrow = "▼" if delta < 0 else "▲"
    
    if lower_is_better:
        emoji = "✅" if delta < 0 else "⚠️"
    else:
        emoji = "✅" if delta > 0 else "⚠️"
    
    return f"{arrow} {abs(delta)}%  {emoji}"

deltas = {
    "execution_time": compute_delta(
        metrics_a["execution_time_minutes"],
        metrics_b["execution_time_minutes"]
    ),
    "memory_usage": compute_delta(
        metrics_a["memory_usage_gb"],
        metrics_b["memory_usage_gb"]
    ),
    "reports_generated": compute_delta(
        metrics_a["reports_generated"],
        metrics_b["reports_generated"]
    ),
    "validation_rules_passed": compute_delta(
        metrics_a["validation_rules_passed"],
        metrics_b["validation_rules_passed"]
    ),
    "validation_rules_failed": compute_delta(
        metrics_a["validation_rules_failed"],
        metrics_b["validation_rules_failed"]
    ),
    "cells_calculated": compute_delta(
        metrics_a["cells_calculated"],
        metrics_b["cells_calculated"]
    ),
}

# ─────────────────────────────────────────────
# DETERMINE RECOMMENDATION
# Score each build on key metrics.
# Build with more points wins.
# ─────────────────────────────────────────────

score_a = 0
score_b = 0

# Lower execution time is better
if metrics_a["execution_time_minutes"] < metrics_b["execution_time_minutes"]:
    score_a += 1
else:
    score_b += 1

# Lower memory is better
if metrics_a["memory_usage_gb"] < metrics_b["memory_usage_gb"]:
    score_a += 1
else:
    score_b += 1

# Fewer failures is better
if metrics_a["validation_rules_failed"] < metrics_b["validation_rules_failed"]:
    score_a += 1
else:
    score_b += 1

# More rules passed is better
if metrics_a["validation_rules_passed"] > metrics_b["validation_rules_passed"]:
    score_a += 1
else:
    score_b += 1

if score_b > score_a:
    winner = build_b
    recommendation = f"{build_b} performs better overall ({score_b}/4 metrics)"
elif score_a > score_b:
    winner = build_a
    recommendation = f"{build_a} performs better overall ({score_a}/4 metrics)"
else:
    winner = "tie"
    recommendation = "Builds are comparable — no clear winner"

print(f"Analysis complete.")
print(f"Recommendation: {recommendation}")
print("-" * 60)


# ─────────────────────────────────────────────
# DETERMINE OUTPUT DIRECTORY
# When running in GitHub Actions, OUTPUT_DIR
# is set to /output which is mounted to the
# runner machine so files persist after container stops.
# When running locally, files go to current directory.
# ─────────────────────────────────────────────

output_dir = os.environ.get("OUTPUT_DIR", ".")
os.makedirs(output_dir, exist_ok=True)

# ─────────────────────────────────────────────
# WRITE GITHUB STEP SUMMARY
# ─────────────────────────────────────────────

step_summary_path = os.environ.get("GITHUB_STEP_SUMMARY")

summary_lines = [
    "# 📊 Performance Comparison Report\n",
    "\n",
    "| | |\n",
    "|---|---|\n",
    f"| **Taxonomy** | `{taxonomy}` |\n",
    f"| **Build A** | `{build_a}` |\n",
    f"| **Build B** | `{build_b}` |\n",
    f"| **Run Date** | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} |\n",
    "\n",
    "## 📈 Metric Comparison\n",
    "\n",
    "| Metric | Build A | Build B | Delta |\n",
    "|--------|---------|---------|-------|\n",
    f"| Execution Time (min) | {metrics_a['execution_time_minutes']} | {metrics_b['execution_time_minutes']} | {format_delta(deltas['execution_time'])} |\n",
    f"| Memory Usage (GB) | {metrics_a['memory_usage_gb']} | {metrics_b['memory_usage_gb']} | {format_delta(deltas['memory_usage'])} |\n",
    f"| Reports Generated | {metrics_a['reports_generated']} | {metrics_b['reports_generated']} | {format_delta(deltas['reports_generated'], lower_is_better=False)} |\n",
    f"| Validation Rules Passed | {metrics_a['validation_rules_passed']} | {metrics_b['validation_rules_passed']} | {format_delta(deltas['validation_rules_passed'], lower_is_better=False)} |\n",
    f"| Validation Failures | {metrics_a['validation_rules_failed']} | {metrics_b['validation_rules_failed']} | {format_delta(deltas['validation_rules_failed'])} |\n",
    f"| Cells Calculated | {metrics_a['cells_calculated']} | {metrics_b['cells_calculated']} | {format_delta(deltas['cells_calculated'], lower_is_better=False)} |\n",
    "\n",
    "## 🏆 Recommendation\n",
    "\n",
    f"> **{recommendation}**\n",
    "\n",
]

if step_summary_path:
    with open(step_summary_path, "a", encoding="utf-8") as f:
        f.writelines(summary_lines)
    print("Step summary written to GitHub Actions.")
else:
    print("\n" + "".join(summary_lines))

# ─────────────────────────────────────────────
# WRITE comparison_report.md
# Written to OUTPUT_DIR so it survives
# after the container stops.
# ─────────────────────────────────────────────

report_path = os.path.join(output_dir, "comparison_report.md")
with open(report_path, "w", encoding="utf-8") as f:
    f.writelines(summary_lines)
print(f"comparison_report.md written to {report_path}")

# ─────────────────────────────────────────────
# WRITE metrics.json
# ─────────────────────────────────────────────

script_duration = round(time.time() - script_start, 2)

metrics_output = {
    "automation": "compare-performance",
    "build_a": build_a,
    "build_b": build_b,
    "taxonomy": taxonomy,
    "timestamp": datetime.now().isoformat(),
    "script_duration_seconds": script_duration,
    "winner": winner,
    "score_a": score_a,
    "score_b": score_b,
    "recommendation": recommendation,
    "status": "success",
    "deltas": deltas,
    "metrics_a": metrics_a,
    "metrics_b": metrics_b,
}

metrics_path = os.path.join(output_dir, "metrics.json")
with open(metrics_path, "w", encoding="utf-8") as f:
    json.dump(metrics_output, f, indent=2)
print(f"metrics.json written to {metrics_path}")

print("-" * 60)
print(f"Script completed in {script_duration}s")
print("Done.")