import { cn } from "@/lib/utils";

export function CapsuleMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn(className)}
    >
      <g transform="translate(16 16) rotate(-32)">
        <rect x="-13" y="-6" width="13" height="12" rx="6" className="fill-pine" />
        <rect x="0" y="-6" width="13" height="12" rx="6" className="fill-clay" />
      </g>
    </svg>
  );
}

export const colorDot: Record<string, string> = {
  pine: "bg-pine",
  clay: "bg-clay",
  ink: "bg-ink",
  moss: "bg-moss",
};
