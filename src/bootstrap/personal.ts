import { execFile } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import * as fs from 'fs-extra';

import { UrchinConfig } from '../core/config';
import { ensureNodeIdentity, ResolvedNodeIdentity } from '../core/identity';
import { writeFileAtomic } from '../core/io';

const execFileAsync = promisify(execFile);

export interface PersonalPaths {
  envPath: string;
  notePath: string;
  servicePath: string;
  timerPath: string;
}

export interface PersonalAutomationState {
  systemdAvailable: boolean;
  timerActive: boolean | null;
  timerEnabled: boolean | null;
}

export interface PersonalSetupOptions {
  config: UrchinConfig;
  enableSystemd?: boolean;
  homeRoot?: string;
  nodePath?: string;
  scriptPath?: string;
  timerCadence?: string;
}

export interface PersonalSetupResult {
  created: string[];
  state: PersonalAutomationState;
  updated: string[];
  written: string[];
}

function quoteSystemdArg(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function envLine(key: string, value: string): string {
  return `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function resolvePersonalPaths(config: UrchinConfig, homeRoot: string = os.homedir()): PersonalPaths {
  return {
    envPath: path.join(homeRoot, '.config', 'urchin', 'personal.env'),
    notePath: path.join(config.vaultRoot, '30-resources', 'ai', 'urchin-personal.md'),
    servicePath: path.join(homeRoot, '.config', 'systemd', 'user', 'urchin.service'),
    timerPath: path.join(homeRoot, '.config', 'systemd', 'user', 'urchin.timer'),
  };
}

async function writeTrackedFile(targetPath: string, content: string, created: string[], updated: string[], written: string[]) {
  const existed = await fs.pathExists(targetPath);
  await writeFileAtomic(targetPath, content);
  written.push(targetPath);
  if (existed) {
    updated.push(targetPath);
  } else {
    created.push(targetPath);
  }
}

export function buildEnvFile(config: UrchinConfig): string {
  return [
    envLine('URCHIN_AGENT_EVENTS_PATH', config.agentEventsPath),
    envLine('URCHIN_VAULT_ROOT', config.vaultRoot),
    envLine('URCHIN_ARCHIVE_ROOT', config.archiveRoot),
    envLine('URCHIN_STATE_PATH', config.statePath),
    envLine('URCHIN_EVENT_JOURNAL_PATH', config.eventJournalPath),
    envLine('URCHIN_IDENTITY_PATH', config.identityPath),
    envLine('URCHIN_INBOX_CAPTURE_PATH', config.inboxCapturePath),
    envLine('URCHIN_INTAKE_ROOT', config.intakeRoot),
    envLine('URCHIN_COPILOT_SESSION_ROOT', config.copilotSessionRoot),
    envLine('URCHIN_CLAUDE_HISTORY_FILE', config.claudeHistoryFile),
    envLine('URCHIN_GEMINI_TMP_ROOT', config.geminiTmpRoot),
    envLine('URCHIN_OPENCLAW_COMMANDS_LOG', config.openclawCommandsLog),
    envLine('URCHIN_OPENCLAW_CRON_RUNS_DIR', config.openclawCronRunsDir),
    envLine('URCHIN_PROJECT_ALIAS_PATH', config.projectAliasPath),
    envLine('URCHIN_REMOTE_MIRROR_ROOT', config.remoteMirrorRoot),
    envLine('URCHIN_REMOTE_SOURCES_PATH', config.remoteSourcesPath),
    envLine('URCHIN_SHELL_HISTORY_FILE', config.shellHistoryFile),
    envLine('URCHIN_REPOS_ROOTS', config.reposRoots.join(',')),
    ...(config.gitAuthor ? [envLine('URCHIN_GIT_AUTHOR', config.gitAuthor)] : []),
    envLine('URCHIN_TIMER_CADENCE', config.timerCadence),
    envLine('URCHIN_VSCODE_WORKSPACE_ALIASES_PATH', config.vscodeWorkspaceAliasesPath),
    envLine('URCHIN_VSCODE_EVENTS_PATH', config.vscodeEventsPath),
  ].join('\n') + '\n';
}

function buildServiceFile(paths: PersonalPaths, nodePath: string, scriptPath: string): string {
  return [
    '[Unit]',
    'Description=Urchin personal sync runner',
    'After=default.target',
    '',
    '[Service]',
    'Type=oneshot',
    `EnvironmentFile=${paths.envPath}`,
    `ExecStart=${quoteSystemdArg(nodePath)} ${quoteSystemdArg(scriptPath)} sync`,
    '',
    '[Install]',
    'WantedBy=default.target',
  ].join('\n') + '\n';
}

function buildTimerFile(cadence: string): string {
  return [
    '[Unit]',
    'Description=Run Urchin personal sync on a steady cadence',
    '',
    '[Timer]',
    'OnBootSec=2m',
    `OnUnitActiveSec=${cadence}`,
    'Persistent=true',
    'Unit=urchin.service',
    '',
    '[Install]',
    'WantedBy=timers.target',
  ].join('\n') + '\n';
}

function buildPersonalNote(config: UrchinConfig, state: PersonalAutomationState, identity: ResolvedNodeIdentity): string {
  return [
    '# Urchin Personal Workflow',
    '',
    'This note is the practical operating surface for the real daily loop: Copilot CLI, VS Code, git, and Obsidian.',
    '',
    '## Current setup',
    `- Vault: \`${config.vaultRoot}\``,
    `- Archive: \`${config.archiveRoot}\``,
    `- Agent bridge queue: \`${config.agentEventsPath}\``,
    `- Node identity file: \`${identity.path}\``,
    `- Identity file exists: \`${identity.exists}\``,
    `- Actor / account / device: \`${identity.identity.actorId}\` / \`${identity.identity.accountId}\` / \`${identity.identity.deviceId}\``,
    `- Default visibility: \`${identity.identity.visibility}\``,
    `- Remote mirror root: \`${config.remoteMirrorRoot}\``,
    `- Remote sources config: \`${config.remoteSourcesPath}\``,
    `- VS Code bridge queue: \`${config.vscodeEventsPath}\``,
    `- VS Code workspace aliases: \`${config.vscodeWorkspaceAliasesPath}\``,
    `- Timer cadence: \`${config.timerCadence}\``,
    `- Automation installed: \`${state.systemdAvailable}\``,
    `- Timer enabled: \`${state.timerEnabled === null ? 'unknown' : state.timerEnabled}\``,
    `- Timer active: \`${state.timerActive === null ? 'unknown' : state.timerActive}\``,
    '',
    '## Daily use',
    '1. Run `urchin doctor` when you want blunt runtime truth.',
    '2. Let the timer keep sync moving in the background.',
    '3. Use `urchin ingest-vscode ...` or `urchin ingest-agent ...` to send workspace-aware editor or agent events.',
    '4. Check promoted context in project notes and `30-resources/ai/urchin.md`.',
    '',
    '## One-off editor events',
    '```bash',
    'urchin ingest-vscode --workspace urchin "Shipped a useful change"',
    '```',
    '',
    '## One-off agent events',
    '```bash',
    'urchin ingest-agent --agent codex --workspace urchin --status completed "Finished a useful task"',
    '```',
    '',
    '## Key paths',
    `- Copilot session-state: \`${config.copilotSessionRoot}\``,
    `- Claude history: \`${config.claudeHistoryFile}\``,
    `- Gemini root: \`${config.geminiTmpRoot}\``,
    `- OpenClaw commands log: \`${config.openclawCommandsLog}\``,
    `- OpenClaw cron runs: \`${config.openclawCronRunsDir}\``,
    `- Repo roots: \`${config.reposRoots.join(', ')}\``,
  ].join('\n') + '\n';
}

