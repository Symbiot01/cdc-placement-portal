import React from "react";
import { AlertTriangle, Info, Loader2, ShieldAlert } from "lucide-react";
import type { ErpFailureInfo, RecoveryAction } from "../lib/erpSessionGuard";

interface SessionRecoveryBannerProps {
  failure: ErpFailureInfo | null;
  busy: boolean;
  /** Label for the primary recovery button, derived from `failure.action`. */
  onRecover: (action: RecoveryAction) => void;
  onDismiss: () => void;
}

const ACTION_LABELS: Record<RecoveryAction, string> = {
  clean_login: "Reset ERP session & retry",
  sign_in: "Sign in again",
  resend_otp: "Send a fresh OTP",
  none: "",
};

/**
 * Always offers exactly ONE primary action.
 *
 * A confused user's worst outcome is a wall of technical text with no obvious
 * next step, so every failure collapses to: plain cause + one button that fixes
 * it + an optional dismiss. Nothing here ever requires understanding ERP.
 */
export const SessionRecoveryBanner: React.FC<SessionRecoveryBannerProps> = ({
  failure,
  busy,
  onRecover,
  onDismiss,
}) => {
  if (!failure) return null;

  const actionLabel = ACTION_LABELS[failure.action];
  const showAction = Boolean(actionLabel);
  const destructive = failure.action === "clean_login";

  return (
    <section
      role="alert"
      className={`flex flex-wrap items-start justify-between gap-3 border-b px-3 py-2 ${
        destructive
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-sky-300 bg-sky-50 text-sky-950"
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {destructive ? (
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        ) : failure.action === "none" ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
        ) : (
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
        )}
        <div className="min-w-0 text-xs leading-relaxed">
          <p className="font-bold">{failure.title}</p>
          <p className="mt-0.5 opacity-90">{failure.detail}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {showAction && (
          <button
            type="button"
            onClick={() => onRecover(failure.action)}
            disabled={busy}
            className={`inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60 ${
              destructive
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-sky-700 hover:bg-sky-800"
            } cursor-pointer`}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy ? "Working…" : actionLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="rounded px-2 py-1.5 text-xs font-semibold opacity-60 hover:opacity-100 disabled:opacity-30 cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
};
