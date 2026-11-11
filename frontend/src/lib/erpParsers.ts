export const DEFAULT_YOP = "2026-2027";
export const REQUIRED_SECURITY_QUESTIONS = 3;
export const MAX_SECURITY_QUESTION_FETCH_TRIES = 24;
export const MAX_SECURITY_QUESTION_RETRIES = 12;

export type CvNumber = 1 | 2 | 3;

export interface SecuritySlot {
  question: string;
  answer: string;
  use: boolean;
}

export interface LoginProfile {
  rollno: string;
  password: string;
  slots: [SecuritySlot, SecuritySlot, SecuritySlot];
}

export type SecurityAnswerDecision =
  | { action: "fill"; answer: string }
  | { action: "retry" }
  | { action: "missing" }
  | { action: "none-usable" }
  | { action: "unknown" };

export interface DeadlineMeta {
  is_open: boolean;
  seconds_remaining: number | null;
  deadline_iso: string | null;
  urgency: "upcoming" | "closed" | "critical" | "soon" | "open" | "unknown";
  badge: string;
}

export interface CompanyRole {
  n: number;
  key: string;
  company: string;
  role: string;
  ctc: string;
  currency: string;
  applied: boolean;
  status: string;
  applied_cv?: CvNumber | null;
  switched_from?: CvNumber | null;
  deadline_start: string;
  deadline: string;
  is_open: boolean;
  seconds_remaining: number | null;
  deadline_iso: string | null;
  urgency: DeadlineMeta["urgency"];
  deadline_badge: string;
  interview_status: string;
  contract: string;
  com_id: string;
  jnf_id: string;
  yop: string;
  has_com_doc: boolean;
  has_ppt_doc: boolean;
  has_jnf_doc: boolean;
}

export interface PlacementNotice {
  n: number;
  id: string;
  type: string;
  category: string;
  subject: string;
  company: string;
  notice: string;
  preview: string;
  by: string;
  when: string;
  has_attachment: boolean;
  attachment_year: string;
}

export interface JnfMoreDetResult {
  job_profile: Record<string, string>;
  job_description: string;
  compensation_details: Record<string, string>;
  eligibility_details: Record<string, string>;
  selection_details: Record<string, string>;
}

export interface JnfDetails {
  com_id: string;
  jnf_id: string;
  applied_cv: CvNumber | null;
  is_applied: boolean;
  can_cancel: boolean;
  available_cvs: CvNumber[];
  fields: Record<string, string>;
  more_details_params?: {
    year: string;
    rollno: string;
    com_id: string;
    jnf_id: string;
  } | null;
  compensation_details?: Record<string, string>;
  eligibility_details?: Record<string, string>;
  selection_details?: Record<string, string>;
  company_details?: Record<string, string>;
  allowed_departments?: string[];
  jd_text: string;
  raw_text: string;
}

export interface FormattedCtc {
  primary: string;
  secondary: string;
  inrSortValue: number;
}

