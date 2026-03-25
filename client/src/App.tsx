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
import { HeaderFooterSection } from "@/pages/sections/HeaderFooterSection";
import { NavigationMenuSection } from "@/pages/sections/NavigationMenuSection";
import { AccountOverviewSection } from "@/pages/sections/AccountOverviewSection";
import { CreateAgentModal } from "@/components/CreateAgentModal";
import { SendModal } from "@/components/SendModal";
import { ExchangeModal } from "@/components/ExchangeModal";

function AppLayout() {
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [accountCollapsed, setAccountCollapsed] = useState(false);
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);

  return (
    <div className="bg-shared-colorsheaderfooterbg w-full min-h-screen flex flex-col">
      <HeaderFooterSection />

      <div className="flex flex-row flex-1 w-full gap-2 px-2 py-2">
        <NavigationMenuSection
          collapsed={navCollapsed}
          onToggle={() => setNavCollapsed((v) => !v)}
          onCreateAgent={() => setCreateAgentOpen(true)}
        />

        <div className="flex-1 min-w-0 min-h-[calc(100vh-130px)]">
          <Switch>
              <Route path="/" component={Marketplace} />
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

      <footer className="flex w-full h-14 items-center justify-between px-6 py-3 bg-shared-colorsheaderfooterbg">
        <div className="inline-flex items-center gap-3 flex-[0_0_auto]">
          <img
            className="w-[57.74px] h-[46.01px] mt-[-2.01px] mb-[-12.00px] ml-[-2.51px]"
            alt="Frame"
            src="/figmaAssets/frame-1000002162.svg"
          />
          <span className="w-fit [font-family:'Mont-Regular',Helvetica] font-normal text-shared-colorsbaby-blue-60 text-sm text-right tracking-[0] leading-[18px] whitespace-nowrap">
            Copyright © 2025 Brain Finance. All rights reserved.
          </span>
        </div>
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
