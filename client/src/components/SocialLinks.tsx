import { SiGithub, SiX } from "react-icons/si";

interface SocialLinksProps {
  className?: string;
}

const links = [
  {
    label: "X",
    href: "https://x.com/robotmoneyos",
    Icon: SiX,
  },
  {
    label: "GitHub",
    href: "https://github.com/robotmoneyos",
    Icon: SiGithub,
  },
] as const;

export function SocialLinks({ className = "" }: SocialLinksProps) {
  return (
    <nav aria-label="Social links" className={`flex items-center gap-2 ${className}`}>
      {links.map(({ label, href, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={label}
          className="flex size-8 items-center justify-center rounded-full bg-brain-v1headerfooterbg text-brain-v1baby-blue-60 transition-colors hover:text-brain-v1baby-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brain-v1purple"
        >
          <Icon size={16} aria-hidden="true" />
        </a>
      ))}
    </nav>
  );
}