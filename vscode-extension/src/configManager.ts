// src/configManager.ts
// ─────────────────────────────────────────────────────────────────────
// Manages the extension's configuration and secrets.
//
// What this file does:
//   - Stores the GitHub Personal Access Token (PAT) securely using
//     VS Code's SecretStorage API. The PAT is encrypted by VS Code.
//   - Reads non-secret settings (repository, catalog URL) from
//     VS Code's configuration.
//   - Provides a single place for other modules to get configuration
//     without each module having to know about VS Code APIs.
//
// Why this matters:
//   - We never store the PAT in plain text settings.
//   - We never log the PAT.
//   - Other modules just call getConfig() and get everything they need.
// ─────────────────────────────────────────────────────────────────────

import * as vscode from 'vscode';

// SecretStorage key for the GitHub PAT.
// This is a unique identifier for our secret inside VS Code.
const SECRET_KEY_PAT = 'automation-hub.github-pat';

// Configuration keys (must match package.json "contributes.configuration")
// Configuration keys (must match package.json "contributes.configuration")
// Note: when using getConfiguration('automationHub'),
// the key is just the part AFTER "automationHub."
const CONFIG_REPOSITORY = 'repository';
const CONFIG_CATALOG_URL = 'catalogUrl';

// The shape of the configuration object returned by getConfig().
// Using a TypeScript "type" for clarity and safety.
export interface ExtensionConfig {
  githubToken: string;
  repository: string;
  catalogUrl: string;
}

// ─────────────────────────────────────────────────────────────────────
// Save the GitHub PAT securely.
// Called when the engineer pastes their PAT into the extension.
// ─────────────────────────────────────────────────────────────────────
export async function saveGitHubToken(token: string): Promise<void> {
  // Get VS Code's secret storage. This is encrypted by VS Code.
  const secrets = vscode.workspace.getConfiguration();

  // Actually, we use the extension context for SecretStorage.
  // But since we don't have context here, we use a global secrets store.
  // The proper way is via the extension context passed in.
  // We handle that in a wrapper below.
  throw new Error('Use saveGitHubTokenWithContext instead');
}

// ─────────────────────────────────────────────────────────────────────
// Save the PAT using a context (the proper VS Code way).
// Call this from extension.ts where we have access to context.
// ─────────────────────────────────────────────────────────────────────
export async function setGitHubToken(
  context: vscode.ExtensionContext,
  token: string
): Promise<void> {
  await context.secrets.store(SECRET_KEY_PAT, token);
}

// ─────────────────────────────────────────────────────────────────────
// Get the PAT (returns empty string if not set).
// ─────────────────────────────────────────────────────────────────────
export async function getGitHubToken(
  context: vscode.ExtensionContext
): Promise<string> {
  const token = await context.secrets.get(SECRET_KEY_PAT);
  return token ?? '';
}

// ─────────────────────────────────────────────────────────────────────
// Check whether a PAT is configured.
// ─────────────────────────────────────────────────────────────────────
export async function hasGitHubToken(
  context: vscode.ExtensionContext
): Promise<boolean> {
  const token = await getGitHubToken(context);
  return token.length > 0;
}

// ─────────────────────────────────────────────────────────────────────
// Delete the PAT (for "sign out" functionality or reset).
// ─────────────────────────────────────────────────────────────────────
export async function deleteGitHubToken(
  context: vscode.ExtensionContext
): Promise<void> {
  await context.secrets.delete(SECRET_KEY_PAT);
}

// ─────────────────────────────────────────────────────────────────────
// Get the full configuration: PAT + repository + catalog URL.
// This is the main function other modules will call.
// ─────────────────────────────────────────────────────────────────────
export async function getConfig(
  context: vscode.ExtensionContext
): Promise<ExtensionConfig> {
  const config = vscode.workspace.getConfiguration('automationHub');

  return {
    githubToken: await getGitHubToken(context),
    repository: config.get<string>(CONFIG_REPOSITORY) || '',
    catalogUrl: config.get<string>(CONFIG_CATALOG_URL) || '',
  };
}

// ─────────────────────────────────────────────────────────────────────
// Prompt the user to enter their PAT.
// Shows an input box. If they enter a value, saves it securely.
// Returns true if a token was saved, false if the user cancelled.
// ─────────────────────────────────────────────────────────────────────
export async function promptForGitHubToken(
  context: vscode.ExtensionContext
): Promise<boolean> {
  const existingToken = await getGitHubToken(context);

  const input = await vscode.window.showInputBox({
    title: 'Automation Hub: GitHub Personal Access Token',
    prompt:
      'Paste your GitHub PAT (must have repo and workflow scopes). ' +
      'Create one at: https://github.com/settings/tokens',
    placeHolder: 'paste-your-token-here',
    password: true, // Hides the input as the user types
    ignoreFocusOut: true,
    value: existingToken || '',
  });

  // User pressed Escape or cancelled
  if (input === undefined) {
    return false;
  }

  // User entered an empty string
  if (input.trim().length === 0) {
    vscode.window.showWarningMessage(
      'Automation Hub: No token provided. You cannot run automations without a token.'
    );
    return false;
  }

  // Save it securely
  await setGitHubToken(context, input.trim());

  vscode.window.showInformationMessage(
    'Automation Hub: GitHub token saved successfully.'
  );

  return true;
}