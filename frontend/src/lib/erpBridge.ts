import {
  CompanyRole,
  CvNumber,
  DEFAULT_YOP,
  JnfDetails,
  LoginProfile,
  MAX_SECURITY_QUESTION_FETCH_TRIES,
  MAX_SECURITY_QUESTION_RETRIES,
  PlacementNotice,
  REQUIRED_SECURITY_QUESTIONS,
  decideSecurityAnswer,
  extractHiddenInput,
  normalizeQuestion,
  parseComViewHtml,
  parseCompanyRow,
  parseJnfHtml,
  parseJnfMoreDetHtml,
  parseJqgridXml,
  parseNoticeRow,
  stripHtmlInline,
} from "./erpParsers";
import {
  ErpFailureCode,
  classifyErpMessage,
  isAuthLandingUrl,
  isStudentWorkspaceHtml,
} from "./erpSessionGuard";

/**
 * Typed ERP failure. Carries a machine-readable code so the UI can always
 * render the correct single recovery action instead of a raw stack string.
 */
export class ErpSessionError extends Error {
  readonly code: ErpFailureCode;
  constructor(code: ErpFailureCode, message: string) {
    super(message);
    this.name = "ErpSessionError";
    this.code = code;
  }
}

/** Wraps an arbitrary failure whose text we must classify at the boundary. */
function asErpError(err: unknown, fallback: ErpFailureCode = "unknown"): ErpSessionError {
  if (err instanceof ErpSessionError) return err;
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (!message.trim()) {
    return new ErpSessionError(fallback, "ERP did not respond. Check your connection and retry.");
  }
  return new ErpSessionError(classifyErpMessage(message), message);
}

const ERP_HOST = "https://erp.iitkgp.ac.in";
const SOURCE_PAGE = "ERP_CDC_PAGE";
const SOURCE_EXT = "ERP_CDC_EXT";

export const ERP_EXTENSION_STORE_URL =
  "https://chromewebstore.google.com/detail/ibcippekdchapicjboimhoaipghjplfk";
export const MIN_BRIDGE_VERSION = "1.0.4";
const BRIDGE_PROBE_TIMEOUT_MS = 2000;

const ROLL_ATTR_RE =
  /(?:rollno|roll_no|user_id)\s*[=:]\s*['"]?([0-9]{2}[A-Za-z]{2}[A-Za-z0-9]{4,8})\b/i;
const ROLL_CALL_RE =
  /TPStudentResume\d*\(\s*['"]([0-9]{2}[A-Za-z]{2}[A-Za-z0-9]{4,8})['"]/i;
const ROLL_PAREN_RE = /\(\s*([0-9]{2}[A-Za-z]{2}[A-Za-z0-9]{5})\s*\)/;

export function extractRollNumberFromErpHtml(html: string): string {
  if (!html) return "";
  const match =
    html.match(ROLL_ATTR_RE) || html.match(ROLL_CALL_RE) || html.match(ROLL_PAREN_RE);
  return match?.[1] ? match[1].trim().toUpperCase() : "";
}

export type ExtensionBridgeSnapshot = {
  status: "checking" | "missing" | "outdated" | "connected";
  version: string | null;
};

export interface BridgeFetchOptions {
  url: string;
  method?: "GET" | "POST";
  form?: Record<string, string>;
  ajax?: boolean;
  responseType?: "text" | "base64";
}

export interface BridgeFetchResponse {
  ok: boolean;
  status: number;
  finalUrl: string;
  contentType: string;
  text?: string;
  base64?: string;
}

export interface ErpSessionState {
  stage: "uninitialized" | "otp_sent" | "authenticated";
  rollno: string;
  requestedUrl: string;
  matchedQuestion: string;
  matchedAnswer: string;
}

export type BridgeTransport = (
  action: "PING" | "FETCH" | "CLEAR_COOKIES",
  payload?: BridgeFetchOptions
) => Promise<any>;

let customTransport: BridgeTransport | null = null;
let requestCounter = 0;

export function setCustomErpBridgeTransport(transport: BridgeTransport | null): void {
  customTransport = transport;
}

function defaultWindowTransport(
  action: "PING" | "FETCH" | "CLEAR_COOKIES",
  payload?: BridgeFetchOptions
): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = `erp_req_${Date.now()}_${++requestCounter}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(
        new Error(
          "ERP bridge extension did not respond. Install it from the Chrome Web Store, allow it on this site, and reload."
        )
      );
    }, 35000);

    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== SOURCE_EXT || data.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (!data.ok) {
        reject(new Error(data.error || "Extension bridge request failed"));
        return;
      }
      resolve(data.result);
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        source: SOURCE_PAGE,
        id,
        action,
        payload,
      },
      window.location.origin
    );
  });
}

async function sendBridgeMessage(
  action: "PING" | "FETCH" | "CLEAR_COOKIES",
  payload?: BridgeFetchOptions
): Promise<any> {
  const transport = customTransport || defaultWindowTransport;
  return transport(action, payload);
}

export function isVersionAtLeast(current: string, minimum: string): boolean {
  const parse = (raw: string): number[] | null => {
    if (!/^\d+(\.\d+){0,3}$/.test(raw)) return null;
    return raw.split(".").map((part) => Number(part));
  };
  const left = parse(current);
  const right = parse(minimum);
  if (!left || !right) return false;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta > 0;
  }
  return true;
}

function probeExtensionPing(timeoutMs: number): Promise<{ version: string | null }> {
  return new Promise((resolve, reject) => {
    const id = `erp_ping_${Date.now()}_${++requestCounter}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("ERP bridge probe timed out"));
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== SOURCE_EXT || data.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (!data.ok) {
        reject(new Error(typeof data.error === "string" ? data.error : "ERP bridge probe failed"));
        return;
      }
      const rawVersion = typeof data.version === "string" ? data.version.trim() : "";
      resolve({
        version: /^\d+\.\d+\.\d+$/.test(rawVersion) ? rawVersion : null,
      });
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        source: SOURCE_PAGE,
        id,
        action: "PING",
      },
      window.location.origin
    );
  });
}

