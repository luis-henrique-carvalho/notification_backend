export interface EventEnvelope<T> {
  eventType: string;
  correlationId: string;
  timestamp: string;
  source: string;
  payload: T;
  metadata?: Record<string, unknown>;
}
