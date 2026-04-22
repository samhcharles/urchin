export type EventSource =
  | 'agent'
  | 'browser'
  | 'claude'
  | 'copilot'
  | 'gemini'
  | 'git'
  | 'manual'
  | 'openclaw'
  | 'shell'
  | 'vscode';

export type EventKind = 'activity' | 'agent' | 'capture' | 'code' | 'conversation' | 'ops';
export type EventVisibility = 'private' | 'team' | 'public';

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

export interface EventIdentity {
  accountId: string;
  actorId: string;
  deviceId: string;
  projectId?: string;
  visibility: EventVisibility;
  workspaceId?: string;
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
  identity?: EventIdentity;
  provenance: EventProvenance;
}

export interface Collector {
  name: EventSource;
  collect(since?: Date): Promise<UrchinEvent[]>;
}