export function classifyBridgePing(
  ok: boolean,
  version: string | null
): Exclude<ExtensionBridgeSnapshot, { status: "checking" }> {
  if (!ok) return { status: "missing", version: null };
  if (version && isVersionAtLeast(version, MIN_BRIDGE_VERSION)) {
    return { status: "connected", version };
  }
  return { status: "outdated", version };
}

export async function readExtensionBridge(): Promise<
  Exclude<ExtensionBridgeSnapshot, { status: "checking" }>
> {
  if (customTransport) {
    return { status: "connected", version: MIN_BRIDGE_VERSION };
  }
  try {
    const { version } = await probeExtensionPing(BRIDGE_PROBE_TIMEOUT_MS);
    return classifyBridgePing(true, version);
  } catch {
    return { status: "missing", version: null };
  }
}

export async function isExtensionBridgeAvailable(): Promise<boolean> {
  const bridge = await readExtensionBridge();
  return bridge.status === "connected";
}

async function erpFetchText(
  url: string,
  form?: Record<string, string>,
  ajax = false
): Promise<{ text: string; finalUrl: string; contentType: string }> {
  const res: BridgeFetchResponse = await sendBridgeMessage("FETCH", {
    url,
    method: form ? "POST" : "GET",
    form,
    ajax,
    responseType: "text",
  });
  if (!res || typeof res.text !== "string") {
    throw new Error("Empty response from ERP bridge");
  }
  return {
    text: res.text,
    finalUrl: res.finalUrl || url,
    contentType: res.contentType || "text/html",
  };
}

async function erpFetchBinary(
  url: string
): Promise<{ base64: string; contentType: string; finalUrl: string }> {
  const res: BridgeFetchResponse = await sendBridgeMessage("FETCH", {
    url,
    method: "GET",
    responseType: "base64",
  });
  if (!res || typeof res.base64 !== "string") {
    throw new Error("Binary response missing from ERP bridge");
  }
  return {
    base64: res.base64,
    contentType: res.contentType || "application/pdf",
    finalUrl: res.finalUrl || url,
  };
}

export type ErpAttachmentKind = "NOTICE" | "JNF" | "COM" | "PPT" | "GUID" | "CV";

export interface ErpAttachmentRequest {
  kind: ErpAttachmentKind;
  title: string;
  subtitle?: string;
  filenameStem: string;
  year?: string;
  id?: string;
  com_id?: string;
  jnf_id?: string;
  cv?: CvNumber;
}

export interface ResolvedErpAttachment {
  blob: Blob;
  mimeType: string;
  extension: string;
  previewKind: "pdf" | "image" | "download";
  byteLength: number;
  filename: string;
}

const MAX_ATTACHMENT_CACHE_ENTRIES = 25;

export function sanitizeErpNumericId(value: string | undefined, label: string): string {
  const clean = (value || "").trim();
  if (!/^\d{1,12}$/.test(clean)) {
    throw new Error(`Invalid ERP ${label} identifier.`);
  }
  return clean;
}

export function sanitizeErpYear(value: string | undefined): string {
  const clean = (value || DEFAULT_YOP).trim();
  if (!/^\d{4}-\d{4}$/.test(clean)) {
    return DEFAULT_YOP;
  }
  return clean;
}

export function sanitizeDownloadFilename(stem: string, extension: string): string {
  const safeStem =
    (stem || "CDC_Attachment")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^[._-]+|[._-]+$/g, "")
      .slice(0, 90) || "CDC_Attachment";
  const safeExt = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "pdf";
  return `${safeStem}.${safeExt}`;
}

/**
 * Security-critical binary attachment validator:
 * Inspects magic bytes directly and NEVER trusts Content-Type headers from ERP,
 * preventing expired-session HTML/SVG responses from ever becoming executable
 * same-origin Blob documents.
 */
export function inspectErpAttachmentBase64(
  base64: string,
  filenameStem = "CDC_Attachment"
): ResolvedErpAttachment {
  if (!base64 || base64.length < 12) {
    throw new Error("ERP returned an empty attachment (no file uploaded for this item).");
  }

  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error("ERP returned malformed binary data.");
  }

  if (binary.length < 8) {
    throw new Error("ERP returned an empty attachment (no file uploaded for this item).");
  }

  const trimmedHead = binary.slice(0, 256).trimStart();
  if (trimmedHead.startsWith("<")) {
    throw new Error(
      "No file was returned by ERP (or your ERP session expired — click Refresh and try again)."
    );
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  // %PDF-
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      mimeType: "application/pdf",
      extension: "pdf",
      previewKind: "pdf",
      byteLength: bytes.length,
      filename: sanitizeDownloadFilename(filenameStem, "pdf"),
    };
  }

  // PK\x03\x04 -> ZIP / OOXML (.xlsx / .docx / .pptx / .zip) — download-only
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const headerAscii = binary.slice(0, 4096);
    let ext = "zip";
    if (headerAscii.includes("xl/")) ext = "xlsx";
    else if (headerAscii.includes("word/")) ext = "docx";
    else if (headerAscii.includes("ppt/")) ext = "pptx";
    return {
      blob: new Blob([bytes], { type: "application/octet-stream" }),
      mimeType: "application/octet-stream",
      extension: ext,
      previewKind: "download",
      byteLength: bytes.length,
      filename: sanitizeDownloadFilename(filenameStem, ext),
    };
  }

  // D0 CF 11 E0 -> Legacy MS Office (.doc / .xls) — download-only
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return {
      blob: new Blob([bytes], { type: "application/octet-stream" }),
      mimeType: "application/octet-stream",
      extension: "doc",
      previewKind: "download",
      byteLength: bytes.length,
      filename: sanitizeDownloadFilename(filenameStem, "doc"),
    };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return {
      blob: new Blob([bytes], { type: "image/png" }),
      mimeType: "image/png",
      extension: "png",
      previewKind: "image",
      byteLength: bytes.length,
      filename: sanitizeDownloadFilename(filenameStem, "png"),
    };
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return {
      blob: new Blob([bytes], { type: "image/jpeg" }),
      mimeType: "image/jpeg",
      extension: "jpg",
      previewKind: "image",
      byteLength: bytes.length,
      filename: sanitizeDownloadFilename(filenameStem, "jpg"),
    };
  }

  throw new Error("ERP did not return a recognized attachment file (session may have expired).");
}

