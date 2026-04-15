export const HeaderFooterSection = (): JSX.Element => {
  return (
    <header className="flex w-full h-[50px] items-center justify-between px-6 py-2 bg-shared-colorsheaderfooterbg">
      {/* Left: Logo */}
      <div className="inline-flex items-center gap-2 pl-2">
        <img
          className="w-[43.31px] h-[44.43px] mb-[-16.93px] ml-[-1.88px]"
          alt="Frame"
          src="/figmaAssets/frame-1000002163.svg"
        />
        <div className="w-fit mt-[-1.00px] [font-family:'Gilroy',sans-serif] font-normal text-transparent text-[28px] tracking-[0] leading-7 whitespace-nowrap">
          <span className="text-[#7631ee]">br</span>
          <span className="text-[#ffffff] leading-[0.1px]">ai</span>
          <span className="text-[#7631ee]">n</span>
        </div>
      </div>
    </header>
  );
};
