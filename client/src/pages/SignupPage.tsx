import { useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { useLocation } from "wouter";
import { SiGoogle } from "react-icons/si";
import brainLogo from "@assets/BrainLogo_1781769246241.png";

type Mode = "login" | "register";

export function SignupPage() {
  const { isLoggedIn, loginWithPassword, register, loginDemo, loginWithGoogle } = useAuth();
  const [, navigate] = useLocation();

  const [mode, setMode] = useState<Mode>("login");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState(""); // login: username OR email
  const [username, setUsername] = useState(""); // register
  const [email, setEmail] = useState(""); // register
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoggedIn) navigate("/");
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setGoogleEnabled(!!d.googleEnabled))
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
      }
      navigate("/");
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
  };

  const handleDemo = async (fresh: boolean) => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await loginDemo(fresh);
      navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Demo login failed.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#06070a] flex flex-col">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-[160px] left-1/2 -translate-x-1/2 w-[640px] h-[420px] bg-[#7631ee] opacity-[0.18] blur-[120px] rounded-full" />

      <header className="flex items-center px-6 h-[50px] flex-shrink-0 z-10 relative">
        <img src={brainLogo} alt="Brain Finance" className="h-[24px] w-auto object-contain mt-[13px]" />
      </header>

      <div className="flex-1 flex items-center justify-center z-10 relative px-4">
        <div className="w-full max-w-[420px] bg-[#11141b] border border-[#1d2132] rounded-[24px] px-7 py-8 shadow-2xl">
          <div className="flex flex-col items-center text-center mb-6">
            <h1 className="[font-family:'Gilroy',sans-serif] font-semibold text-[#e8eaf0] text-[24px] leading-[32px] tracking-[-0.96px]">
              {mode === "login" ? "Welcome Back" : "Create Your Account"}
            </h1>
            <p className="[font-family:'Gilroy',sans-serif] font-normal text-[#6c779d] text-[15px] leading-[22px] mt-1">
              {mode === "login"
                ? "Sign in to your Brain account."
                : "Start managing your finances autonomously."}
            </p>
          </div>

          {/* Google OAuth */}
          {googleEnabled && (
            <>
              <button
                type="button"
                data-testid="button-google-signin"
                onClick={loginWithGoogle}
                className="w-full py-3 px-6 rounded-2xl bg-[#131828] hover:bg-[#1a2235] border border-[#1d2132] hover:border-[#7631ee]/40 transition-colors [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[15px] flex items-center justify-center gap-3"
              >
                <SiGoogle className="text-[18px]" />
                Continue with Google
              </button>

              <div className="flex items-center gap-3 w-full my-5">
                <div className="flex-1 h-px bg-[#1d2132]" />
                <span className="text-[#414965] text-xs [font-family:'Gilroy',sans-serif]">or</span>
                <div className="flex-1 h-px bg-[#1d2132]" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "register" && (
              <div className="flex flex-col gap-1.5">
                <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] pl-1">
                  Name
                </label>
                <input
                  data-testid="input-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Jane Doe"
                  className="w-full h-[48px] px-4 rounded-2xl bg-[#0a0c10] border border-[#1d2132] focus:border-[#7631ee] outline-none transition-colors [font-family:'Gilroy',sans-serif] text-[#e8eaf0] placeholder:text-[#414965] text-[15px]"
                />
              </div>
            )}

            {mode === "login" ? (
              <div className="flex flex-col gap-1.5">
                <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] pl-1">
                  Username or email
                </label>
                <input
                  data-testid="input-identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  placeholder="yourname or you@example.com"
                  className="w-full h-[48px] px-4 rounded-2xl bg-[#0a0c10] border border-[#1d2132] focus:border-[#7631ee] outline-none transition-colors [font-family:'Gilroy',sans-serif] text-[#e8eaf0] placeholder:text-[#414965] text-[15px]"
                />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] pl-1">
                    Username
                  </label>
                  <input
                    data-testid="input-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="yourname"
                    className="w-full h-[48px] px-4 rounded-2xl bg-[#0a0c10] border border-[#1d2132] focus:border-[#7631ee] outline-none transition-colors [font-family:'Gilroy',sans-serif] text-[#e8eaf0] placeholder:text-[#414965] text-[15px]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] pl-1">
                    Email
                  </label>
                  <input
                    data-testid="input-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="w-full h-[48px] px-4 rounded-2xl bg-[#0a0c10] border border-[#1d2132] focus:border-[#7631ee] outline-none transition-colors [font-family:'Gilroy',sans-serif] text-[#e8eaf0] placeholder:text-[#414965] text-[15px]"
                  />
                </div>
              </>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] pl-1">
                Password
              </label>
              <input
                data-testid="input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
                className="w-full h-[48px] px-4 rounded-2xl bg-[#0a0c10] border border-[#1d2132] focus:border-[#7631ee] outline-none transition-colors [font-family:'Gilroy',sans-serif] text-[#e8eaf0] placeholder:text-[#414965] text-[15px]"
              />
            </div>

            {error && (
              <p data-testid="text-auth-error" className="[font-family:'Gilroy',sans-serif] text-[#f4607a] text-[13px] px-1">
                {error}
              </p>
            )}

            <button
              type="submit"
              data-testid="button-submit-auth"
              disabled={submitting}
              className="w-full h-[48px] mt-1 rounded-2xl bg-[#7631ee] hover:bg-[#8442f5] disabled:opacity-50 transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-white text-[15px] flex items-center justify-center gap-2"
            >
              {submitting && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          {/* Demo access — explore the app without creating an account */}
          <div className="flex items-center gap-3 w-full my-5">
            <div className="flex-1 h-px bg-[#1d2132]" />
            <span className="text-[#414965] text-xs [font-family:'Gilroy',sans-serif]">or continue with demo</span>
            <div className="flex-1 h-px bg-[#1d2132]" />
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              data-testid="button-demo-login-existing"
              onClick={() => handleDemo(false)}
              disabled={submitting}
              className="w-full py-3 px-6 rounded-2xl bg-[#131828] hover:bg-[#1a2235] border border-[#1d2132] hover:border-[#7631ee]/40 disabled:opacity-50 transition-colors [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[15px] flex items-center justify-center gap-3"
            >
              Continue with Demo - Existing User
            </button>
            <button
              type="button"
              data-testid="button-demo-login-fresh"
              onClick={() => handleDemo(true)}
              disabled={submitting}
              className="w-full py-3 px-6 rounded-2xl bg-[#131828] hover:bg-[#1a2235] border border-[#1d2132] hover:border-[#7631ee]/40 disabled:opacity-50 transition-colors [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[15px] flex items-center justify-center gap-3"
            >
              Continue with Demo - Fresh User
            </button>
            <p className="text-center text-[#414965] text-xs [font-family:'Gilroy',sans-serif]">
              No account required.
            </p>
          </div>

          <p className="text-center mt-6 [font-family:'Gilroy',sans-serif] text-[#6c779d] text-[14px]">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              data-testid="button-toggle-mode"
              onClick={() => switchMode(mode === "login" ? "register" : "login")}
              className="text-[#a8b9f4] hover:text-[#7631ee] transition-colors font-medium"
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>

      <footer className="flex items-center justify-between px-6 h-14 flex-shrink-0 z-10 relative">
        <span className="[font-family:'Gilroy',sans-serif] text-[#3a4060] text-sm">
          Copyright © 2026 Brain Finance. All rights reserved.
        </span>
        <img alt="Socials" src="/figmaAssets/socials.svg" className="opacity-40" />
      </footer>
    </div>
  );
}
