import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import infoIcon from "@assets/info_1779540800272.png";
import errorIcon from "@assets/errors_1779540800271.png";
import successIcon from "@assets/success_1779540800270.png";
import approvedIcon from "@assets/approved_1784058164235.png";
import rejectedIcon from "@assets/rejected_1784058164236.png";
import postponedIcon from "@assets/postpone_1784058164236.png";

/* ─── Pop-up alerts (Figma 4086:66890 / 4086:66991 / 4086:67000 +
   action confirmations 5773:66469 / 5734:82359 / 5787:65369) ───
   Rich bottom-right toasts used as drop-in replacements for plain
   shadcn toasts. Three core + three action variants.

   Shape across variants:
     - bg #0a0c10, border #1d2132, rounded-16, drop-shadow stack
     - 24×24 circular icon on the left, 16px gap, padded 16
     - Title: 16px / 24px line-height, color = variant accent
     - Body : 16px / 20px line-height, color = #6c779d, supports an
              inline anchor that lights up #a8b9f4 + underline.        */

export type AlertVariant = "info" | "error" | "success" | "approved" | "postponed" | "rejected";

export type AppAlertOptions = {
  variant: AlertVariant;
  title: string;
  description?: ReactNode;
  /** Auto-dismiss timeout in ms. Set 0 to keep open until tapped. */
  durationMs?: number;
};

type ActiveAlert = AppAlertOptions & { id: number };

type AlertContextValue = {
  showAlert: (opts: AppAlertOptions) => number;
  dismissAlert: (id: number) => void;
};

const AppAlertContext = createContext<AlertContextValue | null>(null);

const ACCENT: Record<AlertVariant, { ring: string; bg: string; title: string }> = {
  info:      { ring: "#a8b9f4", bg: "#1d2132", title: "#a8b9f4" },
  error:     { ring: "#d20344", bg: "#350011", title: "#d20344" },
  success:   { ring: "#42bf23", bg: "#123509", title: "#42bf23" },
  approved:  { ring: "#42bf23", bg: "#123509", title: "#42bf23" },
  postponed: { ring: "#a8b9f4", bg: "#222737", title: "#a8b9f4" },
  rejected:  { ring: "#d20344", bg: "#350011", title: "#d20344" },
};

const ICONS: Record<AlertVariant, string> = {
  info:      infoIcon,
  error:     errorIcon,
  success:   successIcon,
  approved:  approvedIcon,
  postponed: postponedIcon,
  rejected:  rejectedIcon,
};

const Glyph = ({ variant }: { variant: AlertVariant }) => (
  <img
    src={ICONS[variant]}
    alt=""
    aria-hidden="true"
    className="shrink-0 size-[24px] rounded-full object-cover"
  />
);

/* Single alert card. Matches the Figma frame exactly: same outer
   chrome, same icon disc, same typography rhythm. The card itself
   is clickable to dismiss for a richer feel than the standard toast. */
const AppAlertCard = ({ alert, onDismiss }: { alert: ActiveAlert; onDismiss: () => void }) => {
  const accent = ACCENT[alert.variant];
  const isError = alert.variant === "error";
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onDismiss();
    }
  };
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-label={`${alert.title} - press Escape to dismiss`}
      tabIndex={0}
      data-testid={`alert-${alert.variant}`}
      onClick={onDismiss}
      onKeyDown={handleKey}
      className="bg-[#0a0c10] border border-[#1d2132] rounded-[16px] flex gap-[16px] items-start p-[16px] w-[360px] max-w-[calc(100vw-32px)] cursor-pointer transition-transform hover:-translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a8b9f4]"
      style={{
        boxShadow:
          "0px 68px 13.5px rgba(0,0,0,0.06), 0px 38px 11.5px rgba(0,0,0,0.2), 0px 17px 8.5px rgba(0,0,0,0.34), 0px 4px 4.5px rgba(0,0,0,0.39)",
      }}
    >
      <Glyph variant={alert.variant} />
      <div className="flex flex-col flex-1 min-w-0 [font-family:'Gilroy',sans-serif] font-medium text-[16px]">
        <p
          data-testid={`alert-title-${alert.variant}`}
          className="leading-[24px] w-full"
          style={{ color: accent.title }}
        >
          {alert.title}
        </p>
        {alert.description !== undefined && (
          <p
            data-testid={`alert-desc-${alert.variant}`}
            className="leading-[20px] w-full text-[#6c779d]"
          >
            {alert.description}
          </p>
        )}
      </div>
    </div>
  );
};

