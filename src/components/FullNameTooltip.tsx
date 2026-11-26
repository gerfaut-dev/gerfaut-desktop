import { type ReactElement, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/** The whole of a name its row cuts short, beside the row, under the
    pointer or the keyboard focus. The row marks the text that may be cut
    with `data-full-name`; a name that fits opens nothing, and neither does
    focus that a click or the code put there (a menu opening on its
    current item). The row's accessible name already holds the whole name:
    this is for the eyes. */
export function FullNameTooltip({ name, children }: { name: string; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && wanted(trigger.current))}>
      <TooltipTrigger asChild ref={trigger}>
        {children}
      </TooltipTrigger>
      <TooltipContent side="right">{name}</TooltipContent>
    </Tooltip>
  );
}

function wanted(trigger: HTMLElement | null): boolean {
  const text = trigger?.querySelector<HTMLElement>("[data-full-name]");
  if (!trigger || !text || text.scrollWidth <= text.clientWidth) return false;
  return matches(trigger, ":hover") || matches(trigger, ":focus-visible");
}

/** An engine that does not know a pseudo-class throws on it. */
function matches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}
