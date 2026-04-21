import { Collector, UrchinEvent } from '../types';
export declare class OpenClawCollector implements Collector {
    name: 'openclaw';
    collect(since?: Date): Promise<UrchinEvent[]>;
}
//# sourceMappingURL=openclaw.d.ts.map