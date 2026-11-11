import React, { useMemo, useState } from "react";
import { CheckCheck, CheckCircle2, FileText, Paperclip, Search, X } from "lucide-react";
import {
  CompanyRole,
  PlacementNotice,
  doesNoticeMatchCompany,
} from "../lib/erpParsers";
import type { ErpAttachmentRequest } from "../lib/erpBridge";

type NoticeQuickFilter = "all" | "unread" | "attachments" | "applied";

interface NoticesSheetProps {
  notices: PlacementNotice[];
  companies: CompanyRole[];
  readIds: Set<string>;
  externalSearch?: string;
  onClearExternalSearch?: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenAttachment: (req: ErpAttachmentRequest) => void;
}

const URL_TOKEN_RE = /(https?:\/\/[^\s<>"')]+)/g;

function categoryPillClass(category: string): string {
  const low = (category || "").toLowerCase();
  if (low.includes("shortlist") || low.includes("selection") || low.includes("offer")) {
    return "border border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (low.includes("interview") || low.includes("gd") || low.includes("schedule")) {
    return "border border-amber-200 bg-amber-50 text-amber-900";
  }
  if (low.includes("test") || low.includes("assessment") || low.includes("coding")) {
    return "border border-purple-200 bg-purple-50 text-purple-800";
  }
  if (low.includes("ppt") || low.includes("workshop") || low.includes("talk")) {
    return "border border-sky-200 bg-sky-50 text-sky-800";
  }
  if (low.includes("urgent") || low.includes("deadline")) {
    return "border border-red-200 bg-red-50 text-red-700";
  }
  return "bg-slate-100 text-slate-700";
}

function renderLinkifiedText(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(URL_TOKEN_RE);
  return parts.map((part, idx) => {
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-medium break-all text-blue-700 underline hover:text-blue-900"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const NoticesSheet: React.FC<NoticesSheetProps> = ({
  notices,
  companies,
  readIds,
  externalSearch,
  onClearExternalSearch,
  onMarkRead,
  onMarkAllRead,
  onOpenAttachment,
}) => {
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<NoticeQuickFilter>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const activeSearch = externalSearch !== undefined && externalSearch !== "" ? externalSearch : search;

  const appliedCompanies = useMemo(
    () => companies.filter((c) => c.applied),
    [companies]
  );

  const matchedAppliedByNoticeId = useMemo(() => {
    const map = new Map<string, CompanyRole>();
    if (appliedCompanies.length === 0) return map;
    for (const n of notices) {
      const hit = appliedCompanies.find((c) => doesNoticeMatchCompany(n.company, c.company));
      if (hit) map.set(String(n.id), hit);
    }
    return map;
  }, [notices, appliedCompanies]);

  const unreadCount = useMemo(
    () => notices.filter((n) => !readIds.has(String(n.id))).length,
    [notices, readIds]
  );
  const attachmentCount = useMemo(
    () => notices.filter((n) => n.has_attachment).length,
    [notices]
  );
  const appliedNoticeCount = matchedAppliedByNoticeId.size;

  const filtered = useMemo(() => {
    const q = activeSearch.trim().toLowerCase();
    return notices.filter((n) => {
      const idStr = String(n.id);
      if (quickFilter === "unread" && readIds.has(idStr)) return false;
      if (quickFilter === "attachments" && !n.has_attachment) return false;
      if (quickFilter === "applied" && !matchedAppliedByNoticeId.has(idStr)) return false;

      if (!q) return true;
      return (
        n.company.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q) ||
        n.notice.toLowerCase().includes(q) ||
        doesNoticeMatchCompany(n.company, q)
      );
    });
  }, [notices, activeSearch, quickFilter, readIds, matchedAppliedByNoticeId]);

  const toggleExpand = (n: PlacementNotice) => {
    const id = String(n.id);
    onMarkRead(id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
      {/* Search + Mark All Read */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="relative min-w-[170px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={activeSearch}
            onChange={(e) => {
              if (externalSearch && onClearExternalSearch) onClearExternalSearch();
              setSearch(e.target.value);
            }}
            placeholder={`Search ${notices.length} placement notices…`}
            className="w-full rounded-md border border-slate-300 bg-white py-1 pr-7 pl-8 text-xs focus:border-blue-600 focus:outline-none"
          />
          {activeSearch && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                onClearExternalSearch?.();
              }}
              aria-label="Clear notice filter"
              className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Mark all read {unreadCount > 0 ? `(${unreadCount})` : ""}
        </button>
      </div>

      {/* Quick Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-1.5">
        {(
          [
            { id: "all", label: `All (${notices.length})` },
            { id: "unread", label: `Unread (${unreadCount})` },
            { id: "attachments", label: `With File (${attachmentCount})` },
            { id: "applied", label: `My Applied (${appliedNoticeCount})` },
          ] as Array<{ id: NoticeQuickFilter; label: string }>
        ).map((pill) => {
          const active = quickFilter === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => setQuickFilter(pill.id)}
              className={`cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
                active
                  ? "bg-blue-700 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {pill.id === "attachments" && (
                <Paperclip className="mr-1 inline h-2.5 w-2.5 -translate-y-[0.5px]" />
              )}
              {pill.label}
            </button>
          );
        })}
      </div>

      {filtered.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {filtered.map((n) => {
            const idStr = String(n.id);
            const isUnread = !readIds.has(idStr);
            const isExpanded = expandedIds.has(idStr);
            const matchedApplied = matchedAppliedByNoticeId.get(idStr);

            return (
              <div
                key={`${idStr}-${n.n}`}
                onClick={() => toggleExpand(n)}
                className={`cursor-pointer px-3 py-2.5 transition-colors hover:bg-slate-50 ${
                  matchedApplied
                    ? "border-l-[3px] border-l-emerald-600 bg-emerald-50/20"
                    : isUnread
                      ? "border-l-[3px] border-l-blue-700 bg-blue-50/20"
                      : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {isUnread && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-blue-700"
                        title="Unread notice"
                      />
                    )}
                    <span className="text-xs font-bold text-slate-900">{n.company}</span>
                    {matchedApplied && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-extrabold text-emerald-800"
                        title={`You applied to ${matchedApplied.company} (${matchedApplied.role})`}
                      >
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Applied
                        {matchedApplied.applied_cv ? ` · CV${matchedApplied.applied_cv}` : ""}
                      </span>
                    )}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${categoryPillClass(
                        n.category
                      )}`}
                    >
                      {n.category}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {n.has_attachment && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkRead(idStr);
                          onOpenAttachment({
                            kind: "NOTICE",
                            id: idStr,
                            year: n.attachment_year,
                            title: `${n.company} — ${n.category}`,
                            subtitle: `Placement Notice #${idStr}${n.when ? ` · ${n.when}` : ""}`,
                            filenameStem: `Notice_${idStr}_${n.company}_${n.category}`,
                          });
                        }}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold text-blue-800 shadow-2xs transition hover:border-blue-600 hover:bg-blue-700 hover:text-white"
                        title="Preview & download official notice attachment from ERP"
                      >
                        <FileText className="h-3 w-3" />
                        Attachment
                      </button>
                    )}
                    <span className="text-[10.5px] whitespace-nowrap text-slate-400">{n.when}</span>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="mt-1.5 rounded-md border border-slate-200 bg-slate-50/90 p-2.5 text-xs leading-relaxed whitespace-pre-wrap text-slate-800">
                    {renderLinkifiedText(n.notice)}
                  </div>
                ) : (
                  <div className="mt-1 line-clamp-2 text-xs text-slate-600">{n.preview}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-3 py-6 text-center text-xs text-slate-400">
          No placement notices match the current filter.
        </div>
      )}
    </div>
  );
};
