import { useState } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Web3Provider } from "@/lib/web3Provider";
import { useAuth } from "@/lib/authContext";
import NotFound from "@/pages/not-found";

import { AgentsActivityPage } from "@/pages/AgentsActivityPage";
import { AgentManagePage } from "@/pages/AgentManagePage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { AgentDetailPage } from "@/pages/AgentDetailPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { AssistantPage } from "@/pages/AssistantPage";
import { Marketplace } from "@/pages/Marketplace";
import { SignupPage } from "@/pages/SignupPage";
import { NavigationMenuSection } from "@/pages/sections/NavigationMenuSection";
import { AccountOverviewSection } from "@/pages/sections/AccountOverviewSection";
import { CreateAgentModal } from "@/components/CreateAgentModal";
import { SendModal } from "@/components/SendModal";
import { ExchangeModal } from "@/components/ExchangeModal";
import { NavContext, AgentPrefillData } from "@/lib/navContext";
import { TransactionProvider } from "@/lib/transactionContext";

function AppLayout() {
  const { isLoggedIn, logout } = useAuth();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [accountCollapsed, setAccountCollapsed] = useState(false);
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [agentEditStep, setAgentEditStep] = useState<number>(0);
  const [agentEditPrefill, setAgentEditPrefill] = useState<AgentPrefillData | undefined>(undefined);
  const [agentEditId, setAgentEditId] = useState<string | undefined>(undefined);
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

  const openCreateAgentAtStep = (step: number, prefill?: AgentPrefillData, agentId?: string) => {
    setAgentEditStep(step);
    setAgentEditPrefill(prefill);
    setAgentEditId(agentId);
    setCreateAgentOpen(true);
  };

  return (
    <NavContext.Provider value={{
      navCollapsed,
      toggleNav: () => setNavCollapsed((v) => !v),
      openCreateAgentAtStep,
    }}>
    <div className="bg-shared-colorsheaderfooterbg w-full h-screen flex flex-col overflow-hidden">

      {/* ── Three-panel content row ── */}
      <div className="flex flex-row flex-1 min-h-0 w-full gap-2 px-2 pt-2">
        <NavigationMenuSection
          collapsed={navCollapsed}
          onToggle={() => setNavCollapsed((v) => !v)}
          onCreateAgent={() => setCreateAgentOpen(true)}
          onLogout={handleLogout}
        />

        <div className="flex-1 min-w-0 min-h-0">
          <Switch>
            <Route path="/" component={DashboardPage} />
            <Route path="/dashboard" component={DashboardPage} />
            <Route path="/assistant" component={AssistantPage} />
            <Route path="/marketplace" component={Marketplace} />
            <Route path="/perks">{() => <Redirect to="/dashboard" />}</Route>
            <Route path="/agents" component={AgentsActivityPage} />
            <Route path="/manage/:id" component={AgentManagePage} />
            <Route path="/notifications" component={NotificationsPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/agent/:id" component={AgentDetailPage} />
            <Route component={NotFound} />
          </Switch>
        </div>

        <AccountOverviewSection
          collapsed={accountCollapsed}
          onToggle={() => setAccountCollapsed((v) => !v)}
          onCreateAgent={() => setCreateAgentOpen(true)}
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

      <CreateAgentModal
        open={createAgentOpen}
        onClose={() => {
          setCreateAgentOpen(false);
          setAgentEditStep(0);
          setAgentEditPrefill(undefined);
          setAgentEditId(undefined);
        }}
        onViewMyAgents={() => {
          setCreateAgentOpen(false);
          setAgentEditStep(0);
          setAgentEditPrefill(undefined);
          setAgentEditId(undefined);
          navigate("/agents?tab=my-agents");
        }}
        initialStep={agentEditStep}
        prefill={agentEditPrefill}
        agentId={agentEditId}
      />
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
