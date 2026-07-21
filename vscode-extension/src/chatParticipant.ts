// src/chatParticipant.ts
// ─────────────────────────────────────────────────────────────────────
// Implements the @automation-hub chat participant (Thing 2).
//
// What this file does:
//   - Receives messages from VS Code Copilot Chat
//   - Parses the message using the intent parser
//   - Sends a confirmation response back to the chat
//   - When the user types "confirm", triggers the workflow
//   - Sends the result back to the chat
//
// How confirm/cancel works:
//   When the user types @automation-hub confirm,
//   VS Code sends a NEW request to our handler with prompt="confirm".
//   We check the prompt text and either execute or cancel.
// ─────────────────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import { loadCatalog, Automation } from './catalogLoader';
import { getConfig, hasGitHubToken, promptForGitHubToken } from './configManager';
import { parseUserMessage } from './intentParser';
import { triggerWorkflow } from './githubClient';

// ID of this chat participant (must match package.json)
const PARTICIPANT_ID = 'automation-hub';

// ─────────────────────────────────────────────────────────────────────
// Register the chat participant with VS Code.
// Call this from extension.ts during activation.
// ─────────────────────────────────────────────────────────────────────
export function registerChatParticipant(
  context: vscode.ExtensionContext
): void {

  // Create the chat participant
  // The second argument is the request handler.
  // It is called for EVERY message the user sends to @automation-hub.
  const participant = vscode.chat.createChatParticipant(
    PARTICIPANT_ID,
    async (
      request: vscode.ChatRequest,
      _chatContext: vscode.ChatContext,
      stream: vscode.ChatResponseStream,
      _token: vscode.CancellationToken
    ) => {
      await handleRequest(context, request, stream);
    }
  );

  // Set the participant's icon (optional, makes it look nicer)
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.svg');

  // Add to subscriptions for cleanup
  context.subscriptions.push(participant);
}

