// src/intentParser.ts
// ─────────────────────────────────────────────────────────────────────
// Parses natural language messages into structured automation requests.
//
// What this file does:
//   - Takes text like "compare v1.2.0 with v1.3.0 on taxonomy 4.2"
//   - Returns a structured object:
//     {
//       automation: "compare-performance",
//       parameters: { build_a: "v1.2.0", build_b: "v1.3.0", taxonomy: "4.2" },
//       confidence: 0.9,
//       missing: []
//     }
//
// Why this matters:
//   - The chat participant needs to convert what the user types
//     into the structured inputs that GitHub Actions expects.
//   - We do not use AI. We use regex and keyword matching.
//     This is fast, predictable, and free.
// ─────────────────────────────────────────────────────────────────────

import { Automation, Catalog, findAutomation } from './catalogLoader';

// Result of parsing a user message.
export interface ParseResult {
  automation: Automation | null;     // The matched automation, or null
  parameters: Record<string, string>; // Extracted parameter values
  confidence: number;                 // 0.0 to 1.0
  missing: string[];                  // Names of required parameters not found
  alternatives: Automation[];         // Other automations that might match
}

// Regular expression for version strings like "v1.2.0" or "1.2.0"
const VERSION_PATTERN = /\bv?\d+\.\d+(?:\.\d+)?\b/gi;

// ─────────────────────────────────────────────────────────────────────
// Main entry point.
// Takes a user message and the full catalog.
// Returns a structured parse result.
// ─────────────────────────────────────────────────────────────────────
export function parseUserMessage(
  message: string,
  catalog: Catalog
): ParseResult {
  const lowerMessage = message.toLowerCase().trim();

  // Step 1: Find the best matching automation
  const { automation, confidence, alternatives } = findBestMatch(
    lowerMessage,
    catalog
  );

  if (!automation) {
    return {
      automation: null,
      parameters: {},
      confidence: 0,
      missing: [],
      alternatives,
    };
  }

  // Step 2: Extract parameters from the message
  const parameters = extractParameters(message, automation);

  // Step 3: Find which required parameters are missing
  const missing: string[] = [];
  for (const param of automation.parameters) {
    if (param.required && !parameters[param.name]) {
      missing.push(param.name);
    }
  }

  return {
    automation,
    parameters,
    confidence,
    missing,
    alternatives,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Find the automation that best matches the user's message.
// Uses keyword matching from each automation's manifest.
// ─────────────────────────────────────────────────────────────────────
function findBestMatch(
  message: string,
  catalog: Catalog
): { automation: Automation | null; confidence: number; alternatives: Automation[] } {

  const scored: Array<{ automation: Automation; score: number }> = [];

  for (const auto of catalog.automations) {
    const keywords = auto.discovery?.keywords || [];
    const name = auto.identity.name.toLowerCase();
    const displayName = auto.identity.display_name.toLowerCase();

    let score = 0;

    // Check each keyword
    for (const keyword of keywords) {
      if (message.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    // Also check the automation name itself
    // Split name by underscores and check each word
    const nameWords = name.split(/[_-]/);
    for (const word of nameWords) {
      if (word.length > 2 && message.includes(word)) {
        score += 2;
      }
    }

    // Also check the display name
    if (message.includes(displayName)) {
      score += 3;
    }

    if (score > 0) {
      scored.push({ automation: auto, score });
    }
  }

  // Sort by score, highest first
  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      automation: null,
      confidence: 0,
      alternatives: [],
    };
  }

  // Normalize confidence to 0-1 range
  // A score of 3+ is high confidence
  const topScore = scored[0].score;
  const confidence = Math.min(topScore / 3, 1);

  return {
    automation: scored[0].automation,
    confidence,
    alternatives: scored.slice(1, 4).map(s => s.automation),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Extract parameter values from the message.
// Uses regex patterns and explicit key=value syntax.
// ─────────────────────────────────────────────────────────────────────
function extractParameters(
  message: string,
  automation: Automation
): Record<string, string> {
  const params: Record<string, string> = {};

  for (const param of automation.parameters) {
    const value = extractSingleParameter(message, param);
    if (value !== null) {
      params[param.name] = value;
    }
  }

  return params;
}

// ─────────────────────────────────────────────────────────────────────
// Extract a single parameter value from the message.
// ─────────────────────────────────────────────────────────────────────
function extractSingleParameter(
  message: string,
  param: Automation['parameters'][0]
): string | null {

  // Strategy 1: Look for explicit key=value or key: value
  // Examples: "build_a=v1.2.0", "build_a: v1.2.0", "build_a v1.2.0"
  const explicitPattern = new RegExp(
    `${param.name}\\s*[:=]\\s*["']?([^\\s"']+)["']?`,
    'i'
  );
  const explicitMatch = message.match(explicitPattern);
  if (explicitMatch) {
    return explicitMatch[1];
  }

  // Strategy 2: For parameters with allowed_values, check each value
  if (param.allowed_values && param.allowed_values.length > 0) {
    for (const allowedValue of param.allowed_values) {
      // Look for the value as a standalone word
      const valuePattern = new RegExp(
        `\\b${escapeRegex(allowedValue)}\\b`,
        'i'
      );
      if (valuePattern.test(message)) {
        return allowedValue;
      }
    }
  }

  // Strategy 3: For "build" or "version" parameters, use version regex
  if (
    param.name.includes('build') ||
    param.name.includes('version') ||
    param.name === 'build_a' ||
    param.name === 'build_b'
  ) {
    // Find all version-like strings in the message
    const matches = message.match(VERSION_PATTERN);
    if (matches && matches.length > 0) {
      // If the parameter name suggests order (a, first, old, from)
      // use the first match. Otherwise, use the second.
      if (
        param.name === 'build_a' ||
        param.name.includes('first') ||
        param.name.includes('old') ||
        param.name.includes('from')
      ) {
        return matches[0];
      }
      if (
        param.name === 'build_b' ||
        param.name.includes('second') ||
        param.name.includes('new') ||
        param.name.includes('with') ||
        param.name.includes('to')
      ) {
        // Use the second match if there are 2+
        if (matches.length >= 2) {
          return matches[1];
        }
        return matches[0];
      }
      // Generic version parameter: use the first match
      return matches[0];
    }
  }

  // Strategy 4: For "taxonomy" parameter, look for version pattern with 2 dots
  if (param.name === 'taxonomy') {
    const taxonomyMatch = message.match(/\b(\d+\.\d+)\b/);
    if (taxonomyMatch) {
      return taxonomyMatch[1];
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Escape special regex characters in a string.
// ─────────────────────────────────────────────────────────────────────
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}