import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpin } from "../lib/motion";

/** The icon of an action in progress, the one loop of the interface: a
    turn per `turn` token, finished before it stops. It always sits by
    words that say the state, which are all that remain under reduced
    motion, where it stands still. */
export function SpinIcon({
  icon: Icon,
  active,
  size,
  className,
}: {
  icon: LucideIcon;
  active: boolean;
  size: number;
  className?: string;
}) {
  const { spinning, onAnimationIteration } = useSpin(active);
  return (
    <Icon
      size={size}
      strokeWidth={1.5}
      aria-hidden
      className={cn(className, spinning && "motion-safe:animate-spin")}
      onAnimationIteration={onAnimationIteration}
    />
  );
}
