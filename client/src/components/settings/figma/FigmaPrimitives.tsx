import { SUB } from "@/assets/sub-icons";

type SwitchProps = {
  className?: string;
  active?: boolean;
};

export function Switch({ className, active = false }: SwitchProps) {
  const off = !active;
  return (
    <div
      className={
        className ||
        `h-[24px] relative w-[40px] ${off ? "rounded-[12px]" : "rounded-[100px]"}`
      }
      data-testid={`switch-${active ? "on" : "off"}`}
    >
      <div
        className={`absolute h-[20px] left-[2px] rounded-[100px] top-[2px] w-[36px] ${
          off ? "bg-[#222737]" : "bg-[#123509]"
        }`}
      />
      <div
        className={`absolute rounded-[100px] size-[16px] top-[4px] ${
          off ? "bg-[#06070a] left-[4px]" : "bg-[#42bf23] left-[20px]"
        }`}
      />
    </div>
  );
}

type IconsProps = {
  className?: string;
  icon?: "Chevron Down";
};

export function Icons({ className, icon = "Chevron Down" }: IconsProps) {
  void icon;
  return (
    <div className={className || "relative size-[24px]"}>
      <div className="absolute bottom-[40.09%] left-1/4 right-1/4 top-[37.5%]">
        <div className="absolute inset-[-18.59%_-8.33%]">
          <img
            alt=""
            className="block max-w-none size-full"
            src={SUB["f313aa48"]}
          />
        </div>
      </div>
    </div>
  );
}
