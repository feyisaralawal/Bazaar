import React, { useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { useProfile } from '../hooks/useProfile';
import { Button } from './ui/Button';
import { Link } from 'react-router-dom';

export const UserMenu: React.FC = () => {
  const { publicKey, disconnect } = useWallet();
  const { profile } = useProfile(publicKey);
  const [isOpen, setIsOpen] = useState(false);

  const shortAddr = publicKey
    ? `${publicKey.substring(0, 6)}...${publicKey.substring(publicKey.length - 4)}`
    : '';

  /**
   * Display the saved display name when available; fall back to the
   * truncated public key so the button always has a meaningful label.
   */
  const displayLabel = profile.displayName.trim() || shortAddr;

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 border-primary/40 bg-card/60"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
        <span className="max-w-[140px] truncate">{displayLabel}</span>
      </Button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-48 rounded-xl border bg-card p-2 shadow-xl z-50"
          role="menu"
          onClick={() => setIsOpen(false)}
        >
          {/* Show full address as context when a display name is set */}
          {profile.displayName.trim() && (
            <p className="px-3 py-1 text-xs text-muted-foreground font-mono truncate">
              {shortAddr}
            </p>
          )}
          <Link
            to="/dashboard"
            role="menuitem"
            className="block px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
          >
            📊 Dashboard
          </Link>
          <Link
            to="/settings"
            role="menuitem"
            className="block px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
          >
            ⚙️ Settings
          </Link>
          <hr className="my-1 border-border" />
          <button
            role="menuitem"
            onClick={disconnect}
            className="w-full text-left px-3 py-2 text-sm rounded-lg text-rose-400 hover:bg-rose-950/30 transition-colors"
          >
            🚪 Disconnect
          </button>
        </div>
      )}
    </div>
  );
};
