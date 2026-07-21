# Adding a New Automation

This guide explains how to add a new automation to Automation Hub.

## Overview

Each automation is a self-contained folder with these files:

- `manifest.yaml` for metadata and discovery
- `run.py` for the automation logic
- `Dockerfile` for the execution environment
- `requirements.txt` for Python dependencies

A corresponding GitHub Actions workflow is also required.

## Step 1: Create the Plugin Folder

```text
automations/
└── my-new-automation/
    ├── manifest.yaml
    ├── run.py
    ├── Dockerfile
    └── requirements.txt
```

## Step 2: Write the Manifest

Create `automations/my-new-automation/manifest.yaml`:

```yaml
identity:
  name: my-new-automation
  display_name: "My New Automation"
  description: "What this automation does"
  version: 1.0.0
  owner: your-team-name
  tags:
    - tag1
    - tag2

parameters:
  - name: input1
    display_name: "Input One"
    description: "Description of input 1"
    type: string
    required: true
    example: "example-value"
    allowed_values:
      - "option-a"
      - "option-b"

execution:
  workflow: my-new-automation.yml
  estimated_duration: "5m"
  async: false
  timeout: "15m"

permissions:
  roles:
    - developer
    - lead
  requires_approval: false

outputs:
  - name: result
    type: artifact
    filename: result.md

discovery:
  keywords:
    - keyword1
    - keyword2
  category: category-name
```

## Step 3: Write the Script

Create `automations/my-new-automation/run.py`. The script receives inputs as environment variables:

```python
import os

input1 = os.environ.get("INPUT1")

if not input1:
    print("ERROR: INPUT1 is required")
    exit(1)

print(f"Running with input1={input1}")

with open("result.md", "w", encoding="utf-8") as file:
    file.write(f"# Result\n\nInput was: {input1}\n")
```

## Step 4: Write the Dockerfile

Create `automations/my-new-automation/Dockerfile`:

```dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY run.py .

CMD ["python", "run.py"]
```

## Step 5: Write `requirements.txt`

Create `automations/my-new-automation/requirements.txt`:

```text
# Add any Python packages your script needs
# requests==2.32.3
# pandas==2.1.0
```

## Step 6: Create the GitHub Actions Workflow

Create `.github/workflows/my-new-automation.yml`:

```yaml
name: My New Automation

on:
  workflow_dispatch:
    inputs:
      input1:
        description: "Input One"
        required: true
        type: string

jobs:
  execute:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -t my-new-automation -f automations/my-new-automation/Dockerfile automations/my-new-automation/

      - name: Run automation
        run: |
          docker run --rm -e INPUT1="${{ inputs.input1 }}" my-new-automation

      - name: Upload output
        uses: actions/upload-artifact@v4
        with:
          name: my-new-automation-output
          path: result.md
```

## Step 7: Push and Test

1. Commit your changes.
2. Push to the `main` branch.
3. Wait for the catalog to regenerate.
4. Confirm the new automation appears in the extension.
5. Test it from the sidebar or chat participant.



