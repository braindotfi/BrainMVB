import { useState } from "react";
import closeIcon from "@assets/Close_1783293571882.png";
import { SiX, SiTelegram, SiWhatsapp } from "react-icons/si";

const REFERRAL_CODE = "ADAM123";
const REFERRAL_URL = `https://brain.finance/ref/${REFERRAL_CODE}`;

interface Props {
  open: boolean;
  onClose: () => void;
}

function GiftIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <rect x="5" y="18" width="30" height="4" rx="2" fill="#7631ee" opacity="0.6"/>
      <rect x="8" y="22" width="24" height="14" rx="2" fill="#7631ee" opacity="0.5"/>
      <rect x="5" y="16" width="30" height="6" rx="2" stroke="#7631ee" strokeWidth="1.5" fill="none"/>
      <rect x="8" y="22" width="24" height="14" rx="2" stroke="#7631ee" strokeWidth="1.5" fill="none"/>
      <path d="M20 16V36" stroke="#7631ee" strokeWidth="1.5"/>
      <path d="M20 16C20 16 16 13 15 10C14 7 16 5 18 6C20 7 20 10 20 10C20 10 20 7 22 6C24 5 26 7 25 10C24 13 20 16 20 16Z" stroke="#7631ee" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <circle cx="15" cy="14" r="5" stroke="#6c779d" strokeWidth="1.6"/>
      <path d="M5 32c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke="#6c779d" strokeWidth="1.6" strokeLinecap="round"/>
      <circle cx="28" cy="14" r="4" stroke="#6c779d" strokeWidth="1.6"/>
      <path d="M32 32c0-4.418-3.582-8-8-8" stroke="#6c779d" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

function CoinStackIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <ellipse cx="20" cy="12" rx="10" ry="4" stroke="#6c779d" strokeWidth="1.6"/>
      <path d="M10 12v5c0 2.209 4.477 4 10 4s10-1.791 10-4v-5" stroke="#6c779d" strokeWidth="1.6"/>
      <path d="M10 17v5c0 2.209 4.477 4 10 4s10-1.791 10-4v-5" stroke="#6c779d" strokeWidth="1.6"/>
      <path d="M10 22v5c0 2.209 4.477 4 10 4s10-1.791 10-4v-5" stroke="#6c779d" strokeWidth="1.6"/>
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="4" width="9" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M4 4V3C4 2.172 4.672 1.5 5.5 1.5H12C12.828 1.5 13.5 2.172 13.5 3V9.5C13.5 10.328 12.828 11 12 11H11" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8H13M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[3px]" onClick={onClose} />

      <div className="relative z-10 w-[400px] max-h-[90vh] flex flex-col bg-[#11141b] border border-[#1d2132] rounded-[24px] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-[16px] h-[56px] flex-shrink-0 border-b border-[#1d2132] bg-[rgba(17,20,27,0.8)] backdrop-blur-[10px]">
          <div className="w-8" />
          <h2 className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px] leading-[24px]">
            Invite Friends
          </h2>
          <button
            onClick={onClose}
            data-testid="close-invite-modal"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#222737] hover:opacity-80 transition-opacity"
          >
            <img src={closeIcon} alt="" className="size-[14px]" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-[23px] py-[16px] flex flex-col gap-[16px]">

          {/* Hero banner */}
          <div className="flex gap-[8px] items-start p-[16px] bg-[#240757] rounded-[16px] h-[100px] flex-shrink-0">
            <div className="w-[40px] h-[40px] flex-shrink-0">
              <GiftIcon />
            </div>
            <div className="flex flex-col gap-[4px] flex-1 min-w-0">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#7631ee] text-[20px] leading-[24px]">
                Invite and earn 50 $BRAIN
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[16px] leading-[20px]">
                Invite your friends and family and earn 50 $BRAIN per referral
              </p>
            </div>
          </div>

          {/* Stats widgets — NO border/stroke */}
          <div className="flex gap-[16px]">
            <div className="flex flex-col gap-[8px] items-center justify-center flex-1 p-[16px] bg-[#222737] rounded-[16px]">
              <TeamIcon />
              <div className="flex flex-col gap-[4px] items-center w-full text-center">
                <span className="[font-family:'Gilroy',sans-serif] font-bold text-white text-[32px] leading-[32px] w-full">21</span>
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[14px] leading-[20px] w-full">Friends Joined</span>
              </div>
            </div>
            <div className="flex flex-col gap-[8px] items-center justify-center flex-1 p-[16px] bg-[#222737] rounded-[16px]">
              <CoinStackIcon />
              <div className="flex flex-col gap-[4px] items-center w-full text-center">
                <span className="[font-family:'Gilroy',sans-serif] font-bold text-white text-[32px] leading-[32px] w-full">1050</span>
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[14px] leading-[20px] w-full">$BRAIN Earned</span>
              </div>
            </div>
          </div>

          {/* Referral Link */}
          <div className="flex flex-col gap-[4px]">
            <label className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[14px] leading-[20px]">
              Referral Link
            </label>
            <div className="flex items-center gap-[8px] p-[8px] bg-[#222737] rounded-[12px]">
              <span className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[16px] leading-[20px] flex-1 truncate">
                {REFERRAL_URL}
              </span>
              <button
                onClick={handleCopyLink}
                data-testid="copy-referral-link"
                className={`flex items-center gap-[4px] px-[12px] py-[8px] rounded-[100px] text-[12px] leading-[16px] [font-family:'Gilroy',sans-serif] font-semibold flex-shrink-0 transition-opacity hover:opacity-80 ${
                  copied ? "bg-[#0d3320] text-[#22c55e]" : "bg-[#4a2300] text-[#ff9500]"
                }`}
              >
                {copied ? "Copied!" : <><CopyIcon />Copy</>}
              </button>
            </div>
          </div>

          {/* Referral Code */}
          <div className="flex flex-col gap-[4px]">
            <label className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[14px] leading-[20px]">
              Referral Code
            </label>
            <div className="flex items-center gap-[8px] p-[8px] bg-[#222737] rounded-[12px]">
              <span className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[16px] leading-[20px] flex-1">
                {REFERRAL_CODE}
              </span>
              <button
                onClick={handleCopyCode}
                data-testid="copy-referral-code"
                className={`flex items-center gap-[4px] px-[12px] py-[8px] rounded-[100px] text-[12px] leading-[16px] [font-family:'Gilroy',sans-serif] font-semibold flex-shrink-0 transition-opacity hover:opacity-80 ${
                  codeCopied ? "bg-[#0d3320] text-[#22c55e]" : "bg-[#4a2300] text-[#ff9500]"
                }`}
              >
                {codeCopied ? "Copied!" : <><CopyIcon />Copy</>}
              </button>
            </div>
          </div>

          {/* Invite by Email */}
          <div className="flex flex-col gap-[4px]">
            <label className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[14px] leading-[20px]">
              Invite by Email
            </label>
            <div className="flex items-center gap-[8px] p-[8px] bg-[#222737] rounded-[12px]">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEmailSend()}
                placeholder="johndoe@mail.com"
                className="flex-1 bg-transparent text-white text-[16px] leading-[20px] [font-family:'Gilroy',sans-serif] placeholder-[#6c779d] outline-none"
              />
              <button
                onClick={handleEmailSend}
                disabled={!email.trim()}
                data-testid="send-invite-email"
                className={`flex items-center gap-[4px] px-[12px] py-[8px] rounded-[100px] text-[12px] leading-[16px] [font-family:'Gilroy',sans-serif] font-semibold flex-shrink-0 transition-opacity bg-[#4a2300] ${
                  emailSent
                    ? "bg-[#0d3320] text-[#22c55e]"
                    : email.trim()
                    ? "text-[#ff9500] hover:opacity-80"
                    : "text-[#ff9500] opacity-50 cursor-not-allowed"
                }`}
              >
                {emailSent ? "Sent!" : <>Send<ArrowIcon /></>}
              </button>
            </div>
          </div>

          {/* Share on Socials */}
          <div className="flex flex-col gap-[4px]">
            <label className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]">
              Share on Socials
            </label>
            <div className="flex items-center gap-[8px]">
              <button
                onClick={() => handleSocial(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Join me on Brain Finance — the AI agent marketplace for DeFi! ${REFERRAL_URL}`)}`)}
                className="bg-black rounded-[12px] p-[8px] hover:opacity-80 transition-opacity flex items-center justify-center"
                data-testid="share-x"
                title="Share on X"
              >
                <SiX size={24} color="#ffffff" />
              </button>
              <button
                onClick={() => handleSocial(`https://t.me/share/url?url=${encodeURIComponent(REFERRAL_URL)}&text=${encodeURIComponent("Join me on Brain Finance!")}`)}
                className="bg-[#0088cc] rounded-[12px] p-[8px] hover:opacity-80 transition-opacity flex items-center justify-center"
                data-testid="share-telegram"
                title="Share on Telegram"
              >
                <SiTelegram size={24} color="#ffffff" />
              </button>
              <button
                onClick={() => handleSocial(`https://wa.me/?text=${encodeURIComponent(`Join me on Brain Finance! ${REFERRAL_URL}`)}`)}
                className="bg-[#075e54] rounded-[12px] p-[8px] hover:opacity-80 transition-opacity flex items-center justify-center"
                data-testid="share-whatsapp"
                title="Share on WhatsApp"
              >
                <SiWhatsapp size={24} color="#ffffff" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
