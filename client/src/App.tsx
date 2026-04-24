import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Web3Provider } from "@/lib/web3Provider";
import { useAuth } from "@/lib/authContext";
import NotFound from "@/pages/not-found";
import { useState } from "react";
import { useLocation } from "wouter";

import { SettingsPage } from "@/pages/SettingsPage";
import { SignupPage } from "@/pages/SignupPage";
import { HomePage } from "@/pages/HomePage";
import { FinancesPage } from "@/pages/FinancesPage";
import { RulesPage } from "@/pages/RulesPage";
import { ActivityPage } from "@/pages/ActivityPage";
import { NavigationMenuSection } from "@/pages/sections/NavigationMenuSection";
import { AccountOverviewSection } from "@/pages/sections/AccountOverviewSection";
import { SendModal } from "@/components/SendModal";
import { ExchangeModal } from "@/components/ExchangeModal";
import { NavContext } from "@/lib/navContext";
import { TransactionProvider } from "@/lib/transactionContext";

function AppLayout() {
  const { isLoggedIn, logout } = useAuth();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [accountCollapsed, setAccountCollapsed] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendCardType, setSendCardType] = useState<"wallet" | "bank">("wallet");
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [exchangeCardType, setExchangeCardType] = useState<"wallet" | "bank">("wallet");
  const [focusExchangesTrigger, setFocusExchangesTrigger] = useState(0);
  const [focusSendWithdrawalTrigger, setFocusSendWithdrawalTrigger] = useState<{ seq: number; sourceAccountType: "wallet" | "bank" } | null>(null);
  const [, navigate] = useLocation();

  if (!isLoggedIn) {
    return <SignupPage />;
  }

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <NavContext.Provider value={{
      navCollapsed,
      toggleNav: () => setNavCollapsed((v) => !v),
    }}>
    <div className="bg-shared-colorsheaderfooterbg w-full h-screen flex flex-col overflow-hidden">

      {/* ── Three-panel content row ── */}
      <div className="flex flex-row flex-1 min-h-0 w-full gap-2 px-2 pt-2">
        <NavigationMenuSection
          collapsed={navCollapsed}
          onToggle={() => setNavCollapsed((v) => !v)}
          onLogout={handleLogout}
        />

        <div className="flex-1 min-w-0 min-h-0">
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/finances" component={FinancesPage} />
            <Route path="/rules" component={RulesPage} />
            <Route path="/activity" component={ActivityPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route component={NotFound} />
          </Switch>
        </div>

        <AccountOverviewSection
          collapsed={accountCollapsed}
          onToggle={() => setAccountCollapsed((v) => !v)}
          onSend={(cardType) => { setSendCardType(cardType); setSendOpen(true); }}
          onExchange={(cardType) => { setExchangeCardType(cardType); setExchangeOpen(true); }}
          focusExchangesTrigger={focusExchangesTrigger}
          focusSendWithdrawalTrigger={focusSendWithdrawalTrigger}
        />
      </div>

      {/* ── Footer ── */}
      <footer className="flex w-full h-14 flex-shrink-0 items-center justify-between px-6 py-3 bg-shared-colorsheaderfooterbg">
        <span className="w-fit [font-family:'Gilroy',sans-serif] font-normal text-shared-colorsbaby-blue-60 text-sm tracking-[0] leading-[18px] whitespace-nowrap">
          Copyright © 2025 Brain Finance. All rights reserved.
        </span>
        <img className="flex-[0_0_auto]" alt="Socials" src="/figmaAssets/socials.svg" />
      </footer>

      <SendModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        sourceAccountType={sendCardType}
        onConfirmed={(type) =>
          setFocusSendWithdrawalTrigger(prev => ({ seq: (prev?.seq ?? 0) + 1, sourceAccountType: type }))
        }
      />
      <ExchangeModal
        open={exchangeOpen}
        onClose={() => setExchangeOpen(false)}
        onConfirmed={() => setFocusExchangesTrigger(n => n + 1)}
        accountType={exchangeCardType}
      />
    </div>
    </NavContext.Provider>
  );
}

function App() {
  return (
    <Web3Provider>
      <TransactionProvider>
        <TooltipProvider>
          <Toaster />
          <AppLayout />
        </TooltipProvider>
      </TransactionProvider>
    </Web3Provider>
  );
}

export default App;
