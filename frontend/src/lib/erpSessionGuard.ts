/**
 * ERP session resilience: pure, dependency-free classifiers.
 *
 * IIT KGP ERP enforces a single interactive session per student. Real users
 * routinely leave a live session on a phone, a lab machine, or a stale tab, and
 * ERP then silently refuses a fresh login (or lands on `login.htm` instead of
 * minting a CDC token). These helpers turn those ambiguous HTTP responses into
 * a small closed set of causes so the UI can always offer exactly one fix.
 */

export type ErpFailureCode =
  | "auth_landing"
  | "session_conflict"
  | "session_stale"
  | "session_reset"
  | "otp_required"
  | "otp_invalid"
  | "otp_expired"
  | "erp_rejected"
  | "bridge_missing"
  | "unknown";

export type RecoveryAction = "resend_otp" | "sign_in" | "clean_login" | "none";

export interface ErpFailureInfo {
  code: ErpFailureCode;
  title: string;
  detail: string;
  action: RecoveryAction;
  /** Safe to retry automatically without asking the user. */
  canAutoRecover: boolean;
}

const AUTH_LANDING_PATHS = ["login.htm", "auth.htm"];

/** Robust pathname extraction that never throws on odd ERP redirect URLs. */
export function pathnameOf(urlOrPath: string): string {
  const raw = String(urlOrPath || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).pathname;
  } catch {
    const withoutQuery = raw.split("?")[0].split("#")[0];
    return withoutQuery || raw;
  }
}

/** True when ERP redirected us to its SSO login surface (i.e. we are logged out). */
export function isAuthLandingUrl(urlOrPath: string): boolean {
  const path = pathnameOf(urlOrPath).toLowerCase();
  if (!path) return false;
  return AUTH_LANDING_PATHS.some((suffix) => path.endsWith(suffix));
}

const WORKSPACE_MARKERS = [
  "TPStudentResume",
  "TPComView",
  "TPJNFView",
  "TPStudent",
  "TPComDescription",
  "TPJNFDescription",
  "NoticeView",
  "jqGrid",
];

