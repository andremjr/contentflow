import { cn } from "@/lib/utils";
import type { Channel } from "@/lib/mock-data";

const SIZE = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
} as const;

export function ChannelAvatar({
  channel,
  size = "md",
  className,
}: {
  channel: Pick<Channel, "name" | "color">;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const initials = channel.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-white ring-1 ring-white/10",
        SIZE[size],
        className,
      )}
      style={{
        background: `linear-gradient(135deg, ${channel.color}, color-mix(in oklab, ${channel.color} 55%, #0F172A))`,
      }}
    >
      {initials}
    </span>
  );
}
