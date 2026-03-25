import { useState, useEffect } from "react";

const slides = [
  {
    label: "FEATURED",
    title: "Momentum Trader",
    description: "A smart assistant designed to analyze market trends and execute trades on your behalf.",
  },
  {
    label: "TRENDING",
    title: "Yield Pilot",
    description: "Manages capital allocation across DeFi protocols and yield strategies while maintaining risk-adjusted returns.",
  },
  {
    label: "TOP RATED",
    title: "Risk Sentinel",
    description: "Continuously monitors positions and transactions to detect anomalies, enforce limits, and prevent loss.",
  },
];

interface FeaturedCarouselProps {
  onSlideClick?: (slideIndex: number) => void;
  autoPlay?: boolean;
}

export const FeaturedCarousel = ({ onSlideClick, autoPlay = true }: FeaturedCarouselProps) => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!autoPlay) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [autoPlay]);

  const slide = slides[current];

  return (
    <div
      className="relative w-full overflow-hidden shadow-[0px_5px_11px_#0000004a,0px_20px_20px_#00000042,0px_44px_26px_#00000026,0px_78px_31px_#0000000a,0px_122px_34px_#00000003] before:content-[''] before:absolute before:inset-0 before:p-0.5 before:rounded-2xl before:[background:linear-gradient(119deg,rgba(118,49,238,0.42)_0%,rgba(118,49,238,0)_36%,rgba(118,49,238,0.06)_67%,rgba(118,49,238,0.6)_100%)] before:[-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude] before:z-[1] before:pointer-events-none"
      style={{ height: "200px", background: "#12032d", borderRadius: "16px" }}
    >
      {/* Glow orb — top right, rotated -30deg */}
      <div className="absolute top-[-94px] left-[433px] w-[621px] h-[339px] bg-brain-v1purple rounded-[310.64px/169.56px] rotate-[-30deg] blur-[50px] opacity-40 pointer-events-none" />
      {/* Glow orb — bottom right */}
      <div className="absolute top-[120px] left-[555px] w-[425px] h-[232px] bg-brain-v1pink-red rounded-[212.74px/116.12px] blur-[97.95px] opacity-20 pointer-events-none" />
      {/* Glow orb — top left, rotated -165deg */}
      <div className="absolute top-[-123px] left-[-257px] w-[469px] h-64 bg-brain-v1purple rounded-[234.29px/127.89px] rotate-[-165deg] blur-[105px] opacity-30 pointer-events-none" />

      {/* Wave chart vector */}
      <img
        className="absolute pointer-events-none"
        style={{
          width: "15.43%",
          top: "calc(50% - 77px)",
          left: "65.87%",
          height: "177px",
        }}
        alt="Vector"
        src="/figmaAssets/vector.svg"
      />

      {/* Clickable slide area */}
      <button
        className="absolute inset-0 w-full h-full text-left z-[2]"
        onClick={() => onSlideClick?.(current)}
      >
        {/* Text content — vertically centred on left */}
        <div
          className="absolute flex flex-col items-start"
          style={{
            top: "calc(50% - 48px)",
            left: "40px",
            width: "336px",
          }}
        >
          <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1purple text-sm tracking-[0] leading-4">
            {slide.label}
          </span>
          <div className="flex flex-col items-start w-full">
            <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-[32px] tracking-[0] leading-10 w-full">
              {slide.title}
            </span>
            <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1purple text-base tracking-[0] leading-5 w-full">
              {slide.description}
            </span>
          </div>
        </div>
      </button>

      {/* Pagination dots — bottom centre */}
      <div
        className="absolute z-[3] flex items-center gap-1"
        style={{ top: "182px", left: "50%", transform: "translateX(-50%)" }}
      >
        {slides.map((_, i) => (
          <button
            key={i}
            data-testid={`carousel-dot-${i}`}
            onClick={(e) => {
              e.stopPropagation();
              setCurrent(i);
            }}
            className="flex items-center justify-center transition-all"
            style={{
              width: i === current ? "18px" : "6px",
              height: "6px",
              borderRadius: "40px",
              background: i === current ? "rgba(118,49,238,0.9)" : "rgba(118,49,238,0.35)",
              cursor: "pointer",
            }}
          />
        ))}
      </div>
    </div>
  );
};
