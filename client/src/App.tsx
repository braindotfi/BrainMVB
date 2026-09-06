import { Switch, Route, useRoute } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppAlertProvider } from "@/components/AppAlert";
import { SourceIngestToastProvider } from "@/components/SourceIngestToast";
import { useAuth } from "@/lib/authContext";
import NotFound from "@/pages/not-found";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useSessionTimeout } from "@/lib/sessionTimeoutContext";
import { useAppAlert } from "@/components/AppAlert";

import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { SettingsPage } from "@/pages/SettingsPage";
import { SignupPage } from "@/pages/SignupPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { CompanySetupPage } from "@/pages/CompanySetupPage";
import { HomePage } from "@/pages/HomePage";
import { FinancesPage } from "@/pages/FinancesPage";
import { InboxPage } from "@/pages/InboxPage";
import { RuleDetail } from "@/pages/RuleDetail";
import { NavigationMenuSection } from "@/pages/sections/NavigationMenuSection";
import { BrainAssistant } from "@/pages/sections/BrainAssistant";
import { NavContext } from "@/lib/navContext";
import { TransactionProvider } from "@/lib/transactionContext";
import { IntentsProvider } from "@/lib/intentsStore";
import { MemberDetailHost } from "@/components/MemberDetailPopup";
import { hydrateDocuments } from "@/lib/documentsStore";
import { useBrainProjectionRefresh } from "@/lib/brainRefresh";
import { useSearch } from "wouter";
import { AuthProvider } from "@/lib/authContext";
import { CurrencyProvider } from "@/lib/currencyContext";
import { SessionTimeoutProvider } from "@/lib/sessionTimeoutContext";
import { queryClient } from "@/lib/queryClient";
import { formatRateLimitDescription, RATE_LIMIT_ALERT_TITLE, subscribeRateLimitReports } from "@/lib/rateLimit";
import { inviteReturnToFromSearch } from "@/lib/inviteReturnTo";

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

/* The old six-tab Audit Log page is retired — settled history now lives in the
   unified Inbox timeline. The route survives ONLY as a redirect: bookmarks,
   assistant citations and record deep links (`/audit-log?record=<id>`) still
   point here, and wouter answers an unregistered path with the NotFound
   catch-all silently. The query string is carried across verbatim, so
   `?record=` deep links reopen the same record popup on the Inbox timeline. */
