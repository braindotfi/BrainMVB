import { Switch, Route, useRoute } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppAlertProvider } from "@/components/AppAlert";
import { Web3Provider } from "@/lib/web3Provider";
import { useAuth } from "@/lib/authContext";
import NotFound from "@/pages/not-found";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useSessionTimeout } from "@/lib/sessionTimeoutContext";
import { useAppAlert } from "@/components/AppAlert";

import { useQuery } from "@tanstack/react-query";
import { SettingsPage } from "@/pages/SettingsPage";
import { SignupPage } from "@/pages/SignupPage";
import { CompanySetupPage } from "@/pages/CompanySetupPage";
import { HomePage } from "@/pages/HomePage";
import { FinancesPage } from "@/pages/FinancesPage";
import { InboxPage } from "@/pages/InboxPage";
import { RuleDetail } from "@/pages/RuleDetail";
import { AuditLogPage } from "@/pages/AuditLogPage";
import { NavigationMenuSection } from "@/pages/sections/NavigationMenuSection";
import { BrainAssistant } from "@/pages/sections/BrainAssistant";
import { NavContext } from "@/lib/navContext";
import { TransactionProvider } from "@/lib/transactionContext";
import { IntentsProvider } from "@/lib/intentsStore";
import { MemberDetailHost } from "@/components/MemberDetailPopup";
import { hydrateDocuments } from "@/lib/documentsStore";
import { useBrainProjectionRefresh } from "@/lib/brainRefresh";
import { useSearch } from "wouter";

/**
 * Vendors and Rules are Ledger tabs now, not pages.
 *
 * These two routes stay registered rather than being deleted: bookmarks, the
 * assistant's citations and anything already in a user's history still point at
 * `/vendors` and `/rules`, and wouter answers an unregistered path with the
 * NotFound catch-all silently — no error, no log, just the wrong screen. They
 * rewrite to the canonical Ledger URL and carry their query across, so a
 * `?vendor=` deep link still opens the right vendor. `/rules?tab=` becomes
 * `?rules=` because `tab` now names the Ledger tab.
 */
function LegacyLedgerRedirect({ tab }: { tab: "vendors" | "rules" }) {
  const search = useSearch();
  const [, navigate] = useLocation();
  useEffect(() => {
    const incoming = new URLSearchParams(search);
    const legacySubTab = incoming.get("tab");
    incoming.delete("tab");
    // Rebuilt with `tab` first so the canonical URL reads the way it is written
    // everywhere else: /ledger?tab=rules&rules=guardrails
    const sp = new URLSearchParams({ tab });
    if (tab === "rules" && legacySubTab) sp.set("rules", legacySubTab);
    for (const [k, v] of incoming) if (!sp.has(k)) sp.set(k, v);
    navigate(`/ledger?${sp.toString()}`, { replace: true });
  }, [search, tab, navigate]);
  return null;
}

const VendorsRedirect = () => <LegacyLedgerRedirect tab="vendors" />;
const RulesRedirect = () => <LegacyLedgerRedirect tab="rules" />;

/* /developers is retired — Developers now lives at Settings → Developers. The
   route survives ONLY to forward existing links and bookmarks: wouter renders
   NotFound for an unregistered path without any error, so deleting it outright
   would turn every old link into a silent dead end. */
const DevelopersRedirect = () => {
  const navigate = useLocation()[1];
  useEffect(() => {
    navigate("/settings?section=developers", { replace: true });
  }, [navigate]);
  return null;
};

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

/* Routes that carry the global search bar. The brief scopes it to Overview,
   Decisions and Ledger; the legacy aliases render those same three pages, so a
   bookmark on an old path must not lose the bar. Settings is deliberately absent
   — the mock puts the input in `.main`, which sits above every page including
   Settings, but nothing in the index is a Settings record. */
const SEARCH_ROUTES = new Set([
  "/", "/decisions", "/ledger", "/finances", "/inbox", "/review", "/activity",
]);

function MainShell({ onLogout }: { onLogout: () => void }) {
  const [location] = useLocation();
  const [navCollapsed, setNavCollapsed] = useState(() => window.innerWidth < 768);
  const [accountCollapsed, setAccountCollapsed] = useState(() => window.innerWidth < 768);

  const handleLogout = onLogout;

  /* Load this account's live uploaded-document catalogue once — every page under
     the shell can tap through to a document's evidence viewer. */
  useEffect(() => {
    void hydrateDocuments();
  }, []);

  /* Refresh brain data once uploaded documents finish being read. Anchored here rather
     than in the upload UI so that closing the Add Source modal — or leaving onboarding —
     mid-extraction does not cancel the refresh. */
  useBrainProjectionRefresh();

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

        <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
          {/* The page owns the flexible space. Keeping search after it pins the
              control to the bottom of the middle column, like Logout in the nav. */}
          <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col relative">
            <Switch>
              <Route path="/" component={HomePage} />
              {/* Canonical IA paths: Overview (/), Decisions, Ledger, Settings */}
              <Route path="/decisions" component={InboxPage} />
              <Route path="/ledger" component={FinancesPage} />
              {/* Legacy deep-link aliases - still routed so existing links keep working */}
              <Route path="/finances" component={FinancesPage} />
              <Route path="/inbox" component={InboxPage} />
              <Route path="/review" component={InboxPage} />
              <Route path="/rules/:id" component={RuleDetail} />
              <Route path="/rules" component={RulesRedirect} />
              <Route path="/vendors" component={VendorsRedirect} />
              <Route path="/activity" component={InboxPage} />
              <Route path="/audit-log" component={AuditLogPage} />
              <Route path="/developers" component={DevelopersRedirect} />
              <Route path="/settings" component={SettingsPage} />
              <Route component={NotFound} />
            </Switch>
          </div>
          {SEARCH_ROUTES.has(location) && <GlobalSearch />}
        </div>

        <BrainAssistant
          collapsed={accountCollapsed}
          onToggle={() => setAccountCollapsed((v) => !v)}
        />
      </div>

      {/* ── Footer ── */}
      <footer className="flex w-full h-14 flex-shrink-0 items-center justify-between px-6 py-3 bg-shared-colorsheaderfooterbg">
        <span className="w-fit [font-family:'Gilroy',sans-serif] font-normal text-shared-colorsbaby-blue-60 text-sm leading-[18px] whitespace-nowrap">
          Copyright © 2026 Brain Finance. All rights reserved.
        </span>
        <img className="flex-[0_0_auto]" alt="Socials" src="/figmaAssets/socials.svg" />
      </footer>
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
