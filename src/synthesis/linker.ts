import * as fs from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';

export class Linker {
  private entities: string[] = [];

  constructor(private vaultRoot: string) {}

  async initialize() {
    const files = await glob('**/*.md', {
      cwd: this.vaultRoot,
      ignore: ['scripts/**', '.obsidian/**', 'node_modules/**']
    });

    this.entities = files.map(f => {
      const name = path.basename(f, '.md');
      return name;
    }).filter(name => name.length > 3); // Avoid linking very short common words
    
    // Sort entities by length descending to match longest phrases first
    this.entities.sort((a, b) => b.length - a.length);
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

  private escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
