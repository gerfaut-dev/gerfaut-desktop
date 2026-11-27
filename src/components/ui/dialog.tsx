import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

/** The shadcn/ui dialog, on the Toundra roles: a Neige surface (Abysse
    in dark) with the overlay shadow, its one use, over a 40% dim. It
    rises as it fades in, the entry of a surface with no origin on
    screen, and leaves by the same path; the dim fades with it. Radix
    keeps both in the tree until their closing animation ends. */
function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 flex justify-center bg-black/40",
        "data-[state=open]:animate-veil-in data-[state=closed]:animate-veil-out",
        className,
      )}
      {...props}
    />
  );
}

/** The overlay holds the surface rather than lying beside it: it places
    it (near the top or centered, through `overlayClassName`) and stacks
    it (`overlayStyle.zIndex`), and a press on it is a press outside. */
function DialogContent({
  className,
  overlayClassName,
  overlayStyle,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  overlayClassName?: string;
  overlayStyle?: React.CSSProperties;
}) {
  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} style={overlayStyle}>
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            "rounded-lg bg-surface shadow-overlay outline-none",
            "data-[state=open]:animate-surface-in data-[state=closed]:animate-surface-out",
            className,
          )}
          {...props}
        />
      </DialogOverlay>
    </DialogPortal>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-display text-lg font-semibold text-text", className)}
      {...props}
    />
  );
}

export { Dialog, DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogTitle };
