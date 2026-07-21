// src/sidebarProvider.ts
// ─────────────────────────────────────────────────────────────────────
// Implements the Automation Hub sidebar panel (Thing 1).
//
// What this file does:
//   - Shows a list of automations in the sidebar
//   - When an automation is clicked, opens a webview with a form
//   - When the form is submitted, triggers the workflow via GitHub
//   - Shows the result (run URL) in the webview
//
// Why this matters:
//   - This is the "click buttons" interface.
//   - Engineers who prefer UI over chat use this.
// ─────────────────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import { Automation, Catalog, loadCatalog, findAutomation, invalidateCatalogCache } from './catalogLoader';
import { getConfig, hasGitHubToken, promptForGitHubToken } from './configManager';
import { triggerWorkflow } from './githubClient';

// ─────────────────────────────────────────────────────────────────────
// TreeDataProvider: tells VS Code what items to show in the sidebar.
// ─────────────────────────────────────────────────────────────────────
export class SidebarProvider implements vscode.TreeDataProvider<AutomationItem> {

  // Event that fires when the data changes (so VS Code re-renders)
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // Cache of the catalog so we do not fetch on every render
  private cachedCatalog: Catalog | null = null;

  constructor(private context: vscode.ExtensionContext) {}

  // Called by VS Code to get the tree items
  async getChildren(): Promise<AutomationItem[]> {
    const config = await getConfig(this.context);

    // Try to load the catalog
    let catalog = this.cachedCatalog;
    if (!catalog) {
      try {
        catalog = await loadCatalog(config.catalogUrl);
        this.cachedCatalog = catalog;
      } catch (err: any) {
        // Show a single error item
        return [new AutomationItem(
          '⚠ Failed to load catalog',
          null,
          err.message,
          vscode.TreeItemCollapsibleState.None
        )];
      }
    }

    // Convert each automation into a tree item
    return catalog.automations.map(auto =>
      new AutomationItem(
        auto.identity.display_name || auto.identity.name,
        auto,
        auto.identity.description,
        vscode.TreeItemCollapsibleState.None
      )
    );
  }

  // Called by VS Code to get the display info for one item
  getTreeItem(item: AutomationItem): vscode.TreeItem {
    return item;
  }

  // Refresh the sidebar (called by the Refresh button)
  refresh(): void {
    invalidateCatalogCache();
    this.cachedCatalog = null;
    this._onDidChangeTreeData.fire();
  }

  // Set up commands (Refresh, Run, etc.)
  registerCommands(): void {
    // Refresh command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('automation-hub.refresh', () => {
        this.refresh();
        vscode.window.showInformationMessage('Automation Hub: Refreshed');
      })
    );

    // Run automation command (when an item is clicked)
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        'automation-hub.runAutomation',
        async (item: AutomationItem) => {
          if (!item.automation) {
            vscode.window.showErrorMessage('Automation Hub: Cannot run this item.');
            return;
          }
          await this.openRunForm(item.automation);
        }
      )
    );

    // Set GitHub token command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('automation-hub.setToken', async () => {
        await promptForGitHubToken(this.context);
      })
    );
  }

  // Open the run form in a webview panel
  private async openRunForm(automation: Automation): Promise<void> {
    // Check if a token is configured
    const hasToken = await hasGitHubToken(this.context);
    if (!hasToken) {
      const action = await vscode.window.showWarningMessage(
        'Automation Hub: No GitHub token configured. Set one now?',
        'Set Token',
        'Cancel'
      );
      if (action === 'Set Token') {
        const saved = await promptForGitHubToken(this.context);
        if (!saved) return;
      } else {
        return;
      }
    }

    // Create a new webview panel
    const panel = vscode.window.createWebviewPanel(
      'automationRun',
      `Run: ${automation.identity.display_name}`,
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    // Set the HTML content
    panel.webview.html = getFormHtml(automation);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.command === 'run') {
          await this.executeAutomation(automation, message.parameters, panel);
        }
      },
      undefined,
      this.context.subscriptions
    );
  }

  // Execute the automation (called when the form's Run button is clicked)
  private async executeAutomation(
    automation: Automation,
    parameters: Record<string, string>,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    const config = await getConfig(this.context);

    // Show progress
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Automation Hub: Running ${automation.identity.display_name}...`,
        cancellable: false,
      },
      async () => {
        // Call the GitHub client
        const result = await triggerWorkflow(
          config.repository,
          automation.execution.workflow,
          parameters,
          config.githubToken
        );

        if ('error' in result) {
          // Show error in the webview
          panel.webview.postMessage({
            command: 'result',
            success: false,
            message: result.error,
          });
          vscode.window.showErrorMessage(`Automation Hub: ${result.error}`);
        } else {
          // Show success in the webview
          panel.webview.postMessage({
            command: 'result',
            success: true,
            runUrl: result.runUrl,
            runId: result.runId,
          });
          vscode.window.showInformationMessage(
            `Automation Hub: ${automation.identity.display_name} triggered!`
          );
        }
      }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Represents one item in the sidebar tree.
// ─────────────────────────────────────────────────────────────────────
class AutomationItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly automation: Automation | null,
    public readonly tooltipText: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.tooltip = tooltipText;
    this.description = automation?.identity.version || '';

    if (automation) {
      this.iconPath = new vscode.ThemeIcon('play');
      this.command = {
        command: 'automation-hub.runAutomation',
        title: 'Run',
        arguments: [this],
      };
    } else {
      this.iconPath = new vscode.ThemeIcon('warning');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Generate the HTML for the run form webview.
// This is a self-contained HTML page with embedded JavaScript.
// ─────────────────────────────────────────────────────────────────────
function getFormHtml(automation: Automation): string {
  // Serialize the automation as JSON for the webview to use
  const automationJson = JSON.stringify(automation)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Run ${automation.identity.display_name}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    h1 { font-size: 18px; margin-bottom: 5px; }
    .description { color: var(--vscode-descriptionForeground); margin-bottom: 20px; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: 600; }
    .help { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 5px; }
    .required { color: #f48771; }
    input, select {
      width: 100%;
      max-width: 400px;
      padding: 8px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      font-size: 13px;
      box-sizing: border-box;
    }
    button {
      padding: 8px 16px;
      margin-right: 8px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 13px;
    }
    button:hover { background-color: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    #result {
      margin-top: 20px;
      padding: 15px;
      border-radius: 3px;
      display: none;
    }
    #result.success { background-color: rgba(78, 201, 176, 0.1); border-left: 3px solid #4ec9b0; }
    #result.error { background-color: rgba(244, 135, 113, 0.1); border-left: 3px solid #f48771; }
    a { color: var(--vscode-textLink-foreground); }
  </style>
</head>
<body>
  <h1>${escapeHtml(automation.identity.display_name)}</h1>
  <p class="description">${escapeHtml(automation.identity.description)}</p>
  <div id="form"></div>
  <div style="margin-top: 20px;">
    <button id="runBtn">Run</button>
    <button id="cancelBtn">Cancel</button>
  </div>
  <div id="result"></div>

  <script>
    // The automation data (passed in from the extension)
    const automation = ${automationJson};

    // Build the form
    const form = document.getElementById('form');
    const parameters = automation.parameters || [];

    if (parameters.length === 0) {
      form.innerHTML = '<p>This automation has no parameters.</p>';
    } else {
      parameters.forEach(param => {
        const group = document.createElement('div');
        group.className = 'form-group';

        const label = document.createElement('label');
        label.textContent = param.display_name || param.name;
        if (param.required) {
          const star = document.createElement('span');
          star.className = 'required';
          star.textContent = ' *';
          label.appendChild(star);
        }

        const help = document.createElement('div');
        help.className = 'help';
        help.textContent = param.description || '';
        if (param.example) {
          help.textContent += ' (e.g. ' + param.example + ')';
        }

        let input;
        if (param.allowed_values && param.allowed_values.length > 0) {
          input = document.createElement('select');
          param.allowed_values.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            if (param.default === val) opt.selected = true;
            input.appendChild(opt);
          });
        } else {
          input = document.createElement('input');
          input.type = 'text';
          if (param.default) input.value = param.default;
          else if (param.example) input.value = param.example;
        }

        input.id = 'param-' + param.name;
        group.appendChild(label);
        if (param.description || param.example) group.appendChild(help);
        group.appendChild(input);
        form.appendChild(group);
      });
    }

    // Handle Run button
    document.getElementById('runBtn').addEventListener('click', () => {
      const runBtn = document.getElementById('runBtn');
      const result = document.getElementById('result');

      // Collect parameters
      const params = {};
      let missing = [];
      parameters.forEach(param => {
        const input = document.getElementById('param-' + param.name);
        if (input && input.value) {
          params[param.name] = input.value;
        } else if (param.required) {
          missing.push(param.display_name || param.name);
        }
      });

      if (missing.length > 0) {
        result.style.display = 'block';
        result.className = 'error';
        result.innerHTML = '<strong>Missing required fields:</strong> ' + missing.join(', ');
        return;
      }

      runBtn.disabled = true;
      runBtn.textContent = 'Running...';
      result.style.display = 'block';
      result.className = '';
      result.textContent = 'Triggering execution...';

      // Send to the extension
      const vscode = acquireVsCodeApi();
      vscode.postMessage({ command: 'run', parameters: params });
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      document.getElementById('result').style.display = 'block';
      document.getElementById('result').className = '';
      document.getElementById('result').textContent = 'Cancelled. Close this tab.';
    });

    // Handle results from the extension
    window.addEventListener('message', event => {
      const message = event.data;
      const result = document.getElementById('result');
      const runBtn = document.getElementById('runBtn');

      if (message.command === 'result') {
        runBtn.disabled = false;
        runBtn.textContent = 'Run';

        if (message.success) {
          result.className = 'success';
          result.innerHTML =
            '<strong>✅ Execution started!</strong><br>' +
            'Run ID: ' + message.runId + '<br>' +
            '<a href="' + message.runUrl + '" target="_blank">View live results on GitHub →</a>';
        } else {
          result.className = 'error';
          result.innerHTML = '<strong>❌ Error:</strong> ' + message.message;
        }
      }
    });
  </script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────
// Helper: escape HTML special characters.
// ─────────────────────────────────────────────────────────────────────
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}