// ─────────────────────────────────────────────────────────────────────
// Handle a chat request. This is the main logic.
// ─────────────────────────────────────────────────────────────────────
async function handleRequest(
  context: vscode.ExtensionContext,
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream
): Promise<void> {

  // The user's message (after removing the @automation-hub prefix)
  // Example: if the user typed "@automation-hub compare v1.2.0 with v1.3.0"
  // then request.prompt is "compare v1.2.0 with v1.3.0"
  const userMessage: string = request.prompt.trim();
  const lowerMessage: string = userMessage.toLowerCase();

  // ─────────────────────────────────────────────────────────────────
  // Command: "set token" or "configure token"
  // ─────────────────────────────────────────────────────────────────
  if (
    lowerMessage === 'set token' ||
    lowerMessage === 'configure token' ||
    lowerMessage.includes('set my token') ||
    lowerMessage.includes('configure my token')
  ) {
    const saved = await promptForGitHubToken(context);
    if (saved) {
      stream.markdown('Token configured. You can now run automations.');
    } else {
      stream.markdown('Token setup was cancelled or no token was provided.');
    }
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // Command: "confirm" — execute the pending automation
  // ─────────────────────────────────────────────────────────────────
  if (lowerMessage === 'confirm' || lowerMessage === 'yes' || lowerMessage === 'y') {
    await executePendingExecution(context, stream);
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // Command: "cancel" — cancel the pending automation
  // ─────────────────────────────────────────────────────────────────
  if (lowerMessage === 'cancel' || lowerMessage === 'no' || lowerMessage === 'n') {
    await context.globalState.update('pendingExecution', undefined);
    stream.markdown('Cancelled. No automation was triggered.');
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // Command: "list" or "help" — show available automations
  // ─────────────────────────────────────────────────────────────────
  if (lowerMessage === 'list' || lowerMessage === 'help' || lowerMessage === '?') {
    const catalog = await loadCatalogSafely(context, stream);
    if (!catalog) return;

    stream.markdown('**Available automations:**\n\n');
    for (const auto of catalog.automations) {
      stream.markdown(
        `- **${auto.identity.display_name}**: ${auto.identity.description}\n`
      );
    }
    stream.markdown(
      '\n**Usage:** `@automation-hub <verb> <parameters>`\n\n' +
      '**Example:** `@automation-hub compare v1.2.0 with v1.3.0 on taxonomy 4.2`'
    );
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // Check if a token is configured (for all other commands)
  // ─────────────────────────────────────────────────────────────────
  const hasToken = await hasGitHubToken(context);
  if (!hasToken) {
    stream.markdown(
      '**No GitHub token configured.**\n\n' +
      'Type `@automation-hub set token` to configure your token, ' +
      'or open the Command Palette (Ctrl+Shift+P) and run ' +
      '**Automation Hub: Set Token**.'
    );
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // Load the catalog
  // ─────────────────────────────────────────────────────────────────
  const catalog = await loadCatalogSafely(context, stream);
  if (!catalog) return;

  // ─────────────────────────────────────────────────────────────────
  // Parse the user's message
  // ─────────────────────────────────────────────────────────────────
  const parsed = parseUserMessage(userMessage, catalog);

  // If we could not identify an automation
  if (!parsed.automation) {
    stream.markdown(
      'I could not identify which automation you want to run.\n\n' +
      '**Available automations:**\n'
    );
    for (const auto of catalog.automations) {
      stream.markdown(`- **${auto.identity.display_name}**: ${auto.identity.description}\n`);
    }
    if (parsed.alternatives.length > 0) {
      stream.markdown('\n**Did you mean:**\n');
      for (const alt of parsed.alternatives) {
        stream.markdown(`- **${alt.identity.display_name}**: ${alt.identity.description}\n`);
      }
    }
    stream.markdown(
      '\n**Example:** `@automation-hub compare v1.2.0 with v1.3.0 on taxonomy 4.2`'
    );
    return;
  }

  // If confidence is low, suggest alternatives
  if (parsed.confidence < 0.3 && parsed.alternatives.length > 0) {
    stream.markdown('**Did you mean one of these?**\n\n');
    for (const alt of parsed.alternatives) {
      stream.markdown(`- **${alt.identity.display_name}**: ${alt.identity.description}\n`);
    }
    return;
  }

  // If required parameters are missing, ask for them
  if (parsed.missing.length > 0) {
    stream.markdown(
      `Ready to run **${parsed.automation.identity.display_name}**, ` +
      `but I need a few more details:\n\n`
    );
    for (const paramName of parsed.missing) {
      const paramDef = parsed.automation.parameters.find(
        (p: Automation['parameters'][0]) => p.name === paramName
      );
      if (paramDef) {
        const example = paramDef.example ? ` (e.g. \`${paramDef.example}\`)` : '';
        const allowed = paramDef.allowed_values
          ? ` Options: ${paramDef.allowed_values.map((v: string) => `\`${v}\``).join(', ')}`
          : '';
        stream.markdown(`- **${paramDef.display_name || paramName}**${example}${allowed}\n`);
      }
    }
    stream.markdown(
      `\n**Example:** \`@automation-hub ${userMessage} ${parsed.missing.map((m: string) => `${m}=<value>`).join(' ')}\``
    );
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // All parameters are present. Show confirmation.
  // ─────────────────────────────────────────────────────────────────
  stream.markdown(
    `**Ready to run: ${parsed.automation.identity.display_name}**\n\n` +
    `**Parameters:**\n`
  );
  for (const [key, value] of Object.entries(parsed.parameters)) {
    stream.markdown(`- \`${key}\`: \`${value}\`\n`);
  }
  stream.markdown(
    `\n**Workflow:** \`${parsed.automation.execution.workflow}\`\n\n` +
    `---\n\n` +
    `Type \`@automation-hub confirm\` to execute, or \`@automation-hub cancel\` to abort.`
  );

  // Store the pending execution for when the user types "confirm"
  await context.globalState.update('pendingExecution', {
    automationName: parsed.automation.identity.name,
    parameters: parsed.parameters,
    timestamp: Date.now(),
  });
}

// ─────────────────────────────────────────────────────────────────────
// Load the catalog with error handling.
// Returns null if loading failed (and shows error in stream).
// ─────────────────────────────────────────────────────────────────────
async function loadCatalogSafely(
  context: vscode.ExtensionContext,
  stream: vscode.ChatResponseStream
): Promise<ReturnType<typeof loadCatalog> | null> {
  try {
    const config = await getConfig(context);
    return await loadCatalog(config.catalogUrl);
  } catch (err: any) {
    stream.markdown(`**Error loading catalog:** ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Execute the pending execution (called when user types "confirm").
// ─────────────────────────────────────────────────────────────────────
async function executePendingExecution(
  context: vscode.ExtensionContext,
  stream: vscode.ChatResponseStream
): Promise<void> {

  // Get the pending execution from global state
  const pending = context.globalState.get<{
    automationName: string;
    parameters: Record<string, string>;
    timestamp: number;
  }>('pendingExecution');

  if (!pending) {
    stream.markdown(
      'No pending automation to confirm.\n\n' +
      'Please describe what you want to run first. For example:\n' +
      '`@automation-hub compare v1.2.0 with v1.3.0 on taxonomy 4.2`'
    );
    return;
  }

  // Check if the pending execution is too old (more than 5 minutes)
  const ageMs = Date.now() - pending.timestamp;
  if (ageMs > 5 * 60 * 1000) {
    stream.markdown('The previous request expired. Please describe what you want to run again.');
    await context.globalState.update('pendingExecution', undefined);
    return;
  }

  // Load catalog to get the workflow file name
  const catalog = await loadCatalogSafely(context, stream);
  if (!catalog) return;

  // Find the automation
  const auto = catalog.automations.find(
    (a: Automation) => a.identity.name === pending.automationName
  );

  if (!auto) {
    stream.markdown(`Automation "${pending.automationName}" not found in catalog.`);
    return;
  }

  // Get config (for the token and repo)
  const config = await getConfig(context);

  stream.markdown('Triggering execution...');

  // Call the GitHub client
  const result = await triggerWorkflow(
    config.repository,
    auto.execution.workflow,
    pending.parameters,
    config.githubToken
  );

  // Clear the pending execution
  await context.globalState.update('pendingExecution', undefined);

  if ('error' in result) {
    stream.markdown(`**Error:** ${result.error}`);
  } else {
    stream.markdown(
      `**Triggered!**\n\n` +
      `Run ID: \`${result.runId}\`\n\n` +
      `**View live results:** [Open on GitHub](${result.runUrl})`
    );
  }
}