import React, { useEffect, useState } from "react";
import { KeyRound, Loader2, Mail, RefreshCw, Send, Zap } from "lucide-react";

interface OtpStripProps {
  authenticated: boolean;
  stage: "uninitialized" | "otp_sent" | "authenticated";
  resumingSession: boolean;
  hasSavedLogin: boolean;
  rollno: string;
  sendingOtp: boolean;
  verifyingOtp: boolean;
  readingGmailOtp: boolean;
  gmailAutoReady: boolean;
  gmailEnabled: boolean;
  gmailEmail: string;
  suggestedOtp: string;
  bridgeReady: boolean;
  /** True while a session reset / recovery round-trip is running. */
  recovering?: boolean;
  onSetupLogin: () => void;
  onSendOtp: (opts?: { forceManual?: boolean }) => void;
  onRecheckGmail: () => void;
  onVerifyOtp: (otp: string) => void;
  /** One-tap “start over”: clears ERP state and begins a clean login. */
  onResetSession?: () => void;
}

export const OtpStrip: React.FC<OtpStripProps> = ({
  authenticated,
  stage,
  resumingSession,
  hasSavedLogin,
  rollno,
  sendingOtp,
  verifyingOtp,
  readingGmailOtp,
  gmailAutoReady,
  gmailEnabled,
  gmailEmail,
  suggestedOtp,
  bridgeReady,
  recovering = false,
  onSetupLogin,
  onSendOtp,
  onRecheckGmail,
  onVerifyOtp,
  onResetSession,
}) => {
  const [otp, setOtp] = useState("");
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    if (suggestedOtp) setOtp(suggestedOtp);
  }, [suggestedOtp]);

  if (authenticated) {
    return null;
  }

  const busy = resumingSession || sendingOtp || readingGmailOtp || verifyingOtp || recovering;
  const showManualForm =
    !gmailAutoReady ||
    manualOverride ||
    (stage === "otp_sent" && !readingGmailOtp && !verifyingOtp);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) return;
    onVerifyOtp(otp.trim());
  };

  const statusText = resumingSession
    ? "Checking active ERP session…"
    : recovering
    ? "Starting a clean ERP session…"
    : !hasSavedLogin
    ? "Set up login once (roll number, security answers, and optional Gmail Auto-OTP)."
    : readingGmailOtp
    ? `Waiting for the new ERP OTP email in ${gmailEmail}…`
    : verifyingOtp
    ? "Verifying OTP and opening CDC Placement…"
    : stage === "otp_sent"
    ? gmailAutoReady
      ? `OTP sent. Check ${gmailEmail} again or enter the 6-digit code below.`
      : "Enter the 6-digit OTP from email to open CDC."
    : gmailAutoReady
    ? `Saved as ${rollno} · Auto-OTP ready via ${gmailEmail}.`
    : gmailEnabled && gmailEmail
    ? `Saved as ${rollno}. Add VITE_GMAIL_CLIENT_ID to enable Auto-OTP, or sign in manually.`
    : `Saved as ${rollno}. Click Send OTP, or enable Auto-fill OTP in Edit login.`;

  return (
    <section className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1.5">
      <div className="flex items-center gap-2 text-xs text-slate-600">
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-700" />}
        <span>{statusText}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {!hasSavedLogin && (
          <button
            type="button"
            onClick={onSetupLogin}
            disabled={!bridgeReady || resumingSession}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Set up login
          </button>
        )}

        {gmailAutoReady && hasSavedLogin ? (
          <>
            <button
              type="button"
              onClick={() => {
                setManualOverride(false);
                onSendOtp();
              }}
              disabled={!bridgeReady || busy}
              className="inline-flex items-center gap-1 rounded bg-blue-700 px-3 py-1 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5" />
              {resumingSession
                ? "Checking…"
                : sendingOtp
                ? "Requesting OTP…"
                : readingGmailOtp
                ? "Reading Gmail…"
                : verifyingOtp
                ? "Opening CDC…"
                : "Sign in to CDC"}
            </button>

            {stage === "otp_sent" && !readingGmailOtp && !verifyingOtp && (
              <button
                type="button"
                onClick={onRecheckGmail}
                disabled={!bridgeReady || busy}
                className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                Check Gmail again
              </button>
            )}

            {!showManualForm && (
              <button
                type="button"
                onClick={() => {
                  setManualOverride(true);
                  onSendOtp({ forceManual: true });
                }}
                disabled={!bridgeReady || busy}
                className="rounded px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 cursor-pointer"
              >
                Manual OTP
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => onSendOtp({ forceManual: true })}
            disabled={!bridgeReady || !hasSavedLogin || busy}
            className="inline-flex items-center gap-1 rounded bg-blue-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
          >
            <Mail className="h-3.5 w-3.5" />
            {sendingOtp ? "Sending…" : "Send OTP"}
          </button>
        )}

        {showManualForm && (
          <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder={readingGmailOtp ? "Waiting…" : "OTP"}
              maxLength={10}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              className="w-24 rounded border border-slate-300 px-2 py-1 text-center text-[13px] font-bold tracking-widest text-slate-900 focus:border-blue-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!bridgeReady || verifyingOtp || resumingSession || recovering}
              className="inline-flex items-center gap-1 rounded bg-amber-500 px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              {verifyingOtp ? "Opening…" : "Open CDC"}
            </button>
          </form>
        )}

        {/* Escape hatch: always reachable, so a confused user is never stuck
            with no idea what to do next. Only shown when there is saved login. */}
        {hasSavedLogin && onResetSession && (
          <button
            type="button"
            onClick={onResetSession}
            disabled={!bridgeReady || busy}
            title="Clears every ERP cookie and starts a completely fresh login. Use this if ERP seems stuck or logged in elsewhere."
            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 cursor-pointer"
          >
            {recovering ? "Resetting…" : "Start over"}
          </button>
        )}
      </div>
    </section>
  );
};
