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
exports.OpenClawCollector = void 0;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const types_1 = require("../types");
class OpenClawCollector {
    name = 'openclaw';
    async collect(since) {
        const logFile = path.join(os.homedir(), '.openclaw/logs/commands.log');
        if (!(await fs.pathExists(logFile)))
            return [];
        const rawData = await fs.readFile(logFile, 'utf-8');
        const lines = rawData.split('\n').filter(l => l.trim().length > 0);
        let events = [];
        for (const line of lines) {
            try {
                // [2026-04-20 18:00:00] user: prompt
                const match = line.match(/^\[(.*?)] user: (.*)$/);
                if (match) {
                    const timestamp = new Date(match[1]);
                    if (since && timestamp < since)
                        continue;
                    events.push({
                        id: 'openclaw-' + match[1],
                        source: 'openclaw',
                        timestamp: timestamp.toISOString(),
                        content: match[2]
                    });
                }
            }
            catch (err) {
                // Silently skip malformed lines
            }
        }
        return events;
    }
}
exports.OpenClawCollector = OpenClawCollector;
//# sourceMappingURL=openclaw.js.map