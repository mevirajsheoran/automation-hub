# Onboarding Guide - Automation Hub VS Code Extension

This guide helps you install the Automation Hub extension and run your first automation in under 5 minutes.

## Prerequisites

- VS Code version 1.85 or higher
- A GitHub account with access to the automation-hub repository
- A GitHub Personal Access Token
- Optional: GitHub Copilot license for the chat participant feature

## Step 1: Install the Extension

You will receive a file called `automation-hub-0.0.1.vsix` from your team lead.

1. Open VS Code.
2. Click the Extensions icon in the left sidebar, or press `Ctrl+Shift+X`.
3. Click the three dots at the top of the Extensions panel.
4. Select Install from VSIX.
5. Browse to the `automation-hub-0.0.1.vsix` file.
6. Click Install.
7. Wait for the installation to complete.

After installation, you will see a lightning bolt icon in the left activity bar. That is Automation Hub.

## Step 2: Create a GitHub Personal Access Token

The extension needs a token to trigger workflows on your behalf.

1. Open your browser and go to https://github.com/settings/tokens.
2. Click Generate new token, then Generate new token (classic).
3. In the Note field, type Automation Hub.
4. Under Expiration, select 90 days.
5. Under Select scopes, check these two scopes:
   - `repo` for repository access
   - `workflow` for GitHub Actions access
6. Click Generate token.
7. Copy the token immediately. It will look like `ghp_xxxxxxxxxxxxxxxxxxxx`.
8. Save the token somewhere safe.

Important: you will not be able to see this token again. If you lose it, you must generate a new one.

## Step 3: Configure the Extension

Now configure the token and repository details.

### Option A: Through VS Code Settings

1. Press `Ctrl+,` to open Settings.
2. In the search bar, type Automation Hub.
3. Fill in the following fields:
   - GitHub Token: paste your token from Step 2
   - Repository: `mevirajsheoran/automation-hub` if your team lead has not given you a different repository
   - Catalog URL: `https://raw.githubusercontent.com/mevirajsheoran/automation-hub/main/catalog.json`

### Option B: Through Chat

1. Open the Copilot Chat panel.
2. Type `@automation-hub set token`.
3. Paste your token when prompted.
4. Press Enter.

The repository and catalog URL are pre-configured unless your team lead says otherwise.

## Step 4: Run Your First Automation

Choose one of the two interfaces.

### Option A: Use the Sidebar

1. Click the lightning bolt icon in the left activity bar.
2. You will see a list of available automations.
3. Click Compare Performance.
4. Fill in the values:
   - Build A: `v1.2.0`
   - Build B: `v1.3.0`
   - Taxonomy Version: `4.2`
5. Click Run.
6. A success message appears with a link to GitHub.
7. Click the link to see the workflow running.

### Option B: Use the Chat

1. Open the Copilot Chat panel.
2. Type `@automation-hub compare v1.2.0 with v1.3.0 on taxonomy 4.2`.
3. The chat shows a confirmation message.
4. Type `@automation-hub confirm`.
5. The chat shows a success message with a link to GitHub.
6. Click the link to see the workflow running.

## Troubleshooting

### The sidebar shows Failed to load catalog

- Check your internet connection.
- Verify the catalog URL in settings is exactly `https://raw.githubusercontent.com/mevirajsheoran/automation-hub/main/catalog.json`.
- Ask your team lead to confirm that you have access to the repository.

### The chat says No GitHub token configured

- Repeat Step 3.
- Make sure you pasted the entire token, including the `ghp_` prefix.

### The workflow triggers but shows an error on GitHub

- Your token may have expired after 90 days.
- Generate a new token and update the extension.
- Ask your team lead to check the workflow logs on GitHub.

### `@automation-hub` does not appear in the chat dropdown

- Make sure the extension is installed and enabled.
- Restart VS Code.
- Check that you have a GitHub Copilot license.

### The lightning bolt icon does not appear

- Check that the extension is enabled in the Extensions panel.
- Restart VS Code.

## Security Notes

- Your token is stored securely in VS Code encrypted storage.
- Your token is only used to call GitHub on your behalf.
- You can revoke the token at any time at https://github.com/settings/tokens.
- If you leave the team, revoke your token immediately.