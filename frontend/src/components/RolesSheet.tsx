import React, { useMemo, useState } from "react";
import {
  ArrowUpDown,
  Building2,
  ChevronDown,
  ChevronRight,
  FileText,
  Presentation,
  Search,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import {
  CompanyRole,
  CvNumber,
  PlacementNotice,
  categorizeCompanies,
  doesNoticeMatchCompany,
  formatCtcDisplay,
} from "../lib/erpParsers";
import type { ErpAttachmentRequest } from "../lib/erpBridge";
import type { CvDiffSummary, RoleMatchRecommendation } from "../lib/matcherApi";

type OpenSortMode = "deadline" | "ctc_desc" | "company";

interface RolesSheetProps {
  companies: CompanyRole[];
  notices: PlacementNotice[];
  selectedKeys: Set<string>;
  smartBusy: boolean;
  aiWarmingUp?: boolean;
  cvDiffs?: CvDiffSummary | null;
  recommendations: Record<string, RoleMatchRecommendation>;
  onToggleKey: (key: string, checked: boolean) => void;
  onToggleAllOpen: (keys: string[], checked: boolean) => void;
  onApplyRole: (role: CompanyRole, cv: CvNumber) => void;
  onSwitchCv: (role: CompanyRole, newCv: CvNumber, prevCv: CvNumber | null) => void;
  onCancelRole: (role: CompanyRole) => void;
  onSmartApplySelected: () => void;
  onOpenJd: (role: CompanyRole) => void;
  onOpenAttachment: (req: ErpAttachmentRequest) => void;
  onFilterNoticesByCompany?: (company: string) => void;
}

const badgeClass: Record<CompanyRole["urgency"], string> = {
  critical: "border border-red-200 bg-red-50 text-red-700",
  soon: "border border-amber-200 bg-amber-50 text-amber-800",
  open: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  upcoming: "border border-blue-200 bg-blue-50 text-blue-700",
  closed: "bg-slate-100 text-slate-500",
  unknown: "bg-slate-100 text-slate-400",
};

const cvPillClass: Record<CvNumber, string> = {
  1: "border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-700 hover:text-white",
  2: "border-purple-600 bg-purple-50 text-purple-700 hover:bg-purple-700 hover:text-white",
  3: "border-teal-600 bg-teal-50 text-teal-700 hover:bg-teal-700 hover:text-white",
};

const cvSolidBadge: Record<CvNumber, string> = {
  1: "bg-blue-700 text-white",
  2: "bg-purple-700 text-white",
  3: "bg-teal-700 text-white",
};

export const RolesSheet: React.FC<RolesSheetProps> = ({
  companies,
  notices,
  selectedKeys,
  smartBusy,
  aiWarmingUp,
  cvDiffs,
  recommendations,
  onToggleKey,
  onToggleAllOpen,
  onApplyRole,
  onSwitchCv,
  onCancelRole,
  onSmartApplySelected,
  onOpenJd,
  onOpenAttachment,
  onFilterNoticesByCompany,
}) => {
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<OpenSortMode>("deadline");
  const [onlyDocs, setOnlyDocs] = useState(false);
  const [closedExpanded, setClosedExpanded] = useState(false);

  const getCvFocus = (cv: CvNumber): string => {
    if (!cvDiffs) return "";
    return cv === 1 ? cvDiffs.cv1 : cv === 2 ? cvDiffs.cv2 : cvDiffs.cv3;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((r) => {
      if (onlyDocs && !r.has_jnf_doc && !r.has_com_doc && !r.has_ppt_doc) {
        return false;
      }
      if (!q) return true;
      return (
        r.company.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q) ||
        r.ctc.toLowerCase().includes(q) ||
        r.currency.toLowerCase().includes(q)
      );
    });
  }, [companies, search, onlyDocs]);

  const { unapplied_open: rawOpen, applied, unapplied_closed } = useMemo(
    () => categorizeCompanies(filtered),
    [filtered]
  );

  const unapplied_open = useMemo(() => {
    if (sortMode === "deadline") return rawOpen;
    const copy = [...rawOpen];
    if (sortMode === "ctc_desc") {
      copy.sort((a, b) => {
        const ca = formatCtcDisplay(a.ctc, a.currency).inrSortValue;
        const cb = formatCtcDisplay(b.ctc, b.currency).inrSortValue;
        if (cb !== ca) return cb - ca;
        return (a.seconds_remaining ?? 1e9) - (b.seconds_remaining ?? 1e9);
      });
    } else if (sortMode === "company") {
      copy.sort((a, b) => a.company.localeCompare(b.company));
    }
    return copy;
  }, [rawOpen, sortMode]);

  const noticeCountsByRoleKey = useMemo(() => {
    const map = new Map<string, number>();
    if (notices.length === 0) return map;
    for (const r of companies) {
      let count = 0;
      for (const n of notices) {
        if (doesNoticeMatchCompany(n.company, r.company)) count += 1;
      }
      if (count > 0) map.set(r.key, count);
    }
    return map;
  }, [companies, notices]);

  const openKeys = unapplied_open.map((r) => r.key);
  const selectedOpenCount = openKeys.filter((k) => selectedKeys.has(k)).length;
  const allOpenSelected = openKeys.length > 0 && selectedOpenCount === openKeys.length;
  const docsCount = useMemo(
    () => companies.filter((r) => r.has_jnf_doc || r.has_com_doc || r.has_ppt_doc).length,
    [companies]
  );

  const renderDocChips = (r: CompanyRole) => {
    if (!r.has_jnf_doc && !r.has_com_doc && !r.has_ppt_doc) return null;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {r.has_jnf_doc && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAttachment({
                kind: "JNF",
                com_id: r.com_id,
                jnf_id: r.jnf_id,
                year: r.yop,
                title: `${r.company} — ${r.role}`,
                subtitle: "Official Job Notification Form / JD attachment from ERP",
                filenameStem: `${r.company}_${r.role}_JD`,
              });
            }}
            className="inline-flex cursor-pointer items-center gap-0.5 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9.5px] font-bold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-100"
            title="Preview & download official JNF / JD PDF uploaded by the company"
          >
            <FileText className="h-2.5 w-2.5" />
            JD PDF
          </button>
        )}
        {r.has_com_doc && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAttachment({
                kind: "COM",
                com_id: r.com_id,
                year: r.yop,
                title: `${r.company} — Company Brochure`,
                subtitle: "Official company overview document from ERP",
                filenameStem: `${r.company}_Brochure`,
              });
            }}
            className="inline-flex cursor-pointer items-center gap-0.5 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-100"
            title="Preview & download Company Brochure PDF"
          >
            <Building2 className="h-2.5 w-2.5" />
            Brochure
          </button>
        )}
        {r.has_ppt_doc && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAttachment({
                kind: "PPT",
                com_id: r.com_id,
                year: r.yop,
                title: `${r.company} — Pre-Placement Deck`,
                subtitle: "Official PPT / presentation file from ERP",
                filenameStem: `${r.company}_PPT`,
              });
            }}
            className="inline-flex cursor-pointer items-center gap-0.5 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-800 transition hover:border-amber-400 hover:bg-amber-100"
            title="Preview & download Pre-Placement Talk presentation"
          >
            <Presentation className="h-2.5 w-2.5" />
            PPT
          </button>
        )}
      </div>
    );
  };

  const renderCtcCell = (r: CompanyRole, muted = false) => {
    const fmt = formatCtcDisplay(r.ctc, r.currency);
    return (
      <div className="leading-tight" title={fmt.secondary ? `Raw ERP CTC: ${fmt.secondary}` : undefined}>
        <div
          className={`whitespace-nowrap text-[11.5px] font-bold ${
            muted ? "text-slate-500" : "text-slate-800"
          }`}
        >
          {fmt.primary}
        </div>
        {fmt.secondary && (
          <div className="whitespace-nowrap text-[9.5px] font-medium text-slate-400">
            {fmt.secondary}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${companies.length} roles, companies, or CTC…`}
            className="w-full rounded-md border border-slate-300 bg-white py-1 pr-7 pl-8 text-xs focus:border-blue-600 focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {docsCount > 0 && (
          <button
            type="button"
            onClick={() => setOnlyDocs((v) => !v)}
            className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold transition ${
              onlyDocs
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
            }`}
            title="Show only roles where the company uploaded a JD PDF, Brochure, or PPT"
          >
            <FileText className="h-3 w-3" />
            Has PDF ({docsCount})
          </button>
        )}

        <div className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600">
          <ArrowUpDown className="h-3 w-3 text-slate-400" />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as OpenSortMode)}
            aria-label="Sort open roles"
            className="cursor-pointer bg-transparent py-0.5 text-[11px] font-semibold text-slate-700 focus:outline-none"
          >
            <option value="deadline">Closing soonest</option>
            <option value="ctc_desc">Highest CTC</option>
            <option value="company">Company A–Z</option>
          </select>
        </div>

        <button
          type="button"
          onClick={onSmartApplySelected}
          disabled={selectedOpenCount === 0 || smartBusy}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-gradient-to-r from-blue-700 to-violet-700 px-3 py-1 text-xs font-bold text-white shadow-xs hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {smartBusy ? "Matching AI…" : `Smart Apply (${selectedOpenCount})`}
        </button>

        {aiWarmingUp && (
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
            <Sparkles className="h-2.5 w-2.5 animate-pulse" />
            AI analyzing CVs…
          </span>
        )}
      </div>

      {/* Section 1: Open & Not Applied */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-blue-50/70 px-3 py-1.5 text-[11px] font-extrabold tracking-wider text-blue-900 uppercase">
        <span>Open — Not Applied ({unapplied_open.length})</span>
        <span className="text-[10px] font-medium normal-case text-slate-500">
          Click role for JD & CTC breakup · PDF chips preview attachments
        </span>
      </div>

      {unapplied_open.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                <th className="w-8 px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={allOpenSelected}
                    onChange={(e) => onToggleAllOpen(openKeys, e.target.checked)}
                    className="h-3.5 w-3.5 cursor-pointer accent-blue-700"
                    title="Select all open roles"
                  />
                </th>
                <th className="px-2 py-1.5">Company & Docs</th>
                <th className="px-2 py-1.5">Role</th>
                <th className="px-2 py-1.5">CTC</th>
                <th className="px-2 py-1.5">Deadline</th>
                <th className="px-2.5 py-1.5 text-right">Apply CV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {unapplied_open.map((r) => {
                const rec = recommendations[r.key];
                const noticeHits = noticeCountsByRoleKey.get(r.key) || 0;
                return (
                  <tr
                    key={r.key}
                    className={`transition-colors hover:bg-blue-50/40 ${
                      r.urgency === "critical" ? "bg-red-50/30" : ""
                    }`}
                  >
                    <td className="px-2.5 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(r.key)}
                        onChange={(e) => onToggleKey(r.key, e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-blue-700"
                      />
                    </td>
                    <td className="max-w-[200px] px-2 py-2 align-top">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-semibold text-slate-900">{r.company}</span>
                        {noticeHits > 0 && onFilterNoticesByCompany && (
                          <button
                            type="button"
                            onClick={() => onFilterNoticesByCompany(r.company)}
                            className="cursor-pointer rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-900 hover:bg-amber-200"
                            title={`${noticeHits} placement notice(s) mention ${r.company} — click to filter Notices`}
                          >
                            {noticeHits} notice{noticeHits > 1 ? "s" : ""}
                          </button>
                        )}
                      </div>
                      {renderDocChips(r)}
                    </td>
                    <td className="max-w-[220px] px-2 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => onOpenJd(r)}
                        className="cursor-pointer text-left font-medium text-blue-700 hover:underline"
                      >
                        {r.role}
                      </button>
                      {rec && (
                        <div className="group relative mt-0.5">
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-violet-700">
                            <span className="rounded bg-violet-100 px-1 py-0.2 font-extrabold text-violet-800">
                              AI → CV{rec.cv}
                            </span>
                            <span className="line-clamp-1 font-normal text-slate-600">
                              {rec.reason}
                            </span>
                          </div>
                          {rec.reason && (
                            <div className="pointer-events-none invisible absolute top-full left-0 z-30 mt-1 w-72 rounded-md border border-slate-700 bg-slate-900 p-2 text-[11px] leading-snug text-slate-100 opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100">
                              <div className="font-bold text-amber-300">
                                Why CV{rec.cv} ({Math.round(rec.confidence * 100)}% fit)
                              </div>
                              <div className="mt-0.5 text-slate-200">{rec.reason}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">{renderCtcCell(r)}</td>
                    <td className="px-2 py-2 align-top whitespace-nowrap">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeClass[r.urgency]}`}
                        title={r.deadline}
                      >
                        {r.deadline_badge}
                      </span>
                      {r.deadline && (
                        <div className="mt-0.5 text-[9.5px] text-slate-400">
                          {r.deadline.replace(/^\d{2}-([A-Za-z]{3})-\d{4}\s+/, "$1 ")}
                        </div>
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-right align-top whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {([1, 2, 3] as CvNumber[]).map((cv) => {
                          const isRec = rec?.cv === cv;
                          const cvFocus = getCvFocus(cv);
                          const tip = isRec
                            ? `AI Recommended CV${cv}: ${rec.reason}${cvFocus ? ` | Profile: ${cvFocus}` : ""}`
                            : cvFocus
                              ? `Apply with CV${cv} (${cvFocus})`
                              : `Apply with CV${cv}`;
                          return (
                            <button
                              key={cv}
                              type="button"
                              onClick={() => onApplyRole(r, cv)}
                              className={`cursor-pointer rounded border px-1.5 py-0.5 text-[10px] font-extrabold transition-colors ${cvPillClass[cv]} ${
                                isRec ? "ring-2 ring-amber-400 ring-offset-1" : ""
                              }`}
                              title={tip}
                            >
                              {isRec ? `★CV${cv}` : `CV${cv}`}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-3 py-4 text-center text-xs text-slate-400">
          No open unapplied roles match the current filter.
        </div>
      )}

      {/* Section 2: Applied */}
      <div className="flex items-center justify-between border-y border-slate-200 bg-emerald-50/70 px-3 py-1.5 text-[11px] font-extrabold tracking-wider text-emerald-900 uppercase">
        <span>Applied ({applied.length})</span>
        <span className="text-[10px] font-medium normal-case text-slate-500">
          Switch CV or Undo while deadline is open
        </span>
      </div>

      {applied.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                <th className="px-2.5 py-1.5">Company & Docs</th>
                <th className="px-2 py-1.5">Role</th>
                <th className="px-2 py-1.5">CTC</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2.5 py-1.5 text-right">Submitted / Switch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applied.map((r) => {
                const curCv: CvNumber | null = r.applied_cv ?? null;
                const noticeHits = noticeCountsByRoleKey.get(r.key) || 0;
                return (
                  <tr key={r.key} className="bg-emerald-50/20 hover:bg-emerald-50/40">
                    <td className="max-w-[200px] px-2.5 py-2 align-top">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-semibold text-slate-900">{r.company}</span>
                        {noticeHits > 0 && onFilterNoticesByCompany && (
                          <button
                            type="button"
                            onClick={() => onFilterNoticesByCompany(r.company)}
                            className="cursor-pointer rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-900 hover:bg-amber-200"
                            title={`${noticeHits} notice(s) mention ${r.company} — click to filter Notices`}
                          >
                            {noticeHits} notice{noticeHits > 1 ? "s" : ""}
                          </button>
                        )}
                      </div>
                      {renderDocChips(r)}
                    </td>
                    <td className="max-w-[210px] px-2 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => onOpenJd(r)}
                        className="cursor-pointer text-left font-medium text-blue-700 hover:underline"
                      >
                        {r.role}
                      </button>
                      {r.interview_status && (
                        <div className="mt-0.5 text-[10px] font-semibold text-emerald-800">
                          Status: {r.interview_status}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">{renderCtcCell(r)}</td>
                    <td className="px-2 py-2 align-top whitespace-nowrap">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeClass[r.urgency]}`}
                        title={r.deadline}
                      >
                        {r.deadline_badge}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-right align-top whitespace-nowrap">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                            curCv ? cvSolidBadge[curCv] : "bg-emerald-700 text-white"
                          }`}
                        >
                          ✓ {curCv ? `CV${curCv}` : "Applied"}
                        </span>

                        {r.is_open && (
                          <>
                            {([1, 2, 3] as CvNumber[])
                              .filter((cv) => cv !== curCv)
                              .map((cv) => (
                                <button
                                  key={cv}
                                  type="button"
                                  onClick={() => onSwitchCv(r, cv, curCv)}
                                  className="cursor-pointer rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:border-blue-600 hover:text-blue-700"
                                  title={`Switch to CV${cv}`}
                                >
                                  →CV{cv}
                                </button>
                              ))}

                            {r.switched_from && r.switched_from !== curCv && (
                              <button
                                type="button"
                                onClick={() => onSwitchCv(r, r.switched_from!, null)}
                                className="inline-flex cursor-pointer items-center gap-0.5 rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 hover:bg-amber-100"
                                title={`Revert back to CV${r.switched_from}`}
                              >
                                <Undo2 className="h-2.5 w-2.5" />
                                CV{r.switched_from}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onCancelRole(r)}
                              className="cursor-pointer rounded border border-red-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-red-600 hover:bg-red-600 hover:text-white"
                              title="Withdraw application"
                            >
                              ×
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-3 py-3 text-center text-xs text-slate-400">
          No applied roles yet.
        </div>
      )}

      {/* Section 3: Closed & Not Applied (collapsible so active items stay clean) */}
      <button
        type="button"
        onClick={() => setClosedExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between border-t border-slate-200 bg-slate-100 px-3 py-1.5 text-left text-[11px] font-extrabold tracking-wider text-slate-600 uppercase transition hover:bg-slate-200/70"
      >
        <span className="inline-flex items-center gap-1">
          {closedExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Closed — Not Applied ({unapplied_closed.length})
        </span>
        <span className="text-[10px] font-medium normal-case text-slate-500">
          {closedExpanded ? "Click to collapse" : "Click to inspect past roles & PDFs"}
        </span>
      </button>

      {closedExpanded && unapplied_closed.length > 0 && (
        <div className="max-h-80 overflow-auto border-t border-slate-200 opacity-85">
          <table className="w-full border-collapse text-left text-xs">
            <tbody className="divide-y divide-slate-100">
              {unapplied_closed.map((r) => (
                <tr key={r.key} className="hover:bg-slate-50">
                  <td className="max-w-[200px] px-2.5 py-2 align-top">
                    <div className="font-medium text-slate-700">{r.company}</div>
                    {renderDocChips(r)}
                  </td>
                  <td className="max-w-[220px] px-2 py-2 align-top">
                    <button
                      type="button"
                      onClick={() => onOpenJd(r)}
                      className="cursor-pointer text-left text-slate-600 hover:text-blue-700 hover:underline"
                    >
                      {r.role}
                    </button>
                  </td>
                  <td className="px-2 py-2 align-top">{renderCtcCell(r, true)}</td>
                  <td className="px-2.5 py-2 text-right align-top">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      {r.deadline_badge}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