/* Stacked viewport - bottom-right floating column, shared with the shadcn
   toaster so info / warning / confirmation pop-ups all stack in the same
   area. New alerts slide in from the right and append to the bottom. */
const AppAlertViewport = ({
  alerts,
  onDismiss,
}: {
  alerts: ActiveAlert[];
  onDismiss: (id: number) => void;
}) => {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      data-testid="alert-viewport"
      className="fixed bottom-[20px] right-[20px] z-[100] flex flex-col gap-[12px] pointer-events-none items-end"
    >
      {alerts.map((a) => (
        <div key={a.id} className="pointer-events-auto animate-in slide-in-from-right-4 fade-in duration-200">
          <AppAlertCard alert={a} onDismiss={() => onDismiss(a.id)} />
        </div>
      ))}
    </div>,
    document.body,
  );
};

export const AppAlertProvider = ({ children }: { children: ReactNode }) => {
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismissAlert = useCallback((id: number) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const showAlert = useCallback(
    (opts: AppAlertOptions) => {
      const id = nextId.current++;
      const duration = opts.durationMs ?? 5_000;
      setAlerts((prev) => [...prev, { ...opts, id }]);
      if (duration > 0) {
        const handle = setTimeout(() => dismissAlert(id), duration);
        timers.current.set(id, handle);
      }
      return id;
    },
    [dismissAlert],
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, []);

  const value = useMemo<AlertContextValue>(
    () => ({ showAlert, dismissAlert }),
    [showAlert, dismissAlert],
  );

  return (
    <AppAlertContext.Provider value={value}>
      {children}
      <AppAlertViewport alerts={alerts} onDismiss={dismissAlert} />
    </AppAlertContext.Provider>
  );
};

/* Hook that returns the three convenience helpers the rest of the
   app actually wants to call. Falls back to a no-op (with a console
   warning) when used outside the provider so tests / storybook usage
   doesn't blow up. */
export const useAppAlert = () => {
  const ctx = useContext(AppAlertContext);
  return useMemo(() => {
    if (!ctx) {
      const warn = (label: string) => () => {
        if (typeof console !== "undefined") {
          console.warn(`[AppAlert] ${label} called outside AppAlertProvider`);
        }
        return -1;
      };
      return {
        info:       warn("info"),
        error:      warn("error"),
        success:    warn("success"),
        approved:   warn("approved"),
        postponed:  warn("postponed"),
        rejected:   warn("rejected"),
        dismiss:    warn("dismiss"),
      };
    }
    return {
      info:       (title: string, description?: ReactNode, durationMs?: number) =>
        ctx.showAlert({ variant: "info", title, description, durationMs }),
      error:      (title: string, description?: ReactNode, durationMs?: number) =>
        ctx.showAlert({ variant: "error", title, description, durationMs }),
      success:    (title: string, description?: ReactNode, durationMs?: number) =>
        ctx.showAlert({ variant: "success", title, description, durationMs }),
      approved:   (title: string, description?: ReactNode, durationMs?: number) =>
        ctx.showAlert({ variant: "approved", title, description, durationMs }),
      postponed:  (title: string, description?: ReactNode, durationMs?: number) =>
        ctx.showAlert({ variant: "postponed", title, description, durationMs }),
      rejected:   (title: string, description?: ReactNode, durationMs?: number) =>
        ctx.showAlert({ variant: "rejected", title, description, durationMs }),
      dismiss:    (id: number) => ctx.dismissAlert(id),
    };
  }, [ctx]);
};

/* Inline link helper for use inside an alert description - matches the
   Figma error variant where "Visit this page to recover your password"
   has the word "page" rendered as a clickable underlined link. */
export const AppAlertLink = ({
  onClick,
  href,
  children,
}: {
  onClick?: () => void;
  href?: string;
  children: ReactNode;
}) => (
  <a
    href={href ?? "#"}
    data-testid="link-alert-inline"
    onClick={(e) => {
      // Stop the parent card's auto-dismiss handler from firing.
      e.stopPropagation();
      if (onClick) {
        e.preventDefault();
        onClick();
      }
    }}
    className="text-[#a8b9f4] underline decoration-solid hover:text-[#c5d2ff]"
  >
    {children}
  </a>
);
