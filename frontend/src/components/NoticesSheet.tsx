import React, { useState } from "react";
import { Paperclip } from "lucide-react";
import { PlacementNotice, splitGluedUrl } from "../lib/erpParsers";

interface NoticesSheetProps {
  notices: PlacementNotice[];
  readIds: Set<string>;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenAttachment: (noticeId: string, year: string) => void;
}

const LABEL_LINE =
  /^(Join link|Link|Note|POC|Deadline|Venue|Meeting ID|Passcode|Password|Webinar number|Webinar password|Session number|Session password|Registration Link(?: for [^:]+)?|Registration link|Additional Details Form|Application Link|Assessment Link|Test Link|Form Link|Form link|Google Form|Meeting link|Meeting Link|Reporting Time|Mode|PFA|PFB)\s*[:：]\s*(.*)$/i;

function linkifySegment(text: string, keyPrefix: string): React.ReactNode[] {
  const urlRe = /(https?:\/\/[^\s<>"]+)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const { url, tail } = splitGluedUrl(m[0]);
    parts.push(
      <a
        key={`${keyPrefix}-u-${m.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline break-all font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );
    if (tail) parts.push(tail.replace(/^\n/, " "));
    last = urlRe.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderInlineFormatting(line: string, keyPrefix: string): React.ReactNode[] {
  const tokenRegex = /(https?:\/\/[^\s<>"]+)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...linkifySegment(line.slice(lastIndex, match.index), `${keyPrefix}-${match.index}`));
    }
    const token = match[0];
    if (token.startsWith("http://") || token.startsWith("https://")) {
      const { url, tail } = splitGluedUrl(token);
      parts.push(
        <a
          key={`${keyPrefix}-url-${match.index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline break-all font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>
      );
      if (tail) parts.push(tail.replace(/^\n/, " "));
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={`${keyPrefix}-b-${match.index}`} className="font-bold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em key={`${keyPrefix}-i-${match.index}`} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push(...linkifySegment(line.slice(lastIndex), `${keyPrefix}-tail`));
  }
  return parts;
}

function renderNoticeBody(raw: string): React.ReactNode {
  const text = (raw || "").trim();
  if (!text) {
    return <p className="italic text-slate-400">No notice text.</p>;
  }

  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let numbered: string[] = [];

  const flushBullets = (keyPrefix: string) => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`${keyPrefix}-ul`} className="my-1.5 list-disc space-y-1 pl-4">
        {bullets.map((b, idx) => (
          <li key={idx} className="break-words">
            {renderInlineFormatting(b, `${keyPrefix}-b${idx}`)}
          </li>
        ))}
      </ul>
    );
    bullets = [];
  };

  const flushNumbered = (keyPrefix: string) => {
    if (numbered.length === 0) return;
    blocks.push(
      <ol key={`${keyPrefix}-ol`} className="my-1.5 list-decimal space-y-1.5 pl-5">
        {numbered.map((b, idx) => (
          <li key={idx} className="break-words pl-0.5">
            {renderInlineFormatting(b, `${keyPrefix}-n${idx}`)}
          </li>
        ))}
      </ol>
    );
    numbered = [];
  };

  const flushLists = (keyPrefix: string) => {
    flushBullets(keyPrefix);
    flushNumbered(keyPrefix);
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushLists(`line-${idx}`);
      return;
    }

    const bulletMatch = line.match(/^(?:•|-|\*)\s+(.*)$/);
    if (bulletMatch) {
      flushNumbered(`line-${idx}`);
      bullets.push(bulletMatch[1]);
      return;
    }

    const numberedMatch = line.match(/^\d+[.)]\s+(.*)$/);
    if (numberedMatch) {
      flushBullets(`line-${idx}`);
      numbered.push(numberedMatch[1]);
      return;
    }

    flushLists(`line-${idx}`);

    const labelMatch = line.match(LABEL_LINE);
    if (labelMatch) {
      const label = labelMatch[1].replace(/\s+/g, " ");
      const rest = (labelMatch[2] || "").trim();
      blocks.push(
        <p key={`label-${idx}`} className="my-1.5 break-words leading-relaxed">
          <span className="font-bold text-slate-900">{label}:</span>
          {rest ? (
            <>
              {" "}
              {renderInlineFormatting(rest, `label-${idx}`)}
            </>
          ) : null}
        </p>
      );
      return;
    }

    const isDayHeader =
      /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),/i.test(line);
    const isFooter = /^CDC,?\s*IIT Kharagpur\.?$/i.test(line);

    if (isDayHeader) {
      blocks.push(
        <p
          key={`day-${idx}`}
          className="mb-0.5 mt-2.5 break-words text-[12px] font-extrabold uppercase tracking-wide text-slate-700"
        >
          {line}
        </p>
      );
      return;
    }

    if (isFooter) {
      blocks.push(
        <p key={`foot-${idx}`} className="mt-2 break-words text-[11px] font-medium text-slate-500">
          {line}
        </p>
      );
      return;
    }

    blocks.push(
      <p key={`p-${idx}`} className="my-1 break-words leading-relaxed">
        {renderInlineFormatting(line, `p-${idx}`)}
      </p>
    );
  });
  flushLists("end");

  return <div className="min-w-0 text-[13px] text-slate-800">{blocks}</div>;
}

export const NoticesSheet: React.FC<NoticesSheetProps> = ({
  notices,
  readIds,
  onMarkRead,
  onMarkAllRead,
  onOpenAttachment,
}) => {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const filtered = notices.filter((n) => {
    if (!query) return true;
    const hay = `${n.category} ${n.company} ${n.notice} ${n.when}`.toLowerCase();
    return hay.includes(query);
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t border border-b-0 border-slate-200 bg-white px-3 py-2">
        <span className="text-xs font-bold text-slate-700">
          Placement Notices ({filtered.length})
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter notices…"
            className="w-40 min-w-0 rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-900 focus:border-blue-600 focus:outline-none sm:w-48"
          />
          <button
            type="button"
            onClick={onMarkAllRead}
            className="cursor-pointer rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Mark all read
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-b border border-slate-200 bg-white">
        <table className="w-full table-fixed border-collapse text-left text-xs">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[70%]" />
          </colgroup>
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              <th className="px-3 py-2">From</th>
              <th className="px-3 py-2">Notice</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-8 text-center text-slate-400">
                  No placement notices loaded.
                </td>
              </tr>
            ) : (
              filtered.map((n) => {
                const unread = !readIds.has(String(n.id));
                return (
                  <tr
                    key={n.id}
                    onClick={() => onMarkRead(String(n.id))}
                    className={`border-b border-slate-200 align-top ${
                      unread ? "bg-amber-50/50" : "hover:bg-slate-50/80"
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="space-y-1.5">
                        <time className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          {n.when}
                        </time>
                        <div className="break-words text-[13px] font-bold leading-snug text-slate-900">
                          {n.company || "—"}
                        </div>
                        {n.category ? (
                          <span className="inline-block max-w-full break-words rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-slate-700">
                            {n.category}
                          </span>
                        ) : null}
                        {n.has_attachment ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenAttachment(n.id, n.attachment_year);
                            }}
                            className="inline-flex cursor-pointer items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                            title="Open attachment"
                          >
                            <Paperclip className="h-3 w-3 shrink-0" />
                            PDF
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="min-w-0 px-3 py-2.5">{renderNoticeBody(n.notice)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