export function base64ToBlob(base64: string, _contentType = "application/pdf"): Blob {
  const inspected = inspectErpAttachmentBase64(base64, "CDC_Document");
  if (inspected.previewKind !== "pdf") {
    throw new Error("ERP did not return a valid PDF document (session may have expired).");
  }
  return inspected.blob;
}

class ClientErpRunner {
  private state: ErpSessionState = {
    stage: "uninitialized",
    rollno: "",
    requestedUrl: `${ERP_HOST}/IIT_ERP3/home.htm`,
    matchedQuestion: "",
    matchedAnswer: "",
  };

  private jnfCache = new Map<string, JnfDetails>();
  private comViewCache = new Map<string, Record<string, string>>();
  private cvPdfBase64Cache = new Map<CvNumber, string>();
  private attachmentBase64Cache = new Map<string, string>();
  private gridOpQueue: Promise<unknown> = Promise.resolve();

  private enqueueGridOp<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.gridOpQueue.then(fn, fn);
    this.gridOpQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private rememberAttachmentBase64(cacheKey: string, base64: string): void {
    if (this.attachmentBase64Cache.has(cacheKey)) {
      this.attachmentBase64Cache.delete(cacheKey);
    } else if (this.attachmentBase64Cache.size >= MAX_ATTACHMENT_CACHE_ENTRIES) {
      const oldestKey = this.attachmentBase64Cache.keys().next().value;
      if (oldestKey) this.attachmentBase64Cache.delete(oldestKey);
    }
    this.attachmentBase64Cache.set(cacheKey, base64);
  }

  getSessionState(): ErpSessionState {
    return { ...this.state };
  }

  /** Drops all in-memory ERP data and returns to a clean logged-out state. */
  private resetToLoggedOut(): void {
    this.jnfCache.clear();
    this.comViewCache.clear();
    this.cvPdfBase64Cache.clear();
    this.attachmentBase64Cache.clear();
    this.state = {
      stage: "uninitialized",
      rollno: "",
      requestedUrl: `${ERP_HOST}/IIT_ERP3/home.htm`,
      matchedQuestion: "",
      matchedAnswer: "",
    };
  }

  /**
   * Non-destructively probes whether Chrome already holds a *verified working*
   * ERP SSO session for the student. Never clears cookies or triggers an OTP.
   *
   * Returns null unless every step proves the session is genuinely usable:
   * an auth landing page, an unauthenticated menu shell, or a non-workspace
   * TPStudent.jsp all mean "not resumable". This is what stops the UI from
   * claiming `authenticated` over a dead session with an empty grid.
   */
  async tryResumeSession(expectedRollno = ""): Promise<{
    rollno: string;
    companies: CompanyRole[];
    notices: PlacementNotice[];
  } | null> {
    const cleanExpected = expectedRollno.trim();
    // Every "not resumable" exit must leave a *clean* logged-out state. A
    // half-reset client is how the UI ended up showing `On` over an empty grid.
    const giveUp = (): null => {
      this.resetToLoggedOut();
      return null;
    };
    try {
      const { text: homeHtml, finalUrl } = await erpFetchText(`${ERP_HOST}/IIT_ERP3/`);
      if (isAuthLandingUrl(finalUrl)) {
        return giveUp();
      }

      await this.openPlacementSession();
      const { text: tpHtml, finalUrl: tpUrl } = await erpFetchText(
        `${ERP_HOST}/TrainingPlacementSSO/TPStudent.jsp`
      );
      if (isAuthLandingUrl(tpUrl)) {
        return giveUp();
      }
      // A real workspace page carries ERP student scaffolding; anything else
      // is a login shell or an error page wearing a 200 status.
      if (!isStudentWorkspaceHtml(tpHtml)) {
        return giveUp();
      }

      const detectedRoll =
        extractRollNumberFromErpHtml(tpHtml) || extractRollNumberFromErpHtml(homeHtml);
      if (
        detectedRoll &&
        cleanExpected &&
        detectedRoll.toUpperCase() !== cleanExpected.toUpperCase()
      ) {
        return giveUp();
      }

      const activeRoll = (detectedRoll || cleanExpected).trim();
      if (!activeRoll) {
        return giveUp();
      }

      const { text: payload, finalUrl: gridUrl } = await erpFetchText(
        `${ERP_HOST}/TrainingPlacementSSO/ERPMonitoring.htm?action=fetchData&jqqueryid=37`
      );
      if (isAuthLandingUrl(gridUrl)) {
        return giveUp();
      }
      let rows: string[][];
      try {
        rows = parseJqgridXml(payload);
      } catch {
        // Not a jqGrid document at all -> the session is not really open yet.
        return giveUp();
      }
      const now = new Date();
      const companies = rows.map((cells, idx) => {
        const parsed = parseCompanyRow(idx + 1, cells, now);
        const cachedJnf = this.jnfCache.get(parsed.key);
        if (parsed.applied && cachedJnf?.applied_cv) {
          parsed.applied_cv = cachedJnf.applied_cv;
        }
        return parsed;
      });

      this.state = {
        stage: "authenticated",
        rollno: activeRoll,
        requestedUrl: `${ERP_HOST}/IIT_ERP3/home.htm`,
        matchedQuestion: "",
        matchedAnswer: "",
      };

      let notices: PlacementNotice[] = [];
      try {
        notices = await this.fetchNotices(100, true);
      } catch {
        notices = [];
      }

      return {
        rollno: activeRoll,
        companies,
        notices,
      };
    } catch {
      return giveUp();
    }
  }

