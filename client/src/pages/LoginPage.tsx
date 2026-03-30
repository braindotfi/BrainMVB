import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth, EmbeddedAuthForm } from "@crossmint/client-sdk-react-ui";

export function LoginPage() {
  const { status } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (status === "logged-in") {
      navigate("/assistant");
    }
  }, [status, navigate]);

  return (
    <div className="relative w-full h-screen bg-[#06070a] flex flex-col overflow-hidden">

      {/* ── Top header bar ── */}
      <header className="flex items-center px-6 h-[50px] flex-shrink-0">
        <div className="flex items-center gap-3">
          <img
            src="/figmaAssets/logo-icon.svg"
            alt="Brain Finance"
            className="w-8 h-8"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <span
            className="text-white text-xl tracking-tight select-none"
            style={{ fontFamily: "'Gilroy-Bold', Helvetica" }}
          >
            br<span className="text-[#7631ee]">ai</span>n
          </span>
        </div>
      </header>

      {/* ── Center: Crossmint auth form ── */}
      <div className="flex-1 flex items-center justify-center">
        {status === "loading" ? (
          <div className="w-6 h-6 border-2 border-[#7631ee] border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="w-full max-w-[400px]">
            <EmbeddedAuthForm />
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="flex items-center justify-between px-6 h-[56px] flex-shrink-0">
        <span
          className="text-[#414965] text-sm"
          style={{ fontFamily: "'Mont-Regular', Helvetica" }}
        >
          Copyright © 2025 Brain Finance. All rights reserved.
        </span>
        <img src="/figmaAssets/socials.svg" alt="Socials" className="h-8" />
      </footer>
    </div>
  );
}
