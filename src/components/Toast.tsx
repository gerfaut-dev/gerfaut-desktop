import { useState } from "react";
import { createPortal } from "react-dom";
import { useExit } from "../lib/motion";
import { useUi } from "../state/store";

/** Benign confirmations only ("Copied", "Setting saved"). Anything that
    matters never auto-dismisses — alerts are banners, not toasts. */
export function Toast() {
  const toast = useUi((s) => s.toast);
  // It arrives like a dialog and leaves by the same path; while it
  // leaves it keeps its last words, already gone for screen readers.
  const { mounted, leaving } = useExit(toast !== null, "base");
  const [said, setSaid] = useState(toast);
  if (toast !== null && toast !== said) setSaid(toast);
  if (!mounted) return null;
  // The inversion (Nuit background, Écume text) comes from the dark
  // island tokens, never from hardcoded values.
  // Beside the modals in the body and above the highest of them: a copy
  // made in a modal is confirmed over its dim, not under it, and a
  // modal opened earlier hides the app from screen readers, which
  // would then never hear the toast.
  return createPortal(
    <output
      aria-hidden={leaving || undefined}
      className={`shell-rail fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-md bg-background px-4 py-2 font-ui text-sm text-text ${
        leaving ? "pointer-events-none animate-surface-out" : "animate-surface-in"
      }`}
    >
      {toast ?? said}
    </output>,
    document.body,
  );
}
