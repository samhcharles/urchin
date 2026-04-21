export declare class Linker {
    private vaultRoot;
    private entities;
    constructor(vaultRoot: string);
    initialize(): Promise<void>;
    link(text: string): string;
    private escapeRegExp;
}
//# sourceMappingURL=linker.d.ts.map