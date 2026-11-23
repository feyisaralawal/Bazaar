import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useWallet } from '../contexts/WalletContext';

/**
 * Blocking banner shown while Freighter is on a different Stellar network than
 * the one this build targets. Transactions would fail to sign, so all
 * mutations are disabled (see `networkMismatch` in WalletContext) until the
 * user switches networks in the wallet.
 */
export const NetworkMismatchBanner: React.FC = () => {
  const { networkMismatch } = useWallet();
  if (!networkMismatch) return null;

  const { expectedLabel, actualLabel } = networkMismatch;

  return (
    <div
      role="alert"
      data-testid="network-mismatch-banner"
      className="w-full border-b border-red-700 bg-red-600 px-4 py-3 text-white"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3 text-sm">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">
            Wrong wallet network: Freighter is on {actualLabel}, but this app uses {expectedLabel}.
          </p>
          <p className="mt-1">
            Open Freighter, click the network selector at the top of the extension and choose{' '}
            <strong>{expectedLabel}</strong>. Posting jobs, bidding, and every other action that
            needs a signature are disabled until the networks match. This page updates
            automatically once you switch.
          </p>
        </div>
      </div>
    </div>
  );
};
