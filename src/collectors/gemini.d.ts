import { Collector, UrchinEvent } from '../types';
export declare class GeminiCollector implements Collector {
    name: 'gemini';
    collect(since?: Date): Promise<UrchinEvent[]>;
}
//# sourceMappingURL=gemini.d.ts.map