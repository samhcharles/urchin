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
exports.Linker = void 0;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const glob_1 = require("glob");
class Linker {
    vaultRoot;
    entities = [];
    constructor(vaultRoot) {
        this.vaultRoot = vaultRoot;
    }
    async initialize() {
        const files = await (0, glob_1.glob)('**/*.md', {
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
    link(text) {
        let linkedText = text;
        for (const entity of this.entities) {
            // Use word boundaries and ensure it's not already linked
            const regex = new RegExp(`(?<!\\[\\[)\\b${this.escapeRegExp(entity)}\\b(?!\\]\\])`, 'gi');
            // Basic approach: replace first matches to avoid over-linking
            linkedText = linkedText.replace(regex, (match) => `[[${entity}]]`);
        }
        return linkedText;
    }
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
exports.Linker = Linker;
//# sourceMappingURL=linker.js.map