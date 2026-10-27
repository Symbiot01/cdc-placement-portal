import React, { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Sparkles, Undo2 } from "lucide-react";
import { CompanyRole, CvNumber, categorizeCompanies } from "../lib/erpParsers";
import type { CvDiffSummary, RoleMatchRecommendation } from "../lib/matcherApi";

interface RolesSheetProps {
  companies: CompanyRole[];
  selectedKeys: Set<string>;
  smartBusy: boolean;
  aiWarmingUp?: boolean;
  cvDiffs?: CvDiffSummary | null;
  recommendations?: Record<string, RoleMatchRecommendation>;
  onToggleKey: (key: string, checked: boolean) => void;
  onToggleAllOpen: (keys: string[], checked: boolean) => void;
  onApplyRole: (role: CompanyRole, cv: CvNumber) => void;
  onSwitchCv: (role: CompanyRole, newCv: CvNumber, prevCv: CvNumber | null) => void;
  onCancelRole: (role: CompanyRole) => void;
  onSmartApplySelected: () => void;
  onOpenJd: (role: CompanyRole) => void;
}

export const RolesSheet: React.FC<RolesSheetProps> = ({
  companies,
  selectedKeys,
  smartBusy,
  aiWarmingUp = false,
  cvDiffs,
  recommendations = {},
  onToggleKey,
  onToggleAllOpen,
  onApplyRole,
  onSwitchCv,
  onCancelRole,
  onSmartApplySelected,
  onOpenJd,
}) => {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const getCvDiffText = (cv: CvNumber): string => {
    if (!cvDiffs) return "";
    return cv === 1 ? cvDiffs.cv1 : cv === 2 ? cvDiffs.cv2 : cvDiffs.cv3;
  };

  const buildCvHoverTitle = (cv: CvNumber, rec?: RoleMatchRecommendation): string => {
    const parts: string[] = [];
    if (rec && rec.cv === cv && rec.reason) {
      parts.push(`★ Best for this role: ${rec.reason}`);
    } else if (rec && rec.reason) {
      parts.push(`AI recommends CV${rec.cv}: ${rec.reason}`);
    }
    const diff = getCvDiffText(cv);
    if (diff) {
      parts.push(`CV${cv} focus: ${diff}`);
    }
    return parts.join(" — ") || `Apply with CV${cv}`;
  };

  const filtered = companies.filter((item) => {
    if (!query) return true;
    const hay = `${item.company} ${item.role} ${item.ctc} ${item.interview_status}`.toLowerCase();
    return hay.includes(query);
  });

  const { unapplied_open, applied, unapplied_closed } = categorizeCompanies(filtered);
  const openKeys = unapplied_open.map((r) => r.key);
  const allOpenSelected = openKeys.length > 0 && openKeys.every((k) => selectedKeys.has(k));

  const renderBadge = (item: CompanyRole) => {
    const cls =
      item.urgency === "critical"
        ? "bg-red-100 text-red-700"
        : item.urgency === "soon"
        ? "bg-amber-100 text-amber-800"
        : item.urgency === "open"
        ? "bg-green-100 text-green-800"
        : "bg-slate-100 text-slate-500";
    return (
      <div className="flex flex-col gap-0.5">
        <span className={`inline-block w-fit rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>
          {item.deadline_badge}
        </span>
        <span className="text-[11px] text-slate-500">{item.deadline || "—"}</span>
      </div>
    );
  };

  const renderSectionDivider = (
    title: string,
    count: number,
    tone: "open" | "applied" | "closed"
  ) => {
    const toneCls =
      tone === "open"
        ? "border-amber-200 bg-amber-50/80 text-amber-900"
        : tone === "applied"
        ? "border-emerald-200 bg-emerald-50/80 text-emerald-900"
        : "border-slate-200 bg-slate-100 text-slate-600";
    return (
      <tr className={`border-y ${toneCls}`}>
        <td colSpan={6} className="px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider">
          {title} ({count})
        </td>
      </tr>
    );
  };

  const renderRow = (item: CompanyRole, section: "open" | "applied" | "closed") => {
    const isChecked = selectedKeys.has(item.key);
    const cvLabel = item.applied_cv ? `CV${item.applied_cv}` : "CV?";
    const rec = recommendations[item.key];

    return (
      <tr
        key={item.key}
        className={`border-b border-slate-200 hover:bg-blue-50/40 ${
          section === "closed" ? "opacity-60" : ""
        }`}
      >
        <td className="w-7 px-2 py-2 text-center align-top">
          {section === "open" && (
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => onToggleKey(item.key, e.target.checked)}
              className="cursor-pointer"
            />
          )}
        </td>

        <td className="w-8 px-1.5 py-2 align-top text-xs text-slate-400">{item.n}</td>

        <td className="px-2.5 py-2 align-top">
          <div className="font-bold text-slate-900">{item.company}</div>
          <div className="mt-0.5 italic text-slate-600 text-xs">{item.role}</div>
          {item.interview_status && (
            <div className="mt-0.5 text-[11px] text-slate-500">{item.interview_status}</div>
          )}
          {section === "open" && rec?.reason && (
            <div className="mt-1 text-[11px] leading-snug text-indigo-700">
              <span className="font-bold text-indigo-800">★ CV{rec.cv}:</span> {rec.reason}
            </div>
          )}
        </td>

        <td className="whitespace-nowrap px-2.5 py-2 align-top font-semibold text-slate-800">
          {item.ctc}
          {item.currency && item.currency !== "INR" ? ` (${item.currency})` : ""}
        </td>

        <td className="whitespace-nowrap px-2.5 py-2 align-top">{renderBadge(item)}</td>

        <td className="whitespace-nowrap px-2.5 py-2 align-top">
          <div className="flex flex-wrap items-center gap-1">
            {section === "open" && (
              <>
                {([1, 2, 3] as CvNumber[]).map((cv) => {
                  const isRec = rec?.cv === cv;
                  const diff = getCvDiffText(cv);
                  const hasTooltip = Boolean(diff || rec);
                  return (
                    <div key={cv} className="group relative inline-block">
                      <button
                        type="button"
                        onClick={() => onApplyRole(item, cv)}
                        title={buildCvHoverTitle(cv, rec)}
                        className={`rounded border px-2 py-0.5 text-[11px] font-bold cursor-pointer ${
                          isRec
                            ? "border-indigo-400 bg-indigo-50 text-indigo-800 ring-1 ring-indigo-300 hover:bg-indigo-600 hover:text-white"
                            : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white"
                        }`}
                      >
                        {isRec ? `★ CV${cv}` : `CV${cv}`}
                      </button>
                      {hasTooltip && (
                        <div className="pointer-events-none invisible absolute right-0 bottom-full z-50 mb-1.5 w-64 whitespace-normal rounded-md border border-slate-700 bg-slate-900 p-2 text-[11px] leading-snug text-slate-100 opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100">
                          {isRec && rec?.reason && (
                            <div className="mb-1 font-semibold text-emerald-300">
                              ★ Best for this role: {rec.reason}
                            </div>
                          )}
                          {!isRec && rec?.reason && (
                            <div className="mb-1 text-indigo-300">
                              AI pick is CV{rec.cv}: {rec.reason}
                            </div>
                          )}
                          {diff && (
                            <div className="text-slate-200">
                              <span className="font-bold text-amber-300">CV{cv}:</span> {diff}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {section === "applied" && (
              <>
                {item.is_open ? (
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800 hover:bg-emerald-200 cursor-pointer"
                        title={
                          item.applied_cv
                            ? buildCvHoverTitle(item.applied_cv, rec)
                            : "Click to switch submitted CV"
                        }
                      >
                        {cvLabel}
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="start"
                        sideOffset={4}
                        className="z-50 flex gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-lg"
                      >
                        {([1, 2, 3] as CvNumber[]).map((cv) => (
                          <DropdownMenu.Item
                            key={cv}
                            title={buildCvHoverTitle(cv, rec)}
                            onSelect={() => {
                              if (item.applied_cv !== cv) {
                                onSwitchCv(item, cv, item.applied_cv || null);
                              }
                            }}
                            className={`rounded px-2 py-1 text-[11px] font-bold outline-none cursor-pointer ${
                              item.applied_cv === cv
                                ? "bg-emerald-100 text-emerald-900"
                                : "bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white"
                            }`}
                          >
                            {rec?.cv === cv ? `★ CV${cv}` : `CV${cv}`}
                          </DropdownMenu.Item>
                        ))}
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                ) : (
                  <span
                    className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800"
                    title={item.applied_cv ? buildCvHoverTitle(item.applied_cv, rec) : undefined}
                  >
                    {cvLabel}
                  </span>
                )}

                {item.is_open && item.switched_from && item.switched_from !== item.applied_cv && (
                  <button
                    type="button"
                    onClick={() => onSwitchCv(item, item.switched_from!, null)}
                    className="inline-flex items-center gap-0.5 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-900 hover:bg-amber-200 cursor-pointer"
                    title={`Revert back to CV${item.switched_from}`}
                  >
                    <Undo2 className="h-3 w-3" />
                    Undo (CV{item.switched_from})
                  </button>
                )}

                {item.is_open && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Cancel your application for ${item.company} — ${item.role}?`
                        )
                      ) {
                        onCancelRole(item);
                      }
                    }}
                    className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 hover:bg-red-600 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => onOpenJd(item)}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              JD
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t border border-b-0 border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-700">
          <span>
            Open ({unapplied_open.length}) · Applied ({applied.length}) · Closed (
            {unapplied_closed.length})
          </span>
          {aiWarmingUp && (
            <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-200">
              <Sparkles className="h-3 w-3 animate-pulse text-indigo-600" />
              Building AI CV cache…
            </span>
          )}
          {selectedKeys.size > 0 && (
            <button
              type="button"
              disabled={smartBusy}
              onClick={onSmartApplySelected}
              className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {smartBusy ? "Matching via AI…" : `Smart apply (${selectedKeys.size})`}
            </button>
          )}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter company or role…"
          className="w-60 rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-b border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              <th className="w-7 px-2 py-2 text-center">
                <input
                  type="checkbox"
                  checked={allOpenSelected}
                  onChange={(e) => onToggleAllOpen(openKeys, e.target.checked)}
                  title="Select all open roles"
                  className="cursor-pointer"
                />
              </th>
              <th className="w-8 px-1.5 py-2">#</th>
              <th className="px-2.5 py-2">Company &amp; Role</th>
              <th className="px-2.5 py-2">CTC</th>
              <th className="px-2.5 py-2">Deadline</th>
              <th className="px-2.5 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No placement roles loaded. Complete OTP login or adjust filter.
                </td>
              </tr>
            ) : (
              <>
                {unapplied_open.length > 0 && (
                  <>
                    {renderSectionDivider(
                      "Open — Not Applied",
                      unapplied_open.length,
                      "open"
                    )}
                    {unapplied_open.map((r) => renderRow(r, "open"))}
                  </>
                )}
                {applied.length > 0 && (
                  <>
                    {renderSectionDivider("Applied Roles", applied.length, "applied")}
                    {applied.map((r) => renderRow(r, "applied"))}
                  </>
                )}
                {unapplied_closed.length > 0 && (
                  <>
                    {renderSectionDivider(
                      "Closed / Past Deadline",
                      unapplied_closed.length,
                      "closed"
                    )}
                    {unapplied_closed.map((r) => renderRow(r, "closed"))}
                  </>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
