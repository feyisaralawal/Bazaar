import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as freighter from '@stellar/freighter-api';
import { Horizon } from '@stellar/stellar-sdk';

export type NetworkType = string;

// Circle USDC issuers — keep these as constants so they're easy to audit
const USDC_ISSUER_TESTNET = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC_ISSUER_MAINNET = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

const getHorizonUrl = (network: string | null) =>
  network === 'PUBLIC'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';

interface Balances {
  /** Native XLM balance as a decimal string, e.g. "9.9999900" */
  xlmBalance: string;
  /** USDC balance as a decimal string, or "0" when no trustline exists */
  usdcBalance: string;
}

/**
 * Fetch both the native XLM balance and the Circle USDC trustline balance
 * for a given account.  Returns "0" for whichever asset is absent rather
 * than throwing, so callers never need to guard against undefined.
 */
const fetchBalances = async (
  publicKey: string,
  network: string | null,
): Promise<Balances> => {
  try {
    const server = new Horizon.Server(getHorizonUrl(network));
    const account = await server.loadAccount(publicKey);

    const native = account.balances.find((b) => b.asset_type === 'native');
    const xlmBalance = native?.balance ?? '0';

    const usdcIssuer =
      network === 'PUBLIC' ? USDC_ISSUER_MAINNET : USDC_ISSUER_TESTNET;

    const usdc = account.balances.find(
      (b) =>
        b.asset_type === 'credit_alphanum4' &&
        b.asset_code === 'USDC' &&
        b.asset_issuer === usdcIssuer,
    );
    const usdcBalance = usdc?.balance ?? '0';

    return { xlmBalance, usdcBalance };
  } catch {
    return { xlmBalance: '0', usdcBalance: '0' };
  }
};

interface WalletState {
  publicKey: string | null;
  network: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  /** Native XLM balance */
  xlmBalance: string;
  /** Circle USDC balance (zero when no trustline exists) */
  usdcBalance: string;
  isLoading: boolean;
  availableNetworks: string[];
}

interface WalletContextType extends WalletState {
  connect: (network?: string) => Promise<void>;
  disconnect: () => void;
  signTransaction: (xdr: string, opts?: any) => Promise<string>;
  signAuthEntry: (xdr: string, address: string, networkPassphrase: string) => Promise<string>;
  switchNetwork: (network: string) => Promise<void>;
  refreshBalance: () => Promise<void>;
  isFreighterInstalled: boolean;
}

const WalletContext = createContext<WalletContextType | null>(null);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within WalletProvider');
  return context;
};

const INITIAL_STATE: WalletState = {
  publicKey: null,
  network: 'TESTNET',
  isConnected: false,
  isConnecting: false,
  xlmBalance: '0',
  usdcBalance: '0',
  isLoading: false,
  availableNetworks: ['TESTNET', 'PUBLIC'],
};

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<WalletState>(INITIAL_STATE);
  const [isFreighterInstalled, setIsFreighterInstalled] = useState(false);

  const checkConnection = useCallback(async () => {
    try {
      const isConnected = await freighter.isConnected();
      setIsFreighterInstalled(Boolean(isConnected));
      if (isConnected) {
        const publicKey = await freighter.getPublicKey();
        if (publicKey) {
          setState((prev) => ({
            ...prev,
            publicKey,
            isConnected: true,
          }));
        }
      }
    } catch (err) {
      console.warn('Freighter connection check error:', err);
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const connect = async () => {
    setState((prev) => ({ ...prev, isConnecting: true }));
    try {
      const publicKey = await freighter.getPublicKey();
      const { xlmBalance, usdcBalance } = await fetchBalances(publicKey, state.network);
      setState((prev) => ({
        ...prev,
        publicKey,
        xlmBalance,
        usdcBalance,
        isConnected: true,
        isConnecting: false,
      }));
    } catch (err) {
      console.error('Failed to connect Freighter wallet:', err);
      setState((prev) => ({ ...prev, isConnecting: false }));
    }
  };

  const disconnect = () => {
    setState(INITIAL_STATE);
  };

  const signTransaction = async (xdr: string, opts?: any): Promise<string> => {
    const result = await freighter.signTransaction(xdr, opts);
    return result.signedTxXdr;
  };

  const signAuthEntry = async (
    xdr: string,
    address: string,
    networkPassphrase: string,
  ): Promise<string> => {
    const result = await freighter.signAuthEntry(xdr, {
      accountToSign: address,
      networkPassphrase,
    });
    return result.signedAuthEntry;
  };

  const switchNetwork = async (net: string) => {
    setState((prev) => ({ ...prev, network: net }));
  };

  const refreshBalance = async () => {
    if (!state.publicKey) return;
    setState((prev) => ({ ...prev, isLoading: true }));
    const { xlmBalance, usdcBalance } = await fetchBalances(
      state.publicKey,
      state.network,
    );
    setState((prev) => ({ ...prev, xlmBalance, usdcBalance, isLoading: false }));
  };

  return (
    <WalletContext.Provider
      value={{
        ...state,
        connect,
        disconnect,
        signTransaction,
        signAuthEntry,
        switchNetwork,
        refreshBalance,
        isFreighterInstalled,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