  /**
   * Drives ERP to a genuine, unauthenticated SSO login page before an OTP is
   * requested. ERP keeps three independent servlet sessions plus a shared
   * `ssoToken` cookie, so a partial cleanup can still land us on `home.htm`
   * and make `getSecurityQues.htm` answer with a stale session's question —
   * which is exactly how users end up with an OTP that never verifies.
   *
   * Escalation ladder (cheap -> thorough):
   *   1. logout every context + clear cookies
   *   2. repeat (leftover ssoToken/JSESSIONID can survive one pass)
   *   3. one final pass after a short settle delay
   *
   * Never throws on ERP oddities; only fails if ERP simply refuses to show a
   * login page after all passes, which is a real, explainable blocker.
   */
  private async ensureLoginLanding(): Promise<string> {
    const settle = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const attempt = async (): Promise<string> => {
      // IIT_ERP3/logout.htm drops the main ERP session; CLEAR_COOKIES then
      // removes every JSID_* / ssoToken cookie across all three contexts, which
      // is what actually stops ERP reusing a half-dead session.
      await erpFetchText(`${ERP_HOST}/IIT_ERP3/logout.htm`).catch(() => undefined);
      await sendBridgeMessage("CLEAR_COOKIES").catch(() => undefined);
      const { finalUrl } = await erpFetchText(`${ERP_HOST}/IIT_ERP3/`);
      return finalUrl;
    };

    let finalUrl = await attempt();
    if (isAuthLandingUrl(finalUrl)) return finalUrl;

    finalUrl = await attempt();
    if (isAuthLandingUrl(finalUrl)) return finalUrl;

    // Give ERP a moment to expire the server-side session before the last pass.
    await settle(600);
    finalUrl = await attempt();
    if (isAuthLandingUrl(finalUrl)) return finalUrl;

    throw new ErpSessionError(
      "session_conflict",
      `ERP kept reusing an existing session instead of showing its login page (got ${finalUrl}). ` +
        "Use “Reset ERP session”, or open erp.iitkgp.ac.in in this Chrome profile, log out there, and retry."
    );
  }

  /**
   * Public recovery entry point: forces a completely clean ERP state.
   *
   * Used by the recovery button and by automatic escalation when a login is
   * blocked by a stale/conflicting session. Safe to call at any time — it never
   * throws, and always leaves the client in a deterministic logged-out state.
   */
  async resetSession(): Promise<{ cleared: boolean }> {
    this.resetToLoggedOut();
    try {
      await erpFetchText(`${ERP_HOST}/IIT_ERP3/logout.htm`);
    } catch {
      /* logout endpoint is best-effort */
    }
    let cleared = true;
    try {
      // Wiping cookies across every ERP context is the part that actually
      // guarantees a clean start, so its failure is reported to the caller.
      await sendBridgeMessage("CLEAR_COOKIES");
    } catch {
      cleared = false;
    }
    return { cleared };
  }

