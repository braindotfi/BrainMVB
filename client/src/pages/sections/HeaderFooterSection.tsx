export const HeaderFooterSection = (): JSX.Element => {
  return (
    <header className="flex w-full h-[50px] items-center justify-between px-6 py-2 bg-shared-colorsheaderfooterbg">
      {/* Left: Logo */}
      <div className="inline-flex items-center gap-6 flex-shrink-0">
        <div className="inline-flex items-center gap-2 pl-2">
          <img
            className="w-[43.31px] h-[44.43px] mb-[-16.93px] ml-[-1.88px]"
            alt="Frame"
            src="/figmaAssets/frame-1000002163.svg"
          />
          <div className="w-fit mt-[-1.00px] [font-family:'Gridular-Regular',Helvetica] font-normal text-transparent text-[28px] tracking-[0] leading-7 whitespace-nowrap">
            <span className="text-[#7631ee]">br</span>
            <span className="text-[#ffffff] leading-[0.1px]">ai</span>
            <span className="text-[#7631ee]">n</span>
          </div>
        </div>
      </div>

      {/* Right: Wallet address + action buttons */}
      <div className="inline-flex items-center gap-2 flex-shrink-0">
        {/* Wallet address badge */}
        <div className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-braindark-purple rounded-[100px]">
          <span className="[font-family:'Mont-SemiBold',Helvetica] text-brainpurple text-xs font-semibold tracking-[0] leading-4 whitespace-nowrap">
            0dak...a2x5
          </span>
        </div>

        <img className="w-8 h-8" alt="Buttons" src="/figmaAssets/buttons.svg" />

        <img
          className="w-8 h-8"
          alt="Buttons"
          src="/figmaAssets/buttons-1.svg"
        />
      </div>
    </header>
  );
};