const AuditLogRedirect = () => {
  const search = useSearch();
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(search ? `/inbox?${search}` : "/inbox", { replace: true });
  }, [search, navigate]);
  return null;
};
function AppLayout() {
  const { isLoggedIn, isLoading, logout } = useAuth();
  const [onPasswordResetRoute, resetParams] = useRoute("/reset-password/:token");
  const { timeoutMin } = useSessionTimeout();
  const alert = useAppAlert();
  const [, navigate] = useLocation();
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resetBoundaryState, setResetBoundaryState] = useState<"idle" | "clearing" | "ready" | "failed">("idle");
  // Refs hold the latest function/value references so the listener-binding
  // effect below depends only on `isLoggedIn` + `timeoutMin` and does not
  // re-bind window listeners every render.
  const logoutRef = useRef(logout);
  const navigateRef = useRef(navigate);
  const alertRef = useRef(alert);
  useEffect(() => { logoutRef.current = logout; }, [logout]);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  useEffect(() => { alertRef.current = alert; }, [alert]);

  useEffect(() => subscribeRateLimitReports((event) => {
    alertRef.current.error(
      RATE_LIMIT_ALERT_TITLE,
      formatRateLimitDescription(event.retryAfterSeconds),
      5_000,
      "brain-rate-limit",
    );
  }), []);

  // Password-reset links are an explicit anonymous boundary. A link may be
  // opened on a shared browser or in a tab retaining another person's cookie;
  // do not render reset content or permit a redirect until that server session
  // has been destroyed and the client identity/cache are cleared.
  useEffect(() => {
    if (!onPasswordResetRoute) {
      setResetBoundaryState("idle");
      return;
    }
    let cancelled = false;
    setResetBoundaryState("clearing");
    void logout().then((serverEndedSession) => {
      if (!cancelled) setResetBoundaryState(serverEndedSession ? "ready" : "failed");
    });
    return () => { cancelled = true; };
  }, [onPasswordResetRoute, logout]);

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
        <div className="h-8 w-8 rounded-full border-2 border-brain-v1stroke-2 border-t-brain-v1purple animate-spin" />
      </div>
    );
  }

  if (onPasswordResetRoute && resetBoundaryState === "ready") {
    return (
      <ResetPasswordPage
        token={resetParams?.token ?? ""}
        returnTo={inviteReturnToFromSearch(window.location.search)}
      />
    );
  }

  if (onPasswordResetRoute) {
    const failed = resetBoundaryState === "failed";
    return (
      <div className="bg-shared-colorsheaderfooterbg w-full h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-[420px] rounded-modal border border-brain-v1stroke-2 bg-brain-v1baby-blue-5 px-7 py-8 text-center shadow-2xl">
          <h1 className="text-[24px] font-semibold leading-[32px] text-brain-v1white [font-family:'Gilroy',sans-serif]">
            {failed ? "We couldn't secure this reset session" : "Securing your reset session"}
          </h1>
          <p className="mt-1 text-[14px] font-medium leading-[20px] text-brain-v1baby-blue-60 [font-family:'Gilroy',sans-serif]">
            {failed
              ? "Please reload this page before continuing. We won't show password reset details until any existing session is signed out."
              : "Please wait while we sign out any existing account in this browser."}
          </p>
          {!failed && <div className="mx-auto mt-6 h-7 w-7 rounded-full border-2 border-brain-v1stroke-2 border-t-brain-v1purple animate-spin" />}
        </div>
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

  if (isLoading) {
    return (
      <div className="bg-shared-colorsheaderfooterbg w-full h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-brain-v1stroke-2 border-t-brain-v1purple animate-spin" />
      </div>
    );
  }

  // Production only: unlinked users always land on setup. Invite links are handled by
  // InviteRouteBoundary before this component (and before any Brain data providers mount).
  if (data?.mode === "production" && !data.linked) {
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

        <div className="flex-1 min-w-0 min-h-0 h-full overflow-hidden flex flex-col rounded-panel border border-solid border-brain-v1stroke-2 bg-brain-v1baby-blue-5">
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
              <Route path="/audit-log" component={AuditLogRedirect} />
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
        <span className="w-fit [font-family:'Gilroy',sans-serif] font-medium text-shared-colorsbaby-blue-60 text-sm whitespace-nowrap">
          Copyright © 2026 RobotMoney Inc. All rights reserved.
        </span>
        <img className="flex-[0_0_auto]" alt="Socials" src="/figmaAssets/socials.svg" />
      </footer>
    </div>
    </NavContext.Provider>
  );
}


/** The invite URL is a hard boundary: only auth state may mount before the user explicitly
 * accepts or abandons the invitation. In particular, this branch is above MainShell and every
 * provider that can grow a Brain data read, preventing durable session provisioning races. */
function InviteRouteBoundary() {
  const [onInviteRoute] = useRoute("/invite/:token");
  const { isLoggedIn, isLoading } = useAuth();

  if (!onInviteRoute) return <AuthenticatedApplication />;

  if (isLoading) {
    return (
      <div className="bg-shared-colorsheaderfooterbg w-full h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-brain-v1stroke-2 border-t-brain-v1purple animate-spin" />
      </div>
    );
  }

  // Keep the exact invite URL through sign-in. CompanySetupPage's invite-only mode performs
  // no tenancy query until its explicit Join company action succeeds.
  return isLoggedIn ? <CompanySetupPage inviteOnly /> : <SignupPage />;
}

function AuthenticatedApplication() {
  return (
    <CurrencyProvider>
      <TransactionProvider>
        <IntentsProvider>
          <AppLayout />
          <MemberDetailHost />
        </IntentsProvider>
      </TransactionProvider>
    </CurrencyProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionTimeoutProvider>
          <TooltipProvider>
            <AppAlertProvider>
              <SourceIngestToastProvider>
                <Toaster />
                <InviteRouteBoundary />
              </SourceIngestToastProvider>
            </AppAlertProvider>
          </TooltipProvider>
        </SessionTimeoutProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