function decodeHtmlEntities(input: string): string {
  if (!input) return "";
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(
      `<!doctype html><body><textarea>${input}</textarea>`,
      "text/html"
    );
    const ta = doc.querySelector("textarea");
    return ta ? ta.value : doc.body.textContent || "";
  }
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function stripHtml(value: string): string {
  if (!value) return "";
  const withBreaks = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(withBreaks);
  return decoded
    .split(/\r?\n/)
    .map((ln) => ln.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function stripHtmlInline(value: string): string {
  if (!value) return "";
  const withoutTags = value.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
}

export function normalizeQuestion(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function decideSecurityAnswer(
  shownQuestion: string,
  slots: SecuritySlot[]
): SecurityAnswerDecision {
  const shown = normalizeQuestion(shownQuestion);
  if (!shown) {
    return { action: "unknown" };
  }

  const usable = (slots || []).some(
    (slot) => slot.use !== false && normalizeQuestion(slot.question) !== "" && slot.answer.trim() !== ""
  );
  if (!usable) {
    return { action: "none-usable" };
  }

  const shownLower = shown.toLowerCase();
  const match = (slots || []).find((slot) => {
    const q = normalizeQuestion(slot.question).toLowerCase();
    return q !== "" && (q === shownLower || shownLower.includes(q) || q.includes(shownLower));
  });

  if (!match) {
    return { action: "unknown" };
  }
  if (match.use === false) {
    return { action: "retry" };
  }
  const ans = match.answer.trim();
  if (!ans) {
    return { action: "missing" };
  }
  return { action: "fill", answer: ans };
}

export function extractAttr(value: string, name: string): string {
  if (!value) return "";
  const re = new RegExp(`${name}\\s*=\\s*['"]([^'"]*)['"]`, "is");
  const m = value.match(re);
  return m ? decodeHtmlEntities(m[1]).trim() : "";
}

export function extractHiddenInput(page: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagMatch = page.match(new RegExp(`<input\\b[^>]*\\bname\\s*=\\s*['"]${escaped}['"][^>]*>`, "i"));
  if (!tagMatch) return "";
  return extractAttr(tagMatch[0], "value");
}

const GLUED_PROSE_STARTERS = new Set([
  "all",
  "interested",
  "eligible",
  "kindly",
  "please",
  "students",
  "student",
  "candidates",
  "candidate",
  "shortlisted",
  "selected",
  "the",
  "this",
  "those",
  "only",
  "for",
  "if",
  "in",
  "on",
  "by",
  "at",
  "to",
  "from",
  "with",
  "note",
  "deadline",
  "venue",
  "mode",
  "date",
  "time",
  "reporting",
  "attendance",
  "no",
  "any",
  "further",
  "fill",
  "submit",
  "join",
  "register",
  "apply",
  "check",
  "refer",
  "visit",
  "contact",
  "poc",
  "cdc",
  "pfa",
  "pfb",
  "mandatory",
  "compulsory",
  "it",
  "we",
  "you",
  "they",
  "who",
  "whose",
  "each",
  "every",
  "both",
  "before",
  "after",
  "within",
  "during",
  "until",
  "till",
  "as",
  "per",
]);

/**
 * Split a greedy URL match into `{ url, tail }` when CDC notice prose is glued
 * directly onto the end of a URL (with no whitespace after `</a>` or `</p>`),
 * or when trailing punctuation / unbalanced closing brackets wrap the URL.
 */
export function splitGluedUrl(rawUrl: string): { url: string; tail: string } {
  let working = rawUrl || "";
  let suffix = "";

  // 1) Strip trailing sentence punctuation and unbalanced closing brackets/parens/quotes.
  while (working.length > 0) {
    const last = working[working.length - 1];
    if (/[.,;:!?'"]/.test(last)) {
      suffix = last + suffix;
      working = working.slice(0, -1);
      continue;
    }
    if (last === ")") {
      const opens = (working.match(/\(/g) || []).length;
      const closes = (working.match(/\)/g) || []).length;
      if (closes > opens) {
        suffix = last + suffix;
        working = working.slice(0, -1);
        continue;
      }
    }
    if (last === "]") {
      const opens = (working.match(/\[/g) || []).length;
      const closes = (working.match(/\]/g) || []).length;
      if (closes > opens) {
        suffix = last + suffix;
        working = working.slice(0, -1);
        continue;
      }
    }
    break;
  }

  const finish = (urlPart: string, extraTail: string) => {
    // Re-strip any trailing punctuation exposed after peeling off glued prose
    let cleanUrl = urlPart;
    let punct = "";
    while (cleanUrl.length > 0 && /[.,;:!?]/.test(cleanUrl[cleanUrl.length - 1])) {
      punct = cleanUrl[cleanUrl.length - 1] + punct;
      cleanUrl = cleanUrl.slice(0, -1);
    }
    return {
      url: cleanUrl,
      tail: `${punct}${extraTail ? (punct ? ` ${extraTail}` : `\n${extraTail}`) : ""}${suffix}`,
    };
  };

  // 2) Exact fixed-length / structural URL patterns common in CDC notices:
  //    - Google Forms shortlinks: https://forms.gle/<17 base62 chars>
  const formsGleMatch = working.match(/^(https?:\/\/forms\.gle\/[A-Za-z0-9_-]{17})([A-Z][A-Za-z]*)$/);
  if (formsGleMatch) {
    return finish(formsGleMatch[1], formsGleMatch[2]);
  }

  //    - Google Meet links: https://meet.google.com/xxx-xxxx-xxx
  const meetMatch = working.match(
    /^(https?:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3})([A-Za-z].*)$/i
  );
  if (meetMatch && !meetMatch[2].startsWith("?")) {
    return finish(meetMatch[1], meetMatch[2]);
  }

  //    - Zoom numeric meeting links without query string: https://*.zoom.us/j/<9-11 digits>
  const zoomNumericMatch = working.match(
    /^(https?:\/\/(?:[A-Za-z0-9-]+\.)?zoom\.us\/[jw]\/\d{9,11})([A-Za-z].*)$/i
  );
  if (zoomNumericMatch) {
    return finish(zoomNumericMatch[1], zoomNumericMatch[2]);
  }

  //    - Google Docs/Forms/Sheets/Drive view/edit suffix glued to prose:
  //      .../viewform, .../edit, .../view, .../usp=sharing, .../usp=sf_link
  const gdocsEndMatch = working.match(
    /^(https?:\/\/(?:docs|drive)\.google\.com\/[^\s]*?(?:viewform|usp=sharing|usp=sf_link|\/edit|\/view))([A-Z][a-z].*)$/
  );
  if (gdocsEndMatch) {
    return finish(gdocsEndMatch[1], gdocsEndMatch[2]);
  }

  //    Fixed-token CDC links whose id ends in a capital or digit, so the
  //    TitleCase heuristic never sees a boundary. The extra group is prose
  //    glued with no space (Qualtrics SV_ + 15, Oracle /job/<digits>, etc.).
  const structuralGlues: RegExp[] = [
    /^(https?:\/\/[^\s]*qualtrics\.com\/jfe\/form\/SV_[A-Za-z0-9]{15})([A-Z][A-Za-z]*)$/,
    /^(https?:\/\/[^\s]*oraclecloud\.com\/[^\s]*\/job\/\d+)([A-Za-z][A-Za-z]*)$/,
    /^(https?:\/\/[^\s]*joinsuperset\.com\/[^\s]*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})([A-Z][A-Za-z]*)$/i,
    /^(https?:\/\/teams\.microsoft\.com\/[^\s]*?\/\d+\?p=[A-Za-z0-9]{18})([A-Z][A-Za-z]*)$/,
    /^(https?:\/\/[^\s]*webex\.com\/[^\s]*MTID=m[0-9a-f]{32})([A-Z][A-Za-z]*)$/i,
    /^(https?:\/\/[^\s]*on24\.com\/[^\s]*[0-9A-F]{32})([A-Z][A-Za-z]*)$/,
    /^(https?:\/\/[^\s]*recsolu\.com\/[^\s]*\/requisitions\/[A-Za-z0-9]{22})([A-Z][A-Za-z]*)$/,
    /^(https?:\/\/[^\s]*accenture\.com\/[^\s]*[?&]event=\d+)([A-Z][A-Za-z]*)$/,
    /^(https?:\/\/[^\s]*utm_source=External\+Job\+Share)([A-Z][A-Za-z]*)$/,
  ];
  for (const pattern of structuralGlues) {
    const structuralMatch = working.match(pattern);
    if (structuralMatch) {
      return finish(structuralMatch[1], structuralMatch[2]);
    }
  }

  // 3) General heuristic: if the URL ends with a TitleCase word (`[A-Z][a-z]{1,14}`)
  //    that is a common prose starter ("All", "Interested", "Please", "Kindly",
  //    "Students", "The", "Note", "No", "For", "Deadline", etc.) preceded by a
  //    digit, punctuation, `/`, or lowercase letter at the end of a path/query token.
  const trailingWordMatch = working.match(/^(https?:\/\/.+?[0-9a-z/_=-])([A-Z][a-z]{1,14})$/);
  if (trailingWordMatch) {
    const candidateWord = trailingWordMatch[2].toLowerCase();
    if (GLUED_PROSE_STARTERS.has(candidateWord)) {
      return finish(trailingWordMatch[1], trailingWordMatch[2]);
    }
  }

  return { url: working, tail: suffix };
}

export function noticeTextFromHtml(value: string): string {
  if (!value) return "";
  let text = decodeHtmlEntities(value);
  text = text
    // Ensure closing anchors / spans after URLs don't glue to following prose
    .replace(/<\/a\s*>/gi, " ")
    .replace(/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi, "**$1**")
    .replace(/<(?:i|em)[^>]*>([\s\S]*?)<\/(?:i|em)>/gi, "*$1*")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  text = decodeHtmlEntities(text);

  return prettifyNoticeText(text);
}

/**
 * CDC notice bodies often arrive as one long run-on string (labels, URLs,
 * numbered lists, and PPO names glued together). Re-introduce readable breaks.
 */
export function prettifyNoticeText(raw: string): string {
  let text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  // 1) Split labeled fields first (longest-first alternation) so greedy URL
  //    matching cannot swallow "…pwd=abc.Note:" into the link.
  const labels = [
    "Registration Link for Dual Degree and Masters Courses",
    "Registration Link for Bachelor Courses",
    "Registration Link",
    "Registration link",
    "Additional Details Form",
    "Application Link",
    "Assessment Link",
    "Test Link",
    "Join link",
    "Form Link",
    "Form link",
    "Google Form",
    "Meeting link",
    "Meeting Link",
    "Webinar number",
    "Webinar password",
    "Session number",
    "Session password",
    "Meeting ID",
    "Reporting Time",
    "Passcode",
    "Password",
    "Deadline",
    "Venue",
    "Note",
    "POC",
    "Mode",
    "Link",
    "PFA",
    "PFB",
  ];
  const labelAlt = labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  text = text.replace(new RegExp(`(?<![\\nA-Za-z])((?:${labelAlt})\\s*[:：])`, "gi"), "\n$1");

  // 2) Protect URLs from sentence-splitting (domains contain ".us" etc.) and
  //    peel off any CDC prose glued directly to the end of the URL.
  const urls: string[] = [];
  text = text.replace(/(?<![\w/:])((?:meet\.google\.com|forms\.gle)\/[^\s<>"]+)/gi, (_m, path) => {
    return `https://${path}`;
  });
  text = text.replace(/https?:\/\/[^\s<>"]+/gi, (rawUrl) => {
    const { url, tail } = splitGluedUrl(rawUrl);
    const token = `⟦URL${urls.length}⟧`;
    urls.push(url);
    return tail ? `${token}${tail}` : token;
  });

  // Year jammed into a numbered item: "20261. [PPT" → "2026\n1. [PPT"
  text = text.replace(/(\b20\d{2})(\d{1,2}\.\s)/g, "$1\n$2");

  // URL token glued to preceding text → own line
  text = text.replace(/([^\s\n])(⟦URL\d+⟧)/g, "$1\n$2");

  // URL token followed immediately by a sentence / capital word on the same line → newline
  text = text.replace(/(⟦URL\d+⟧)[ \t]+([A-Z][a-z]{1,14}\b)/g, "$1\n$2");

  // Numbered list item starting mid-line (must NOT be preceded by a digit, or
  // "2026. " gets split into "20" + "26. " and rendered as an <ol>).
  text = text.replace(/([^\n\d])(\d{1,2}\.\s+(?:\[[^\]]+\]|[A-Z*(]))/g, "$1\n$2");

  // Weekday schedule headers mid-line
  text = text.replace(
    /([^\n])((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\d)/gi,
    "$1\n$2"
  );

  // PPO / shortlist: roll number (e.g. 22EE38016, 22CE3FP14, 25EC62R03) glued to
  // the next name or sentence.
  text = text.replace(/(\d{2}[A-Z]{2}[A-Z0-9]{3}\d{2})(?=[A-Z])/g, "$1\n");

  // Closing paren glued to a new sentence: ")Interested and eligible…"
  text = text.replace(/\)([A-Z][a-z]{2,}\b)/g, ")\n$1");

  // Sentence end glued to a new capitalized clause ("PM.Join", "fail.Attendance")
  text = text.replace(/\.([A-Z][a-zA-Z])/g, ".\n$1");

  // Signature footer
  text = text.replace(/([^\n])(CDC,?\s*IIT Kharagpur\.?)/gi, "$1\n$2");

  text = text.replace(/⟦URL(\d+)⟧/g, (_, i) => urls[Number(i)] ?? "");

  const lines = text.split(/\n/).map((ln) => ln.replace(/[ \t]+/g, " ").trim());
  const compact: string[] = [];
  for (const line of lines) {
    if (line) {
      compact.push(line);
    } else if (compact.length > 0 && compact[compact.length - 1] !== "") {
      compact.push("");
    }
  }
  return compact.join("\n").trim();
}

export function parseJqgridXml(payload: string): string[][] {
  const trimmed = (payload || "").trim();
  const start = trimmed.indexOf("<rows");
  if (start < 0) {
    throw new Error("ERP response did not contain jqGrid <rows> XML");
  }
  let xmlBody = trimmed.slice(start);
  if (!xmlBody.includes("</rows>") && !/<row\b/i.test(xmlBody)) {
    return [];
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlBody, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Failed to parse ERP jqGrid XML payload");
  }
  const rows: string[][] = [];
  for (const rowEl of Array.from(doc.querySelectorAll("row"))) {
    const cells = Array.from(rowEl.querySelectorAll("cell")).map((c) => c.textContent || "");
    rows.push(cells);
  }
  return rows;
}

export function parseDeadline(deadlineStr: string): Date | null {
  const clean = (deadlineStr || "").trim();
  if (!clean) return null;

  // YYYY-MM-DD HH:MM(:SS)
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (isoMatch) {
    const [, y, m, d, hh, mm, ss] = isoMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss || 0));
  }

  // DD-MM-YYYY HH:MM or DD/MM/YYYY HH:MM
  const dmyMatch = clean.match(/^(\d{2})[-/](\d{2})[-/](\d{4})\s+(\d{2}):(\d{2})$/);
  if (dmyMatch) {
    const [, d, m, y, hh, mm] = dmyMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), 0);
  }
  return null;
}

