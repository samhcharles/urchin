import { Collector, UrchinEvent } from '../types';
export declare class ShellCollector implements Collector {
    name: 'shell';
    collect(since?: Date): Promise<UrchinEvent[]>;
}
export declare class GitCollector implements Collector {
    name: 'git';
    collect(since?: Date): Promise<UrchinEvent[]>;
}
//# sourceMappingURL=shell.d.ts.map