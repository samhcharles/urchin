import * as os from 'node:os';
import * as path from 'node:path';

export interface UrchinConfig {
  agentEventsPath: string;
  archiveIndexPath: string;
  archiveRoot: string;
  claudeHistoryFile: string;
  eventCachePath: string;
  eventJournalPath: string;
  identityPath: string;
  copilotSessionRoot: string;
  geminiTmpRoot: string;
  gitAuthor?: string;
  inboxCapturePath: string;
  intakePort: number;
  intakePortFile: string;
  intakeRoot: string;
  openclawCommandsLog: string;
  openclawCronRunsDir: string;
  projectAliasPath: string;
  reposRoots: string[];
  shellIgnorePrefixes: string[];
  shellMinCommandLength: number;
  shellHistoryFile: string;
  statePath: string;
  timerCadence: string;
  vaultRoot: string;
  vscodeWorkspaceAliasesPath: string;
  vscodeEventsPath: string;
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

function splitList(value: string | undefined, fallback: string[]): string[] {
  if (!value) {
    return fallback;
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadConfig(): UrchinConfig {
  const vaultRoot = expandHome(process.env.URCHIN_VAULT_ROOT ?? '~/brain');
  const archiveRoot = expandHome(process.env.URCHIN_ARCHIVE_ROOT ?? path.join(vaultRoot, '40-archive', 'urchin'));

  return {
    agentEventsPath: expandHome(process.env.URCHIN_AGENT_EVENTS_PATH ?? '~/.local/share/urchin/agents/events.jsonl'),
    eventCachePath: expandHome(process.env.URCHIN_EVENT_CACHE_PATH ?? '~/.local/share/urchin/event-cache.jsonl'),
    eventJournalPath: expandHome(process.env.URCHIN_EVENT_JOURNAL_PATH ?? '~/.local/share/urchin/journal/events.jsonl'),
    identityPath: expandHome(process.env.URCHIN_IDENTITY_PATH ?? '~/.config/urchin/identity.json'),
    archiveIndexPath: path.join(archiveRoot, 'index.md'),
    archiveRoot,
    claudeHistoryFile: expandHome(process.env.URCHIN_CLAUDE_HISTORY_FILE ?? '~/.claude/history.jsonl'),
    copilotSessionRoot: expandHome(process.env.URCHIN_COPILOT_SESSION_ROOT ?? '~/.copilot/session-state'),
    geminiTmpRoot: expandHome(process.env.URCHIN_GEMINI_TMP_ROOT ?? '~/.gemini/tmp'),
    gitAuthor: process.env.URCHIN_GIT_AUTHOR?.trim() || undefined,
    inboxCapturePath: expandHome(process.env.URCHIN_INBOX_CAPTURE_PATH ?? path.join(vaultRoot, '00-inbox', 'urchin-capture.md')),
    intakePort: Number(process.env.URCHIN_INTAKE_PORT ?? '18799'),
    intakePortFile: expandHome(process.env.URCHIN_INTAKE_PORT_FILE ?? '~/.local/state/urchin/intake.port'),
    intakeRoot: expandHome(process.env.URCHIN_INTAKE_ROOT ?? '~/.local/share/urchin/intake'),
    openclawCommandsLog: expandHome(process.env.URCHIN_OPENCLAW_COMMANDS_LOG ?? '~/.openclaw/logs/commands.log'),
    openclawCronRunsDir: expandHome(process.env.URCHIN_OPENCLAW_CRON_RUNS_DIR ?? '~/.openclaw/cron/runs'),
    projectAliasPath: expandHome(process.env.URCHIN_PROJECT_ALIAS_PATH ?? '~/.config/urchin/project-aliases.json'),
    reposRoots: splitPaths(process.env.URCHIN_REPOS_ROOTS, [expandHome('~/dev'), expandHome('~/repos')]),
    shellIgnorePrefixes: splitList(process.env.URCHIN_SHELL_IGNORE_PREFIXES, ['cd', 'ls', 'pwd', 'clear', 'history', 'exit']),
    shellMinCommandLength: Number(process.env.URCHIN_SHELL_MIN_COMMAND_LENGTH ?? '8'),
    shellHistoryFile: expandHome(process.env.URCHIN_SHELL_HISTORY_FILE ?? '~/.bash_history'),
    statePath: expandHome(process.env.URCHIN_STATE_PATH ?? '~/.local/state/urchin/state.json'),
    timerCadence: process.env.URCHIN_TIMER_CADENCE?.trim() || '5m',
    vaultRoot,
    vscodeWorkspaceAliasesPath: expandHome(process.env.URCHIN_VSCODE_WORKSPACE_ALIASES_PATH ?? '~/.config/urchin/vscode-workspaces.json'),
    vscodeEventsPath: expandHome(process.env.URCHIN_VSCODE_EVENTS_PATH ?? '~/.local/share/urchin/editors/vscode/events.jsonl'),
  };
}