export function classifyDeadline(startStr: string, endStr: string, now?: Date): DeadlineMeta {
  const ref = now || new Date();
  const endDt = parseDeadline(endStr);
  const startDt = parseDeadline(startStr);
  if (!endDt) {
    return {
      is_open: false,
      seconds_remaining: null,
      deadline_iso: null,
      urgency: "unknown",
      badge: "No Deadline",
    };
  }
  const remaining = Math.floor((endDt.getTime() - ref.getTime()) / 1000);
  const notStarted = startDt !== null && ref.getTime() < startDt.getTime();
  const isOpen = remaining > 0 && !notStarted;

  let urgency: DeadlineMeta["urgency"];
  let badge: string;

  if (notStarted && startDt) {
    urgency = "upcoming";
    badge = `Opens ${startDt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${startDt
      .toTimeString()
      .slice(0, 5)}`;
  } else if (remaining <= 0) {
    urgency = "closed";
    badge = "Closed";
  } else if (remaining <= 3 * 3600) {
    const hours = Math.floor(remaining / 3600);
    const mins = Math.floor((remaining % 3600) / 60);
    urgency = "critical";
    badge = hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
  } else if (remaining <= 24 * 3600) {
    const hours = Math.floor(remaining / 3600);
    const mins = Math.floor((remaining % 3600) / 60);
    urgency = "soon";
    badge = `${hours}h ${mins}m left`;
  } else {
    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);
    urgency = "open";
    badge = `${days}d ${hours}h left`;
  }

  return {
    is_open: isOpen,
    seconds_remaining: remaining,
    deadline_iso: endDt.toISOString(),
    urgency,
    badge,
  };
}

