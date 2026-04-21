import * as os from 'node:os';
import * as path from 'node:path';

export interface UrchinConfig {
  archiveIndexPath: string;
  archiveRoot: string;
  claudeHistoryFile: string;
  copilotSessionRoot: string;
  geminiTmpRoot: string;
  inboxCapturePath: string;
  intakeRoot: string;
  openclawCommandsLog: string;
  projectAliasPath: string;
  reposRoots: string[];
  shellHistoryFile: string;
  statePath: string;
  vaultRoot: string;
}

function expandHome(input: string): string {
  if (input === '~') {
    return os.homedir();
  }

  if (input.startsWith('~/')) {
    return path.join(os.homedir(), input.slice(2));
  }

  return input;
}

function splitPaths(value: string | undefined, fallback: string[]): string[] {
  if (!value) {
    return fallback;
  }

  return value
    .split(',')
    .map((entry) => expandHome(entry.trim()))
    .filter(Boolean);
}

export function loadConfig(): UrchinConfig {
  const vaultRoot = expandHome(process.env.URCHIN_VAULT_ROOT ?? '~/brain');
  const archiveRoot = expandHome(process.env.URCHIN_ARCHIVE_ROOT ?? path.join(vaultRoot, '40-archive', 'urchin'));

  return {
    archiveIndexPath: path.join(archiveRoot, 'index.md'),
    archiveRoot,
    claudeHistoryFile: expandHome(process.env.URCHIN_CLAUDE_HISTORY_FILE ?? '~/.claude/history.jsonl'),
    copilotSessionRoot: expandHome(process.env.URCHIN_COPILOT_SESSION_ROOT ?? '~/.copilot/session-state'),
    geminiTmpRoot: expandHome(process.env.URCHIN_GEMINI_TMP_ROOT ?? '~/.gemini/tmp'),
    inboxCapturePath: expandHome(process.env.URCHIN_INBOX_CAPTURE_PATH ?? path.join(vaultRoot, '00-inbox', 'urchin-capture.md')),
    intakeRoot: expandHome(process.env.URCHIN_INTAKE_ROOT ?? '~/.local/share/urchin/intake'),
    openclawCommandsLog: expandHome(process.env.URCHIN_OPENCLAW_COMMANDS_LOG ?? '~/.openclaw/logs/commands.log'),
    projectAliasPath: expandHome(process.env.URCHIN_PROJECT_ALIAS_PATH ?? '~/.config/urchin/project-aliases.json'),
    reposRoots: splitPaths(process.env.URCHIN_REPOS_ROOTS, [expandHome('~/dev'), expandHome('~/repos')]),
    shellHistoryFile: expandHome(process.env.URCHIN_SHELL_HISTORY_FILE ?? '~/.bash_history'),
    statePath: expandHome(process.env.URCHIN_STATE_PATH ?? '~/.local/state/urchin/state.json'),
    vaultRoot,
  };
}
