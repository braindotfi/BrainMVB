import { useUserContact } from "@/lib/userContact";
import { useAuth } from "@/lib/authContext";
import { Switch } from "./FigmaPrimitives";
import { AlertCallout, MutedCallout } from "@/components/Callout";

/* Settings → Notifications.
 *
 * There is no notification backend: no routes, no preference store, nothing
 * that could receive a value if this page sent one. The design mock shows three
 * live-looking toggles, and wiring them to local state would produce a screen
 * that remembers your choice, shows it back to you, and silently never acts on
 * it — a worse lie than an empty page, because it invites you to rely on it.
 *
 * So the channels render in their real shape and are visibly, explicitly
 * inert: non-interactive controls, `aria-disabled`, dimmed, under a heading
 * that says plainly that none of it is connected yet. The structure is honest
 * about what is coming; the state is honest about what exists.
 *
 * The mock's channel copy also carries invented specifics — a "#finance-approvals"
 * Slack channel and an SMS threshold of "$100,000". Neither is configured
 * anywhere in this product. The descriptions below say what each channel is
 * FOR without quoting a number or a destination that nothing would honour.
 */

const CHANNELS: { id: string; title: string; detail: string }[] = [
  {
    id: "slack",
    title: "Slack",
    detail: "Urgent and big-ticket items, in the channel your team already watches.",
  },
  {
    id: "email-digest",
    title: "Email digest",
    detail: "A daily summary of everything Brain did overnight.",
  },
  {
    id: "sms-urgent",
    title: "SMS for urgent items",
    detail: "Fraud anomalies and other time-sensitive flags.",
  },
];

export default function NotificationsSection() {
  const { user } = useAuth();
  const { email, phone } = useUserContact(user?.email);

  return (
    <div className="flex flex-col gap-[20px] w-full">
      <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full">
        <div className="flex items-center min-h-[36px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-brain-v1baby-blue-60 text-[16px]">
            Notifications
          </p>
        </div>

        <div className="bg-brain-v1highlight-dropdown-bg rounded-panel p-[16px] flex flex-col gap-[16px] w-full">
          {/* Said once, at the top, rather than repeated on every row. */}
          <MutedCallout
            title="Notification delivery is not connected yet."
            testId="text-notifications-unavailable"
          >
            These channels are shown so you can see what Brain will support. None of
            them can be switched on today, and nothing here is being sent.
          </MutedCallout>

          {CHANNELS.map((c, i) => (
            <div key={c.id} className="flex flex-col gap-[16px]">
              {i > 0 && <div className="h-px bg-brain-v1stroke-2 w-full" />}
              <div
                className="settings-record flex gap-[16px] items-center opacity-40"
                data-testid={`row-notification-${c.id}`}
                aria-disabled="true"
              >
                <div className="settings-record-copy flex flex-[1_0_0] flex-col gap-[4px] min-w-px">
                  <p className="settings-record-title">
                    {c.title}
                  </p>
                  <p className="settings-record-detail">
                    {c.detail}
                  </p>
                </div>
                {/* Presentational only — deliberately not a button and not focusable. */}
                <div className="shrink-0" aria-hidden="true">
                  <Switch active={false} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p
        className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-60 text-[14px]"
        data-testid="text-notifications-contact"
      >
        When channels are wired up, Brain will reach you at {email} (email) and {phone} (SMS).
      </p>
    </div>
  );
}