export function hasErpDownloadLink(cellHtml: string): boolean {
  const raw = (cellHtml || "").trim();
  if (!raw) return false;
  if (/<a\b/i.test(raw)) {
    const title = extractAttr(raw, "title").toLowerCase();
    const visibleText = stripHtmlInline(raw).toLowerCase();
    return (
      title === "download" ||
      visibleText === "download" ||
      visibleText.includes("download") ||
      raw.includes("AdmFilePDF.htm")
    );
  }
  return Boolean(/NoticeView\s*\(|TPNotice\s*\(|AdmFilePDF\.htm/i.test(raw));
}

export function formatCtcDisplay(ctcRaw: string, currencyRaw = "INR"): FormattedCtc {
  const raw = stripHtmlInline(ctcRaw);
  const currency = (stripHtmlInline(currencyRaw) || "INR").toUpperCase();
  if (!raw) {
    return { primary: "—", secondary: "", inrSortValue: 0 };
  }

  const lpaMatch = raw.match(/^₹?\s*(\d+(?:\.\d+)?)\s*LPA$/i);
  if (lpaMatch) {
    const val = Number(lpaMatch[1]);
    return {
      primary: `₹${lpaMatch[1]} LPA`,
      secondary: "",
      inrSortValue: Number.isFinite(val) ? Math.round(val * 100_000) : 0,
    };
  }

  const cleanedNumber = raw.replace(/[₹$,¥€£,\s]/g, "");
  if (/^\d+(\.\d+)?$/.test(cleanedNumber)) {
    const amount = Number(cleanedNumber);
    if (Number.isFinite(amount) && amount > 0) {
      if (currency === "INR" || raw.includes("₹")) {
        if (amount >= 100_000) {
          const lpa = (amount / 100_000).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
          return {
            primary: `₹${lpa} LPA`,
            secondary: `₹${Math.round(amount).toLocaleString("en-IN")}`,
            inrSortValue: amount,
          };
        }
        return {
          primary: `₹${Math.round(amount).toLocaleString("en-IN")}`,
          secondary: "",
          inrSortValue: amount,
        };
      }
      if (currency === "JPY") {
        const millions =
          amount >= 1_000_000
            ? `¥${(amount / 1_000_000).toFixed(2).replace(/\.00$/, "")}M JPY`
            : `¥${Math.round(amount).toLocaleString("en-US")} JPY`;
        return {
          primary: millions,
          secondary: amount >= 1_000_000 ? `¥${Math.round(amount).toLocaleString("en-US")}` : "",
          inrSortValue: Math.round(amount * 0.56),
        };
      }
      if (currency === "USD") {
        return {
          primary: `$${Math.round(amount).toLocaleString("en-US")} USD`,
          secondary: "",
          inrSortValue: Math.round(amount * 85),
        };
      }
      const fxApprox: Record<string, number> = {
        GBP: 108,
        EUR: 92,
        SGD: 63,
        AED: 23,
        HKD: 11,
        TWD: 2.7,
      };
      return {
        primary: `${Math.round(amount).toLocaleString("en-US")} ${currency}`,
        secondary: "",
        inrSortValue: Math.round(amount * (fxApprox[currency] ?? 1)),
      };
    }
  }

  return {
    primary: currency && currency !== "INR" && !raw.includes(currency) ? `${raw} (${currency})` : raw,
    secondary: "",
    inrSortValue: 0,
  };
}

const COMPANY_NOISE_WORDS = new Set([
  "private",
  "pvt",
  "limited",
  "ltd",
  "inc",
  "incorporated",
  "llp",
  "llc",
  "plc",
  "corp",
  "corporation",
  "company",
  "co",
  "india",
  "japan",
  "global",
  "services",
  "service",
  "solutions",
  "solution",
  "technologies",
  "technology",
  "tech",
  "advisors",
  "advisory",
  "consulting",
  "group",
  "holdings",
  "formerly",
  "known",
  "as",
  "the",
  "and",
  "through",
]);

export function canonicalCompanyTokens(name: string): string[] {
  const cleaned = (name || "")
    .toLowerCase()
    .replace(/\.com\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!cleaned || cleaned.startsWith("cdc ")) return [];
  const rawTokens = cleaned.split(/\s+/).filter(Boolean);
  const core = rawTokens.filter((t) => !COMPANY_NOISE_WORDS.has(t));
  return core.length > 0 ? core : rawTokens;
}

export function doesNoticeMatchCompany(noticeCompany: string, roleCompany: string): boolean {
  const nRaw = (noticeCompany || "").trim().toLowerCase();
  const rRaw = (roleCompany || "").trim().toLowerCase();
  if (!nRaw || !rRaw || nRaw === "cdc general" || nRaw.startsWith("cdc placement")) {
    return false;
  }
  if (nRaw === rRaw) return true;

  const nTokens = canonicalCompanyTokens(noticeCompany);
  const rTokens = canonicalCompanyTokens(roleCompany);
  if (nTokens.length === 0 || rTokens.length === 0) return false;

  const nJoined = nTokens.join("");
  const rJoined = rTokens.join("");
  if (nJoined.length >= 3 && nJoined === rJoined) return true;

  // First primary brand token match when sufficiently distinctive (e.g. "Accenture", "Airbus", "Phyagents", "IQVIA")
  if (nTokens[0] === rTokens[0] && nTokens[0].length >= 4) {
    if (nTokens.length === 1 || rTokens.length === 1) return true;
    if (nTokens[1] === rTokens[1]) return true;
  }

  // Subset check when notice uses short brand name ("YCP Auctus" vs "YCP ... Auctus")
  if (
    nTokens.every((t) => t.length >= 3 && rTokens.includes(t)) ||
    rTokens.every((t) => t.length >= 3 && nTokens.includes(t))
  ) {
    return true;
  }

  return false;
}

export function parseCompanyRow(index: number, cells: string[], now?: Date): CompanyRole {
  const padded = [...cells];
  while (padded.length < 13) padded.push("");

  const companyHtml = padded[0];
  const view2Html = padded[1];
  const view3Html = padded[2];
  const designationHtml = padded[3];
  const ctcRaw = padded[5];
  const currencyRaw = padded[6];
  const view1Html = padded[7];
  const applyRaw = padded[8];
  const startRaw = padded[9];
  const endRaw = padded[10];
  const interviewRaw = padded[11];
  const contractRaw = padded[12];

  const roleCall = (designationHtml || padded[4]).match(
    /TPJNFView\(\s*['"](\d+)['"]\s*,\s*['"](\d+)['"]\s*(?:,\s*['"]([^'"]+)['"])?\s*\)/
  );
  const companyCall = companyHtml.match(/TPComView\(\s*['"]([^'"]+)['"]\s*,\s*['"](\d+)['"]\s*\)/);
  const jnfDescCall = view1Html.match(
    /TPJNFDescription\(\s*['"]([^'"]+)['"]\s*,\s*['"](\d+)['"]\s*,\s*['"](\d+)['"]\s*\)/
  );

  const jnf_id = (roleCall && roleCall[1]) || (jnfDescCall && jnfDescCall[3]) || "";
  const com_id =
    (roleCall && roleCall[2]) ||
    (companyCall && companyCall[2]) ||
    (jnfDescCall && jnfDescCall[2]) ||
    "";
  const yop =
    (roleCall && roleCall[3]) ||
    (companyCall && companyCall[1]) ||
    (jnfDescCall && jnfDescCall[1]) ||
    DEFAULT_YOP;

  const company = extractAttr(companyHtml, "title") || stripHtmlInline(companyHtml);
  const role = extractAttr(designationHtml, "title") || stripHtmlInline(designationHtml);
  const applied = stripHtmlInline(applyRaw).toUpperCase() === "Y";
  const deadline_start = stripHtmlInline(startRaw);
  const deadline = stripHtmlInline(endRaw);
  const dlMeta = classifyDeadline(deadline_start, deadline, now);

  return {
    n: index,
    key: com_id && jnf_id ? `${com_id}_${jnf_id}` : `row_${index}`,
    company,
    role,
    ctc: stripHtmlInline(ctcRaw),
    currency: stripHtmlInline(currencyRaw),
    applied,
    status: applied ? "Y" : "",
    applied_cv: null,
    deadline_start,
    deadline,
    is_open: dlMeta.is_open,
    seconds_remaining: dlMeta.seconds_remaining,
    deadline_iso: dlMeta.deadline_iso,
    urgency: dlMeta.urgency,
    deadline_badge: dlMeta.badge,
    interview_status: stripHtmlInline(interviewRaw),
    contract: stripHtmlInline(contractRaw),
    com_id,
    jnf_id,
    yop,
    has_com_doc: hasErpDownloadLink(view2Html),
    has_ppt_doc: hasErpDownloadLink(view3Html),
    has_jnf_doc: hasErpDownloadLink(view1Html),
  };
}

export function categorizeCompanies(companies: CompanyRole[]) {
  const unapplied_open: CompanyRole[] = [];
  const applied: CompanyRole[] = [];
  const unapplied_closed: CompanyRole[] = [];

  for (const row of companies) {
    if (row.applied) {
      applied.push(row);
    } else if (row.is_open) {
      unapplied_open.push(row);
    } else {
      unapplied_closed.push(row);
    }
  }

  unapplied_open.sort((a, b) => {
    const sa = a.seconds_remaining ?? 1e9;
    const sb = b.seconds_remaining ?? 1e9;
    if (sa !== sb) return sa - sb;
    return a.n - b.n;
  });

  return { unapplied_open, applied, unapplied_closed };
}

export function parseNoticeRow(index: number, cells: string[]): PlacementNotice {
  const padded = [...cells];
  while (padded.length < 8) padded.push("");

  const id = stripHtmlInline(padded[0]);
  const type = stripHtmlInline(padded[1]).toUpperCase();
  const category = stripHtmlInline(padded[2]);
  const company = stripHtmlInline(padded[3]);
  const noticeHtml = padded[4];
  const by = stripHtmlInline(padded[5]);
  const when = stripHtmlInline(padded[6]);
  const viewHtml = padded[7];

  const titleText = noticeTextFromHtml(extractAttr(noticeHtml, "title"));
  const innerText = noticeTextFromHtml(noticeHtml);
  const titleNewlines = (titleText.match(/\n/g) || []).length;
  const innerNewlines = (innerText.match(/\n/g) || []).length;

  let bodyText: string;
  if (titleNewlines > innerNewlines) {
    bodyText = titleText;
  } else if (innerText.length > titleText.length) {
    bodyText = innerText;
  } else {
    bodyText = titleText || innerText;
  }
  bodyText = prettifyNoticeText(bodyText);

  // Real CDC Notice.jsp uses TPNotice(year, id) with >Download</a> only when a file exists;
  // also retain NoticeView(id, year) compatibility.
  const tpNoticeCall = viewHtml.match(/TPNotice\(\s*['"]([^'"]+)['"]\s*,\s*['"](\d+)['"]\s*\)/i);
  const legacyAttachCall = viewHtml.match(
    /NoticeView\(\s*['"](\d+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i
  );
  const has_attachment = hasErpDownloadLink(viewHtml);
  const resolvedId = (tpNoticeCall && tpNoticeCall[2]) || (legacyAttachCall && legacyAttachCall[1]) || id;
  const attachment_year =
    (tpNoticeCall && tpNoticeCall[1]) || (legacyAttachCall && legacyAttachCall[2]) || DEFAULT_YOP;

  return {
    n: index,
    id: resolvedId || id,
    type,
    category: category || "General",
    subject: category || "General",
    company: company || "CDC General",
    notice: bodyText,
    preview: bodyText.length > 200 ? `${bodyText.slice(0, 200)}...` : bodyText,
    by,
    when,
    has_attachment,
    attachment_year,
  };
}

function extractAppliedCv(page: string): CvNumber | null {
  const patterns = [
    /TPStudentResume2\(\s*['"][^'"]*['"]\s*,\s*['"]?([123])['"]?\s*\)/i,
    /TPStudentResume\(\s*['"][^'"]*['"]\s*,\s*['"]?([123])['"]?\s*\)/i,
    /Submitted\s*CV\s*([123])/i,
    /Applied\s*CV\s*([123])/i,
  ];
  for (const pattern of patterns) {
    const m = page.match(pattern);
    if (m) {
      const n = Number(m[1]);
      if (n === 1 || n === 2 || n === 3) return n;
    }
  }
  return null;
}

/**
 * Cleans Win-1252 / mojibake artifacts and formats inline bullets/pipes emitted by
 * ERP's TPJNFView.jsp and JnfMoreDet.jsp ("Click Here for more details") into crisp,
 * multi-line readable text.
 */
export function prettifyErpRichText(input: string): string {
  if (!input) return "";
  let text = decodeHtmlEntities(input)
    .replace(/\uFFFD/g, " — ")
    .replace(/""([^"\n]+)""/g, '"$1"')
    .replace(/''/g, "'")
    .replace(/\r\n?/g, "\n");

  // Put Unicode bullet glyphs (● \u25CF, ○ \u25CB, ▪ \u25AA, ◆ \u25C6) onto clean lines
  text = text.replace(/\s*[\u25CF\u25AA\u25C6]\s*/g, "\n• ");
  text = text.replace(/\s*\u25CB\s*/g, "\n  ◦ ");

  // Convert inline asterisk lists ("foo: * Design and ... * Development of ...") into bullet lines
  if ((text.match(/\s\*\s+[A-Z]/g) || []).length >= 2) {
    text = text.replace(/(^|[:.;])\s*\*\s+(?=[A-Z])/g, "$1\n• ");
    text = text.replace(/\s+\*\s+(?=[A-Z])/g, "\n• ");
  }

  // Split pipe-delimited compensation/detail strings ("Fixed 2222222 | Bonus 177778 | Total 2400000")
  if (text.includes(" | ")) {
    text = text
      .split(/\s*\|\s*/)
      .map((part) => part.trim())
      .filter(Boolean)
      .join("\n• ");
    if (text.includes("\n• ")) text = `• ${text}`;
  }

  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatCtcBreakupText(input: string): string {
  const base = prettifyErpRichText(input);
  if (!base || base.includes("\n")) return base;

  // Format comma-separated or run-on "Component: Value" CTC breakups into clean bullet lines:
  // e.g. "Total Base Salary: 577500, Total Allowances: 276171, Joining Bonus: 100000"
  const commaParts = base.split(/,\s+(?=[A-Z0-9][A-Za-z0-9 '/()-]{2,38}:)/);
  if (commaParts.length >= 2) {
    return commaParts.map((p) => `• ${p.trim()}`).join("\n");
  }

  // Run-on space-separated currency breakups (e.g. Amazon / Accenture Japan):
  // "Base Pay (INR) 2,030,000 Sign-on Bonus Year 1 (INR) 643,500 ..."
  const runOn = base.replace(
    /(\d[\d,]*(?:\s*(?:INR|JPY|USD|EUR|GBP|SGD|\([^)]+\)))?)\s+(?=(?:Base|Gross|Fixed|Total|Sign-on|Signing|Joining|Relocation|Retention|Restricted|Employees|Employment|Housing|Monthly|Variable|Performance|Bonus|Annual|CTC)\b)/gi,
    "$1\n• "
  );
  if (runOn.includes("\n• ")) {
    return `• ${runOn.trim()}`;
  }

  return base;
}

export function parseJnfMoreDetHtml(page: string): JnfMoreDetResult {
  const job_profile: Record<string, string> = {};
  let job_description = "";
  const compensation_details: Record<string, string> = {};
  const eligibility_details: Record<string, string> = {};
  const selection_details: Record<string, string> = {};

  if (
    !page ||
    /500\s+Internal\s+Server/i.test(page) ||
    /Sorry,\s*You\s+are\s+not\s+supposed\s+to\s+open\s+this/i.test(page)
  ) {
    return {
      job_profile,
      job_description,
      compensation_details,
      eligibility_details,
      selection_details,
    };
  }

  // 1) Parse <h4>Job Profile</h4> table if present
  const profileTableMatch = page.match(
    /<h4[^>]*>\s*Job\s+Profile\s*<\/h4>\s*<table[^>]*>([\s\S]*?)<\/table>/i
  );
  if (profileTableMatch) {
    const ths = Array.from(profileTableMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)).map((m) =>
      stripHtmlInline(m[1]).replace(/:+$/, "").trim()
    );
    const tds = Array.from(profileTableMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((m) =>
      stripHtmlInline(m[1]).trim()
    );
    for (let i = 0; i < Math.min(ths.length, tds.length); i++) {
      if (ths[i] && tds[i]) {
        job_profile[ths[i]] = tds[i];
      }
    }
  }

  // 2) Parse <h4>Job Description</h4> <div>...</div>
  const jdBlockMatch = page.match(
    /<h4[^>]*>\s*Job\s+Description\s*<\/h4>\s*<div[^>]*>([\s\S]*?)<\/div>\s*(?=<h4|$)/i
  );
  if (jdBlockMatch) {
    job_description = prettifyErpRichText(stripHtml(jdBlockMatch[1]));
  }

  const COMP_KEY_RE =
    /ctc|salary|gross|bonus|perk|benefit|stipend|compensation|allowance|stock|esop|take\s*home/i;
  const ELIG_KEY_RE =
    /bond|skill|pwd|dap|disability|cgpa|backlog|medical|additional\s*info|criteria|cutoff/i;

  const otherSplitIdx = page.search(/<h4[^>]*>\s*Other\s+Details\s*<\/h4>/i);
  const selectionSplitIdx = page.search(/<h4[^>]*>\s*Selection\s+Details\s*<\/h4>/i);
  const startIdx = otherSplitIdx >= 0 ? otherSplitIdx : 0;
  const upperSection =
    selectionSplitIdx >= 0 ? page.slice(startIdx, selectionSplitIdx) : page.slice(startIdx);
  const selectionSection = selectionSplitIdx >= 0 ? page.slice(selectionSplitIdx) : "";

  const extractBootstrapPairs = (chunk: string): Array<[string, string]> => {
    if (!chunk) return [];
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(chunk, "text/html");
      const nodes = Array.from(
        doc.querySelectorAll('[class*="col-xs-"], [class*="col-sm-"], [class*="col-md-"]')
      );
      const pairs: Array<[string, string]> = [];
      for (let i = 0; i + 1 < nodes.length; i += 2) {
        const rawLabel = (nodes[i].textContent || "")
          .replace(/\s+/g, " ")
          .replace(/\s*:\s*$/, "")
          .trim();
        const rawVal = stripHtml(nodes[i + 1].innerHTML || "");
        if (rawLabel && rawLabel.length <= 90) {
          pairs.push([rawLabel, rawVal]);
        }
      }
      return pairs;
    }
    const cols = Array.from(
      chunk.matchAll(
        /<div[^>]*class=['"][^'"]*\bcol-(?:xs|sm|md)-\d+\b[^'"]*['"][^>]*>([\s\S]*?)<\/div>/gi
      )
    );
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i + 1 < cols.length; i += 2) {
      const rawLabel = stripHtmlInline(cols[i][1]).replace(/\s*:\s*$/, "").trim();
      const rawVal = stripHtml(cols[i + 1][1]).trim();
      if (rawLabel && rawLabel.length <= 90) {
        pairs.push([rawLabel, rawVal]);
      }
    }
    return pairs;
  };

  const cleanLabelName = (raw: string): string =>
    raw
      .replace(/,\s*if\s+any\s*$/i, "")
      .replace(/\s*\(provide\s+details\s+below\)\s*$/i, "")
      .trim();

  const isMeaningfulValue = (val: string): boolean => {
    const clean = val.trim();
    if (!clean) return false;
    if (/^(n\/a|na|nil|none|-|--|refer\s+jd)$/i.test(clean)) return false;
    return true;
  };

  const rawUpperPairs = extractBootstrapPairs(upperSection);
  for (let i = 0; i < rawUpperPairs.length; i++) {
    const [origLabel, origVal] = rawUpperPairs[i];
    if (!isMeaningfulValue(origVal)) continue;

    // Combine conditional ERP pairs cleanly ("Is there a CGPA Criteria?" = Yes + "If Yes, minimum CGPA required" = 6.5)
    if (/^Is\s+there\s+a\s+CGPA\s+Criteria\??$/i.test(origLabel)) {
      const next = rawUpperPairs[i + 1];
      if (next && /^If\s+Yes.*CGPA/i.test(next[0])) {
        const minCgpa = next[1].trim();
        eligibility_details["CGPA Criteria"] =
          /^yes$/i.test(origVal.trim()) && isMeaningfulValue(minCgpa)
            ? `Yes (Minimum CGPA: ${minCgpa})`
            : origVal.trim();
        i += 1;
        continue;
      }
      eligibility_details["CGPA Criteria"] = origVal.trim();
      continue;
    }

    if (/^Is\s+the\s+position\s+also\s+open\s+to\s+PwD/i.test(origLabel)) {
      const next = rawUpperPairs[i + 1];
      if (next && /^If\s+No.*disability/i.test(next[0])) {
        const note = next[1].trim();
        eligibility_details["Open to PwD / DAP"] =
          /^no$/i.test(origVal.trim()) && isMeaningfulValue(note)
            ? `No (${prettifyErpRichText(note)})`
            : origVal.trim();
        i += 1;
        continue;
      }
      eligibility_details["Open to PwD / DAP"] = origVal.trim();
      continue;
    }

    if (/^Bonds$/i.test(origLabel)) {
      let bondSummary = origVal.trim();
      const durPair = rawUpperPairs[i + 1];
      const amtPair = rawUpperPairs[i + 2];
      if (
        durPair &&
        /^Bond\s+Duration$/i.test(durPair[0]) &&
        amtPair &&
        /^Bond\s+Amount$/i.test(amtPair[0])
      ) {
        const extras: string[] = [];
        if (isMeaningfulValue(durPair[1]) && durPair[1].trim() !== "0") {
          extras.push(`Duration: ${durPair[1].trim()}`);
        }
        if (isMeaningfulValue(amtPair[1]) && amtPair[1].trim() !== "0") {
          extras.push(`Amount: ${amtPair[1].trim()}`);
        }
        if (extras.length > 0) {
          bondSummary = `${bondSummary} (${extras.join(", ")})`;
        }
        eligibility_details["Bond / Service Contract"] = bondSummary;
        i += 2;
        continue;
      }
    }

    if (/^If\s+(?:Yes|No)\b/i.test(origLabel)) continue;

    const label = cleanLabelName(origLabel);
    if (COMP_KEY_RE.test(origLabel)) {
      if (origVal.trim() === "0" && /bonus/i.test(origLabel)) continue;
      compensation_details[label] = /breakup/i.test(origLabel)
        ? formatCtcBreakupText(origVal)
        : prettifyErpRichText(origVal);
    } else if (ELIG_KEY_RE.test(origLabel)) {
      if (origVal.trim() === "0" && /bond\s*amount/i.test(origLabel)) continue;
      eligibility_details[label] = prettifyErpRichText(origVal);
    } else {
      eligibility_details[label] = prettifyErpRichText(origVal);
    }
  }

  const rawSelectionPairs = extractBootstrapPairs(selectionSection);
  for (let i = 0; i < rawSelectionPairs.length; i++) {
    const [origLabel, origVal] = rawSelectionPairs[i];
    if (!isMeaningfulValue(origVal)) continue;
    if (/^If\s+Yes,\s*Mode$/i.test(origLabel)) continue;

    const next = rawSelectionPairs[i + 1];
    if (next && /^If\s+Yes,\s*Mode$/i.test(next[0])) {
      const modeVal = next[1].trim();
      selection_details[cleanLabelName(origLabel)] =
        /^yes$/i.test(origVal.trim()) && isMeaningfulValue(modeVal)
          ? `Yes (${modeVal})`
          : origVal.trim();
      i += 1;
      continue;
    }

    selection_details[cleanLabelName(origLabel)] = prettifyErpRichText(origVal);
  }

  return {
    job_profile,
    job_description,
    compensation_details,
    eligibility_details,
    selection_details,
  };
}

export function parseComViewHtml(page: string): Record<string, string> {
  const details: Record<string, string> = {};
  if (!page) return details;

  const rowMatches = page.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const trMatch of rowMatches) {
    const rawCells = Array.from(trMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(
      (m) => m[1]
    );
    if (rawCells.length !== 2) continue;
    const label = stripHtmlInline(rawCells[0]).replace(/:+$/, "").trim();
    let val = stripHtml(rawCells[1]).trim();
    if (!label || !val || label.length > 50 || /^company\s+details$/i.test(label)) continue;
    if (/^website$/i.test(label)) {
      val = val.replace(/^http:\/\/(https?:\/\/)/i, "$1");
    }
    details[label] = val;
  }
  return details;
}

export function parseJnfHtml(page: string, com_id = "", jnf_id = ""): JnfDetails {
  const applied_cv = extractAppliedCv(page);
  const can_cancel =
    page.includes("TPStudenApply.jsp?mode=cancel") || page.includes("mode=cancel");
  const available_cvs: CvNumber[] = [];
  for (const cvNum of [1, 2, 3] as CvNumber[]) {
    if (page.includes(`ApplyCV${cvNum}`)) available_cvs.push(cvNum);
  }

  // Extract exact onclick="jnfMoreDet('2026-2027', '22NA30028', '226', '12')" parameters from "Click Here for more details"
  const moreDetCall = page.match(
    /jnfMoreDet\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"](\d+)['"]\s*,\s*['"](\d+)['"]\s*\)/i
  );
  const more_details_params = moreDetCall
    ? {
        year: moreDetCall[1].trim(),
        rollno: moreDetCall[2].trim(),
        com_id: moreDetCall[3].trim(),
        jnf_id: moreDetCall[4].trim(),
      }
    : null;

  const fields: Record<string, string> = {};
  const longBlocks: string[] = [];
  const allowed_departments: string[] = [];
  let inAllowedDepartments = false;
  let pendingHeaders: string[] | null = null;
  let nextSingleCellIsJd = false;

  const rowMatches = page.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const trMatch of rowMatches) {
    const trHtml = trMatch[1];
    // Avoid double-counting outer wrapper <tr> that itself contains a nested <table>
    if (/<table\b/i.test(trHtml)) continue;

    const thCells = Array.from(trHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)).map((m) =>
      stripHtmlInline(m[1])
    );
    if (thCells.length >= 2) {
      pendingHeaders = thCells;
      continue;
    }

    const rawCells = Array.from(trHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((m) =>
      stripHtml(m[1])
    );
    if (pendingHeaders && rawCells.length === pendingHeaders.length) {
      for (let i = 0; i < pendingHeaders.length; i++) {
        const k = pendingHeaders[i].replace(/:+$/, "").trim();
        const v = rawCells[i].trim();
        if (k && v) fields[k] = v;
      }
      pendingHeaders = null;
      continue;
    }
    pendingHeaders = null;

    const cells = rawCells.filter(Boolean);
    if (cells.length === 0) continue;

    if (cells.length === 1) {
      const text = cells[0].trim();
      if (/^Allowed\s+Departments\s+and\s+degrees$/i.test(text)) {
        inAllowedDepartments = true;
        nextSingleCellIsJd = false;
        continue;
      }
      if (/^View\s+More\s+Details$/i.test(text) || /^Click\s+Here\s+for\s+more\s+details/i.test(text)) {
        nextSingleCellIsJd = false;
        continue;
      }
      if (/^Job\s+Description$/i.test(text)) {
        nextSingleCellIsJd = true;
        continue;
      }
      if (inAllowedDepartments) {
        if (text && !/Notification Form More Details/i.test(text)) {
          allowed_departments.push(text);
        }
        continue;
      }
      if (nextSingleCellIsJd || text.length > 80) {
        if (
          !/^Company\s*:/i.test(text) &&
          !/^View\s+applied\s+Resume$/i.test(text) &&
          !/Sorry,\s*You\s+are\s+not\s+supposed\s+to\s+open\s+this/i.test(text)
        ) {
          longBlocks.push(prettifyErpRichText(text));
        }
        nextSingleCellIsJd = false;
      }
      continue;
    }

    if (cells.length === 2 && !inAllowedDepartments) {
      const label = cells[0].replace(/:+$/, "").trim();
      const val = cells[1].trim();
      if (label && val && label.length <= 65) {
        fields[label] = val;
        if (val.length > 80) longBlocks.push(`${label}: ${val}`);
      }
    }
  }

  const cleanFull = stripHtml(page);
  const filteredLines = cleanFull.split(/\r?\n/).filter(
    (line) =>
      ![
        "function TP",
        "window.open(",
        "document.getElementById",
        "xmlhttp",
        "ApplyCV1",
        "TPStudenApply.jsp",
      ].some((noise) => line.includes(noise))
  );

  const summaryText =
    longBlocks.length > 0 ? longBlocks.join("\n\n") : filteredLines.slice(0, 60).join("\n");

  return {
    com_id,
    jnf_id,
    applied_cv,
    is_applied: applied_cv !== null || can_cancel,
    can_cancel,
    available_cvs,
    fields,
    more_details_params,
    allowed_departments,
    jd_text: summaryText.slice(0, 6000),
    raw_text: filteredLines.join("\n").slice(0, 8000),
  };
}
