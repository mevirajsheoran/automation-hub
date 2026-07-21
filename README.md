# Automation Hub

Automation Hub is a standardized execution platform for engineering automations. Discover, trigger, and monitor automations directly from VS Code.

## What This Repository Contains

- Automation scripts in `automations/`, each described by a `manifest.yaml`
- A catalog generator in `catalog/` that builds the master automation list
- A VS Code extension in `vscode-extension/` with a sidebar and the `@automation-hub` chat participant
- GitHub Actions workflows in `.github/workflows/` that execute automations in Docker containers

## Architecture

```mermaid
flowchart TB
	vscode[VS Code on Engineer Machine] --> sidebar[Sidebar Panel]
	vscode --> chat[@automation-hub Chat Participant]
	vscode -->|HTTPS with PAT| github[GitHub.com]

	github --> catalog[catalog.json]
	github --> workflows[GitHub Actions Workflows]
	github --> artifacts[Workflow Artifacts]
	github --> history[Execution History]
```

The extension talks to GitHub directly using each engineer's Personal Access Token. There is no backend, no server, and no separate infrastructure.

## Quick Start

For team members, see [docs/onboarding.md](docs/onboarding.md).

For developers working on the extension:

```bash
git clone https://github.com/mevirajsheoran/automation-hub.git
cd automation-hub

cd vscode-extension
npm install
npm run compile
```

Then open the folder in VS Code and press F5.

## Adding a New Automation

Create a new folder under `automations/`:

```text
automations/my-new-automation/
├── manifest.yaml
├── run.py
├── Dockerfile
└── requirements.txt
```

Add a workflow file under `.github/workflows/`:

```text
.github/workflows/my-new-automation.yml
```

After you push to `main`, the catalog regenerates and the new automation appears in the extension.

See [docs/adding-automation.md](docs/adding-automation.md) for the full guide.

## Repository Structure

```text
automation-hub/
├── automations/              # Plugin folders, one per automation
│   ├── compare-performance/
│   └── environment-check/
├── catalog/                  # Catalog generator script
├── catalog.json              # Auto-generated master list
├── docs/                     # Documentation
│   ├── onboarding.md         # Installation guide for team members
│   └── adding-automation.md  # Guide for adding new automations
├── vscode-extension/         # VS Code extension source
│   ├── src/                  # TypeScript source code
│   ├── package.json          # Extension manifest
│   └── tsconfig.json         # TypeScript configuration
├── .github/
│   └── workflows/            # GitHub Actions workflows
└── README.md
```

## Available Automations

| Name | Description | Parameters |
| --- | --- | --- |
| compare-performance | Simulated performance comparison between two build versions | `build_a`, `build_b`, `taxonomy` |
| environment-check | Stub for extensibility demonstration | `environment` |

## Extension Commands

| Command | Description |
| --- | --- |
| `@automation-hub list` | Show all available automations |
| `@automation-hub help` | Show usage instructions |
| `@automation-hub set token` | Configure your GitHub Personal Access Token |
| `@automation-hub compare v1.2.0 with v1.3.0 on taxonomy 4.2` | Trigger compare-performance |
| `@automation-hub confirm` | Execute the pending automation |
| `@automation-hub cancel` | Cancel the pending automation |

## Requirements

- VS Code, any recent version
- GitHub account with access to this repository
- GitHub Personal Access Token with `repo` and `workflow` scopes
- GitHub Copilot license for the chat participant feature

## License

Internal use only.