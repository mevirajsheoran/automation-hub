// src/extension.ts
// ─────────────────────────────────────────────────────────────────────
// Entry point for the Automation Hub extension.
//
// What this file does:
//   - Runs when VS Code finishes starting (per activationEvents in package.json)
//   - Creates the sidebar provider
//   - Registers the sidebar view
//   - Registers the chat participant
//   - Registers commands (refresh, set token)
//
// Why this matters:
//   - This is the file VS Code loads first.
//   - Everything else is wired up from here.
// ─────────────────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import { SidebarProvider } from './sidebarProvider';
import { registerChatParticipant } from './chatParticipant';
import { hasGitHubToken } from './configManager';

// This function is called by VS Code when the extension activates.
export function activate(context: vscode.ExtensionContext) {

  console.log('Automation Hub extension activating...');

  // ─────────────────────────────────────────────────────────────────
  // Create the sidebar provider
  // ─────────────────────────────────────────────────────────────────
  const sidebarProvider = new SidebarProvider(context);

  // Register the sidebar view
  // 'automationList' matches the id in package.json contributes.views
  const sidebarView = vscode.window.registerTreeDataProvider(
    'automationList',
    sidebarProvider
  );

  // Register sidebar commands (refresh, run, set token)
  sidebarProvider.registerCommands();

  // ─────────────────────────────────────────────────────────────────
  // Register the chat participant (@automation-hub)
  // ─────────────────────────────────────────────────────────────────
  registerChatParticipant(context);

  // ─────────────────────────────────────────────────────────────────
  // Add all to subscriptions for proper cleanup
  // ─────────────────────────────────────────────────────────────────
  context.subscriptions.push(sidebarView);

  // ─────────────────────────────────────────────────────────────────
  // Check if a GitHub token is configured.
  // If not, show a friendly notification (but do not force setup).
  // ─────────────────────────────────────────────────────────────────
  hasGitHubToken(context).then(hasToken => {
    if (!hasToken) {
      // Show a one-time notification
      vscode.window.showInformationMessage(
        'Automation Hub: Welcome! Configure your GitHub token to start running automations.',
        'Set Token Now',
        'Later'
      ).then(selection => {
        if (selection === 'Set Token Now') {
          vscode.commands.executeCommand('automation-hub.setToken');
        }
      });
    }
  });

  console.log('Automation Hub extension activated');
}

// This function is called when the extension is deactivated.
// VS Code handles cleanup of registered items via context.subscriptions.
export function deactivate() {
  console.log('Automation Hub extension deactivated');
}