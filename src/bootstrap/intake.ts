import { execFile } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import * as fs from 'fs-extra';

import { UrchinConfig } from '../core/config';
import { writeFileAtomic } from '../core/io';
import { buildEnvFile, resolvePersonalPaths } from './personal';

const execFileAsync = promisify(execFile);

export interface IntakeServiceAutomationState {
  serviceActive: boolean | null;
  serviceEnabled: boolean | null;
  systemdAvailable: boolean;
}

export interface IntakeServiceSetupOptions {
  config: UrchinConfig;
  enableSystemd?: boolean;
  homeRoot?: string;
  nodePath?: string;
  scriptPath?: string;
}

export interface IntakeServiceSetupResult {
  created: string[];
  state: IntakeServiceAutomationState;
  updated: string[];
  written: string[];
}

function quoteSystemdArg(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function resolveIntakeServicePath(homeRoot: string = os.homedir()): string {
  return path.join(homeRoot, '.config', 'systemd', 'user', 'urchin-intake.service');
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

function buildIntakeServiceFile(envPath: string, nodePath: string, scriptPath: string): string {
  return [
    '[Unit]',
    'Description=Urchin intake server — local HTTP endpoint for multi-agent context capture',
    'Documentation=https://github.com/samhcharles/urchin',
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    `EnvironmentFile=${envPath}`,
    `ExecStart=${quoteSystemdArg(nodePath)} ${quoteSystemdArg(scriptPath)} serve`,
    'Restart=on-failure',
    'RestartSec=5s',
    '',
    '# Port discovery: the live port is written to ~/.local/state/urchin/intake.port on start.',
    '# Any tool reads that file to find the server — no hardcoded port required.',
    '',
    '[Install]',
    'WantedBy=default.target',
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

async function getIntakeServiceAutomationState(): Promise<IntakeServiceAutomationState> {
  const systemdAvailable = await detectSystemdAvailability();
  if (!systemdAvailable) {
    return {
      serviceActive: null,
      serviceEnabled: null,
      systemdAvailable,
    };
  }

  return {
    serviceActive: await readUnitState('urchin-intake.service', 'is-active'),
    serviceEnabled: await readUnitState('urchin-intake.service', 'is-enabled'),
    systemdAvailable,
  };
}

export async function setupIntakeService(options: IntakeServiceSetupOptions): Promise<IntakeServiceSetupResult> {
  const created: string[] = [];
  const updated: string[] = [];
  const written: string[] = [];
  const homeRoot = options.homeRoot ?? os.homedir();
  const personalPaths = resolvePersonalPaths(options.config, homeRoot);
  const servicePath = resolveIntakeServicePath(homeRoot);
  const nodePath = options.nodePath ?? process.execPath;
  const scriptPath = path.resolve(options.scriptPath ?? process.argv[1] ?? '');

  await fs.ensureDir(path.dirname(personalPaths.envPath));
  await fs.ensureDir(path.dirname(servicePath));

  await writeTrackedFile(personalPaths.envPath, buildEnvFile(options.config), created, updated, written);
  await writeTrackedFile(servicePath, buildIntakeServiceFile(personalPaths.envPath, nodePath, scriptPath), created, updated, written);

  let state = await getIntakeServiceAutomationState();
  if (options.enableSystemd && state.systemdAvailable) {
    await execFileAsync('systemctl', ['--user', 'daemon-reload']);
    await execFileAsync('systemctl', ['--user', 'enable', '--now', 'urchin-intake.service']);
    state = await getIntakeServiceAutomationState();
  }

  return {
    created,
    state,
    updated,
    written,
  };
}
