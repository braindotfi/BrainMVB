import { useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { useLocation, useRoute } from "wouter";
import googleLogo from "@assets/pngtree-google-internet-icon-vector-png-image_9183287_1784767118256.png";
import brainLogo from "@assets/BrainLogo_1781769246241.png";
import { Button } from "@/components/ui/button";

type Mode = "login" | "register" | "forgot";

export function SignupPage() {
  const { isLoggedIn, loginWithPassword, register, loginDemoFresh, loginWithGoogle } = useAuth();
  const [, navigate] = useLocation();

  const [mode, setMode] = useState<Mode>("login");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [tenancyProduction, setTenancyProduction] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState(""); // login: username OR email
  const [username, setUsername] = useState(""); // register
  const [email, setEmail] = useState(""); // register
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySubmitted, setRecoverySubmitted] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invite deep-links stay on their exact URL through every auth path. An invited account
  // must only reach Brain tenancy through an explicit Join company action, never through
  // signup's normal automatic workspace creation.
  const [onInviteRoute] = useRoute("/invite/:token");

  useEffect(() => {
    if (isLoggedIn && !onInviteRoute) navigate("/");
  }, [isLoggedIn, onInviteRoute, navigate]);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setGoogleEnabled(!!d.googleEnabled);
        setTenancyProduction(!!d.tenancyProduction);
      })
      .catch(() => setGoogleEnabled(false));
  }, []);

  // Surface OAuth errors passed back as ?auth_error=... by the Google callback.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("auth_error");
    if (err) {
      const messages: Record<string, string> = {
        google_unconfigured: "Google sign-in isn't configured yet.",
        google_state: "Google sign-in expired. Please try again.",
        google_token: "Google sign-in failed. Please try again.",
        google_profile: "Couldn't read your Google profile. Please try again.",
        google_demo_account: "That address belongs to a demo account, which can't be signed into. Use \"Continue With Demo\" for a demo, or sign up with your own email.",
        google_failed: "Google sign-in failed. Please try again.",
      };
      setError(messages[err] ?? "Sign-in failed. Please try again.");
      // Clean the error param out of the URL so it doesn't persist on refresh.
      params.delete("auth_error");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : ""),
      );
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (mode === "forgot") {
      if (!recoveryEmail.trim()) {
        setError("Email is required.");
        return;
      }
      setSubmitting(true);
      try {
        await fetch("/api/auth/password-reset/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: recoveryEmail.trim() }),
        });
        setRecoverySubmitted(true);
      } catch {
        // The endpoint's promise is deliberately identical for known and
        // unknown accounts. Keep the UI equally non-revealing on a network miss.
        setRecoverySubmitted(true);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (mode === "login") {
      if (!identifier.trim() || !password) {
        setError("Username/email and password are required.");
        return;
      }
    } else {
      if (!email.trim() || !password) {
        setError("Email and password are required.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (tenancyProduction && !onInviteRoute && !companyName.trim()) {
        setError("Company name is required.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        await loginWithPassword(identifier.trim(), password);
      } else {
        await register({
          email: email.trim(),
          username: username.trim() || undefined,
          password,
          name: name.trim() || undefined,
        });
        // Production tenancy: create the company right after the local account.
        // NOT retried automatically (tenant creation is not idempotent). If it fails,
        // the user is logged in but unlinked - the Company Setup screen takes over and
        // shows the failure so THEY decide whether to submit again.
        if (tenancyProduction && !onInviteRoute) {
          try {
            const res = await fetch("/api/brain/tenants", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ company_name: companyName.trim() }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              const msg = typeof data?.message === "string" && data.message
                ? data.message
                : "Your account was created, but the company couldn't be set up.";
              try {
                sessionStorage.setItem("brain_company_setup_error", msg);
                sessionStorage.setItem("brain_company_setup_name", companyName.trim());
              } catch { /* ignore storage errors */ }
            }
          } catch {
            try {
              sessionStorage.setItem(
                "brain_company_setup_error",
                "Your account was created, but we couldn't reach the server to set up the company.",
              );
              sessionStorage.setItem("brain_company_setup_name", companyName.trim());
            } catch { /* ignore storage errors */ }
          }
        }
      }
      if (!onInviteRoute) navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword("");
    setIdentifier("");
    setUsername("");
    setRecoverySubmitted(false);
  };

  const handleDemo = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // Fresh, ISOLATED demo tenant per visitor - never the shared demo@brain.fi identity.
      // A shared tenant accumulates whatever the previous visitor did, which is exactly
      // what makes an investor walkthrough untrustworthy. The shared /api/auth/demo route
      // has been DELETED (see server/auth.ts) - this is the only demo entry point.
      await loginDemoFresh({ skipOnboarding: true });
      navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Demo login failed.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-brain-v1headerfooterbg flex flex-col">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-[160px] left-1/2 -translate-x-1/2 w-[640px] h-[420px] bg-brain-v1purple opacity-[0.18] blur-[120px] rounded-full" />

      <header className="flex items-center px-6 h-[50px] flex-shrink-0 z-10 relative">
        <img src={brainLogo} alt="Brain Finance" className="h-[24px] w-auto object-contain mt-[13px]" />
      </header>

      <div className="flex-1 flex items-center justify-center z-10 relative px-4">
        <div className="w-full max-w-[420px] bg-brain-v1baby-blue-5 border border-brain-v1stroke-2 rounded-modal px-7 pt-8 pb-8 shadow-2xl">
          <div className="flex flex-col items-center text-center mb-6">
            <h1 className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1white text-[24px] leading-[32px]">
              {mode === "login" ? "Welcome Back" : mode === "forgot" ? "Reset Your Password" : "Create Your Account"}
            </h1>
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] leading-[20px] mt-1">
              {mode === "login"
                ? "Sign in to your Brain account."
                : mode === "forgot"
                  ? "Enter your email and we'll send a reset link if an account matches it."
                : "Start managing your finances autonomously."}
            </p>
          </div>

           {/* Google OAuth */}
           {mode !== "forgot" && googleEnabled && (
            <>
              <Button
                variant="subtle"
                size="large"
                data-testid="button-google-signin"
                onClick={() => loginWithGoogle(onInviteRoute ? window.location.pathname : undefined)}
                className="w-full border border-brain-v1stroke-2 hover:border-[#7631ee]/40"
              >
                <img src={googleLogo} alt="" className="h-[18px] w-[18px] rounded-full object-contain" />
                Continue with Google
              </Button>

              <div className="flex items-center gap-3 w-full my-5">
                <div className="flex-1 h-px bg-brain-v1stroke-2" />
                <span className="text-brain-v1baby-blue-30 text-xs [font-family:'Gilroy',sans-serif]">or</span>
                <div className="flex-1 h-px bg-brain-v1stroke-2" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "register" && tenancyProduction && !onInviteRoute && (
              <div className="flex flex-col gap-1.5">
                <label className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] leading-[20px] pl-1">
                  Company name
                </label>
                <input
                  data-testid="input-signup-company"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  autoComplete="organization"
                  placeholder="Acme Inc."
                  className="w-full h-[48px] px-4 rounded-2xl bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 focus:border-brain-v1purple outline-none transition-colors [font-family:'Gilroy',sans-serif] text-brain-v1white placeholder:text-brain-v1baby-blue-30 text-[16px] leading-[20px]"
                />
              </div>
            )}
            {mode === "register" && (
              <div className="flex flex-col gap-1.5">
                <label className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] leading-[20px] pl-1">
                  Name
                </label>
                <input
                  data-testid="input-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Jane Doe"
                  className="w-full h-[48px] px-4 rounded-2xl bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 focus:border-brain-v1purple outline-none transition-colors [font-family:'Gilroy',sans-serif] text-brain-v1white placeholder:text-brain-v1baby-blue-30 text-[16px] leading-[20px]"
                />
              </div>
            )}

            {mode === "forgot" ? (
              recoverySubmitted ? (
                <p data-testid="text-reset-request-confirmation" className="rounded-2xl border border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg px-4 py-3 text-center text-[14px] leading-[20px] text-brain-v1baby-blue-60 [font-family:'Gilroy',sans-serif]">
                  If an account matches that email, a password reset link will arrive shortly.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] leading-[20px] pl-1">
                    Email
                  </label>
                  <input
                    data-testid="input-password-reset-email"
                    type="email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="w-full h-[48px] px-4 rounded-2xl bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 focus:border-brain-v1purple outline-none transition-colors [font-family:'Gilroy',sans-serif] text-brain-v1white placeholder:text-brain-v1baby-blue-60 text-[16px] leading-[20px]"
                  />
                </div>
              )
            ) : mode === "login" ? (
              <div className="flex flex-col gap-1.5">
                <label className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] leading-[20px] pl-1">
                  Username or Email
                </label>
                <input
                  data-testid="input-identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  placeholder="yourname or you@example.com"
                  className="w-full h-[48px] px-4 rounded-2xl bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 focus:border-brain-v1purple outline-none transition-colors [font-family:'Gilroy',sans-serif] text-brain-v1white placeholder:text-brain-v1baby-blue-30 text-[16px] leading-[20px]"
                />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] leading-[20px] pl-1">
                    Username
                  </label>
                  <input
                    data-testid="input-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="yourname"
                    className="w-full h-[48px] px-4 rounded-2xl bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 focus:border-brain-v1purple outline-none transition-colors [font-family:'Gilroy',sans-serif] text-brain-v1white placeholder:text-brain-v1baby-blue-30 text-[16px] leading-[20px]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] leading-[20px] pl-1">
                    Email
                  </label>
                  <input
                    data-testid="input-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="w-full h-[48px] px-4 rounded-2xl bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 focus:border-brain-v1purple outline-none transition-colors [font-family:'Gilroy',sans-serif] text-brain-v1white placeholder:text-brain-v1baby-blue-30 text-[16px] leading-[20px]"
                  />
                </div>
              </>
            )}

            {mode !== "forgot" && <div className="flex flex-col gap-1.5">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] leading-[20px] pl-1">
                Password
              </label>
              <input
                data-testid="input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
                className="w-full h-[48px] px-4 rounded-2xl bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 focus:border-brain-v1purple outline-none transition-colors [font-family:'Gilroy',sans-serif] text-brain-v1white placeholder:text-brain-v1baby-blue-30 text-[16px] leading-[20px]"
              />
            </div>}

            {error && (
              <p data-testid="text-auth-error" className="[font-family:'Gilroy',sans-serif] text-brain-v1error-text text-[14px] leading-[20px] px-1">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="cta"
              size="large"
              data-testid="button-submit-auth"
              disabled={submitting}
              className="w-full mt-1"
            >
              {submitting && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {mode === "login" ? "Sign In" : mode === "forgot" ? "Send reset link" : "Create Account"}
            </Button>
          </form>

          {/* Demo access - explore the app without creating an account */}
          {mode !== "forgot" && !onInviteRoute && <div className="flex items-center gap-3 w-full my-5">
            <div className="flex-1 h-px bg-brain-v1stroke-2" />
            <span className="text-brain-v1baby-blue-30 text-xs [font-family:'Gilroy',sans-serif]">or continue with demo</span>
            <div className="flex-1 h-px bg-brain-v1stroke-2" />
          </div>}

          {mode !== "forgot" && !onInviteRoute && <Button
            variant="subtle"
            size="large"
            data-testid="button-demo-login"
            onClick={handleDemo}
            disabled={submitting}
            className="w-full border border-brain-v1stroke-2 hover:border-[#7631ee]/40"
          >
            Continue with Demo
          </Button>}

          <p className="text-center mt-6 [font-family:'Gilroy',sans-serif] text-brain-v1baby-blue-60 text-[14px] leading-[20px]">
            {mode === "forgot" ? "Remember your password?" : mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              data-testid="button-toggle-mode"
              onClick={() => switchMode(mode === "forgot" ? "login" : mode === "login" ? "register" : "login")}
              className="text-brain-v1baby-blue-100 hover:text-brain-v1purple transition-colors font-medium"
            >
              {mode === "forgot" ? "Sign In" : mode === "login" ? "Sign Up" : "Sign In"}
            </button>
          </p>
          {mode === "login" && (
            <button
              type="button"
              data-testid="button-forgot-password"
              onClick={() => switchMode("forgot")}
              className="mt-5 w-full text-center text-[14px] font-medium leading-[20px] text-brain-v1baby-blue-60 transition-colors hover:text-brain-v1purple [font-family:'Gilroy',sans-serif]"
            >
              Forgot password?
            </button>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between px-6 h-14 flex-shrink-0 z-10 relative">
        <span className="[font-family:'Gilroy',sans-serif] text-brain-v1baby-blue-30 text-sm">
          Copyright © 2026 Brain Finance. All rights reserved.
        </span>
        <img alt="Socials" src="/figmaAssets/socials.svg" className="opacity-40" />
      </footer>
    </div>
  );
}
