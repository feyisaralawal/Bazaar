import React, { useState } from 'react';
import { Outlet, Link, useLocation, NavLink, useNavigate } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { Button } from './ui/Button';
import { WalletConnect } from './WalletConnect';
import { UserMenu } from './UserMenu';
import { Lock } from 'lucide-react';

/**
 * nav items that require a connected wallet carry `auth: true`.
 * When the wallet is NOT connected those items are rendered with a lock
 * badge and a tooltip instead of being hidden outright, so the user can
 * still discover what the platform offers without being confused by a
 * suddenly shorter nav list.
 */
const NAV_ITEMS = [
  { path: '/marketplace', label: 'Marketplace', icon: '🏪', auth: false },
  { path: '/create-job',       label: 'Post Job',        icon: '📝', auth: true },
  { path: '/register-agent',   label: 'Register Agent',  icon: '🤖', auth: true },
  { path: '/dashboard',        label: 'Dashboard',       icon: '📊', auth: true },
] as const;

export const Layout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isConnected, connect } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Clicking a locked nav item scrolls users to the top-of-page connect
   * button (mobile) or triggers the wallet connect flow directly.
   */
  const handleLockedClick = (e: React.MouseEvent) => {
    e.preventDefault();
    connect();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav
          className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4"
          aria-label="Main navigation"
        >
          {/* Brand */}
          <Link to="/marketplace" className="flex items-center space-x-2">
            <span className="text-2xl">🤖</span>
            <span className="text-xl font-bold text-primary">AgentMarket</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex md:items-center md:space-x-6">
            {NAV_ITEMS.map((item) => {
              const isLocked = item.auth && !isConnected;

              if (isLocked) {
                return (
                  /* Locked item — not a real link; clicking triggers connect */
                  <button
                    key={item.path}
                    onClick={handleLockedClick}
                    title="Connect wallet to access"
                    aria-label={`${item.label} – connect wallet to access`}
                    className="group relative flex items-center space-x-1 text-sm font-medium text-muted-foreground/50 cursor-pointer select-none transition-colors hover:text-muted-foreground"
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    <Lock className="ml-1 h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                    {/* Tooltip */}
                    <span
                      className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background opacity-0 group-hover:opacity-100 transition-opacity z-50"
                      role="tooltip"
                    >
                      Connect wallet to access
                    </span>
                  </button>
                );
              }

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center space-x-1 text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`
                  }
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>

          {/* Right side: wallet / connect */}
          <div className="flex items-center space-x-4">
            {isConnected ? (
              <UserMenu />
            ) : (
              /* Primary-style connect button when no wallet is connected so it
                 stands out and clearly signals the primary CTA on the page. */
              <WalletConnect onConnect={connect} prominent />
            )}

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-lg text-muted-foreground hover:bg-accent"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t px-4 py-4 space-y-2">
            {NAV_ITEMS.map((item) => {
              const isLocked = item.auth && !isConnected;

              if (isLocked) {
                return (
                  <button
                    key={item.path}
                    onClick={(e) => {
                      handleLockedClick(e);
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground/50 hover:bg-accent/50 transition-colors"
                    title="Connect wallet to access"
                  >
                    <span className="flex items-center space-x-2">
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </span>
                    <Lock className="h-3 w-3 opacity-60" aria-hidden="true" />
                  </button>
                );
              }

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent'
                    }`
                  }
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              );
            })}

            {/* Show inline connect in mobile menu when not connected */}
            {!isConnected && (
              <div className="pt-2 border-t">
                <WalletConnect onConnect={() => { connect(); setIsMobileMenuOpen(false); }} prominent />
              </div>
            )}
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-muted-foreground">
          <p>Built on Stellar Soroban • AI Agent Marketplace</p>
        </div>
      </footer>
    </div>
  );
};
