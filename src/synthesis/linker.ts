import * as fs from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';

export class Linker {
  private entities: string[] = [];
  private projectAliases = new Map<string, string>();
  private projectNotes = new Map<string, string>();

  constructor(
    private vaultRoot: string,
    private projectAliasPath?: string,
  ) {}

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private projectTokens(value: string): string[] {
    const noise = new Set(['agent', 'agents', 'backup', 'bot', 'braindump', 'code', 'dev', 'framework', 'kit', 'maintenance', 'playbook', 'prod', 'project', 'repo', 'soul', 'workspace']);
    return this.normalize(value)
      .split(/\s+/)
      .filter((token) => token.length > 1 && !noise.has(token));
  }

  private resolveHeuristicProject(candidate: string): string | undefined {
    const candidateTokens = new Set(this.projectTokens(candidate));
    if (candidateTokens.size === 0) {
      return undefined;
    }

    let bestMatch: { coverage: number; noteCoverage: number; note: string } | undefined;

    for (const note of this.projectNotes.values()) {
      const noteTokens = this.projectTokens(note);
      if (noteTokens.length === 0) {
        continue;
      }

      const intersection = noteTokens.filter((token) => candidateTokens.has(token)).length;
      if (intersection === 0) {
        continue;
      }

      const candidateCoverage = intersection / candidateTokens.size;
      const noteCoverage = intersection / noteTokens.length;
      const qualifies =
        candidateCoverage === 1 ||
        (candidateCoverage >= 0.66 && noteCoverage >= 0.66);

      if (!qualifies) {
        continue;
      }

      if (
        !bestMatch ||
        candidateCoverage > bestMatch.coverage ||
        (candidateCoverage === bestMatch.coverage && noteCoverage > bestMatch.noteCoverage)
      ) {
        bestMatch = { coverage: candidateCoverage, noteCoverage, note };
      }
    }

    return bestMatch?.note;
  }

  async initialize() {
    const files = await glob('**/*.md', {
      cwd: this.vaultRoot,
      ignore: ['scripts/**', '.obsidian/**', 'node_modules/**']
    });

    this.entities = [...new Set(
      files.map(f => {
        const name = path.basename(f, '.md');
        return name;
      }).filter(name => name.length > 3 && name.length <= 120)
    )];
    
    // Sort entities by length descending to match longest phrases first
    this.entities.sort((a, b) => b.length - a.length);

    const projectFiles = await glob('10-projects/**/*.md', {
      cwd: this.vaultRoot,
    });

    this.projectNotes = new Map(
      projectFiles.map((file) => {
        const name = path.basename(file, '.md');
        return [this.normalize(name), name];
      }),
    );

    if (this.projectAliasPath && await fs.pathExists(this.projectAliasPath)) {
      const aliases = await fs.readJson(this.projectAliasPath).catch(() => ({}));
      if (aliases && typeof aliases === 'object') {
        this.projectAliases = new Map(
          Object.entries(aliases)
            .filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
            .map(([key, value]) => [this.normalize(key), value]),
        );
      }
    }
  }

  link(text: string): string {
    let linkedText = text;

    for (const entity of this.entities) {
      // Use word boundaries and ensure it's not already linked
      const regex = new RegExp(`(?<!\\[\\[)\\b${this.escapeRegExp(entity)}\\b(?!\\]\\])`, 'gi');
      
      // Basic approach: replace first matches to avoid over-linking
      linkedText = linkedText.replace(regex, (match) => `[[${entity}]]`);
    }

    return linkedText;
  }

  resolveProjectName(candidate: string): string | undefined {
    const normalized = this.normalize(candidate);
    if (!normalized) {
      return undefined;
    }

    const aliasMatch = this.projectAliases.get(normalized);
    if (aliasMatch) {
      return aliasMatch;
    }

    const noteMatch = this.projectNotes.get(normalized);
    if (noteMatch) {
      return noteMatch;
    }

    return this.resolveHeuristicProject(candidate);
  }

  private escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
