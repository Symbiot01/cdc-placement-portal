import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Sparkles, X } from "lucide-react";
import { CompanyRole, CvNumber, JnfDetails } from "../lib/erpParsers";
import type { CvDiffSummary, RoleMatchRecommendation } from "../lib/matcherApi";

interface JdModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: CompanyRole | null;
  details: JnfDetails | null;
  loading: boolean;
  recommendation?: RoleMatchRecommendation | null;
  recommendationLoading?: boolean;
  cvDiffs?: CvDiffSummary | null;
  onApplyRole: (role: CompanyRole, cv: CvNumber) => void;
}

export const JdModal: React.FC<JdModalProps> = ({
  open,
  onOpenChange,
  role,
  details,
  loading,
  recommendation,
  recommendationLoading,
  cvDiffs,
  onApplyRole,
}) => {
  const fields = details ? Object.entries(details.fields) : [];

  const getCvDiffText = (cv: CvNumber): string => {
    if (!cvDiffs) return "";
    return cv === 1 ? cvDiffs.cv1 : cv === 2 ? cvDiffs.cv2 : cvDiffs.cv3;
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] w-[min(760px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-white shadow-xl">
          <div className="flex items-start justify-between bg-[#12305a] px-4 py-2.5 text-white">
            <div>
              <span className="text-[11px] text-blue-300">{role?.company || "Company"}</span>
              <Dialog.Title className="text-sm font-bold">
                {role?.role || "Job Description"}
              </Dialog.Title>
            </div>
            <Dialog.Close className="text-white/80 hover:text-white cursor-pointer">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-4 text-xs">
            {loading ? (
              <p className="text-slate-500">Loading job description from ERP…</p>
            ) : !details ? (
              <p className="text-slate-500">No JNF details available.</p>
            ) : (
              <div className="space-y-3">
                {fields.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {fields.map(([k, v]) => (
                      <div key={k} className="rounded border border-slate-200 bg-slate-50 p-2">
                        <div className="text-[10px] font-bold uppercase text-slate-500">{k}</div>
                        <div className="mt-0.5 text-xs font-medium text-slate-900">{v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 1-line AI recommendation banner right above the JD so user doesn't need to read full JD */}
                {recommendation ? (
                  <div className="flex items-start justify-between gap-2 rounded-md border border-indigo-200 bg-indigo-50/90 px-3 py-2 text-xs text-indigo-950">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                        <span>
                          Best Resume: CV{recommendation.cv} — {recommendation.reason}
                        </span>
                      </div>
                      {getCvDiffText(recommendation.cv) && (
                        <div className="text-[11px] text-indigo-700">
                          CV{recommendation.cv} focus: {getCvDiffText(recommendation.cv)}
                        </div>
                      )}
                    </div>
                  </div>
                ) : recommendationLoading ? (
                  <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse text-indigo-600" />
                    <span>Checking best CV match for this role…</span>
                  </div>
                ) : null}

                <pre className="whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 font-sans text-xs leading-relaxed text-slate-800">
                  {details.jd_text || details.raw_text || "No description text returned by ERP."}
                </pre>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              {role &&
                role.is_open &&
                ([1, 2, 3] as CvNumber[]).map((cv) => {
                  const isRec = recommendation?.cv === cv;
                  const diff = getCvDiffText(cv);
                  return (
                    <button
                      key={cv}
                      type="button"
                      title={
                        isRec && recommendation?.reason
                          ? `★ Best match: ${recommendation.reason}${diff ? ` | CV${cv}: ${diff}` : ""}`
                          : diff
                          ? `CV${cv}: ${diff}`
                          : `Apply with CV${cv}`
                      }
                      onClick={() => {
                        onApplyRole(role, cv);
                        onOpenChange(false);
                      }}
                      className={`rounded border px-2.5 py-1 text-xs font-bold cursor-pointer ${
                        isRec
                          ? "border-indigo-400 bg-indigo-600 text-white hover:bg-indigo-700"
                          : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white"
                      }`}
                    >
                      {isRec ? `★ Apply CV${cv}` : `Apply CV${cv}`}
                    </button>
                  );
                })}
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
