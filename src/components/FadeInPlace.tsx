import { clsx } from "clsx";
import type { ReactNode } from "react";
import { useSwap } from "../lib/motion";

/** A block that fades in where it stands each time its state changes
    after it first showed: loading to content, content to an error. It
    keeps its place; what was there goes at once. Key it on what it
    shows (a wallet, a transaction) so that opening another one already
    known does not fade. */
export function FadeInPlace({
  state,
  className,
  children,
}: {
  state: string;
  className?: string;
  children: ReactNode;
}) {
  const arrive = useSwap(state);
  return (
    <div key={state} className={clsx(className, arrive)}>
      {children}
    </div>
  );
}
