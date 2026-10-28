import React, { useState } from "react";
import { KeyRound, Mail, Send } from "lucide-react";

interface OtpStripProps {
  authenticated: boolean;
  stage: "uninitialized" | "otp_sent" | "authenticated";
  hasSavedLogin: boolean;
  rollno: string;
  sendingOtp: boolean;
  verifyingOtp: boolean;
  bridgeReady: boolean;
  onSetupLogin: () => void;
  onSendOtp: () => void;
  onVerifyOtp: (otp: string) => void;
}

export const OtpStrip: React.FC<OtpStripProps> = ({
  authenticated,
  stage,
  hasSavedLogin,
  rollno,
  sendingOtp,
  verifyingOtp,
  bridgeReady,
  onSetupLogin,
  onSendOtp,
  onVerifyOtp,
}) => {
  const [otp, setOtp] = useState("");

  if (authenticated) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) return;
    onVerifyOtp(otp.trim());
    setOtp("");
  };

  return (
    <section className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1.5">
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <span>
          {!hasSavedLogin
            ? "Set up login: fetch all 3 ERP security questions, then send OTP."
            : stage === "otp_sent"
            ? "Enter the 6-digit OTP from email to open CDC."
            : `Saved as ${rollno}. Click Send OTP, or Edit login in the top bar.`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {!hasSavedLogin && (
          <button
            type="button"
            onClick={onSetupLogin}
            disabled={!bridgeReady}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Set up login
          </button>
        )}

        <button
          type="button"
          onClick={onSendOtp}
          disabled={!bridgeReady || !hasSavedLogin || sendingOtp}
          className="inline-flex items-center gap-1 rounded bg-blue-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
        >
          <Mail className="h-3.5 w-3.5" />
          {sendingOtp ? "Sending…" : "Send OTP"}
        </button>

        <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="OTP"
            maxLength={10}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            className="w-24 rounded border border-slate-300 px-2 py-1 text-center text-[13px] font-bold tracking-widest text-slate-900 focus:border-blue-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!bridgeReady || verifyingOtp}
            className="inline-flex items-center gap-1 rounded bg-amber-500 px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
            {verifyingOtp ? "Opening…" : "Open CDC"}
          </button>
        </form>
      </div>
    </section>
  );
};
