/**
 * useProfile – persists off-chain display name, email, and bio in localStorage
 * keyed by the connected Stellar public key so each wallet has its own record.
 *
 * The hook provides:
 *   - `profile`         – the current saved values (or empty strings on first use)
 *   - `saveProfile`     – writes new values to localStorage and returns immediately
 *   - `clearProfile`    – removes the stored record for the active public key
 *
 * Storage strategy: localStorage was chosen because it is universally available
 * without any server round-trip, keeps user data fully local (no off-chain
 * service dependency), and is sufficient for the display-name / bio use-case
 * where the data is purely cosmetic and does not need cross-device sync.
 * A future migration to a DID / Ceramic profile service can be done by
 * swapping the read/write helpers below while keeping the hook API intact.
 */

import { useState, useEffect, useCallback } from 'react';

export interface UserProfile {
  displayName: string;
  email: string;
  bio: string;
}

const EMPTY_PROFILE: UserProfile = { displayName: '', email: '', bio: '' };

function storageKey(publicKey: string): string {
  return `agentmarket:profile:${publicKey}`;
}

function readProfile(publicKey: string | null): UserProfile {
  if (!publicKey) return EMPTY_PROFILE;
  try {
    const raw = localStorage.getItem(storageKey(publicKey));
    if (!raw) return EMPTY_PROFILE;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      displayName: parsed.displayName ?? '',
      email: parsed.email ?? '',
      bio: parsed.bio ?? '',
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function useProfile(publicKey: string | null) {
  const [profile, setProfile] = useState<UserProfile>(() => readProfile(publicKey));

  // Re-read whenever the connected wallet changes
  useEffect(() => {
    setProfile(readProfile(publicKey));
  }, [publicKey]);

  const saveProfile = useCallback(
    (updates: Partial<UserProfile>) => {
      if (!publicKey) return;
      const next: UserProfile = { ...profile, ...updates };
      try {
        localStorage.setItem(storageKey(publicKey), JSON.stringify(next));
      } catch {
        // localStorage may be full or unavailable in private-browsing mode;
        // silently degrade – the in-memory state update still goes through.
      }
      setProfile(next);
    },
    [publicKey, profile],
  );

  const clearProfile = useCallback(() => {
    if (!publicKey) return;
    localStorage.removeItem(storageKey(publicKey));
    setProfile(EMPTY_PROFILE);
  }, [publicKey]);

  return { profile, saveProfile, clearProfile };
}
