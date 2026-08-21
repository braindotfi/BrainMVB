import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import brainLogo from "@assets/BrainLogo_1781769246241.png";
import { Button } from "@/components/ui/button";
import { validInviteReturnTo } from "@/lib/inviteReturnTo";

type ResetState = "checking" | "invalid" | "resend" | "resent" | "ready" | "complete";

export function ResetPasswordPage({ token, returnTo }: { token: string; returnTo?: string }) {
  const [, navigate] = useLocation();
  const inviteReturnTo = validInviteReturnTo(returnTo);
  const [state, setState] = useState<ResetState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/password-reset/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({ valid: false }));
        if (!cancelled) setState(body.valid === true ? "ready" : "invalid");
      })
      .catch(() => {
        if (!cancelled) setState("invalid");
      });
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
          ...(inviteReturnTo ? { return_to: inviteReturnTo } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || "This password reset link is invalid or has expired.");
        if (response.status === 400) setState("invalid");
        return;
      }
      setState("complete");
    } catch {
      setError("We couldn't update your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (!recoveryEmail.trim()) {
      setError("Email is required.");
      return;
    }
    setSubmitting(true);
    try {
      await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: recoveryEmail.trim(),
          ...(inviteReturnTo ? { return_to: inviteReturnTo } : {}),
        }),
      });
    } catch {
      // The server intentionally gives the same confirmation for all account
      // states; retain that behavior for a network failure as well.
    } finally {
      setSubmitting(false);
      setState("resent");
    }
  };

  const content = (() => {
    if (state === "checking") {
      return {
        title: "Checking your link",
        body: "Please wait while we verify your password reset link.",
        children: <div className="mx-auto h-7 w-7 rounded-full border-2 border-brain-v1stroke-2 border-t-brain-v1purple animate-spin" />,
      };
    }
    if (state === "invalid") {
      return {
        title: "This link is no longer valid",
        body: "Password reset links expire 30 minutes after they are requested and can only be used once.",
        children: (
          <Button variant="cta" size="large" className="w-full" onClick={() => setState("resend")}>
            Request a new link
          </Button>
        ),
      };
    }
    if (state === "resend") {
      return {
        title: "Request a new link",
        body: "Enter your email and we'll send a reset link if an account matches it.",
        children: (
          <form onSubmit={resend} className="flex flex-col gap-4 text-left">
            <div className="flex flex-col gap-1.5">
              <label className="pl-1 [font-family:'Gilroy',sans-serif] text-[14px] font-medium leading-[20px] text-brain-v1baby-blue-60">
                Email address
              </label>
              <input
                data-testid="input-reset-resend-email"
                type="email"
                autoComplete="email"
                value={recoveryEmail}
                onChange={(event) => setRecoveryEmail(event.target.value)}
                placeholder="you@example.com"
                className="h-[48px] w-full rounded-2xl border border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg px-4 text-[16px] leading-[20px] text-brain-v1white outline-none transition-colors placeholder:text-brain-v1baby-blue-60 focus:border-brain-v1purple [font-family:'Gilroy',sans-serif]"
              />
            </div>
            {error && <p className="px-1 text-[14px] leading-[20px] text-brain-v1error-text [font-family:'Gilroy',sans-serif]">{error}</p>}
            <Button type="submit" variant="cta" size="large" disabled={submitting} className="mt-1 w-full">
              {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Send reset link
            </Button>
          </form>
        ),
      };
    }
    if (state === "resent") {
      return {
        title: "Check your email",
        body: "If an account matches that email, a password reset link will arrive shortly.",
        children: (
          <Button variant="cta" size="large" className="w-full" onClick={() => navigate(inviteReturnTo ?? "/")}>
            Back to sign in
          </Button>
        ),
      };
    }
    if (state === "complete") {
      return {
        title: "Password updated",
        body: "Your password has been changed. You can sign in now.",
        children: (
          <Button variant="cta" size="large" className="w-full" onClick={() => navigate(inviteReturnTo ?? "/")}>
            Go to sign in
          </Button>
        ),
      };
    }
    return {
      title: "Set a new password",
      body: "Choose a new password with at least 8 characters.",
      children: (
        <form onSubmit={submit} className="flex flex-col gap-4 text-left">
          <div className="flex flex-col gap-1.5">
            <label className="pl-1 [font-family:'Gilroy',sans-serif] text-[14px] font-medium leading-[20px] text-brain-v1baby-blue-60">
              New password
            </label>
            <input
              data-testid="input-reset-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              className="h-[48px] w-full rounded-2xl border border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg px-4 text-[16px] leading-[20px] text-brain-v1white outline-none transition-colors placeholder:text-brain-v1baby-blue-60 focus:border-brain-v1purple [font-family:'Gilroy',sans-serif]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="pl-1 [font-family:'Gilroy',sans-serif] text-[14px] font-medium leading-[20px] text-brain-v1baby-blue-60">
              Confirm new password
            </label>
            <input
              data-testid="input-reset-password-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat your password"
              className="h-[48px] w-full rounded-2xl border border-brain-v1stroke-2 bg-brain-v1highlight-dropdown-bg px-4 text-[16px] leading-[20px] text-brain-v1white outline-none transition-colors placeholder:text-brain-v1baby-blue-60 focus:border-brain-v1purple [font-family:'Gilroy',sans-serif]"
            />
          </div>
          {error && <p className="px-1 text-[14px] leading-[20px] text-brain-v1error-text [font-family:'Gilroy',sans-serif]">{error}</p>}
          <Button type="submit" variant="cta" size="large" disabled={submitting} className="mt-1 w-full">
            {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            Update password
          </Button>
        </form>
      ),
    };
  })();

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-brain-v1headerfooterbg">
      <div className="pointer-events-none absolute -top-[160px] left-1/2 h-[420px] w-[640px] -translate-x-1/2 rounded-full bg-brain-v1purple opacity-[0.18] blur-[120px]" />
      <header className="relative z-10 flex h-[50px] flex-shrink-0 items-center px-6">
        <img src={brainLogo} alt="Brain Finance" className="mt-[13px] h-[24px] w-auto object-contain" />
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-4">
        <section className="w-full max-w-[420px] rounded-modal border border-brain-v1stroke-2 bg-brain-v1baby-blue-5 px-7 py-8 text-center shadow-2xl">
          <h1 className="text-[24px] font-semibold leading-[32px] text-brain-v1white [font-family:'Gilroy',sans-serif]">{content.title}</h1>
          <p className="mb-6 mt-1 text-[14px] font-medium leading-[20px] text-brain-v1baby-blue-60 [font-family:'Gilroy',sans-serif]">{content.body}</p>
          {content.children}
        </section>
      </main>
    </div>
  );
}