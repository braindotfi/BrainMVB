import { Switch, Route, useRoute } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppAlertProvider } from "@/components/AppAlert";
import { Web3Provider } from "@/lib/web3Provider";
import { useAuth } from "@/lib/authContext";
import NotFound from "@/pages/not-found";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useSessionTimeout } from "@/lib/sessionTimeoutContext";
import { useAppAlert } from "@/components/AppAlert";

import { useQuery } from "@tanstack/react-query";
import { SettingsPage } from "@/pages/SettingsPage";
import { SignupPage } from "@/pages/SignupPage";
import { CompanySetupPage } from "@/pages/CompanySetupPage";
import { HomePage } from "@/pages/HomePage";
import { FinancesPage } from "@/pages/FinancesPage";
import { ReviewPage } from "@/pages/ReviewPage";
import { RulesPage } from "@/pages/RulesPage";
import { RuleDetail } from "@/pages/RuleDetail";
import { VendorsPage } from "@/pages/VendorsPage";
import { ActivityPage } from "@/pages/ActivityPage";
import { AuditLogPage } from "@/pages/AuditLogPage";
import { NavigationMenuSection } from "@/pages/sections/NavigationMenuSection";
import { BrainAssistant } from "@/pages/sections/BrainAssistant";
import { AddSourceModal } from "@/components/AddSourceModal";
import { NavContext } from "@/lib/navContext";
import { TransactionProvider } from "@/lib/transactionContext";
import { IntentsProvider } from "@/lib/intentsStore";
import { MemberDetailHost } from "@/components/MemberDetailPopup";
import { hydrateDocuments } from "@/lib/documentsStore";

function AppLayout() {
  const { isLoggedIn, isLoading, logout } = useAuth();
  const { timeoutMin } = useSessionTimeout();
  const alert = useAppAlert();
  const [, navigate] = useLocation();
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs hold the latest function/value references so the listener-binding
  // effect below depends only on `isLoggedIn` + `timeoutMin` and does not
  // re-bind window listeners every render.
  const logoutRef = useRef(logout);
  const navigateRef = useRef(navigate);
  const alertRef = useRef(alert);
  useEffect(() => { logoutRef.current = logout; }, [logout]);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  useEffect(() => { alertRef.current = alert; }, [alert]);

  // Inactivity-based auto-logout. Resets on any user interaction.
  useEffect(() => {
    if (!isLoggedIn) return;
    const timeoutMs = timeoutMin * 60 * 1000;

    const triggerLogout = () => {
      logoutRef.current();
      navigateRef.current("/");
      alertRef.current.info(
        "Session Expired",
        `You were logged out due to inactivity to help protect your financial data.`,
        5000,
      );
    };

    const reset = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(triggerLogout, timeoutMs);
    };

    const events: (keyof WindowEventMap)[] = [
      "mousedown", "mousemove", "keydown", "touchstart", "touchmove", "scroll", "wheel",
    ];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [isLoggedIn, timeoutMin]);

  if (isLoading) {
    return (
      <div className="bg-shared-colorsheaderfooterbg w-full h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#1d2132] border-t-[#7631ee] animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <SignupPage />;
  }

  return <TenancyGate onLogout={() => { logout(); navigate("/"); }} />;
}

/* Production tenancy gate (Phase 2): once platform auth succeeds, check whether this
   user is linked to a brain-core tenant. In production mode an unlinked user is routed
   to "Create a company / Enter your invite link" - never auto-provisioned. In demo mode
   this is a no-op (linked:true). */
function TenancyGate({ onLogout }: { onLogout: () => void }) {
  const { data, isLoading } = useQuery<{ mode: string; linked: boolean }>({
    queryKey: ["/api/brain/tenancy"],
    staleTime: 60_000,
  });
  const [onInviteRoute] = useRoute("/invite/:token");

  if (isLoading) {
    return (
      <div className="bg-shared-colorsheaderfooterbg w-full h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#1d2132] border-t-[#7631ee] animate-spin" />
      </div>
    );
  }

  // Production only: unlinked users always land on setup; an invite link also opens it
  // explicitly (already-linked users get core's honest "already belongs" refusal if they
  // try to consume - never a silent no-op). Demo mode is untouched, including /invite/*.
  if (data?.mode === "production" && (!data.linked || onInviteRoute)) {
    return <CompanySetupPage />;
  }

  return <MainShell onLogout={onLogout} />;
}

function MainShell({ onLogout }: { onLogout: () => void }) {
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [accountCollapsed, setAccountCollapsed] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);

  const handleLogout = onLogout;

  /* Load this account's live uploaded-document catalogue once — every page under
     the shell can tap through to a document's evidence viewer. */
  useEffect(() => {
    void hydrateDocuments();
  }, []);

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
          onAddSource={() => setAddSourceOpen(true)}
        />

        <div className="flex-1 min-w-0 min-h-0">
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/finances" component={FinancesPage} />
            <Route path="/review" component={ReviewPage} />
            <Route path="/rules/:id" component={RuleDetail} />
            <Route path="/rules" component={RulesPage} />
            <Route path="/vendors" component={VendorsPage} />
            <Route path="/activity" component={ActivityPage} />
            <Route path="/audit-log" component={AuditLogPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route component={NotFound} />
          </Switch>
        </div>

        <BrainAssistant
          collapsed={accountCollapsed}
          onToggle={() => setAccountCollapsed((v) => !v)}
        />
      </div>

      {/* ── Footer ── */}
      <footer className="flex w-full h-14 flex-shrink-0 items-center justify-between px-6 py-3 bg-shared-colorsheaderfooterbg">
        <span className="w-fit [font-family:'Gilroy',sans-serif] font-normal text-shared-colorsbaby-blue-60 text-sm tracking-[0] leading-[18px] whitespace-nowrap">
          Copyright © 2026 Brain Finance. All rights reserved.
        </span>
        <img className="flex-[0_0_auto]" alt="Socials" src="/figmaAssets/socials.svg" />
      </footer>

      <AddSourceModal
        open={addSourceOpen}
        onClose={() => setAddSourceOpen(false)}
      />
    </div>
    </NavContext.Provider>
  );
}

function App() {
  return (
    <Web3Provider>
      <TransactionProvider>
        <IntentsProvider>
          <TooltipProvider>
            <AppAlertProvider>
              <Toaster />
              <AppLayout />
              <MemberDetailHost />
            </AppAlertProvider>
          </TooltipProvider>
        </IntentsProvider>
      </TransactionProvider>
    </Web3Provider>
  );
}

export default App;
