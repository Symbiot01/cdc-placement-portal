import React, { useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Building2,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  GraduationCap,
  Loader2,
  Presentation,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import {
  CompanyRole,
  CvNumber,
  JnfDetails,
  formatCtcDisplay,
} from "../lib/erpParsers";
import type { ErpAttachmentRequest } from "../lib/erpBridge";
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
  onOpenAttachment: (req: ErpAttachmentRequest) => void;
}

function formatMoneyValueIfNumeric(val: string, currency = "INR"): {
  primary: string;
  secondary?: string;
} {
  const clean = val.trim();
  if (/^\d{4,12}(\.\d+)?$/.test(clean)) {
    const fmt = formatCtcDisplay(clean, currency);
    return { primary: fmt.primary, secondary: fmt.secondary || undefined };
  }
  return { primary: clean };
}

function renderFormattedLines(text: string): React.ReactNode {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }
        if (trimmed.startsWith("• ")) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
              <span className="leading-relaxed text-slate-800">{trimmed.slice(2)}</span>
            </div>
          );
        }
        if (trimmed.startsWith("◦ ")) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full border border-slate-500" />
              <span className="leading-relaxed text-slate-700">{trimmed.slice(2)}</span>
            </div>
          );
        }
        if (trimmed.startsWith("- ")) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
              <span className="leading-relaxed text-slate-800">{trimmed.slice(2)}</span>
            </div>
          );
        }
        return (
          <p key={idx} className="leading-relaxed text-slate-800">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

const HIGHLIGHT_COMP_KEYS = [
  { match: /^1st\s+year\s+ctc$/i, title: "1st Year CTC" },
  { match: /^base\s+salary$/i, title: "Base Salary" },
  { match: /^gross\b/i, title: "Gross (Per Annum)" },
  { match: /^fixed\s+take\s+home/i, title: "Fixed Take Home" },
  { match: /^joining\s+bonus/i, title: "Joining Bonus" },
  { match: /^relocation\s+bonus/i, title: "Relocation Bonus" },
  { match: /^retention\s+bonus/i, title: "Retention Bonus" },
];

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
  onOpenAttachment,
}) => {
  const formattedTopCtc = useMemo(
    () => (role ? formatCtcDisplay(role.ctc, role.currency) : null),
    [role]
  );

  if (!role) return null;

  const fieldEntries = details
    ? Object.entries(details.fields).filter(
        ([k, v]) => v.trim() !== "" && !(k.toLowerCase().includes("cgpa") && v.trim() === "0.0")
      )
    : [];
  const compMap = details?.compensation_details || {};
  const compEntries = Object.entries(compMap);
  const eligEntries = details?.eligibility_details
    ? Object.entries(details.eligibility_details)
    : [];
  const selEntries = details?.selection_details
    ? Object.entries(details.selection_details)
    : [];
  const compProfileEntries = details?.company_details
    ? Object.entries(details.company_details)
    : [];
  const allowedDepts = details?.allowed_departments || [];

  // Separate scalar compensation KPI cards (Base, Gross, 1st Yr CTC, Joining Bonus...) from narrative breakup/perks
  const kpiCards: Array<{ title: string; primary: string; secondary?: string }> = [];
  const usedCompKeys = new Set<string>();
  for (const spec of HIGHLIGHT_COMP_KEYS) {
    const found = compEntries.find(([k]) => spec.match.test(k));
    if (found) {
      usedCompKeys.add(found[0]);
      const fmt = formatMoneyValueIfNumeric(found[1], role.currency);
      kpiCards.push({
        title: spec.title,
        primary: fmt.primary,
        secondary: fmt.secondary,
      });
    }
  }
  const narrativeCompEntries = compEntries.filter(([k]) => !usedCompKeys.has(k));

  const getCvFocus = (cv: CvNumber): string => {
    if (!cvDiffs) return "";
    return cv === 1 ? cvDiffs.cv1 : cv === 2 ? cvDiffs.cv2 : cvDiffs.cv3;
  };

  const hasAnyOfficialDoc = role.has_jnf_doc || role.has_com_doc || role.has_ppt_doc;
  const hasMoreDetails =
    compEntries.length > 0 || eligEntries.length > 0 || selEntries.length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(920px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Dialog.Title className="text-sm font-bold text-slate-900">
                  {role.company} — {role.role}
                </Dialog.Title>
                {role.applied && (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                    <CheckCircle2 className="h-3 w-3" />
                    Applied {role.applied_cv ? `(CV${role.applied_cv})` : ""}
                  </span>
                )}
              </div>
              <Dialog.Description className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
                <span className="font-bold text-slate-900">
                  CTC: {formattedTopCtc?.primary || role.ctc || "—"}
                </span>
                {formattedTopCtc?.secondary && (
                  <span className="text-slate-400">({formattedTopCtc.secondary})</span>
                )}
                <span>·</span>
                <span>Deadline: {role.deadline || "—"}</span>
                <span>·</span>
                <span className="font-semibold text-blue-700">{role.deadline_badge}</span>
              </Dialog.Description>

              {/* Official ERP Documents Action Bar */}
              {hasAnyOfficialDoc && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {role.has_jnf_doc && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenAttachment({
                          kind: "JNF",
                          com_id: role.com_id,
                          jnf_id: role.jnf_id,
                          year: role.yop,
                          title: `${role.company} — ${role.role}`,
                          subtitle: "Official Job Notification Form / JD file from ERP",
                          filenameStem: `${role.company}_${role.role}_JD`,
                        })
                      }
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-800 transition hover:bg-indigo-600 hover:text-white"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Open Role JD PDF
                    </button>
                  )}
                  {role.has_com_doc && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenAttachment({
                          kind: "COM",
                          com_id: role.com_id,
                          year: role.yop,
                          title: `${role.company} — Company Brochure`,
                          subtitle: "Official company brochure uploaded on ERP",
                          filenameStem: `${role.company}_Brochure`,
                        })
                      }
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-600 hover:text-white"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      Company Brochure
                    </button>
                  )}
                  {role.has_ppt_doc && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenAttachment({
                          kind: "PPT",
                          com_id: role.com_id,
                          year: role.yop,
                          title: `${role.company} — Pre-Placement Deck`,
                          subtitle: "Official PPT / presentation deck uploaded on ERP",
                          filenameStem: `${role.company}_PPT`,
                        })
                      }
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900 transition hover:bg-amber-600 hover:text-white"
                    >
                      <Presentation className="h-3.5 w-3.5" />
                      PPT Deck
                    </button>
                  )}
                </div>
              )}
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 text-xs text-slate-800">
            {/* AI Recommendation Banner */}
            {(recommendation || recommendationLoading) && (
              <div className="mb-3 rounded-lg border border-violet-200 bg-gradient-to-r from-violet-50 to-blue-50 p-3">
                {recommendationLoading && !recommendation ? (
                  <div className="flex items-center gap-2 text-violet-700">
                    <Sparkles className="h-4 w-4 animate-pulse" />
                    <span className="font-semibold">
                      Analyzing which CV fits this JD best…
                    </span>
                  </div>
                ) : recommendation ? (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-violet-700" />
                        <span className="font-extrabold text-violet-950">
                          AI Recommends CV{recommendation.cv}
                        </span>
                        <span className="rounded-full bg-violet-200/80 px-2 py-0.5 text-[10px] font-bold text-violet-900">
                          {Math.round(recommendation.confidence * 100)}% fit
                        </span>
                      </div>
                      {getCvFocus(recommendation.cv) && (
                        <span className="text-[11px] font-medium text-slate-600">
                          CV{recommendation.cv}: {getCvFocus(recommendation.cv)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700">
                      {recommendation.reason}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                <span>
                  Fetching JD + ERP &ldquo;Click Here for more details&rdquo; (CTC breakup,
                  criteria &amp; selection rounds)…
                </span>
              </div>
            ) : details ? (
              <Tabs.Root defaultValue="full_jd" className="space-y-3">
                <Tabs.List className="flex flex-wrap gap-1 border-b border-slate-200 pb-1">
                  <Tabs.Trigger
                    value="full_jd"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-t-md border-b-2 border-transparent px-3 py-1.5 text-xs font-bold text-slate-500 data-[state=active]:border-blue-700 data-[state=active]:bg-blue-50/70 data-[state=active]:text-blue-800"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Role, JD &amp; More Details
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="company"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-t-md border-b-2 border-transparent px-3 py-1.5 text-xs font-bold text-slate-500 data-[state=active]:border-blue-700 data-[state=active]:bg-blue-50/70 data-[state=active]:text-blue-800"
                  >
                    <GraduationCap className="h-3.5 w-3.5" />
                    Company &amp; Eligible Branches
                    {allowedDepts.length > 0 && (
                      <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] text-slate-700">
                        {allowedDepts.length}
                      </span>
                    )}
                  </Tabs.Trigger>
                </Tabs.List>

                {/* Tab 1: Complete unified view — Job Profile + Formatted JD + More Details (CTC Breakup, Criteria, Selection) */}
                <Tabs.Content value="full_jd" className="space-y-4 focus:outline-none">
                  {/* 1. Compensation Snapshot KPI Cards from JnfMoreDet */}
                  {kpiCards.length > 0 && (
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold tracking-wider text-slate-600 uppercase">
                        <Wallet className="h-3.5 w-3.5 text-emerald-700" />
                        Compensation Breakdown (More Details)
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {kpiCards.map((card) => (
                          <div
                            key={card.title}
                            className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-2"
                          >
                            <div className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
                              {card.title}
                            </div>
                            <div className="mt-0.5 text-[13px] font-extrabold text-slate-900">
                              {card.primary}
                            </div>
                            {card.secondary && (
                              <div className="text-[10px] font-medium text-slate-500">
                                {card.secondary}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Narrative CTC Breakup & Perks */}
                  {narrativeCompEntries.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <table className="w-full border-collapse text-xs">
                        <tbody className="divide-y divide-slate-100">
                          {narrativeCompEntries.map(([k, v]) => (
                            <tr key={k}>
                              <th className="w-44 bg-slate-50 px-3 py-2 text-left align-top font-semibold text-slate-600">
                                {k}
                              </th>
                              <td className="px-3 py-2 align-top text-slate-800">
                                {renderFormattedLines(v)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 2. Job Profile Summary Fields */}
                  {fieldEntries.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-extrabold tracking-wider text-slate-600 uppercase">
                        Job Profile
                      </div>
                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        <table className="w-full border-collapse text-xs">
                          <tbody className="divide-y divide-slate-100">
                            {fieldEntries.map(([k, v]) => (
                              <tr key={k}>
                                <th className="w-44 bg-slate-50 px-3 py-1.5 text-left font-semibold text-slate-600">
                                  {k}
                                </th>
                                <td className="px-3 py-1.5 whitespace-pre-wrap text-slate-800">
                                  {v}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 3. Formatted Job Description */}
                  {details.jd_text && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-extrabold tracking-wider text-slate-600 uppercase">
                        Job Description
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3.5 text-xs">
                        {renderFormattedLines(details.jd_text)}
                      </div>
                    </div>
                  )}

                  {/* 4. Eligibility, Skills, Bond & Additional Info from JnfMoreDet */}
                  {eligEntries.length > 0 && (
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold tracking-wider text-slate-600 uppercase">
                        <ClipboardCheck className="h-3.5 w-3.5 text-blue-700" />
                        Eligibility, Skills &amp; Other Details
                      </div>
                      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <table className="w-full border-collapse text-xs">
                          <tbody className="divide-y divide-slate-100">
                            {eligEntries.map(([k, v]) => (
                              <tr key={k}>
                                <th className="w-48 bg-slate-50 px-3 py-2 text-left align-top font-semibold text-slate-600">
                                  {k}
                                </th>
                                <td className="px-3 py-2 align-top text-slate-800">
                                  {renderFormattedLines(v)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 5. Selection Process Rounds from JnfMoreDet */}
                  {selEntries.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-extrabold tracking-wider text-slate-600 uppercase">
                        Selection Process
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {selEntries.map(([k, v]) => {
                          const startsYes = /^yes\b/i.test(v.trim());
                          return (
                            <div
                              key={k}
                              className={`rounded-lg border px-3 py-2 ${
                                startsYes
                                  ? "border-blue-200 bg-blue-50/70 text-blue-950"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                              }`}
                            >
                              <div className="text-[10.5px] font-semibold opacity-80">{k}</div>
                              <div className="mt-0.5 text-xs font-extrabold">{v}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!hasMoreDetails && !details.jd_text && fieldEntries.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                      ERP did not expose additional JNF text for this role.
                      {role.has_jnf_doc
                        ? " Click 'Open Role JD PDF' above to view the uploaded job document."
                        : ""}
                    </div>
                  )}
                </Tabs.Content>

                {/* Tab 2: Company Overview & Allowed Departments */}
                <Tabs.Content value="company" className="space-y-3 focus:outline-none">
                  {compProfileEntries.length > 0 && (
                    <div>
                      <div className="mb-1 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                        Company Overview (TPComView)
                      </div>
                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        <table className="w-full border-collapse text-xs">
                          <tbody className="divide-y divide-slate-100">
                            {compProfileEntries.map(([k, v]) => (
                              <tr key={k}>
                                <th className="w-44 bg-slate-50 px-3 py-1.5 text-left font-semibold text-slate-600">
                                  {k}
                                </th>
                                <td className="px-3 py-1.5 whitespace-pre-wrap text-slate-800">
                                  {/^https?:\/\//i.test(v) ? (
                                    <a
                                      href={v}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 font-medium text-blue-700 underline hover:text-blue-900"
                                    >
                                      {v}
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  ) : (
                                    v
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {allowedDepts.length > 0 && (
                    <div>
                      <div className="mb-1 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                        Eligible Departments &amp; Degrees ({allowedDepts.length})
                      </div>
                      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                        <ul className="space-y-1 text-[11px] text-slate-700">
                          {allowedDepts.map((dept, idx) => (
                            <li key={idx} className="rounded bg-white px-2 py-1 shadow-2xs">
                              {dept}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {compProfileEntries.length === 0 && allowedDepts.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                      No additional company profile metadata was provided on ERP.
                    </div>
                  )}
                </Tabs.Content>
              </Tabs.Root>
            ) : (
              <p className="py-6 text-center text-slate-400">Could not load JNF details.</p>
            )}
          </div>

          {/* Footer Quick Apply */}
          {!role.applied && role.is_open && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
              <span className="text-xs font-semibold text-slate-600">
                Quick apply to {role.company}:
              </span>
              <div className="flex items-center gap-1.5">
                {([1, 2, 3] as CvNumber[]).map((cv) => {
                  const isRec = recommendation?.cv === cv;
                  return (
                    <button
                      key={cv}
                      type="button"
                      onClick={() => {
                        onApplyRole(role, cv);
                        onOpenChange(false);
                      }}
                      title={
                        getCvFocus(cv) ? `CV${cv}: ${getCvFocus(cv)}` : `Apply with CV${cv}`
                      }
                      className={`cursor-pointer rounded-md px-3 py-1 text-xs font-bold text-white hover:opacity-95 ${
                        isRec
                          ? "bg-violet-700 ring-2 ring-amber-400 ring-offset-1"
                          : "bg-blue-700 hover:bg-blue-800"
                      }`}
                    >
                      {isRec ? `★ Apply CV${cv} (Recommended)` : `Apply with CV${cv}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