async function detectSystemdAvailability(): Promise<boolean> {
  try {
    await execFileAsync('systemctl', ['--user', '--version']);
    return true;
  } catch {
    return false;
  }
}

async function readUnitState(unit: string, mode: 'is-enabled' | 'is-active'): Promise<boolean | null> {
  try {
    const { stdout } = await execFileAsync('systemctl', ['--user', mode, unit]);
    const output = stdout.trim();
    return output === 'enabled' || output === 'active';
  } catch (error) {
    const output =
      typeof error === 'object' && error && 'stdout' in error && typeof error.stdout === 'string'
        ? error.stdout.trim()
        : '';
    if (output === 'disabled' || output === 'inactive' || output === 'failed') {
      return false;
    }
    return null;
  }
}

export async function getPersonalAutomationState(homeRoot: string = os.homedir()): Promise<PersonalAutomationState> {
  const systemdAvailable = await detectSystemdAvailability();
  if (!systemdAvailable) {
    return {
      systemdAvailable,
      timerActive: null,
      timerEnabled: null,
    };
  }

  const timerUnit = 'urchin.timer';
  return {
    systemdAvailable,
    timerActive: await readUnitState(timerUnit, 'is-active'),
    timerEnabled: await readUnitState(timerUnit, 'is-enabled'),
  };
}

export async function setupPersonalWorkflow(options: PersonalSetupOptions): Promise<PersonalSetupResult> {
  const paths = resolvePersonalPaths(options.config, options.homeRoot);
  const created: string[] = [];
  const updated: string[] = [];
  const written: string[] = [];
  const nodePath = options.nodePath ?? process.execPath;
  const scriptPath = path.resolve(options.scriptPath ?? process.argv[1] ?? '');

  await fs.ensureDir(path.dirname(paths.envPath));
  await fs.ensureDir(path.dirname(paths.servicePath));
  await fs.ensureDir(path.dirname(paths.notePath));

  await writeTrackedFile(paths.envPath, buildEnvFile(options.config), created, updated, written);
  await writeTrackedFile(paths.servicePath, buildServiceFile(paths, nodePath, scriptPath), created, updated, written);
  await writeTrackedFile(paths.timerPath, buildTimerFile(options.timerCadence ?? options.config.timerCadence), created, updated, written);
  const identityExisted = await fs.pathExists(options.config.identityPath);
  const identity = await ensureNodeIdentity(options.config);
  written.push(identity.path);
  if (identityExisted) {
    updated.push(identity.path);
  } else {
    created.push(identity.path);
  }

  let state = await getPersonalAutomationState(options.homeRoot);
  if (options.enableSystemd && state.systemdAvailable) {
    await execFileAsync('systemctl', ['--user', 'daemon-reload']);
    await execFileAsync('systemctl', ['--user', 'enable', '--now', 'urchin.timer']);
    state = await getPersonalAutomationState(options.homeRoot);
  }

  await writeTrackedFile(paths.notePath, buildPersonalNote(options.config, state, identity), created, updated, written);

  return {
    created,
    state,
    updated,
    written,
  };
}
