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
exports.GeminiCollector = void 0;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const types_1 = require("../types");
class GeminiCollector {
    name = 'gemini';
    async collect(since) {
        const chatDir = path.join(os.homedir(), '.gemini/tmp/samhc/chats');
        if (!(await fs.pathExists(chatDir)))
            return [];
        const files = await fs.readdir(chatDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        let events = [];
        for (const file of jsonFiles) {
            try {
                const filePath = path.join(chatDir, file);
                const stats = await fs.stat(filePath);
                if (since && stats.mtime < since)
                    continue;
                const data = await fs.readJson(filePath);
                if (data.messages && Array.isArray(data.messages)) {
                    for (const msg of data.messages) {
                        if (msg.type === 'user') {
                            const content = Array.isArray(msg.content)
                                ? msg.content.map((c) => c.text).join('\n')
                                : msg.content;
                            events.push({
                                id: msg.id,
                                source: 'gemini',
                                timestamp: msg.timestamp,
                                content: content,
                                metadata: { sessionId: data.sessionId }
                            });
                        }
                    }
                }
            }
            catch (err) {
                console.error(`Error parsing Gemini chat file ${file}:`, err);
            }
        }
        return events;
    }
}
exports.GeminiCollector = GeminiCollector;
//# sourceMappingURL=gemini.js.map