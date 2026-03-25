import { useState } from "react";
import { SiX, SiTelegram, SiWhatsapp } from "react-icons/si";

const REFERRAL_CODE = "ADAM123";
const REFERRAL_URL = `https://brain.finance/ref/${REFERRAL_CODE}`;

const stats = [
  { label: "Friends Joined", value: "3", icon: "👥" },
  { label: "$BRAIN Earned", value: "150", icon: "🧠" },
  { label: "Per Referral", value: "50 $BRAIN", icon: "🎁" },
];

const socialPlatforms = [
  {
    id: "twitter",
    label: "Share on X",
    icon: SiX,
    color: "bg-black hover:bg-[#1a1a1a]",
    textColor: "text-white",
    url: () => `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Join me on Brain Finance — the AI agent marketplace for DeFi! Use my referral link: ${REFERRAL_URL}`)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: SiTelegram,
    color: "bg-[#00609c] hover:bg-[#0070b8]",
    textColor: "text-white",
    url: () => `https://t.me/share/url?url=${encodeURIComponent(REFERRAL_URL)}&text=${encodeURIComponent("Join me on Brain Finance — the AI agent marketplace for DeFi!")}`,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: SiWhatsapp,
    color: "bg-[#0a5c38] hover:bg-[#0d7046]",
    textColor: "text-white",
    url: () => `https://wa.me/?text=${encodeURIComponent(`Join me on Brain Finance! Use my referral link: ${REFERRAL_URL}`)}`,
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export const ShareModal = ({ open, onClose }: Props): JSX.Element | null => {
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  if (!open) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(REFERRAL_URL).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(REFERRAL_CODE).catch(() => {});
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2200);
  };

  const handleSocialShare = (platform: typeof socialPlatforms[0]) => {
    window.open(platform.url(), "_blank", "noopener,noreferrer");
  };

  const handleEmailSend = () => {
    if (!email.trim()) return;
    setEmailSent(true);
    setEmail("");
    setTimeout(() => setEmailSent(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-[500px] max-h-[90vh] flex flex-col bg-[#0d1017] border border-[#1d2131] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* Header */}
        <div className="relative px-6 pt-6 pb-5 border-b border-[#1d2131] flex-shrink-0 overflow-hidden">
          {/* Decorative glow */}
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-64 h-32 bg-brain-v1dark-orange opacity-20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-brain-v1dark-orange flex items-center justify-center text-2xl flex-shrink-0">
                🧠
              </div>
              <div>
                <h2 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-xl leading-tight">
                  Invite Friends
                </h2>
                <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-sm mt-0.5">
                  Share Brain Finance &amp; earn 50 $BRAIN per referral
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-30 transition-colors flex-shrink-0 mt-0.5"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1 p-3 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl text-center">
                <span className="text-xl">{s.icon}</span>
                <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1white text-base leading-tight">{s.value}</span>
                <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-[10px] leading-tight">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Referral link */}
          <div className="flex flex-col gap-2">
            <label className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs uppercase tracking-wider">
              Your Referral Link
            </label>
            <div className="flex items-center gap-2 p-1 pl-4 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl">
              <span className="[font-family:'JetBrains_Mono',Helvetica] text-brain-v1baby-blue-60 text-xs flex-1 truncate select-all">
                {REFERRAL_URL}
              </span>
              <button
                onClick={handleCopyLink}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold flex-shrink-0 transition-all ${
                  copied
                    ? "bg-brain-v1dark-green text-brain-v1green"
                    : "bg-brain-v1dark-orange text-brain-v1light-orange hover:opacity-80"
                }`}
              >
                {copied ? (
                  <>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <rect x="0.75" y="2.75" width="6.5" height="6.5" rx="1.25" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M2.75 2.75V1.75C2.75 1.199 3.199 0.75 3.75 0.75H8.25C8.801 0.75 9.25 1.199 9.25 1.75V6.25C9.25 6.801 8.801 7.25 8.25 7.25H7.25" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                    Copy Link
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Referral code */}
          <div className="flex items-center gap-3 p-4 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-2xl">
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">Referral Code</span>
              <span className="[font-family:'JetBrains_Mono',Helvetica] font-bold text-brain-v1white text-xl tracking-wider">
                {REFERRAL_CODE}
              </span>
            </div>
            <button
              onClick={handleCopyCode}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold flex-shrink-0 transition-all ${
                codeCopied
                  ? "bg-brain-v1dark-green text-brain-v1green"
                  : "bg-brain-v1baby-blue-30 text-brain-v1baby-blue-100 hover:bg-brain-v1baby-blue-60"
              }`}
            >
              {codeCopied ? "Copied!" : "Copy Code"}
            </button>
          </div>

          {/* Share via social */}
          <div className="flex flex-col gap-2">
            <label className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs uppercase tracking-wider">
              Share via
            </label>
            <div className="grid grid-cols-3 gap-2">
              {socialPlatforms.map((platform) => {
                const Icon = platform.icon;
                return (
                  <button
                    key={platform.id}
                    onClick={() => handleSocialShare(platform)}
                    className={`flex items-center justify-center gap-2 py-3 rounded-2xl border border-[#1d2131] transition-all hover:opacity-90 hover:scale-[1.02] active:scale-100 ${platform.color} ${platform.textColor}`}
                  >
                    <Icon size={15} />
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-xs">{platform.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Email invite */}
          <div className="flex flex-col gap-2">
            <label className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs uppercase tracking-wider">
              Invite by Email
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-4 py-2.5 bg-brain-v1baby-blue-15 border border-[#1d2131] focus-within:border-[#414965] rounded-2xl transition-colors">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-brain-v1baby-blue-30 flex-shrink-0">
                  <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M1 4.5L7 8L13 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEmailSend()}
                  placeholder="friend@example.com"
                  className="flex-1 bg-transparent text-brain-v1white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-30 outline-none"
                />
              </div>
              <button
                onClick={handleEmailSend}
                disabled={!email.trim()}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm [font-family:'Gilroy-SemiBold',Helvetica] font-semibold flex-shrink-0 transition-all ${
                  emailSent
                    ? "bg-brain-v1dark-green text-brain-v1green"
                    : email.trim()
                    ? "bg-brain-v1dark-orange text-brain-v1light-orange hover:opacity-80"
                    : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-30 cursor-not-allowed opacity-50"
                }`}
              >
                {emailSent ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Sent!
                  </>
                ) : "Send"}
              </button>
            </div>
          </div>

          {/* Promo banner */}
          <div className="flex items-start gap-3 p-4 bg-[#1a1300] border border-[#3a2800] rounded-2xl">
            <div className="w-8 h-8 rounded-xl bg-brain-v1dark-orange flex items-center justify-center text-sm flex-shrink-0">🎁</div>
            <div>
              <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1light-orange text-sm">
                Earn 50 $BRAIN per referral
              </p>
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs mt-0.5 leading-relaxed">
                Your friend gets 25 $BRAIN as a welcome bonus. Rewards are credited when they complete their first transaction.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
