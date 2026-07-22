import { useEffect, useState } from "react";
import { SUB } from "@/assets/sub-icons";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/hooks/use-toast";
import { useAppAlert } from "@/components/AppAlert";

function parseBalance(raw?: string): number {
  if (!raw) return 0;
  const n = parseFloat(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

type ModalKind = null | "confirm" | "deleteData";

function Backdrop({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px] transition-opacity duration-200"
      onClick={onClick}
      data-testid="modal-backdrop"
    />
  );
}

// Container styling shared across all three popups, matching Figma
// (file cC2lQwC3g9hv96o5Wgy8Ek, nodes 3970:45780, 3969:45754, 3969:45740).
const POPUP_CONTAINER =
  "fixed left-1/2 top-1/2 z-[101] w-[320px] -translate-x-1/2 -translate-y-1/2 " +
  "flex flex-col rounded-[16px] bg-[#11141b] border border-[#1d2132] overflow-clip " +
  "shadow-[0px_68px_27px_0px_rgba(0,0,0,0.06),0px_38px_23px_0px_rgba(0,0,0,0.2),0px_17px_17px_0px_rgba(0,0,0,0.34),0px_4px_9px_0px_rgba(0,0,0,0.39)]";

const POPUP_HEADER =
  "flex flex-col items-center gap-[8px] px-[8px] py-[24px] w-full text-center";

const POPUP_TITLE =
  "font-['Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px] leading-[24px] w-full";

const POPUP_BODY =
  "font-['Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[16px] w-full";

const POPUP_BUTTON_ROW = "flex gap-[8px] items-start p-[8px] w-full";

const POPUP_BUTTON_NEUTRAL =
  "flex-1 min-w-px flex items-center justify-center px-[12px] py-[8px] rounded-[100px] " +
  "bg-[#222737] disabled:opacity-50 disabled:cursor-not-allowed " +
  "font-['Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[16px] whitespace-nowrap";

const POPUP_BUTTON_DESTRUCTIVE =
  "flex-1 min-w-px flex items-center justify-center px-[12px] py-[8px] rounded-[100px] " +
  "bg-[#350011] disabled:opacity-60 disabled:cursor-not-allowed " +
  "font-['Gilroy',sans-serif] font-semibold text-[#d20344] text-[12px] leading-[16px] whitespace-nowrap";

function ConfirmCloseModal({ onCancel, onConfirm, isDeleting }: { onCancel: () => void; onConfirm: () => void; isDeleting: boolean }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-account-title"
      className={POPUP_CONTAINER}
      data-testid="modal-close-account-confirm"
    >
      <div className={POPUP_HEADER}>
        <p id="close-account-title" className={POPUP_TITLE}>
          Close Account
        </p>
        <p className={POPUP_BODY}>
          Are you sure you want to permanently delete your Brain account? This is irreversible.
        </p>
      </div>
      <div className={POPUP_BUTTON_ROW}>
        <button
          onClick={onCancel}
          disabled={isDeleting}
          data-testid="button-close-account-cancel"
          className={POPUP_BUTTON_NEUTRAL}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isDeleting}
          data-testid="button-close-account-confirm"
          className={POPUP_BUTTON_DESTRUCTIVE}
        >
          {isDeleting ? "Deleting…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

function ConfirmDeleteDataModal({ onCancel, onConfirm, isDeleting }: { onCancel: () => void; onConfirm: () => void; isDeleting: boolean }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-data-title"
      className={POPUP_CONTAINER}
      data-testid="modal-delete-data-confirm"
    >
      <div className={POPUP_HEADER}>
        <p id="delete-data-title" className={POPUP_TITLE}>
          Delete Data
        </p>
        <p className={POPUP_BODY}>
          Are you sure you want to permanently delete your Brain data? This is irreversible.
        </p>
      </div>
      <div className={POPUP_BUTTON_ROW}>
        <button
          onClick={onCancel}
          disabled={isDeleting}
          data-testid="button-delete-data-cancel"
          className={POPUP_BUTTON_NEUTRAL}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isDeleting}
          data-testid="button-delete-data-confirm"
          className={POPUP_BUTTON_DESTRUCTIVE}
        >
          {isDeleting ? "Deleting…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

export default function AccountSection() {
  const { deleteAccount, deleteAccountData } = useAuth();
  const { toast } = useToast();
  const appAlert = useAppAlert();
  const [modal, setModal] = useState<ModalKind>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Lock body scroll while a modal is open
  useEffect(() => {
    if (modal) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [modal]);

  // Close on Escape (disabled while a destructive delete is in flight)
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) setModal(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal, isDeleting]);

  const handleCloseAccountClick = () => {
    setModal("confirm");
  };

  const handleConfirm = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteAccount();
      setModal(null);
      appAlert.success(
        "Account closed",
        "Your Brain account and all associated records have been permanently deleted.",
      );
    } catch (err: any) {
      toast({
        title: "Couldn't delete account",
        description: err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDeleteData = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteAccountData();
      setModal(null);
      appAlert.success(
        "Data deleted",
        "All your Brain data has been permanently deleted. Your account remains active.",
      );
    } catch (err: any) {
      toast({
        title: "Couldn't delete data",
        description: err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full">
        <div className="content-stretch flex flex-col justify-center min-h-[36px] items-start relative shrink-0 w-full">
          <p className="font-['Gilroy',sans-serif] font-semibold leading-[24px] not-italic relative shrink-0 text-[#414965] text-[16px] w-full">
            Your Data
          </p>
        </div>
        <div className="bg-[#0a0c10] content-stretch flex flex-col gap-[16px] items-start overflow-clip p-[16px] relative rounded-[16px] shrink-0 w-full">
          <div className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full">
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["ce14e446"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="absolute inset-[16.67%]">
                    <div className="absolute inset-[-6.25%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["df7932d3"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Export My Data
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Last updated January 1, 2025
                  </p>
                </div>
              </div>
            </div>
            <div className="relative rounded-[100px] shrink-0 size-[40px]">
              <div className="absolute left-0 size-[40px] top-0">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["c2ab79ae"]} />
              </div>
              <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                <div className="absolute bottom-1/4 flex items-center justify-center left-[40.09%] right-[37.5%] top-1/4" style={{ containerType: "size" }}>
                  <div className="-rotate-90 -scale-x-100 flex-none h-[100cqw] w-[100cqh]">
                    <div className="relative size-full">
                      <div className="absolute inset-[-18.59%_-8.33%]">
                        <img alt="" className="block max-w-none size-full" src={SUB["0f43a9ae"]} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="h-0 relative shrink-0 w-full">
            <div className="absolute inset-[-0.5px_0]">
              <img alt="" className="block max-w-none size-full" src={SUB["7bddb712"]} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModal("deleteData")}
            data-testid="button-delete-data"
            aria-label="Delete My Data"
            className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#414965] rounded-[4px]"
          >
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["ce14e446"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%_16.67%]">
                    <div className="absolute inset-[-5.56%_-6.25%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["851a5227"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[16px] whitespace-nowrap">
                  Delete My Data
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    How we handle your data
                  </p>
                </div>
              </div>
            </div>
            <div className="relative rounded-[100px] shrink-0 size-[40px]">
              <div className="absolute left-0 size-[40px] top-0">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["c2ab79ae"]} />
              </div>
              <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                <div className="absolute bottom-1/4 flex items-center justify-center left-[40.09%] right-[37.5%] top-1/4" style={{ containerType: "size" }}>
                  <div className="-rotate-90 -scale-x-100 flex-none h-[100cqw] w-[100cqh]">
                    <div className="relative size-full">
                      <div className="absolute inset-[-18.59%_-8.33%]">
                        <img alt="" className="block max-w-none size-full" src={SUB["0f43a9ae"]} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>
      <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full">
        <div className="content-stretch flex flex-col justify-center min-h-[36px] items-start relative shrink-0 w-full">
          <p className="font-['Gilroy',sans-serif] font-semibold leading-[24px] not-italic relative shrink-0 text-[#414965] text-[16px] w-full">
            Account
          </p>
        </div>
        <div className="bg-[#0a0c10] content-stretch flex flex-col items-start overflow-clip p-[16px] relative rounded-[16px] shrink-0 w-full">
          <button
            type="button"
            onClick={handleCloseAccountClick}
            data-testid="button-close-account"
            aria-label="Close Account"
            className="content-stretch flex gap-[16px] h-[40px] items-center relative shrink-0 w-full text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#414965] rounded-[4px]"
          >
            <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["670b6028"]} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="absolute inset-[12.5%_16.66%_16.67%_20.36%]">
                    <div className="absolute inset-[-5.88%_-6.62%]">
                      <img alt="" className="block max-w-none size-full" src={SUB["67eca363"]} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0">
                <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[#d20344] text-[16px] whitespace-nowrap">
                  Close Account
                </p>
                <div className="content-stretch flex items-center relative shrink-0">
                  <p className="font-['Gilroy',sans-serif] font-medium leading-[16px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">
                    Permanently delete your Brain account
                  </p>
                </div>
              </div>
            </div>
            <div className="relative rounded-[100px] shrink-0 size-[40px]">
              <div className="absolute left-0 size-[40px] top-0">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={SUB["c2ab79ae"]} />
              </div>
              <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                <div className="absolute bottom-1/4 flex items-center justify-center left-[40.09%] right-[37.5%] top-1/4" style={{ containerType: "size" }}>
                  <div className="-rotate-90 -scale-x-100 flex-none h-[100cqw] w-[100cqh]">
                    <div className="relative size-full">
                      <div className="absolute inset-[-18.59%_-8.33%]">
                        <img alt="" className="block max-w-none size-full" src={SUB["0f43a9ae"]} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {modal && <Backdrop onClick={() => { if (!isDeleting) setModal(null); }} />}
      {modal === "confirm" && <ConfirmCloseModal onCancel={() => setModal(null)} onConfirm={handleConfirm} isDeleting={isDeleting} />}
      {modal === "deleteData" && <ConfirmDeleteDataModal onCancel={() => setModal(null)} onConfirm={handleConfirmDeleteData} isDeleting={isDeleting} />}
    </div>
  );
}
