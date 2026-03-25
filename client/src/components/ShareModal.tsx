import { useState } from "react";
import { SiX, SiTelegram, SiWhatsapp } from "react-icons/si";

const REFERRAL_CODE = "ADAM123";
const REFERRAL_URL = `https://brain.finance/ref/${REFERRAL_CODE}`;

interface Props {
  open: boolean;
  onClose: () => void;
}

export const ShareModal = ({ open, onClose }: Props): JSX.Element | null => {
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);

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

  const handleEmailSend = () => {
    if (!email.trim()) return;
    setEmailSent(true);
    setEmail("");
    setTimeout(() => setEmailSent(false), 3000);
  };

  const handleSocial = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-[3px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-[400px] max-h-[88vh] flex flex-col bg-[#0d1017] border border-[#1d2132] rounded-3xl shadow-2xl overflow-hidden">

        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
          <div className="w-6" />
          <h2 className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-base leading-tight">
            Invite Friends
          </h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-brain-v1baby-blue-60 hover:text-brain-v1white transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-4">

          {/* Purple promo banner */}
          <div className="flex items-center gap-3 p-4 bg-[#1e0a3c] border border-[#3b1a70] rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-[#7631ee] flex items-center justify-center flex-shrink-0 text-xl">
              🎁
            </div>
            <div>
              <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1purple text-sm leading-tight">
                Invite and earn 50 $BRAIN
              </p>
              <p className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs mt-0.5 leading-relaxed">
                Invite your friends and family and earn 50 $BRAIN per referral
              </p>
            </div>
          </div>

          {/* 2-column stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center gap-2 p-4 bg-[#111827] border border-[#1d2132] rounded-2xl">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-brain-v1baby-blue-60">
                <circle cx="10" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M3 22c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="19" cy="9" r="3" stroke="currentColor" strokeWidth="1.4" />
                <path d="M22 22c0-3.314-2.686-6-6-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span className="[font-family:'Gilroy-Bold',Helvetica] font-bold text-brain-v1white text-2xl leading-tight">21</span>
              <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs text-center leading-tight">Friends Joined</span>
            </div>
            <div className="flex flex-col items-center gap-2 p-4 bg-[#111827] border border-[#1d2132] rounded-2xl">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-brain-v1baby-blue-60">
                <ellipse cx="14" cy="9" rx="7" ry="3" stroke="currentColor" strokeWidth="1.4" />
                <path d="M7 9v4c0 1.657 3.134 3 7 3s7-1.343 7-3V9" stroke="currentColor" strokeWidth="1.4" />
                <path d="M7 13v4c0 1.657 3.134 3 7 3s7-1.343 7-3v-4" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              <span className="[font-family:'Gilroy-Bold',Helvetica] font-bold text-brain-v1white text-2xl leading-tight">1050</span>
              <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs text-center leading-tight">$BRAIN Earned</span>
            </div>
          </div>

          {/* Referral Link */}
          <div className="flex flex-col gap-2">
            <label className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">
              Referral Link
            </label>
            <div className="flex items-center gap-2 px-4 py-3 bg-[#111827] border border-[#1d2132] rounded-2xl">
              <span className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1white text-sm flex-1 truncate">
                {REFERRAL_URL}
              </span>
              <button
                onClick={handleCopyLink}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold flex-shrink-0 transition-all ${
                  copied
                    ? "bg-brain-v1dark-green text-brain-v1green"
                    : "bg-[#4a2300] text-[#ff9500] hover:opacity-80"
                }`}
              >
                {copied ? (
                  "Copied!"
                ) : (
                  <>
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <rect x="0.75" y="2.75" width="6.5" height="6.5" rx="1.25" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M2.75 2.75V1.75C2.75 1.199 3.199 0.75 3.75 0.75H8.25C8.801 0.75 9.25 1.199 9.25 1.75V6.25C9.25 6.801 8.801 7.25 8.25 7.25H7.25" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Referral Code */}
          <div className="flex flex-col gap-2">
            <label className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">
              Referral Code
            </label>
            <div className="flex items-center gap-2 px-4 py-3 bg-[#111827] border border-[#1d2132] rounded-2xl">
              <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-sm flex-1 tracking-widest">
                {REFERRAL_CODE}
              </span>
              <button
                onClick={handleCopyCode}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold flex-shrink-0 transition-all ${
                  codeCopied
                    ? "bg-brain-v1dark-green text-brain-v1green"
                    : "bg-[#4a2300] text-[#ff9500] hover:opacity-80"
                }`}
              >
                {codeCopied ? (
                  "Copied!"
                ) : (
                  <>
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <rect x="0.75" y="2.75" width="6.5" height="6.5" rx="1.25" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M2.75 2.75V1.75C2.75 1.199 3.199 0.75 3.75 0.75H8.25C8.801 0.75 9.25 1.199 9.25 1.75V6.25C9.25 6.801 8.801 7.25 8.25 7.25H7.25" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Invite by Email */}
          <div className="flex flex-col gap-2">
            <label className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">
              Invite by Email
            </label>
            <div className="flex items-center gap-2 px-4 py-3 bg-[#111827] border border-[#1d2132] rounded-2xl">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEmailSend()}
                placeholder="|johndoe@mail.com"
                className="flex-1 bg-transparent text-brain-v1white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-30 outline-none"
              />
              <button
                onClick={handleEmailSend}
                disabled={!email.trim()}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs [font-family:'Gilroy-SemiBold',Helvetica] font-semibold flex-shrink-0 transition-all ${
                  emailSent
                    ? "bg-brain-v1dark-green text-brain-v1green"
                    : email.trim()
                    ? "bg-[#4a2300] text-[#ff9500] hover:opacity-80"
                    : "text-brain-v1baby-blue-30 cursor-not-allowed"
                }`}
              >
                {emailSent ? "Sent!" : (
                  <>
                    Send
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5h6M6 3l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Share on Socials */}
          <div className="flex flex-col gap-3">
            <label className="[font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 text-xs">
              Share on Socials
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleSocial(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Join me on Brain Finance — the AI agent marketplace for DeFi! ${REFERRAL_URL}`)}`)}
                className="w-12 h-12 rounded-full bg-[#0a0a0a] hover:opacity-80 transition-opacity flex items-center justify-center border border-[#1d2132]"
                title="Share on X"
              >
                <SiX size={18} color="#ffffff" />
              </button>
              <button
                onClick={() => handleSocial(`https://t.me/share/url?url=${encodeURIComponent(REFERRAL_URL)}&text=${encodeURIComponent("Join me on Brain Finance!")}`)}
                className="w-12 h-12 rounded-full bg-[#0088cc] hover:opacity-80 transition-opacity flex items-center justify-center"
                title="Share on Telegram"
              >
                <SiTelegram size={20} color="#ffffff" />
              </button>
              <button
                onClick={() => handleSocial(`https://wa.me/?text=${encodeURIComponent(`Join me on Brain Finance! ${REFERRAL_URL}`)}`)}
                className="w-12 h-12 rounded-full bg-[#25d366] hover:opacity-80 transition-opacity flex items-center justify-center"
                title="Share on WhatsApp"
              >
                <SiWhatsapp size={20} color="#ffffff" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
