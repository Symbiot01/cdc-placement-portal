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

export interface JnfDetails {
  com_id: string;
  jnf_id: string;
  applied_cv: CvNumber | null;
  is_applied: boolean;
  can_cancel: boolean;
  available_cvs: CvNumber[];
  fields: Record<string, string>;
  jd_text: string;
  raw_text: string;
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

  const jnf_id = roleCall ? roleCall[1] : "";
  const com_id = (roleCall && roleCall[2]) || (companyCall && companyCall[2]) || "";
  const yop = (roleCall && roleCall[3]) || (companyCall && companyCall[1]) || DEFAULT_YOP;

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
    has_com_doc: view2Html.includes("TPComDescription"),
    has_ppt_doc: view3Html.includes("TPPPTDescription"),
    has_jnf_doc: view1Html.includes("TPJNFDescription"),
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

  const attachCall = viewHtml.match(/NoticeView\(\s*['"](\d+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/);
  const has_attachment = Boolean(attachCall) || viewHtml.includes("AdmFilePDF.htm");
  const attachment_year = attachCall ? attachCall[2] : DEFAULT_YOP;

  return {
    n: index,
    id,
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

export function parseJnfHtml(page: string, com_id = "", jnf_id = ""): JnfDetails {
  const applied_cv = extractAppliedCv(page);
  const can_cancel =
    page.includes("TPStudenApply.jsp?mode=cancel") || page.includes("mode=cancel");
  const available_cvs: CvNumber[] = [];
  for (const cvNum of [1, 2, 3] as CvNumber[]) {
    if (page.includes(`ApplyCV${cvNum}`)) available_cvs.push(cvNum);
  }

  const fields: Record<string, string> = {};
  const longBlocks: string[] = [];
  const rowMatches = page.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const trMatch of rowMatches) {
    const trHtml = trMatch[1];
    const cells = Array.from(trHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi))
      .map((m) => stripHtml(m[1]))
      .filter(Boolean);
    if (cells.length === 2) {
      const label = cells[0].replace(/:+$/, "").trim();
      const val = cells[1].trim();
      if (label && val && label.length <= 65) {
        fields[label] = val;
        if (val.length > 80) longBlocks.push(`${label}: ${val}`);
      }
    } else if (cells.length === 1 && cells[0].length > 80) {
      longBlocks.push(cells[0]);
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
    longBlocks.length > 0 ? longBlocks.join("\n") : filteredLines.slice(0, 60).join("\n");

  return {
    com_id,
    jnf_id,
    applied_cv,
    is_applied: applied_cv !== null || can_cancel,
    can_cancel,
    available_cvs,
    fields,
    jd_text: summaryText.slice(0, 6000),
    raw_text: filteredLines.join("\n").slice(0, 8000),
  };
}