const ROLLNO_IN_HTML_RE =
  /(?:rollno|roll_no|user_id)\s*[=:]\s*['"]?([0-9]{2}[A-Za-z]{2}[A-Za-z0-9]{4,8})\b/i;

/**
 * Markers that prove we are looking at the SSO login shell rather than the
 * placement workspace. Critically, `login.htm?requestedUrl=...TPStudent.jsp`
 * contains the string "TPStudent", so a positive marker alone is not enough —
 * we must reject login shells *before* trusting workspace markers.
 */
const LOGIN_SHELL_MARKERS = [
  'name="password"',
  "name='password'",
  'id="password"',
  "getSecurityQues.htm",
  'name="email_otp"',
  'id="email_otp"',
  'id="loginform"',
  "SSOAdministration/login.htm",
];

/**
 * A page is a *real* placement workspace only when it carries ERP student
 * scaffolding. This is what separates "no roles published yet" (companies: [])
 * from "session is silently dead" (also companies: []) — the ambiguity that
 * previously made the UI claim `authenticated` with an empty grid.
 */
export function isStudentWorkspaceHtml(html: string): boolean {
  if (!html || html.length < 12) return false;
  const haystack = html.toLowerCase();
  const looksLikeLoginShell = LOGIN_SHELL_MARKERS.some((marker) =>
    haystack.includes(marker.toLowerCase())
  );
  if (looksLikeLoginShell) return false;
  if (WORKSPACE_MARKERS.some((marker) => html.includes(marker))) return true;
  return ROLLNO_IN_HTML_RE.test(html);
}

const CONFLICT_PATTERNS: RegExp[] = [
  /already\s+logged\s*-?\s*in/i,
  /already\s+(?:have\s+an?\s+)?active\s+session/i,
  /another\s+(?:device|browser|machine|session|location)/i,
  /session\s+(?:is\s+)?(?:already\s+)?active/i,
  /already\s+authenticated/i,
  /please\s+logout/i,
  /multiple\s+(?:login|session)/i,
];

const STALE_PATTERNS: RegExp[] = [
  /session\s+(?:has\s+)?(?:been\s+)?(?:expired|timed\s*out|invalid|not\s+found)/i,
  /invalid\s+session/i,
  /not\s+logged\s*-?\s*in/i,
  /please\s+(?:login|log\s*in)\s+again/i,
  /kindly\s+(?:login|log\s*in)/i,
  /unauthori[sz]ed/i,
];

const OTP_EXPIRED_PATTERNS: RegExp[] = [
  /otp\s+(?:has\s+)?(?:been\s+)?expired/i,
  /(?:otp|code)s?\s+(?:is\s+)?(?:no\s+longer|not)\s+valid/i,
  /validity\s+(?:of\s+)?(?:the\s+)?otp/i,
  /otp\s+timed?\s*out/i,
];

const OTP_INVALID_PATTERNS: RegExp[] = [
  /(?:invalid|incorrect|wrong|mismatch\w*)\s+(?:otp|one[\s-]*time|code)/i,
  /(?:otp|one[\s-]*time\s*password|code)\s+(?:is\s+)?(?:invalid|incorrect|wrong|mismatch\w*)/i,
];

const BRIDGE_PATTERNS: RegExp[] = [/extension/i, /bridge/i];

/** Classify a raw ERP/portal error string into one known cause. Order matters. */
export function classifyErpMessage(message: string): ErpFailureCode {
  const text = String(message || "");
  if (!text.trim()) return "unknown";
  if (BRIDGE_PATTERNS.some((re) => re.test(text))) return "bridge_missing";
  if (OTP_EXPIRED_PATTERNS.some((re) => re.test(text))) return "otp_expired";
  if (OTP_INVALID_PATTERNS.some((re) => re.test(text))) return "otp_invalid";
  if (CONFLICT_PATTERNS.some((re) => re.test(text))) return "session_conflict";
  if (STALE_PATTERNS.some((re) => re.test(text))) return "session_stale";
  return "erp_rejected";
}

/** Plain-language cause + the single action that resolves it. */
export function explainErpFailure(code: ErpFailureCode): ErpFailureInfo {
  switch (code) {
    case "auth_landing":
    case "session_stale":
      return {
        code,
        title: "Your ERP session ended",
        detail:
          "ERP logged this browser out (usually after a while, or because you signed in somewhere else). Nothing is lost — sign in again to reload your roles.",
        action: "sign_in",
        canAutoRecover: true,
      };
    case "session_conflict":
      return {
        code,
        title: "ERP thinks you are still logged in",
        detail:
          "ERP allows only one active session per student. A leftover session is blocking this login. Tap the button below — it clears every ERP cookie here and starts a clean login.",
        action: "clean_login",
        canAutoRecover: true,
      };
    case "session_reset":
      return {
        code,
        title: "ERP session cleared",
        detail: "This browser no longer holds any ERP session. Sign in to continue.",
        action: "sign_in",
        canAutoRecover: true,
      };
    case "otp_required":
      return {
        code,
        title: "That login attempt expired",
        detail:
          "The login page you started earlier is no longer valid. Request a fresh OTP — it takes one tap.",
        action: "resend_otp",
        canAutoRecover: true,
      };
    case "otp_expired":
      return {
        code,
        title: "OTP expired",
        detail:
          "ERP OTPs are valid for only a few minutes. Send a new one and enter it right away.",
        action: "resend_otp",
        canAutoRecover: true,
      };
    case "otp_invalid":
      return {
        code,
        title: "OTP was not accepted",
        detail:
          "Check you pasted the newest 6-digit code from ERP. If it is the newest one, it has most likely expired — send a fresh OTP.",
        action: "resend_otp",
        canAutoRecover: true,
      };
    case "bridge_missing":
      return {
        code,
        title: "ERP bridge extension is not connected",
        detail:
          "The portal talks to ERP through the Chrome extension. Install or update it, then reload this page.",
        action: "none",
        canAutoRecover: false,
      };
    case "erp_rejected":
      return {
        code,
        title: "ERP rejected that request",
        detail:
          "ERP returned an error. Retrying after a clean login fixes most of these.",
        action: "clean_login",
        canAutoRecover: true,
      };
    case "unknown":
    default:
      return {
        code: "unknown",
        title: "Something went wrong talking to ERP",
        detail: "Tap retry. If it repeats, start a clean login — that clears any stuck ERP state.",
        action: "clean_login",
        canAutoRecover: true,
      };
  }
}

export interface ClassifiedErpError extends ErpFailureInfo {
  rawMessage: string;
}

/** Normalise any thrown value into an actionable, user-safe explanation. */
export function classifyErpError(err: unknown): ClassifiedErpError {
  const rawMessage =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err ?? "");
  const explicit = (err as { code?: unknown } | null)?.code;
  const code =
    typeof explicit === "string" && explicit in FAILURE_CODES
      ? (explicit as ErpFailureCode)
      : classifyErpMessage(rawMessage);
  return { ...explainErpFailure(code), rawMessage };
}

const FAILURE_CODES: Record<ErpFailureCode, true> = {
  auth_landing: true,
  session_conflict: true,
  session_stale: true,
  session_reset: true,
  otp_required: true,
  otp_invalid: true,
  otp_expired: true,
  erp_rejected: true,
  bridge_missing: true,
  unknown: true,
};
