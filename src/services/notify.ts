/**
 * Local notifications. Uses the browser Notification API only —
 * no servers, no push services, no third-party calls.
 */
import { getSettings, saveSettings } from '../data/store';

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined';
}

export function permissionState(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

/** Ask the user for notification permission. Returns the granted state. */
export async function requestPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const res = await Notification.requestPermission();
    if (res !== 'granted') {
      saveSettings({ notificationsEnabled: false });
    }
    return res === 'granted';
  } catch {
    return false;
  }
}

/** Show a local notification if enabled and permitted. */
export function notify(title: string, body: string, tag: string): void {
  const s = getSettings();
  if (!s.notificationsEnabled) return;
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    // `tag` replaces an earlier notification with the same tag.
    new Notification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
  } catch {
    // Notification constructor can throw in some contexts — never crash.
  }
}

/** Reminder about budget warnings (called after data changes). */
export function notifyBudgetWarning(text: string): void {
  notify('Budget alert', text, 'budget-warning');
}

/** Reminder for savings goals. */
export function notifyGoal(text: string): void {
  notify('Savings goal', text, 'goal-reminder');
}

/** Reminder that recurring expenses were added. */
export function notifyRecurring(count: number): void {
  notify(
    'Recurring expenses added',
    count === 1 ? '1 recurring expense was added.' : `${count} recurring expenses were added.`,
    'recurring-added',
  );
}
