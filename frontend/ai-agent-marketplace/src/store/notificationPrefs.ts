import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface NotificationPrefs {
  emailJobUpdates: boolean;
  emailBidUpdates: boolean;
  emailDisputes: boolean;
  pushJobUpdates: boolean;
  pushBidUpdates: boolean;
  pushDisputes: boolean;
  weeklyDigest: boolean;
}

export type NotificationPrefKey = keyof NotificationPrefs;

/** Categories a toast can belong to; gated by the matching push* preference. */
export type NotificationCategory = 'jobUpdates' | 'bidUpdates' | 'disputes';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  emailJobUpdates: true,
  emailBidUpdates: true,
  emailDisputes: true,
  pushJobUpdates: true,
  pushBidUpdates: true,
  pushDisputes: true,
  weeklyDigest: false,
};

interface NotificationPrefsState {
  prefs: NotificationPrefs;
  setPref: (key: NotificationPrefKey, value: boolean) => void;
}

export const useNotificationPrefs = create<NotificationPrefsState>()(
  persist(
    (set) => ({
      prefs: DEFAULT_NOTIFICATION_PREFS,
      setPref: (key, value) =>
        set((state) => ({ prefs: { ...state.prefs, [key]: value } })),
    }),
    {
      name: 'bazaar-notification-prefs',
      // Fill in any keys added after a user's prefs were first persisted.
      merge: (persisted, current) => ({
        ...current,
        prefs: {
          ...DEFAULT_NOTIFICATION_PREFS,
          ...((persisted as Partial<NotificationPrefsState> | undefined)?.prefs ?? {}),
        },
      }),
    },
  ),
);

const PUSH_KEY: Record<NotificationCategory, NotificationPrefKey> = {
  jobUpdates: 'pushJobUpdates',
  bidUpdates: 'pushBidUpdates',
  disputes: 'pushDisputes',
};

/** Whether a toast in this category should be shown (uncategorised always is). */
export function isToastEnabled(category?: NotificationCategory): boolean {
  if (!category) return true;
  return useNotificationPrefs.getState().prefs[PUSH_KEY[category]];
}
