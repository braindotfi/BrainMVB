import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "@/lib/authContext";
import { queryClient } from "@/lib/queryClient";
import brainLogo from "@assets/BrainLogo_1781769246241.png";

/* Production tenancy (Phase 2). Shown when the logged-in user has a platform account but
   no brain-core tenant membership (NoTenantError / linked:false). Membership must come
   from creating a company (POST /api/brain/tenants) or accepting an invite
   (POST /api/brain/invites/consume). NOTHING is auto-provisioned, and an invite is only
   consumed after the explicit "Join" confirm below. */

const inputCls =
  "w-full h-[48px] px-4 rounded-2xl bg-[#0a0c10] border border-[#1d2132] focus:border-[#7631ee] outline-none transition-colors [font-family:'Gilroy',sans-serif] text-[#e8eaf0] placeholder:text-[#414965] text-[15px]";
const primaryBtn =
  "w-full h-[48px] rounded-2xl bg-[#7631ee] hover:bg-[#8442f5] disabled:opacity-50 transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-white text-[15px] flex items-center justify-center gap-2";

/** Pull a bare invite token out of a pasted link or raw token. */
function extractInviteToken(raw: string): string {
  const t = raw.trim();
  const m = t.match(/\/invite\/([^/?#\s]+)/);
  return m ? m[1] : t;
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function upstreamMessage(data: any, fallback: string): string {
  if (typeof data?.message === "string" && data.message) return data.message;
  const body = data?.body;
  const nested = body?.error?.message ?? body?.message ?? body?.reason ?? body?.error?.code;
  if (typeof nested === "string" && nested) return `Brain core refused the request: ${nested}`;
  return fallback;
}

export function CompanySetupPage() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [matchInvite, inviteParams] = useRoute("/invite/:token");
  const urlToken = matchInvite ? inviteParams?.token ?? "" : "";

  // A failed tenant-create during signup hands its error (and the typed company name)
  // over via sessionStorage so the failure is never silently dropped.
  const handoff = (() => {
    try {
      const err = sessionStorage.getItem("brain_company_setup_error");
      const nm = sessionStorage.getItem("brain_company_setup_name");
      sessionStorage.removeItem("brain_company_setup_error");
      sessionStorage.removeItem("brain_company_setup_name");
      return { err, nm };
    } catch {
      return { err: null, nm: null };
    }
  })();

  const [tab, setTab] = useState<"create" | "join">(urlToken ? "join" : "create");
  const [companyName, setCompanyName] = useState(handoff.nm ?? "");
  const [inviteInput, setInviteInput] = useState(urlToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(handoff.err);

  const finish = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/brain/tenancy"] });
    await queryClient.invalidateQueries();
    navigate("/");
  };

  const createCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await postJson("/api/brain/tenants", { company_name: companyName.trim() });
      if (!ok) {
        // Tenant creation is NOT idempotent. Never auto-retry; surface it and let the
        // user decide whether to submit again.
        setError(upstreamMessage(data, "Couldn't create your company. Nothing was set up. You can try again."));
        return;
      }
      await finish();
    } catch {
      setError("Couldn't reach the server. Nothing was set up. You can try again.");
    } finally {
      setBusy(false);
    }
  };

  const joinCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const token = extractInviteToken(inviteInput);
    if (!token) {
      setError("Paste your invite link or code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await postJson("/api/brain/invites/consume", { invite_token: token });
      if (!ok) {
        setError(upstreamMessage(data, "Couldn't accept that invite."));
        return;
      }
      await finish();
    } catch {
      setError("Couldn't reach the server. The invite was not used. You can try again.");
    } finally {
      setBusy(false);
    }
  };

  const tabBtn = (key: "create" | "join", label: string, testId: string) => (
    <button
      type="button"
      data-testid={testId}
      onClick={() => { setTab(key); setError(null); }}
      className="flex-1 py-[10px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[14px] transition-colors"
      style={{
        background: tab === key ? "#240757" : "#0c0f14",
        color: tab === key ? "#7631ee" : "#414965",
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#06070a] flex flex-col">
      <div className="pointer-events-none absolute -top-[160px] left-1/2 -translate-x-1/2 w-[640px] h-[420px] bg-[#7631ee] opacity-[0.18] blur-[120px] rounded-full" />
      <header className="flex items-center px-6 h-[50px] flex-shrink-0 z-10 relative">
        <img src={brainLogo} alt="Brain Finance" className="h-[24px] w-auto object-contain mt-[13px]" />
      </header>

      <div className="flex-1 flex items-center justify-center z-10 relative px-4">
        <div className="w-full max-w-[440px] bg-[#11141b] border border-[#1d2132] rounded-[24px] px-7 py-8 shadow-2xl">
          <div className="flex flex-col items-center text-center mb-6">
            <h1 className="[font-family:'Gilroy',sans-serif] font-semibold text-[#e8eaf0] text-[24px] leading-[32px]">
              Set Up Your Company
            </h1>
            <p className="[font-family:'Gilroy',sans-serif] font-normal text-[#6c779d] text-[15px] leading-[22px] mt-1">
              {user?.email ? `Signed in as ${user.email}. ` : ""}Your account isn't part of a company yet -
              create one, or join with an invite from your admin.
            </p>
          </div>

          <div className="flex gap-[8px] mb-6">
            {tabBtn("create", "Create a company", "tab-create-company")}
            {tabBtn("join", "I have an invite", "tab-join-company")}
          </div>

          {tab === "create" ? (
            <form onSubmit={createCompany} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] pl-1">
                  Company name
                </label>
                <input
                  data-testid="input-company-name"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Inc."
                  className={inputCls}
                />
              </div>
              {error && (
                <p data-testid="text-company-setup-error" className="[font-family:'Gilroy',sans-serif] text-[#f4607a] text-[13px] px-1">
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy} data-testid="button-create-company" className={primaryBtn}>
                {busy && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Create company
              </button>
              <p className="text-center text-[#414965] text-xs [font-family:'Gilroy',sans-serif]">
                You'll be the company's first admin.
              </p>
            </form>
          ) : (
            <form onSubmit={joinCompany} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] pl-1">
                  Invite link or code
                </label>
                <input
                  data-testid="input-invite-token"
                  type="text"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  placeholder="Paste your invite link"
                  className={inputCls}
                />
              </div>
              <p className="[font-family:'Gilroy',sans-serif] text-[#6c779d] text-[13px] px-1">
                Joining links this account{user?.email ? ` (${user.email})` : ""} to your company - make sure this
                invite was meant for you.
              </p>
              {error && (
                <p data-testid="text-company-setup-error" className="[font-family:'Gilroy',sans-serif] text-[#f4607a] text-[13px] px-1">
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy} data-testid="button-join-company" className={primaryBtn}>
                {busy && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Join company
              </button>
            </form>
          )}

          <p className="text-center mt-6 [font-family:'Gilroy',sans-serif] text-[#6c779d] text-[14px]">
            Wrong account?{" "}
            <button
              type="button"
              data-testid="button-setup-logout"
              onClick={() => { logout(); navigate("/"); }}
              className="text-[#a8b9f4] hover:text-[#7631ee] transition-colors font-medium"
            >
              Sign out
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
