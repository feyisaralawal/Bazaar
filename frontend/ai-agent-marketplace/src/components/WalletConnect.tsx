import React from 'react';
import { Button } from './ui/Button';
import { Wallet } from 'lucide-react';

interface WalletConnectProps {
  onConnect: () => void;
  /**
   * When `prominent` is true the button uses the primary filled style so it
   * stands out as the main CTA in the nav bar when no wallet is connected.
   * Defaults to false (outline style) for in-page usage.
   */
  prominent?: boolean;
}

export const WalletConnect: React.FC<WalletConnectProps> = ({
  onConnect,
  prominent = false,
}) => {
  return (
    <Button
      onClick={onConnect}
      variant={prominent ? 'default' : 'outline'}
      className={
        prominent
          ? 'font-semibold shadow-md gap-2 bg-primary text-primary-foreground hover:bg-primary/90'
          : 'font-semibold gap-2'
      }
    >
      <Wallet className="h-4 w-4" aria-hidden="true" />
      Connect Wallet
    </Button>
  );
};
