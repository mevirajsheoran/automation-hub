// src/githubClient.ts
// ─────────────────────────────────────────────────────────────────────
// Wraps all calls to the GitHub REST API.
//
// What this file does:
//   - Triggers a workflow run (workflow_dispatch) using the engineer's PAT
//   - Checks the status of a workflow run
//   - Constructs the URL where the engineer can view the run
//
// Why this matters:
//   - All GitHub API logic is in one place. If the API changes,
//     we only update this file.
//   - Other modules do not need to know about HTTP, authentication,
//     or GitHub's API structure.
// ─────────────────────────────────────────────────────────────────────

// The shape of a workflow run, matching GitHub's API response.
export interface WorkflowRun {
  id: number;
  html_url: string;
  status: 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  name: string;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// Trigger a workflow run.
//
// GitHub API endpoint:
//   POST /repos/{owner}/{repo}/actions/workflows/{workflow}/dispatches
//
// Returns:
//   - On success: the run ID and URL
//   - On failure: an error message
// ─────────────────────────────────────────────────────────────────────
export async function triggerWorkflow(
  repository: string,         // e.g. "mevirajsheoran/automation-hub"
  workflowFile: string,       // e.g. "compare-performance.yml"
  inputs: Record<string, string>,  // e.g. { build_a: "v1.2.0", build_b: "v1.3.0" }
  githubToken: string
): Promise<{ runId: number; runUrl: string } | { error: string }> {

  // Build the URL
  // Strip ".yml" or ".yaml" from the workflow file name if present
  const cleanWorkflowFile = workflowFile.replace(/\.ya?ml$/, '');
  const url =
    `https://api.github.com/repos/${repository}/` +
    `actions/workflows/${cleanWorkflowFile}.yml/dispatches`;

  // The body GitHub expects
  const body = {
    ref: 'main',           // Always trigger from the main branch
    inputs: inputs,        // The parameters from the form / chat
  };

  try {
    // Make the POST request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // GitHub returns 204 No Content on success
    if (response.status === 204) {
      // GitHub does not return the run ID in the 204 response.
      // We need to fetch the most recent run to find it.
      const recentRun = await getLatestRun(
        repository,
        cleanWorkflowFile,
        githubToken
      );

      if (recentRun) {
        return { runId: recentRun.id, runUrl: recentRun.html_url };
      }

      // Fallback: we know it was triggered, but we cannot get the exact run ID.
      // Construct a URL to the actions page so the user can find it.
      return {
        runId: 0,
        runUrl: `https://github.com/${repository}/actions/workflows/${cleanWorkflowFile}.yml`,
      };
    }

    // Handle errors
    if (response.status === 401) {
      return { error: 'Authentication failed. Your GitHub token may be invalid or expired.' };
    }
    if (response.status === 403) {
      return { error: 'Permission denied. Your token may not have the required scopes (repo, workflow).' };
    }
    if (response.status === 404) {
      return { error: `Workflow not found. Check that '${cleanWorkflowFile}.yml' exists in the repository.` };
    }
    if (response.status === 422) {
      const errorBody = await response.text();
      return { error: `Validation error: ${errorBody}` };
    }

    // Other errors
    const errorText = await response.text();
    return { error: `GitHub API error (${response.status}): ${errorText}` };

  } catch (err: any) {
    // Network errors, DNS errors, etc.
    return { error: `Network error: ${err.message || 'Unknown error'}` };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Get the most recent run for a workflow.
// Used after triggering to get the run ID and URL.
// ─────────────────────────────────────────────────────────────────────
async function getLatestRun(
  repository: string,
  workflowFile: string,
  githubToken: string
): Promise<WorkflowRun | null> {
  const url =
    `https://api.github.com/repos/${repository}/` +
    `actions/workflows/${workflowFile}.yml/runs?per_page=1`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { workflow_runs: WorkflowRun[] };
    const runs = data.workflow_runs;

    if (runs && runs.length > 0) {
      return runs[0];
    }

    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Get the current status of a workflow run.
// Used to check if a run has completed.
// ─────────────────────────────────────────────────────────────────────
export async function getRunStatus(
  repository: string,
  runId: number,
  githubToken: string
): Promise<WorkflowRun | null> {
  const url = `https://api.github.com/repos/${repository}/actions/runs/${runId}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json() as WorkflowRun;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Construct the URL where the engineer can view a run in the browser.
// ─────────────────────────────────────────────────────────────────────
export function getRunUrl(repository: string, runId: number): string {
  return `https://github.com/${repository}/actions/runs/${runId}`;
}