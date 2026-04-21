"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const gemini_1 = require("./collectors/gemini");
const claude_1 = require("./collectors/claude");
const openclaw_1 = require("./collectors/openclaw");
const shell_1 = require("./collectors/shell");
const linker_1 = require("./synthesis/linker");
const types_1 = require("./types");
const VAULT_ROOT = '/home/samhc/dev/openclaw-workspace';
async function main() {
    const sinceDate = new Date();
    sinceDate.setHours(sinceDate.getHours() - 24);
    console.log(`Urchin: Syncing context since ${sinceDate.toISOString()}`);
    const collectors = [
        new gemini_1.GeminiCollector(),
        new claude_1.ClaudeCollector(),
        new openclaw_1.OpenClawCollector(),
        new shell_1.ShellCollector(),
        new shell_1.GitCollector()
    ];
    const linker = new linker_1.Linker(VAULT_ROOT);
    await linker.initialize();
    let allEvents = [];
    for (const collector of collectors) {
        try {
            const events = await collector.collect(sinceDate);
            allEvents.push(...events);
        }
        catch (err) {
            console.error(`Error in collector ${collector.name}:`, err);
        }
    }
    // Deduplicate and Sort
    allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    // Basic deduplication (if content and source match within 1s)
    const uniqueEvents = allEvents.filter((event, index, self) => index === self.findIndex((e) => (e.content === event.content &&
        e.source === event.source &&
        Math.abs(new Date(e.timestamp).getTime() - new Date(event.timestamp).getTime()) < 1000)));
    if (uniqueEvents.length === 0) {
        console.log('No new events to sync.');
        return;
    }
    // Formatting for Obsidian
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
function getSourceIcon(source) {
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
//# sourceMappingURL=index.js.map