import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Networks } from '@stellar/stellar-sdk';
import { TransactionStatus } from './TransactionStatus';
import { explorerTxUrl, useTxTracker, type TrackedTx } from '@/lib/txTracker';

const HASH = 'a'.repeat(64);

function tx(overrides: Partial<TrackedTx>): TrackedTx {
  return {
    hash: HASH,
    label: 'post_job',
    status: 'pending',
    networkPassphrase: Networks.TESTNET,
    submittedAt: Date.now(),
    ...overrides,
  };
}

describe('explorerTxUrl', () => {
  it('links to the testnet explorer for the testnet passphrase', () => {
    expect(explorerTxUrl(HASH, Networks.TESTNET)).toBe(
      `https://stellar.expert/explorer/testnet/tx/${HASH}`,
    );
  });

  it('links to the public explorer for the mainnet passphrase', () => {
    expect(explorerTxUrl(HASH, Networks.PUBLIC)).toBe(
      `https://stellar.expert/explorer/public/tx/${HASH}`,
    );
  });

  it('links to the futurenet explorer for the futurenet passphrase', () => {
    expect(explorerTxUrl(HASH, Networks.FUTURENET)).toBe(
      `https://stellar.expert/explorer/futurenet/tx/${HASH}`,
    );
  });
});

describe('TransactionStatus', () => {
  beforeEach(() => {
    useTxTracker.setState({ txs: [] });
  });

  it('renders nothing when there are no transactions', () => {
    const { container } = render(<TransactionStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['pending', 'Pending'],
    ['success', 'Confirmed'],
    ['failed', 'Failed'],
  ] as const)('shows the %s state', (status, label) => {
    useTxTracker.setState({ txs: [tx({ status })] });
    render(<TransactionStatus />);
    expect(screen.getByText(new RegExp(`^${label} ·`))).toBeInTheDocument();
  });

  it('links to the explorer for the network the tx was submitted on', () => {
    useTxTracker.setState({
      txs: [tx({ networkPassphrase: Networks.PUBLIC, status: 'success' })],
    });
    render(<TransactionStatus />);
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/public/tx/${HASH}`,
    );
  });

  it('only allows dismissing finished transactions', () => {
    useTxTracker.setState({ txs: [tx({ status: 'pending' })] });
    const { rerender } = render(<TransactionStatus />);
    expect(screen.queryByRole('button')).toBeNull();

    useTxTracker.setState({ txs: [tx({ status: 'failed' })] });
    rerender(<TransactionStatus />);
    expect(screen.getByRole('button', { name: /dismiss post_job/i })).toBeInTheDocument();
  });
});