  /**
   * Verifies the current session is still alive. Returns false (and quietly
   * logs out locally) when ERP has dropped us, so stale UI can self-heal.
   */
  async isSessionAlive(): Promise<boolean> {
    if (this.state.stage !== "authenticated") return false;
    try {
      const randId = Math.floor(1e14 + Math.random() * 9e14);
      const { finalUrl } = await erpFetchText(
        `${ERP_HOST}/IIT_ERP3/holdSession.htm?rand_id=${randId}`
      );
      if (isAuthLandingUrl(finalUrl)) {
        this.resetToLoggedOut();
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async fetchAllSecurityQuestions(rollno: string): Promise<string[]> {
    const roll = rollno.trim();
    if (!/^[A-Za-z0-9]{5,20}$/.test(roll)) {
      throw new Error("Invalid roll number");
    }

    try {
      await this.ensureLoginLanding();
    } catch (err) {
      throw asErpError(err, "session_conflict");
    }

    const questions: string[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < MAX_SECURITY_QUESTION_FETCH_TRIES; i++) {
      if (questions.length >= REQUIRED_SECURITY_QUESTIONS) break;
      const { text, finalUrl } = await erpFetchText(
        `${ERP_HOST}/SSOAdministration/getSecurityQues.htm`,
        { user_id: roll },
        true
      );
      if (isAuthLandingUrl(finalUrl)) {
        throw new ErpSessionError(
          "session_conflict",
          "ERP dropped the login page while reading your security questions. Use “Reset ERP session” and try again."
        );
      }
      const question = normalizeQuestion(stripHtmlInline(text));
      if (!question || question.toUpperCase() === "FALSE") {
        throw new Error(
          questions.length === 0
            ? "Invalid roll number"
            : `ERP stopped returning security questions after ${questions.length}`
        );
      }
      if (!seen.has(question)) {
        seen.add(question);
        questions.push(question);
      }
    }

    if (questions.length < REQUIRED_SECURITY_QUESTIONS) {
      throw new Error(
        `Could not fetch ${REQUIRED_SECURITY_QUESTIONS} unique security questions (got ${questions.length})`
      );
    }

    return questions.slice(0, REQUIRED_SECURITY_QUESTIONS);
  }

  async sendOtp(profile: LoginProfile): Promise<{
    rollno: string;
    question: string;
    message: string;
  }> {
    const roll = profile.rollno.trim();
    const password = profile.password;
    if (!roll || !password) {
      throw new Error("Roll number and password are required");
    }
    const usable = profile.slots.some(
      (s) => s.use !== false && normalizeQuestion(s.question) !== "" && s.answer.trim() !== ""
    );
    if (!usable) {
      throw new Error("At least one usable security answer is required");
    }

    try {
      return await this.sendOtpOnce(profile);
    } catch (err) {
      const failure = asErpError(err);
      // Session-level causes are self-healing: purge everything and retry once
      // so the user never sees this class of error at all.
      if (failure.code !== "session_conflict" && failure.code !== "session_stale" && failure.code !== "auth_landing") {
        throw failure;
      }
      await this.resetSession();
      try {
        return await this.sendOtpOnce(profile);
      } catch (retryErr) {
        throw asErpError(retryErr, "session_conflict");
      }
    }
  }

  private async sendOtpOnce(profile: LoginProfile): Promise<{
    rollno: string;
    question: string;
    message: string;
  }> {
    const roll = profile.rollno.trim();
    const password = profile.password;

    const finalUrl = await this.ensureLoginLanding();
    try {
      const parsed = new URL(finalUrl);
      const reqUrl = parsed.searchParams.get("requestedUrl");
      if (reqUrl) this.state.requestedUrl = reqUrl;
    } catch {
      /* keep default */
    }

    let lastQuestion = "";
    let matchedQuestion = "";
    let matchedAnswer = "";

    for (let i = 0; i < MAX_SECURITY_QUESTION_RETRIES; i++) {
      const { text } = await erpFetchText(
        `${ERP_HOST}/SSOAdministration/getSecurityQues.htm`,
        { user_id: roll },
        true
      );
      const question = normalizeQuestion(stripHtmlInline(text));
      if (!question || question.toUpperCase() === "FALSE") {
        throw new Error(`ERP did not return a security question for roll ${roll}`);
      }
      lastQuestion = question;
      const decision = decideSecurityAnswer(question, profile.slots);
      if (decision.action === "fill") {
        matchedQuestion = question;
        matchedAnswer = decision.answer;
        break;
      }
      if (decision.action === "missing") {
        throw new Error("This security question has no saved answer. Update it in Edit login.");
      }
      if (decision.action === "none-usable") {
        throw new Error("No usable security answers saved. Update them in Edit login.");
      }
      // retry or unknown -> loop again to rotate ERP question
    }

    if (!matchedAnswer) {
      throw new Error(
        `Could not get a security question you marked as correct (last: ${lastQuestion})`
      );
    }

    const { text: otpBody, finalUrl: otpUrl } = await erpFetchText(
      `${ERP_HOST}/SSOAdministration/getEmilOTP.htm`,
      {
        user_id: roll,
        password,
        answer: matchedAnswer,
        typeee: "SI",
        sessionToken: "",
        requestedUrl: this.state.requestedUrl,
        email_otp: "",
      },
      true
    );

    if (isAuthLandingUrl(otpUrl)) {
      throw new ErpSessionError(
        "session_conflict",
        "ERP closed the login page before sending the OTP. Resetting the ERP session and trying again."
      );
    }

    let payload: { msg?: string };
    try {
      payload = JSON.parse(otpBody);
    } catch {
      throw new ErpSessionError(
        "session_conflict",
        "ERP returned an unexpected page instead of an OTP confirmation. Resetting the ERP session and trying again."
      );
    }

    const message = String(payload.msg || "").trim();
    const low = message.toLowerCase();
    if (
      low.includes("unable") ||
      low.includes("incorrect") ||
      low.includes("invalid") ||
      low.includes("error")
    ) {
      throw new Error(message || "ERP rejected password/security answer when requesting OTP");
    }

    this.state = {
      stage: "otp_sent",
      rollno: roll,
      requestedUrl: this.state.requestedUrl,
      matchedQuestion,
      matchedAnswer,
    };

    return {
      rollno: roll,
      question: matchedQuestion,
      message,
    };
  }

  async verifyOtpAndOpenCdc(
    profile: LoginProfile,
    otp: string
  ): Promise<{
    rollno: string;
    companies: CompanyRole[];
    notices: PlacementNotice[];
  }> {
    const cleanOtp = otp.trim();
    if (!cleanOtp) {
      throw new Error("OTP cannot be empty");
    }
    if (this.state.stage !== "otp_sent" || !this.state.matchedAnswer) {
      throw new ErpSessionError(
        "otp_required",
        "This login attempt is no longer active. Tap ‘Send OTP’ to start a fresh login."
      );
    }

    const { finalUrl } = await erpFetchText(`${ERP_HOST}/SSOAdministration/auth.htm`, {
      user_id: profile.rollno.trim(),
      password: profile.password,
      answer: this.state.matchedAnswer,
      typeee: "SI",
      sessionToken: "",
      requestedUrl: this.state.requestedUrl,
      email_otp: cleanOtp,
    });

    if (isAuthLandingUrl(finalUrl)) {
      // ERP bounces back to the login shell for two very different reasons:
      // a bad/expired OTP, or a session that another device invalidated.
      // We cannot tell them apart here — so stay in `otp_sent`: the user can
      // retype the code if it was merely mistyped, and the banner offers a
      // one-tap fresh OTP if it really expired.
      throw new ErpSessionError(
        "otp_invalid",
        "ERP did not accept that code. Check the newest 6-digit OTP, or send a fresh one — a login on another device can also cancel this attempt."
      );
    }

    await this.openPlacementSession();
    this.state.stage = "authenticated";
    this.state.rollno = profile.rollno.trim();

    const companies = await this.fetchCompanies();
    let notices: PlacementNotice[] = [];
    try {
      notices = await this.fetchNotices(100, true);
    } catch (err) {
      // A dead session here is not a notice problem — surface it as auth.
      if (err instanceof ErpSessionError && err.code === "auth_landing") throw err;
      try {
        notices = await this.fetchNotices(100, true);
      } catch (retryErr) {
        if (retryErr instanceof ErpSessionError && retryErr.code === "auth_landing") {
          throw retryErr;
        }
        notices = [];
      }
    }

    return {
      rollno: this.state.rollno,
      companies,
      notices,
    };
  }

  async openPlacementSession(): Promise<void> {
    const { text: page, finalUrl: menuUrl } = await erpFetchText(
      `${ERP_HOST}/IIT_ERP3/showmenu.htm`,
      {
        module_id: "26",
        menu_id: "11",
        link: `${ERP_HOST}/TrainingPlacementSSO/TPStudent.jsp`,
        module_name: "CDC",
        parent_display_name: "Student",
        display_name: "Application of Placement/Internship",
      }
    );

    if (isAuthLandingUrl(menuUrl)) {
      throw new ErpSessionError(
        "auth_landing",
        "Your ERP session ended before CDC could open. Sign in again to continue."
      );
    }

    const ssoToken = extractHiddenInput(page, "ssoToken");
    if (!ssoToken) {
      throw new ErpSessionError(
        "session_conflict",
        "ERP did not open CDC Placement. A stale session is usually the cause — use “Reset ERP session”, then sign in again."
      );
    }

    const { finalUrl: tpUrl } = await erpFetchText(
      `${ERP_HOST}/TrainingPlacementSSO/TPStudent.jsp`,
      {
        ssoToken,
        module_id: "26",
        menu_id: "11",
      }
    );
    if (isAuthLandingUrl(tpUrl)) {
      throw new ErpSessionError(
        "auth_landing",
        "Your ERP session ended while opening CDC. Sign in again to continue."
      );
    }
  }

  async fetchCompanies(): Promise<CompanyRole[]> {
    return this.enqueueGridOp(async () => {
      const primed = await erpFetchText(`${ERP_HOST}/TrainingPlacementSSO/TPStudent.jsp`);
      if (isAuthLandingUrl(primed.finalUrl)) {
        throw new ErpSessionError(
          "auth_landing",
          "Your ERP session ended. Sign in again to reload roles."
        );
      }
      let { text: payload, finalUrl: gridUrl } = await erpFetchText(
        `${ERP_HOST}/TrainingPlacementSSO/ERPMonitoring.htm?action=fetchData&jqqueryid=37`
      );
      if (isAuthLandingUrl(gridUrl)) {
        throw new ErpSessionError(
          "auth_landing",
          "Your ERP session ended while loading roles. Sign in again to continue."
        );
      }

      let rows: string[][];
      try {
        rows = parseJqgridXml(payload);
      } catch {
        await this.openPlacementSession();
        const primed = await erpFetchText(`${ERP_HOST}/TrainingPlacementSSO/TPStudent.jsp`);
        if (isAuthLandingUrl(primed.finalUrl)) {
          throw new ErpSessionError(
            "auth_landing",
            "Your ERP session ended. Sign in again to reload roles."
          );
        }
        const retry = await erpFetchText(
          `${ERP_HOST}/TrainingPlacementSSO/ERPMonitoring.htm?action=fetchData&jqqueryid=37`
        );
        if (isAuthLandingUrl(retry.finalUrl)) {
          throw new ErpSessionError(
            "auth_landing",
            "Your ERP session ended while loading roles. Sign in again to continue."
          );
        }
        rows = parseJqgridXml(retry.text);
      }

      const now = new Date();
      return rows.map((cells, idx) => {
        const parsed = parseCompanyRow(idx + 1, cells, now);
        const cachedJnf = this.jnfCache.get(parsed.key);
        if (parsed.applied && cachedJnf?.applied_cv) {
          parsed.applied_cv = cachedJnf.applied_cv;
        }
        return parsed;
      });
    });
  }

  async fetchNotices(rows = 100, placementOnly = true): Promise<PlacementNotice[]> {
    return this.enqueueGridOp(async () => {
      const clamped = Math.max(1, Math.min(150, rows));
      const primed = await erpFetchText(`${ERP_HOST}/TrainingPlacementSSO/Notice.jsp`);
      if (isAuthLandingUrl(primed.finalUrl)) {
        throw new ErpSessionError(
          "auth_landing",
          "Your ERP session ended. Sign in again to reload notices."
        );
      }
      const epochMs = Date.now();
      const { text: payload, finalUrl } = await erpFetchText(
        `${ERP_HOST}/TrainingPlacementSSO/ERPMonitoring.htm?action=fetchData&jqqueryid=54&_search=false&nd=${epochMs}&rows=${clamped}&page=1&sidx=&sord=asc&totalrows=${clamped}`
      );
      if (isAuthLandingUrl(finalUrl)) {
        throw new ErpSessionError(
          "auth_landing",
          "Your ERP session ended while loading notices. Sign in again to continue."
        );
      }
      const parsed = parseJqgridXml(payload).map((cells, idx) => parseNoticeRow(idx + 1, cells));
      return placementOnly ? parsed.filter((n) => n.type.toUpperCase() === "PLACEMENT") : parsed;
    });
  }

  async fetchCompanyProfile(
    com_id: string,
    yop = DEFAULT_YOP
  ): Promise<Record<string, string>> {
    const cleanComId = sanitizeErpNumericId(com_id, "company");
    const cleanYear = sanitizeErpYear(yop);
    const cacheKey = `${cleanYear}_${cleanComId}`;
    if (this.comViewCache.has(cacheKey)) {
      return this.comViewCache.get(cacheKey)!;
    }
    const params = new URLSearchParams({
      yop: cleanYear,
      com_id: cleanComId,
      user_type: "SU",
    });
    const { text, finalUrl } = await erpFetchText(
      `${ERP_HOST}/TrainingPlacementSSO/TPComView.jsp?${params.toString()}`
    );
    if (isAuthLandingUrl(finalUrl)) {
      throw new ErpSessionError(
        "auth_landing",
        "Your ERP session ended. Sign in again to view company details."
      );
    }
    const parsed = parseComViewHtml(text);
    this.comViewCache.set(cacheKey, parsed);
    return parsed;
  }

  async fetchJnf(
    com_id: string,
    jnf_id: string,
    yop = DEFAULT_YOP,
    forceRefresh = false,
    includeExtended = false
  ): Promise<JnfDetails> {
    const cleanComId = sanitizeErpNumericId(com_id, "company");
    const cleanJnfId = sanitizeErpNumericId(jnf_id, "JNF");
    const cleanYear = sanitizeErpYear(yop);
    const key = `${cleanComId}_${cleanJnfId}`;
    const existing = this.jnfCache.get(key);
    if (
      !forceRefresh &&
      existing &&
      (!includeExtended || existing.compensation_details !== undefined)
    ) {
      return existing;
    }

    const params = new URLSearchParams({
      jnf_id: cleanJnfId,
      com_id: cleanComId,
      yop: cleanYear,
      user_type: "SU",
      rollno: this.state.rollno,
    });
    const { text, finalUrl } = await erpFetchText(
      `${ERP_HOST}/TrainingPlacementSSO/TPJNFView.jsp?${params.toString()}`
    );
    if (isAuthLandingUrl(finalUrl)) {
      throw new ErpSessionError(
        "auth_landing",
        "Your ERP session ended. Sign in again to view this job description."
      );
    }
    const details = parseJnfHtml(text, cleanComId, cleanJnfId);

    if (includeExtended) {
      const moreDetRef = details.more_details_params;
      const moreYear = sanitizeErpYear(moreDetRef?.year || cleanYear);
      const moreRoll = /^[A-Za-z0-9]{5,20}$/.test(moreDetRef?.rollno || "")
        ? moreDetRef!.rollno
        : this.state.rollno;
      const moreComId = moreDetRef?.com_id
        ? sanitizeErpNumericId(moreDetRef.com_id, "company")
        : cleanComId;
      const moreJnfId = moreDetRef?.jnf_id
        ? sanitizeErpNumericId(moreDetRef.jnf_id, "JNF")
        : cleanJnfId;

      const moreParams = new URLSearchParams({
        mode: "jnfMoreDet",
        rollno: moreRoll,
        year: moreYear,
        com_id: moreComId,
        jnf_id: moreJnfId,
      });

      // Only invoke JnfMoreDet.jsp if TPJNFView exposed "Click Here for more details" (or if TPJNFView was non-forbidden)
      const isForbiddenJnf = /Sorry,\s*You\s+are\s+not\s+supposed\s+to\s+open\s+this/i.test(text);
      const [moreHtml, companyDetails] = await Promise.all([
        isForbiddenJnf && !moreDetRef
          ? Promise.resolve("")
          : erpFetchText(
              `${ERP_HOST}/TrainingPlacementSSO/JnfMoreDet.jsp?${moreParams.toString()}`
            )
              .then((r) => r.text)
              .catch(() => ""),
        this.fetchCompanyProfile(cleanComId, cleanYear).catch(() => ({})),
      ]);

      const moreParsed = parseJnfMoreDetHtml(moreHtml);
      details.compensation_details = moreParsed.compensation_details;
      details.eligibility_details = moreParsed.eligibility_details;
      details.selection_details = moreParsed.selection_details;
      details.company_details = companyDetails;

      for (const [k, v] of Object.entries(moreParsed.job_profile)) {
        if (!details.fields[k]) {
          details.fields[k] = v;
        }
      }
      if (
        moreParsed.job_description &&
        (!details.jd_text ||
          /as\s+mentioned\s+in/i.test(details.jd_text) ||
          moreParsed.job_description.length > details.jd_text.length)
      ) {
        details.jd_text = moreParsed.job_description.slice(0, 6000);
      }
    }

    this.jnfCache.set(key, details);
    return details;
  }

  async applyRole(
    com_id: string,
    jnf_id: string,
    cv: CvNumber,
    yop = DEFAULT_YOP
  ): Promise<{ verified: boolean; applied_cv: CvNumber | null }> {
    const params = new URLSearchParams({
      mode: `ApplyCV${cv}`,
      rollno: this.state.rollno,
      year: yop || DEFAULT_YOP,
      com_id,
      jnf_id,
    });
    const action = await erpFetchText(
      `${ERP_HOST}/TrainingPlacementSSO/TPJNFViewAction.jsp?${params.toString()}`
    );
    if (isAuthLandingUrl(action.finalUrl)) {
      throw new ErpSessionError(
        "auth_landing",
        "Your ERP session ended before the application was submitted. Sign in again and re-apply."
      );
    }
    const details = await this.fetchJnf(com_id, jnf_id, yop, true);
    const verified = details.is_applied;
    const applied_cv = details.applied_cv || (verified ? cv : null);
    return { verified, applied_cv };
  }

  async cancelRole(
    com_id: string,
    jnf_id: string,
    yop = DEFAULT_YOP
  ): Promise<{ cancelled: boolean }> {
    const params = new URLSearchParams({
      mode: "cancel",
      year: yop || DEFAULT_YOP,
      rollno: this.state.rollno,
      com_id,
      jnf_id,
    });
    const action = await erpFetchText(
      `${ERP_HOST}/TrainingPlacementSSO/TPStudenApply.jsp?${params.toString()}`
    );
    if (isAuthLandingUrl(action.finalUrl)) {
      throw new ErpSessionError(
        "auth_landing",
        "Your ERP session ended before the change was saved. Sign in again and retry."
      );
    }
    const details = await this.fetchJnf(com_id, jnf_id, yop, true);
    return { cancelled: !details.is_applied };
  }

  async fetchCvPdfBase64(cvNo: CvNumber): Promise<string> {
    if (this.cvPdfBase64Cache.has(cvNo)) {
      return this.cvPdfBase64Cache.get(cvNo)!;
    }
    const { base64, finalUrl } = await erpFetchBinary(
      `${ERP_HOST}/TrainingPlacementSSO/cvGenerate.jsp?resume_no=${cvNo}`
    );
    if (isAuthLandingUrl(finalUrl)) {
      throw new ErpSessionError(
        "auth_landing",
        "Your ERP session ended. Sign in again to download your CV."
      );
    }
    if (!atob(base64).startsWith("%PDF")) {
      throw new Error(`CV${cvNo} download was not a valid PDF (ERP session may have expired).`);
    }
    this.cvPdfBase64Cache.set(cvNo, base64);
    return base64;
  }

  async fetchAllThreeCvPdfsBase64(): Promise<{ cv1: string; cv2: string; cv3: string }> {
    const [cv1, cv2, cv3] = await Promise.all([
      this.fetchCvPdfBase64(1),
      this.fetchCvPdfBase64(2),
      this.fetchCvPdfBase64(3),
    ]);
    return { cv1, cv2, cv3 };
  }

  async fetchAttachment(req: ErpAttachmentRequest): Promise<ResolvedErpAttachment> {
    if (req.kind === "CV") {
      const cvNo = req.cv;
      if (cvNo !== 1 && cvNo !== 2 && cvNo !== 3) {
        throw new Error("Invalid CV number.");
      }
      const base64 = await this.fetchCvPdfBase64(cvNo);
      return inspectErpAttachmentBase64(base64, req.filenameStem || `CV${cvNo}`);
    }

    let params: URLSearchParams;
    let cacheKey: string;

    switch (req.kind) {
      case "NOTICE": {
        const cleanId = sanitizeErpNumericId(req.id, "notice");
        const cleanYear = sanitizeErpYear(req.year);
        params = new URLSearchParams({
          type: "NOTICE",
          year: cleanYear,
          id: cleanId,
        });
        cacheKey = `NOTICE_${cleanYear}_${cleanId}`;
        break;
      }
      case "JNF": {
        const cleanComId = sanitizeErpNumericId(req.com_id, "company");
        const cleanJnfId = sanitizeErpNumericId(req.jnf_id, "JNF");
        const cleanYear = sanitizeErpYear(req.year);
        params = new URLSearchParams({
          type: "JNF",
          year: cleanYear,
          jnf_id: cleanJnfId,
          com_id: cleanComId,
        });
        cacheKey = `JNF_${cleanYear}_${cleanComId}_${cleanJnfId}`;
        break;
      }
      case "COM": {
        const cleanComId = sanitizeErpNumericId(req.com_id, "company");
        const cleanYear = sanitizeErpYear(req.year);
        params = new URLSearchParams({
          type: "COM",
          year: cleanYear,
          com_id: cleanComId,
        });
        cacheKey = `COM_${cleanYear}_${cleanComId}`;
        break;
      }
      case "PPT": {
        const cleanComId = sanitizeErpNumericId(req.com_id, "company");
        const cleanYear = sanitizeErpYear(req.year);
        params = new URLSearchParams({
          type: "PPT",
          year: cleanYear,
          com_id: cleanComId,
        });
        cacheKey = `PPT_${cleanYear}_${cleanComId}`;
        break;
      }
      case "GUID": {
        params = new URLSearchParams({ type: "GUID" });
        cacheKey = "GUID_DEFAULT";
        break;
      }
    }

    let base64 = this.attachmentBase64Cache.get(cacheKey);
    if (!base64) {
      const fetched = await erpFetchBinary(
        `${ERP_HOST}/TrainingPlacementSSO/AdmFilePDF.htm?${params.toString()}`
      );
      // Validate before caching so error responses are never cached
      const verified = inspectErpAttachmentBase64(fetched.base64, req.filenameStem);
      this.rememberAttachmentBase64(cacheKey, fetched.base64);
      return verified;
    }

    return inspectErpAttachmentBase64(base64, req.filenameStem);
  }

  async openCvPreview(cvNo: CvNumber): Promise<void> {
    const resolved = await this.fetchAttachment({
      kind: "CV",
      cv: cvNo,
      title: `CV${cvNo} Preview`,
      filenameStem: `${this.state.rollno || "Student"}_CV${cvNo}`,
    });
    const url = URL.createObjectURL(resolved.blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async openNoticeAttachment(noticeId: string, year = DEFAULT_YOP): Promise<void> {
    const resolved = await this.fetchAttachment({
      kind: "NOTICE",
      id: noticeId,
      year,
      title: `Notice #${noticeId}`,
      filenameStem: `CDC_Notice_${noticeId}`,
    });
    const url = URL.createObjectURL(resolved.blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async keepalive(): Promise<void> {
    if (this.state.stage !== "authenticated") return;
    const randId = Math.floor(1e14 + Math.random() * 9e14);
    const { finalUrl } = await erpFetchText(
      `${ERP_HOST}/IIT_ERP3/holdSession.htm?rand_id=${randId}`
    );
    // A dropped session must never keep looking `authenticated` in the UI.
    if (isAuthLandingUrl(finalUrl)) {
      this.resetToLoggedOut();
      throw new ErpSessionError(
        "auth_landing",
        "Your ERP session expired. Sign in again to keep working."
      );
    }
  }

  async logout(): Promise<void> {
    try {
      await Promise.all([
        erpFetchText(`${ERP_HOST}/IIT_ERP3/logout.htm`).catch(() => undefined),
        erpFetchText(`${ERP_HOST}/SSOAdministration/logout.htm`).catch(() => undefined),
      ]);
    } catch {
      /* ignore */
    }
    await sendBridgeMessage("CLEAR_COOKIES").catch(() => undefined);
    this.resetToLoggedOut();
  }
}

export const erpClient = new ClientErpRunner();
