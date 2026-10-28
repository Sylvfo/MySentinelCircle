export const REALTIME_NOTIFIER = Symbol('REALTIME_NOTIFIER');

// Push-only: the gateway never receives app-level messages from clients,
// callers just signal "go refetch" — clients re-fetch the real data over
// the existing REST endpoints, so the payload stays a bare id.
export interface RealtimeNotifier {
  notifyNewMessage(userId: string, conversationId: string): void;
  notifyAlertChanged(userId: string, alertId: string): void;
  notifyNotificationNew(userId: string): void;
}
