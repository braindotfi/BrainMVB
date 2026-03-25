import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { Marketplace } from "@/pages/Marketplace";
import { AssistantPage } from "@/pages/AssistantPage";
import { AgentsActivityPage } from "@/pages/AgentsActivityPage";
import { LaunchpadPage } from "@/pages/LaunchpadPage";
import { AgentDetailPage } from "@/pages/AgentDetailPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { NavigationMenuSection } from "@/pages/sections/NavigationMenuSection";
import { AccountOverviewSection } from "@/pages/sections/AccountOverviewSection";
import { CreateAgentModal } from "@/components/CreateAgentModal";
import { SendModal } from "@/components/SendModal";
import { ExchangeModal } from "@/components/ExchangeModal";
import { NavContext } from "@/lib/navContext";

function AppLayout() {
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [accountCollapsed, setAccountCollapsed] = useState(false);
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);

  return (
    <NavContext.Provider value={{ navCollapsed, toggleNav: () => setNavCollapsed((v) => !v) }}>
    <div className="bg-shared-colorsheaderfooterbg w-full h-screen flex flex-col overflow-hidden">

      {/* ── Three-panel content row ── */}
      <div className="flex flex-row flex-1 min-h-0 w-full gap-2 px-2 pt-2">
        <NavigationMenuSection
          collapsed={navCollapsed}
          onToggle={() => setNavCollapsed((v) => !v)}
          onCreateAgent={() => setCreateAgentOpen(true)}
        />

        <div className="flex-1 min-w-0 min-h-0">
          <Switch>
            <Route path="/" component={AssistantPage} />
            <Route path="/assistant" component={AssistantPage} />
            <Route path="/agents" component={AgentsActivityPage} />
            <Route path="/launchpad" component={LaunchpadPage} />
            <Route path="/agent/:id" component={AgentDetailPage} />
            <Route path="/notifications" component={NotificationsPage} />
            <Route component={NotFound} />
          </Switch>
        </div>

        <AccountOverviewSection
          collapsed={accountCollapsed}
          onToggle={() => setAccountCollapsed((v) => !v)}
          onCreateAgent={() => setCreateAgentOpen(true)}
          onSend={() => setSendOpen(true)}
          onExchange={() => setExchangeOpen(true)}
        />
      </div>

      {/* ── Footer ── */}
      <footer className="flex w-full h-14 flex-shrink-0 items-center justify-between px-6 py-3 bg-shared-colorsheaderfooterbg">
        <span className="w-fit [font-family:'Mont-Regular',Helvetica] font-normal text-shared-colorsbaby-blue-60 text-sm tracking-[0] leading-[18px] whitespace-nowrap">
          Copyright © 2025 Brain Finance. All rights reserved.
        </span>
        <img className="flex-[0_0_auto]" alt="Socials" src="/figmaAssets/socials.svg" />
      </footer>

      <CreateAgentModal
        open={createAgentOpen}
        onClose={() => setCreateAgentOpen(false)}
      />
      <SendModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
      />
      <ExchangeModal
        open={exchangeOpen}
        onClose={() => setExchangeOpen(false)}
      />
    </div>
    </NavContext.Provider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppLayout />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
