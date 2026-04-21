import { Collector, UrchinEvent } from '../types';
export declare class ClaudeCollector implements Collector {
    name: 'claude';
    collect(since?: Date): Promise<UrchinEvent[]>;
}
//# sourceMappingURL=claude.d.ts.map