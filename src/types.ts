export type EventSource = 'gemini' | 'claude' | 'copilot' | 'shell' | 'openclaw' | 'git';

export interface UrchinEvent {
  id: string;
  source: EventSource;
  timestamp: string; // ISO-8601
  content: string;
  metadata?: Record<string, any>;
}

export interface Collector {
  name: EventSource;
  collect(since?: Date): Promise<UrchinEvent[]>;
}
