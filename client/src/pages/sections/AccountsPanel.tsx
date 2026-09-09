import collapseBtnIcon from "@assets/Collapse_1781818197054.png";
import expandBtnIcon from "@assets/Expand_Button_1781817819809.png";

interface AccountsPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Right-hand rail.
 *
 * The Brain Assistant used to live here; it now owns the middle frame at
 * `/assistant`. This panel is reserved for bank and agent accounts, which are
 * not wired up yet — so it says exactly that rather than showing a mock list.
 * Its collapse/expand behaviour is kept intact because the middle frame sizes
 * itself against it.
 */
export function AccountsPanel({ collapsed, onToggle }: AccountsPanelProps) {
  if (collapsed) {
    return (
      <div className="relative w-[54px] h-full rounded-panel border border-solid border-brain-v1stroke-2 bg-brain-v1baby-blue-5 overflow-hidden flex-shrink-0">
        <div className="flex flex-col gap-[16px] items-start absolute left-[7px] top-[7px] w-[40px]">
          <button
            data-testid="button-accounts-expand"
            onClick={onToggle}
            className="size-[40px]"
            title="Expand accounts"
          >
            <img src={expandBtnIcon} alt="Expand" className="size-[40px] block" />
          </button>

          <div className="w-full h-px bg-brain-v1stroke-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[390px] h-full rounded-panel border border-solid border-brain-v1stroke-2 bg-brain-v1baby-blue-5 overflow-hidden flex flex-col flex-shrink-0">
      <div className="flex items-center gap-[8px] p-[7px]">
        <button
          data-testid="button-accounts-collapse"
          onClick={onToggle}
          className="flex-shrink-0 size-[40px]"
          title="Collapse accounts"
        >
          <img src={collapseBtnIcon} alt="Collapse" className="size-[40px] block" />
        </button>
        <span className="flex-1 min-w-0 truncate [font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 text-[16px] leading-[24px]">
          Accounts
        </span>
      </div>

      <div className="flex-1 min-h-0 mx-[7px] mb-[7px] rounded-row bg-brain-v1highlight-dropdown-bg overflow-y-auto">
        <div
          data-testid="accounts-panel-empty"
          className="h-full flex flex-col items-center justify-center gap-[4px] px-[16px] py-[12px] text-center"
        >
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-100 text-[14px] leading-[20px]">
            Nothing here yet
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[12px] leading-[16px]">
            Bank and agent accounts will live in this panel.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AccountsPanel;
