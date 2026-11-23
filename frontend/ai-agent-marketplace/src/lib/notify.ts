import { toast } from 'sonner';
import { isToastEnabled, type NotificationCategory } from '@/store/notificationPrefs';

/**
 * Single entry point for user-facing notifications.
 * Backed by sonner (see the <Toaster /> in main.tsx).
 *
 * Pass a `category` to let the user's push-notification preferences
 * (Settings → Notifications) suppress the toast. Errors are never suppressed.
 */
export const notify = {
  success(message: string, description?: string, category?: NotificationCategory) {
    if (!isToastEnabled(category)) return undefined;
    return toast.success(message, { description });
  },
  error(message: string, description?: string) {
    return toast.error(message, { description });
  },
  info(message: string, description?: string, category?: NotificationCategory) {
    if (!isToastEnabled(category)) return undefined;
    return toast(message, { description });
  },
  warning(message: string, description?: string, category?: NotificationCategory) {
    if (!isToastEnabled(category)) return undefined;
    return toast.warning(message, { description });
  },
  /** Report the outcome of a transaction (hash shown when available). */
  tx(message: string, hash?: string, category?: NotificationCategory) {
    if (!isToastEnabled(category)) return undefined;
    return toast.success(message, {
      description: hash ? `Tx: ${hash}` : undefined,
    });
  },
};

export default notify;
