import * as fs from 'fs-extra';
import * as path from 'path';
import { GeminiCollector } from './collectors/gemini';
import { ClaudeCollector } from './collectors/claude';
import { OpenClawCollector } from './collectors/openclaw';
import { ShellCollector, GitCollector } from './collectors/shell';
import { Linker } from './synthesis/linker';
import { UrchinEvent } from './types';

const VAULT_ROOT = '/home/samhc/dev/openclaw-workspace';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'dump') {
    const text = args.slice(1).join(' ');
    if (!text) {
      console.error('Usage: urchin dump "your thought"');
      process.exit(1);
    }
    await dumpThought(text);
    return;
  }

  await sync();
}

async function dumpThought(text: string) {
  const today = new Date().toISOString().split('T')[0];
  const dumpFile = path.join(VAULT_ROOT, 'INBOX.md');
  const timestamp = new Date().toLocaleTimeString();
  
  const linker = new Linker(VAULT_ROOT);
  await linker.initialize();
  const linkedText = linker.link(text);

  const entry = `\n- [ ] ${timestamp}: ${linkedText} #urchin-dump\n`;
  await fs.ensureDir(path.dirname(dumpFile));
  await fs.appendFile(dumpFile, entry);
  console.log(`Urchin: Thought dumped to INBOX.md`);
}

async function sync() {
  const sinceDate = new Date();
  sinceDate.setHours(sinceDate.getHours() - 24);

  console.log(`Urchin: Syncing context since ${sinceDate.toISOString()}`);

  const collectors = [
    new GeminiCollector(),
    new ClaudeCollector(),
    new OpenClawCollector(),
    new ShellCollector(),
    new GitCollector()
  ];

  const linker = new Linker(VAULT_ROOT);
  await linker.initialize();

  let allEvents: UrchinEvent[] = [];

  for (const collector of collectors) {
    try {
      const events = await collector.collect(sinceDate);
      allEvents.push(...events);
    } catch (err) {
      console.error(`Error in collector ${collector.name}:`, err);
    }
  }

  // Deduplicate and Sort
  allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  const uniqueEvents = allEvents.filter((event, index, self) =>
    index === self.findIndex((e) => (
      e.content === event.content && 
      e.source === event.source &&
      Math.abs(new Date(e.timestamp).getTime() - new Date(event.timestamp).getTime()) < 1000
    ))
  );

  if (uniqueEvents.length === 0) {
    console.log('No new events to sync.');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const outputPath = path.join(VAULT_ROOT, 'memory', `${today}-urchin.md`);

  let markdown = `# Urchin Timeline: ${today}\n\n`;
  
  for (const event of uniqueEvents) {
    const timeStr = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sourceIcon = getSourceIcon(event.source);
    const linkedContent = linker.link(event.content);

    markdown += `### ${sourceIcon} ${timeStr} (${event.source})\n`;
    markdown += `${linkedContent}\n\n`;
    if (event.metadata && event.metadata.repo) {
      markdown += `*Repo: [[${event.metadata.repo}]]*\n\n`;
    }
    markdown += `---\n\n`;
  }

  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, markdown);

  console.log(`Urchin: Timeline updated at ${outputPath}`);
}

function getSourceIcon(source: string): string {
  switch (source) {
    case 'gemini': return '♊';
    case 'claude': return '🎭';
    case 'copilot': return '🤖';
    case 'shell': return '🐚';
    case 'openclaw': return '🦾';
    case 'git': return '📦';
    default: return '📍';
  }
}

main().catch(console.error);
