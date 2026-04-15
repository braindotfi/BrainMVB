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
      {/* Ellipse 1488 — top right, rotated -30deg */}
      <div
        className="absolute flex items-center justify-center pointer-events-none"
        style={{ height: "604.316px", width: "707.593px", left: "388px", top: "-229px" }}
      >
        <div style={{ transform: "rotate(-30deg)" }} className="flex-none">
          <div className="relative" style={{ height: "339.113px", width: "621.271px" }}>
            <img
              alt=""
              className="absolute block max-w-none"
              src="/figmaAssets/ellipse-1488.svg"
              style={{ inset: "-29.49% -16.1%", width: "calc(100% + 32.2%)", height: "calc(100% + 58.98%)" }}
            />
          </div>
        </div>
      </div>

      {/* Ellipse 1490 — bottom right */}
      <div
        className="absolute pointer-events-none"
        style={{ height: "232.242px", left: "553px", top: "118px", width: "425.479px" }}
      >
        <img
          alt=""
          className="absolute block max-w-none"
          src="/figmaAssets/ellipse-1490.svg"
          style={{ inset: "-84.35% -46.04%", width: "calc(100% + 92.08%)", height: "calc(100% + 168.7%)" }}
        />
      </div>

      {/* Ellipse 1489 — top left, rotated -165deg */}
      <div
        className="absolute flex items-center justify-center pointer-events-none"
        style={{ height: "368.334px", width: "518.817px", left: "-284px", top: "-181px" }}
      >
        <div style={{ transform: "rotate(-165deg)" }} className="flex-none">
          <div className="relative" style={{ height: "255.771px", width: "468.585px" }}>
            <img
              alt=""
              className="absolute block max-w-none"
              src="/figmaAssets/ellipse-1489.svg"
              style={{ inset: "-82.1% -44.82%", width: "calc(100% + 89.64%)", height: "calc(100% + 164.2%)" }}
            />
          </div>
        </div>
      </div>

      {/* Banner vector — right side */}
      <div
        className="absolute pointer-events-none"
        style={{
          transform: "translateY(-50%)",
          height: "136px",
          left: "calc(66.67% + 0.67px)",
          right: "calc(17.91% - 1.28px)",
          top: "calc(50% - 4px)",
        }}
      >
        <img
          alt=""
          className="block w-full h-full"
          src="/figmaAssets/banner-vector.svg"
        />
      </div>

      {/* Clickable slide area */}
      <button
        className="absolute inset-0 w-full h-full text-left z-[2]"
        onClick={() => onSlideClick?.(current)}
        data-testid="btn-featured-banner"
      >
        {/* Text content — vertically centered on left */}
        <div
          className="absolute flex flex-col items-start"
          style={{
            transform: "translateY(-50%)",
            top: "50%",
            left: "38px",
            width: "336px",
          }}
        >
          <p
            className="text-[#7631ee] text-[14px] leading-[16px] w-full shrink-0 relative"
            style={{ fontFamily: "'Gilroy', 'Gilroy', sans-serif", fontWeight: 600 }}
          >
            {slide.label}
          </p>
          <div className="flex flex-col items-start w-full shrink-0">
            <p
              className="text-white text-[32px] leading-[40px] w-full shrink-0"
              style={{ fontFamily: "'Gilroy', 'Gilroy', sans-serif", fontWeight: 700 }}
            >
              {slide.title}
            </p>
            <p
              className="text-[#7631ee] text-[16px] leading-[20px] w-full shrink-0"
              style={{ fontFamily: "'Gilroy', 'Gilroy', sans-serif", fontWeight: 500 }}
            >
              {slide.description}
            </p>
          </div>
        </div>
      </button>

      {/* Pagination dots — bottom center */}
      <div
        className="absolute z-[3] flex items-center gap-[4px]"
        style={{ top: "180px", left: "50%", transform: "translateX(-50%)" }}
      >
        {slides.map((_, i) => (
          <button
            key={i}
            data-testid={`carousel-dot-${i}`}
            onClick={(e) => {
              e.stopPropagation();
              setCurrent(i);
            }}
            className="flex items-center justify-center mix-blend-plus-lighter transition-all"
            style={{
              width: i === current ? "18px" : "6px",
              height: "6px",
              borderRadius: "40px",
              background: i === current ? "rgba(255,255,255,0.9)" : "rgba(118,49,238,0.4)",
              cursor: "pointer",
            }}
          />
        ))}
      </div>
    </div>
  );
};
