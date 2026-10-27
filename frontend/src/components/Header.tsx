import React from "react";
import { FileText, KeyRound, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { CvNumber } from "../lib/erpParsers";
import type { CvDiffSummary } from "../lib/matcherApi";

interface HeaderProps {
  rollno: string;
  stage: "uninitialized" | "otp_sent" | "authenticated";
  hasSavedLogin: boolean;
  serverConsent: boolean | null;
  isRefreshing: boolean;
  cvDiffs?: CvDiffSummary | null;
  onOpenCv: (cv: CvNumber) => void;
  onRefresh: () => void;
  onEditLogin: () => void;
  onOpenConsent: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  rollno,
  stage,
  hasSavedLogin,
  serverConsent,
  isRefreshing,
  cvDiffs,
  onOpenCv,
  onRefresh,
  onEditLogin,
  onOpenConsent,
  onLogout,
}) => {
  const isAuthenticated = stage === "authenticated";

  const getCvDiffText = (cv: CvNumber): string => {
    if (!cvDiffs) return "";
    return cv === 1 ? cvDiffs.cv1 : cv === 2 ? cvDiffs.cv2 : cvDiffs.cv3;
  };

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b-2 border-amber-500 bg-[#0b1f3a] px-3 py-1.5 text-white">
      <div className="flex items-center gap-2">
        <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-extrabold text-[#0b1f3a]">
          CDC
        </span>
        <strong className="text-[13px] font-bold tracking-tight">Placement 2026–27</strong>
        {rollno && <span className="text-xs text-slate-300">{rollno}</span>}
      </div>

      <div className="flex items-center gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            isAuthenticated
              ? "bg-green-100 text-green-800"
              : stage === "otp_sent"
              ? "bg-amber-100 text-amber-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {isAuthenticated ? "On" : stage === "otp_sent" ? "OTP" : "Off"}
        </span>

        {isAuthenticated && (
          <div className="flex items-center gap-1">
            {([1, 2, 3] as CvNumber[]).map((cv) => {
              const diff = getCvDiffText(cv);
              return (
                <div key={cv} className="group relative">
                  <button
                    type="button"
                    onClick={() => onOpenCv(cv)}
                    className="inline-flex items-center gap-1 rounded border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-white/20 cursor-pointer"
                    title={diff ? `CV${cv}: ${diff}` : `Preview CV ${cv}`}
                  >
                    <FileText className="h-3 w-3" />
                    CV{cv}
                  </button>
                  {diff && (
                    <div className="pointer-events-none invisible absolute right-0 top-full z-50 mt-1.5 w-64 rounded-md border border-slate-700 bg-slate-900 p-2 text-[11px] leading-snug text-slate-100 opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100">
                      <div className="font-bold text-amber-300">CV{cv} Profile Focus</div>
                      <div className="mt-0.5 text-slate-200">{diff}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={onOpenConsent}
          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-bold cursor-pointer ${
            serverConsent
              ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-100"
              : "border-white/20 bg-white/10 text-slate-200 hover:bg-white/20"
          }`}
          title="Configure permission for sending CV PDFs & JD tables to AI Matcher server"
        >
          <ShieldCheck className="h-3 w-3" />
          {serverConsent ? "AI Sync: On" : "AI Sync: Ask"}
        </button>

        {isAuthenticated && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1 rounded border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-white/20 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}

        {(hasSavedLogin || isAuthenticated) && (
          <button
            type="button"
            onClick={onEditLogin}
            className="inline-flex items-center gap-1 rounded border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-white/20 cursor-pointer"
          >
            <KeyRound className="h-3 w-3" />
            Edit login
          </button>
        )}

        {isAuthenticated && (
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1 rounded border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-white/20 cursor-pointer"
          >
            <LogOut className="h-3 w-3" />
            Logout
          </button>
        )}
      </div>
    </header>
  );
};
