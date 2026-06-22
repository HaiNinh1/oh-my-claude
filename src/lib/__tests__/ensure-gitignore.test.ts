import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ensureOmcGitignored, gitignoreMentionsOmc } from '../ensure-gitignore.js';

describe('gitignoreMentionsOmc', () => {
  it('detects plain and trailing-slash entries', () => {
    expect(gitignoreMentionsOmc('.omc')).toBe(true);
    expect(gitignoreMentionsOmc('.omc/')).toBe(true);
    expect(gitignoreMentionsOmc('/.omc/')).toBe(true);
  });

  it('detects negation rules (custom-managed repos)', () => {
    expect(gitignoreMentionsOmc('!.omc/\n.omc/*\n!.omc/skills/')).toBe(true);
  });

  it('ignores comments and unrelated lines', () => {
    expect(gitignoreMentionsOmc('# .omc note\nnode_modules/\n*.log')).toBe(false);
    expect(gitignoreMentionsOmc('')).toBe(false);
    // Substrings like `.omcfoo` must not count.
    expect(gitignoreMentionsOmc('.omcfoo/\nsomething.omc.bak')).toBe(false);
  });
});

describe('ensureOmcGitignored', () => {
  let dir: string;
  const savedStateDir = process.env.OMC_STATE_DIR;
  const savedDisable = process.env.OMC_DISABLE_GITIGNORE;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'omc-gi-'));
    delete process.env.OMC_STATE_DIR;
    delete process.env.OMC_DISABLE_GITIGNORE;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (savedStateDir === undefined) delete process.env.OMC_STATE_DIR;
    else process.env.OMC_STATE_DIR = savedStateDir;
    if (savedDisable === undefined) delete process.env.OMC_DISABLE_GITIGNORE;
    else process.env.OMC_DISABLE_GITIGNORE = savedDisable;
  });

  function makeGitRepo(): void {
    mkdirSync(join(dir, '.git'), { recursive: true });
  }

  it('does nothing when directory is not a git repo', () => {
    expect(ensureOmcGitignored(dir)).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(false);
  });

  it('creates .gitignore with .omc/ in a fresh git repo', () => {
    makeGitRepo();
    expect(ensureOmcGitignored(dir)).toBe(true);
    const content = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(content).toContain('.omc/');
    expect(content).toContain('# oh-my-claudecode runtime state');
  });

  it('appends to an existing .gitignore without clobbering', () => {
    makeGitRepo();
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n*.log\n');
    expect(ensureOmcGitignored(dir)).toBe(true);
    const content = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('*.log');
    expect(content).toContain('.omc/');
  });

  it('is idempotent — second run does not modify', () => {
    makeGitRepo();
    expect(ensureOmcGitignored(dir)).toBe(true);
    const first = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(ensureOmcGitignored(dir)).toBe(false);
    expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toBe(first);
  });

  it('leaves repos that already manage .omc untouched (negation rules)', () => {
    makeGitRepo();
    const managed = '!.omc/\n.omc/*\n!.omc/skills/\n';
    writeFileSync(join(dir, '.gitignore'), managed);
    expect(ensureOmcGitignored(dir)).toBe(false);
    expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toBe(managed);
  });

  it('skips when OMC_STATE_DIR centralizes state', () => {
    makeGitRepo();
    process.env.OMC_STATE_DIR = join(tmpdir(), 'central');
    expect(ensureOmcGitignored(dir)).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(false);
  });

  it('skips when OMC_DISABLE_GITIGNORE is set', () => {
    makeGitRepo();
    process.env.OMC_DISABLE_GITIGNORE = '1';
    expect(ensureOmcGitignored(dir)).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(false);
  });
});
