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
exports.GitCollector = exports.ShellCollector = void 0;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const types_1 = require("../types");
class ShellCollector {
    name = 'shell';
    async collect(since) {
        const historyFile = path.join(os.homedir(), '.bash_history');
        if (!(await fs.pathExists(historyFile)))
            return [];
        const stats = await fs.stat(historyFile);
        if (since && stats.mtime < since)
            return [];
        const rawData = await fs.readFile(historyFile, 'utf-8');
        const lines = rawData.split('\n').filter(l => l.trim().length > 0).slice(-20);
        return [{
                id: 'shell-' + stats.mtime.getTime(),
                source: 'shell',
                timestamp: stats.mtime.toISOString(),
                content: lines.join('\n'),
                metadata: { lastCommands: true }
            }];
    }
}
exports.ShellCollector = ShellCollector;
class GitCollector {
    name = 'git';
    async collect(since) {
        const reposDir = path.join(os.homedir(), 'repos');
        if (!(await fs.pathExists(reposDir)))
            return [];
        const repos = await fs.readdir(reposDir);
        let events = [];
        const dateStr = since ? since.toISOString() : '24 hours ago';
        for (const repo of repos) {
            const repoPath = path.join(reposDir, repo);
            const gitDir = path.join(repoPath, '.git');
            if (await fs.pathExists(gitDir)) {
                try {
                    const log = (0, child_process_1.execSync)(`git log --author="samhcharles" --since="${dateStr}" --pretty=format:"%h|%aI|%s"`, {
                        cwd: repoPath,
                        encoding: 'utf-8'
                    });
                    const lines = log.split('\n').filter(l => l.trim().length > 0);
                    for (const line of lines) {
                        const [hash, time, subject] = line.split('|');
                        events.push({
                            id: `git-${repo}-${hash}`,
                            source: 'git',
                            timestamp: time,
                            content: subject,
                            metadata: { repo, hash }
                        });
                    }
                }
                catch (err) {
                    // Repo might be empty or other git errors
                }
            }
        }
        return events;
    }
}
exports.GitCollector = GitCollector;
//# sourceMappingURL=shell.js.map