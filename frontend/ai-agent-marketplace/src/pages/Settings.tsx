import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Textarea } from '@/components/ui/Textarea';
import { useWallet } from '@/contexts/WalletContext';
import { useStellar } from '@/contexts/StellarContext';
import { 
  Wallet, User, Shield, Settings as SettingsIcon, Bell, Key, 
  LogOut, Moon, Sun, Globe, ShieldCheck, 
  CreditCard, History, Download, Upload, Eye, EyeOff,
  Activity, FileText, Star, CheckCircle
} from 'lucide-react';
import { clsx } from 'clsx';

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { publicKey, isConnected, disconnect, usdcBalance, xlmBalance } = useWallet();
  const { getContractClient } = useStellar();
  const [activeTab, setActiveTab] = useState<'profile' | 'wallet' | 'notifications' | 'security' | 'appearance'>('profile');
  const { theme, setTheme, isDark } = useTheme();
  const [notifications, setNotifications] = useState({
    emailJobUpdates: true,
    emailBidUpdates: true,
    emailDisputes: true,
    pushJobUpdates: true,
    pushBidUpdates: true,
    pushDisputes: true,
    weeklyDigest: false,
  });
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Connect Wallet Required</h2>
            <p className="text-muted-foreground mb-6">
              You need to connect your Stellar wallet to access settings.
            </p>
            <Button onClick={() => navigate('/marketplace')}>Go to Marketplace</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const shortAddress = `${publicKey?.slice(0, 6)}...${publicKey?.slice(-4)}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <h1 className="text-xl font-bold">Settings</h1>
            <Button variant="ghost" onClick={disconnect} className="gap-2">
              <LogOut className="h-4 w-4" />
              Disconnect
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="profile"><User className="h-4 w-4 mr-2" /> Profile</TabsTrigger>
            <TabsTrigger value="wallet"><Wallet className="h-4 w-4 mr-2" /> Wallet</TabsTrigger>
            <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-2" /> Notifications</TabsTrigger>
            <TabsTrigger value="security"><Shield className="h-4 w-4 mr-2" /> Security</TabsTrigger>
            <TabsTrigger value="appearance"><SettingsIcon className="h-4 w-4 mr-2" /> Appearance</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>Manage your public profile and account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                    {publicKey?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <h3 className="text-lg font-medium">Connected Account</h3>
                    <p className="font-mono text-sm text-muted-foreground">{shortAddress}</p>
                    <p className="text-xs text-muted-foreground mt-1">Stellar Public Key</p>
                  </div>
                </div>

                <div className="border-t pt-6 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Input label="Display Name" placeholder="Your Name" defaultValue="" />
                    <Input label="Email" type="email" placeholder="you@example.com" defaultValue="" />
                  </div>
                  <Textarea label="Bio" placeholder="Tell others about yourself..." rows={3} defaultValue="" />
                  <div className="flex gap-2">
                    <Button variant="outline">Save Changes</Button>
                    <Button variant="ghost">Cancel</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Activity Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Jobs Posted" value="12" icon={FileText} />
                  <StatCard label="Jobs Completed" value="8" icon={ShieldCheck} />
                  <StatCard label="Total Spent" value="$2,450" icon={CreditCard} />
                  <StatCard label="Avg Rating Given" value="4.8" icon={Star} color="text-yellow-500" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Wallet Tab */}
          <TabsContent value="wallet" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Wallet Balance
                </CardTitle>
                <CardDescription>Your balances on the Stellar network</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-6 bg-gradient-to-r from-primary/10 to-stellar/10 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">USDC Balance</p>
                      <p className="text-4xl font-bold text-foreground">
                        ${parseFloat(usdcBalance || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        XLM: {parseFloat(xlmBalance || '0').toLocaleString(undefined, { minimumFractionDigits: 7, maximumFractionDigits: 7 })} XLM
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" /> Withdraw
                      </Button>
                      <Button size="sm">
                        <Upload className="h-4 w-4 mr-2" /> Deposit
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <Card className="border-green-500/20 bg-green-500/5">
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Escrow Held</p>
                      <p className="text-2xl font-bold text-green-500">$1,200.00</p>
                      <p className="text-xs text-muted-foreground mt-1">Across 3 active jobs</p>
                    </CardContent>
                  </Card>
                  <Card className="border-blue-500/20 bg-blue-500/5">
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Pending Release</p>
                      <p className="text-2xl font-bold text-blue-500">$0.00</p>
                      <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="border-t pt-6">
                  <h4 className="font-medium mb-3">Transaction History</h4>
                  <div className="space-y-3">
                    <TransactionRow type="deposit" amount="+$500.00" desc="USDC Deposit from Exchange" date="2 hours ago" status="completed" />
                    <TransactionRow type="escrow" amount="-$800.00" desc="Escrow for Job #42" date="1 day ago" status="held" />
                    <TransactionRow type="release" amount="+$450.00" desc="Payment released from Job #38" date="3 days ago" status="completed" />
                    <TransactionRow type="fee" amount="-$4.50" desc="Platform fee (Job #38)" date="3 days ago" status="completed" />
                  </div>
                  <Button variant="ghost" className="w-full mt-4">View Full History</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Methods
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <CreditCard className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-medium">Stellar USDC</p>
                        <p className="text-sm text-muted-foreground">Native Stellar Asset</p>
                      </div>
                    </div>
                    <Badge variant="default" className="bg-green-500/10 text-green-500">Primary</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    All payments on this marketplace use USDC on the Stellar network. 
                    Make sure your wallet has sufficient USDC balance for escrow deposits.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notification Preferences
                </CardTitle>
                <CardDescription>Choose how you want to be notified about marketplace activity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <NotificationSection title="Email Notifications" icon="📧" items={[
                  { key: 'emailJobUpdates', label: 'Job Updates', desc: 'New bids, job status changes, deliverable submissions' },
                  { key: 'emailBidUpdates', label: 'Bid Updates', desc: 'When your bids are accepted, rejected, or outbid' },
                  { key: 'emailDisputes', label: 'Disputes', desc: 'Dispute notifications and resolution updates' },
                ]} notifications={notifications} setNotifications={setNotifications} />
                
                <NotificationSection title="Push Notifications" icon="🔔" items={[
                  { key: 'pushJobUpdates', label: 'Job Updates', desc: 'Real-time updates on your jobs and bids' },
                  { key: 'pushBidUpdates', label: 'Bid Updates', desc: 'Instant notification when bid status changes' },
                  { key: 'pushDisputes', label: 'Disputes', desc: 'Urgent dispute notifications requiring action' },
                ]} notifications={notifications} setNotifications={setNotifications} />

                <div className="border-t pt-6">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={notifications.weeklyDigest}
                      onChange={e => setNotifications(prev => ({ ...prev, weeklyDigest: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <div>
                      <p className="font-medium">Weekly Digest</p>
                      <p className="text-sm text-muted-foreground">Receive a weekly summary of marketplace activity every Monday</p>
                    </div>
                  </label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Account Security
                </CardTitle>
                <CardDescription>Manage your authentication and access settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <SecurityItem 
                    title="Two-Factor Authentication" 
                    desc="Add an extra layer of security to your account"
                    action={<Button variant="outline" size="sm">Enable 2FA</Button>}
                    status="disabled"
                  />
                  <SecurityItem 
                    title="Passkey / WebAuthn" 
                    desc="Use biometric authentication for faster, secure login"
                    action={<Button variant="outline" size="sm">Add Passkey</Button>}
                    status="available"
                  />
                  <SecurityItem 
                    title="Session Management" 
                    desc="View and revoke active sessions"
                    action={<Button variant="ghost" size="sm">View Sessions</Button>}
                    status="active"
                  />
                </div>

                <div className="border-t pt-6">
                  <h4 className="font-medium mb-3">Connected Wallets</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Wallet className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">Freighter</p>
                          <p className="text-sm text-muted-foreground font-mono">{shortAddress}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="success">Active</Badge>
                        <Button variant="ghost" size="icon">
                          <EyeOff className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" className="mt-4">Connect Another Wallet</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-destructive/20 bg-destructive/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <Shield className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-background">
                  <div>
                    <p className="font-medium text-destructive">Delete Account</p>
                    <p className="text-sm text-muted-foreground">Permanently delete your account and all data. This action cannot be undone.</p>
                  </div>
                  <Button variant="destructive" size="sm">Delete Account</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Moon className="h-5 w-5" />
                  Theme
                </CardTitle>
                <CardDescription>Choose your preferred color scheme</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <ThemeOption 
                    name="Light" 
                    icon={Sun} 
                    selected={theme === 'light'} 
                    onClick={() => setTheme('light')} 
                  />
                  <ThemeOption 
                    name="Dark" 
                    icon={Moon} 
                    selected={theme === 'dark'} 
                    onClick={() => setTheme('dark')} 
                  />
                  <ThemeOption 
                    name="System" 
                    icon={Globe} 
                    selected={theme === 'system'} 
                    onClick={() => setTheme('system')} 
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Language & Region
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <select className="input" defaultValue="en">
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="zh">Chinese</option>
                    <option value="ja">Japanese</option>
                  </select>
                  <select className="input" defaultValue="US">
                    <option value="US">United States</option>
                    <option value="EU">European Union</option>
                    <option value="UK">United Kingdom</option>
                    <option value="SG">Singapore</option>
                    <option value="HK">Hong Kong</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SettingsIcon className="h-5 w-5" />
                  Data & Privacy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Analytics</p>
                    <p className="text-sm text-muted-foreground">Allow anonymous usage analytics to improve the platform</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Marketing Emails</p>
                    <p className="text-sm text-muted-foreground">Receive updates about new features and marketplace news</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
                <Button variant="outline">Download My Data</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; color?: string }) {
  return (
    <div className="p-4 bg-muted/50 rounded-lg">
      <Icon className={clsx('h-5 w-5 text-muted-foreground mb-2', color)} />
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function TransactionRow({ type, amount, desc, date, status }: { 
  type: string; 
  amount: string; 
  desc: string; 
  date: string; 
  status: string; 
}) {
  const icons = {
    deposit: { icon: '⬇️', color: 'text-green-500' },
    escrow: { icon: '🔒', color: 'text-blue-500' },
    release: { icon: '⬆️', color: 'text-green-500' },
    fee: { icon: '💸', color: 'text-orange-500' },
  };
  const { icon, color } = icons[type as keyof typeof icons] || { icon: '💰', color: '' };

  return (
    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div>
          <p className="font-medium text-sm">{desc}</p>
          <p className="text-xs text-muted-foreground">{date}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={clsx('font-medium', color)}>{amount}</p>
        <Badge variant={status === 'held' ? 'outline' : 'default'} className="text-xs mt-1">
          {status}
        </Badge>
      </div>
    </div>
  );
}

function NotificationSection({ title, icon, items, notifications, setNotifications }: { 
  title: string; 
  icon: string; 
  items: { key: string; label: string; desc: string }[];
  notifications: any;
  setNotifications: React.Dispatch<React.SetStateAction<any>>;
}) {
  return (
    <div>
      <h4 className="flex items-center gap-2 font-medium mb-4">
        <span className="text-xl">{icon}</span>
        {title}
      </h4>
      <div className="space-y-3">
        {items.map(item => (
          <label key={item.key} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
            <input
              type="checkbox"
              checked={notifications[item.key]}
              onChange={e => setNotifications(prev => ({ ...prev, [item.key]: e.target.checked }))}
              className="h-4 w-4 mt-0.5 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <div className="flex-1">
              <p className="font-medium">{item.label}</p>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function SecurityItem({ title, desc, action, status }: { 
  title: string; 
  desc: string; 
  action: React.ReactNode; 
  status: 'active' | 'disabled' | 'available';
}) {
  const statusConfig = {
    active: { color: 'text-green-500', bg: 'bg-green-500/10', label: 'Enabled' },
    disabled: { color: 'text-gray-500', bg: 'bg-gray-500/10', label: 'Disabled' },
    available: { color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Available' },
  }[status];

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="outline" className={statusConfig.bg + ' ' + statusConfig.color}>
          {statusConfig.label}
        </Badge>
        {action}
      </div>
    </div>
  );
}

function ThemeOption({ name, icon: Icon, selected, onClick }: { 
  name: string; 
  icon: React.ComponentType<{ className?: string }>; 
  selected: boolean; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2',
        selected 
          ? 'border-primary bg-primary/5' 
          : 'border-muted hover:border-primary/50'
      )}
    >
      <Icon className={clsx('h-6 w-6', selected ? 'text-primary' : 'text-muted-foreground')} />
      <span className="font-medium">{name}</span>
      {selected && <CheckCircle className="h-4 w-4 text-primary" />}
    </button>
  );
}