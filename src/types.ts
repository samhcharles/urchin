export type EventSource =
  | 'browser'
  | 'claude'
  | 'copilot'
  | 'gemini'
  | 'git'
  | 'manual'
  | 'openclaw'
  | 'shell';

export type EventKind = 'activity' | 'agent' | 'capture' | 'code' | 'conversation' | 'ops';

export type AsyncAgentStatus = 'launched' | 'running' | 'completed' | 'failed';

export interface AsyncAgentMetadata {
  agentId: string;
  agentType?: string;
  model?: string;
  parentToolCallId?: string;
  readToolCallId?: string;
  status: AsyncAgentStatus;
  title?: string;
}

export interface EventProvenance {
  adapter: string;
  location: string;
  scope: 'local' | 'network';
  repo?: string;
  sessionId?: string;
}

export interface UrchinEvent {
  id: string;
  kind: EventKind;
  source: EventSource;
  timestamp: string;
  summary: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  provenance: EventProvenance;
}

export interface Collector {
  name: EventSource;
  collect(since?: Date): Promise<UrchinEvent[]>;
}
