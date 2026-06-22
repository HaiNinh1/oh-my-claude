/**
 * Auto-gitignore for the local `.omc/` runtime state directory.
 *
 * OMC creates a `.omc/` directory inside a git repo for runtime state (sessions,
 * logs, plans, notepad, etc.). That directory is not source — tracking it produces
 * noisy diffs and merge conflicts. This helper ensures the project's `.gitignore`
 * has a `.omc/` entry so the runtime state stays untracked.
 *
 * Design constraints:
 * - Best-effort: never throws into the caller (SessionStart must not be blocked).
 * - Idempotent and non-destructive: if `.gitignore` already references `.omc`
 *   in any form, the file is left untouched. This deliberately preserves repos
 *   that manage `.omc/` themselves with custom rules (e.g. OMC's own repo uses
 *   `!.omc/` negation to track `.omc/skills/`).
 * - Scoped: only acts when state lives in a local `.omc/` inside a git repo.
 *   When OMC_STATE_DIR centralizes state elsewhere, there is nothing in the repo
 *   to ignore, so it does nothing.
 * - Opt-out: set OMC_DISABLE_GITIGNORE to a truthy value to skip entirely.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { atomicWriteFileSync } from './atomic-write.js';

const GITIGNORE_BLOCK = '# oh-my-claudecode runtime state\n.omc/\n';

/**
 * Returns true when any non-comment line of the gitignore content references
 * `.omc` as a pattern (ignore or negation). Used to avoid touching repos that
 * already manage the directory.
 */
export function gitignoreMentionsOmc(content: string): boolean {
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .some(line => /(^|\/|!)\.omc(\/|$)/.test(line));
}

/**
 * Ensure `directory`'s `.gitignore` ignores the local `.omc/` runtime directory.
 *
 * @param directory - Worktree root (already resolved by the caller).
 * @returns true if the gitignore was modified, false otherwise.
 */
export function ensureOmcGitignored(directory: string): boolean {
  try {
    if (isTruthyEnv(process.env.OMC_DISABLE_GITIGNORE)) return false;

    // Centralized state lives outside the repo — nothing local to ignore.
    if (process.env.OMC_STATE_DIR?.trim()) return false;

    if (!directory) return false;

    // Only act inside a git repo. A worktree's `.git` is a file, not a dir, so
    // existsSync covers both the main repo and linked worktrees.
    if (!existsSync(join(directory, '.git'))) return false;

    const gitignorePath = join(directory, '.gitignore');
    const existing = existsSync(gitignorePath)
      ? readFileSync(gitignorePath, 'utf-8')
      : '';

    // Respect any repo that already manages `.omc` (ignore or negation rules).
    if (gitignoreMentionsOmc(existing)) return false;

    const next = appendBlock(existing, GITIGNORE_BLOCK);
    atomicWriteFileSync(gitignorePath, next);
    return true;
  } catch {
    // Best-effort only — never block startup on a gitignore write.
    return false;
  }
}

function appendBlock(existing: string, block: string): string {
  if (existing.length === 0) return block;
  // Separate the appended block from prior content with a blank line.
  const needsNewline = !existing.endsWith('\n');
  const separator = needsNewline ? '\n\n' : (existing.endsWith('\n\n') ? '' : '\n');
  return existing + separator + block;
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v !== '' && v !== '0' && v !== 'false' && v !== 'no';
}
