import {
  GmailOtpAccount,
  clearGmailOtpAccount,
  loadGmailOtpAccount,
  saveGmailOtpAccount,
} from "./storage";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const SESSION_TOKEN_KEY = "erp_cdc_gmail_session_token_v1";
const CONSUMED_IDS_KEY = "erp_cdc_gmail_consumed_otp_ids_v1";

const CLIENT_ID_RE = /^[0-9]{6,}-[a-z0-9-]+\.apps\.googleusercontent\.com$/i;
const MESSAGE_ID_RE = /^[A-Za-z0-9]{1,64}$/;
const ACCESS_TOKEN_RE = /^ya29\.[A-Za-z0-9\-._~+/]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ERP_CONTEXT_RE = /iitkgp|kharagpur|\berp\b/i;
const OTP_AFTER_LABEL_RE =
  /(?:otp|one[\s-]*time(?:\s+password)?|verification\s+code)\D{0,64}(?<!\d)(\d{6})(?!\d)/i;
const OTP_BEFORE_LABEL_RE =
  /(?<!\d)(\d{6})(?!\d)\D{0,64}(?:otp|one[\s-]*time(?:\s+password)?|verification\s+code)/i;

const ERP_OTP_GMAIL_QUERY =
  'in:anywhere -in:trash newer_than:1d (otp OR "one-time password" OR "one time password" OR "verification code") (iitkgp OR kharagpur OR erp)';

const TOKEN_EXPIRY_BUFFER_MS = 90_000;
const CLOCK_SKEW_TOLERANCE_WITH_BASELINE_MS = 5 * 60_000;
const POPUP_TIMEOUT_MS = 120_000;
const MAX_PART_CHARS = 80_000;
const MAX_TEXT_CHARS = 20_000;
const MAX_CONSUMED_IDS = 25;
const ADAPTIVE_POLL_DELAYS_MS = [1200, 1500, 1500, 1800, 2000, 2500];

export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthError";
  }
}

export interface GmailSession {
  accessToken: string;
  expiresAt: number;
  email: string;
}

export interface OtpCandidateMessage {
  id?: string;
  internalDateMs: number;
  text: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
  scope?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (override?: { prompt?: string; hint?: string }) => void;
}

interface GmailHeader {
  name?: string;
  value?: string;
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string };
  parts?: GmailPart[];
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            hint?: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => GoogleTokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let gisPromise: Promise<void> | null = null;
const memoryConsumedIds = new Set<string>();

export function getGmailClientId(): string {
  const raw = String(import.meta.env.VITE_GMAIL_CLIENT_ID || "").trim();
  return CLIENT_ID_RE.test(raw) ? raw : "";
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

export function extractErpOtp(text: string): string | null {
  const plain = toPlainText(text);
  if (!plain || !ERP_CONTEXT_RE.test(plain)) return null;
  const match = plain.match(OTP_AFTER_LABEL_RE) || plain.match(OTP_BEFORE_LABEL_RE);
  return match?.[1] || null;
}

export function pickErpOtpMatch(
  candidates: OtpCandidateMessage[],
  notBeforeMs: number,
  excludedIds?: ReadonlySet<string>
): { id: string; otp: string } | null {
  const fresh = candidates
    .filter((item) => {
      if (!Number.isFinite(item.internalDateMs) || item.internalDateMs < notBeforeMs) {
        return false;
      }
      if (item.id && excludedIds?.has(item.id)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.internalDateMs - a.internalDateMs);

  for (const item of fresh) {
    const otp = extractErpOtp(item.text);
    if (otp) {
      return { id: item.id || "", otp };
    }
  }
  return null;
}

export function pickErpOtp(
  candidates: OtpCandidateMessage[],
  notBeforeMs: number,
  excludedIds?: ReadonlySet<string>
): string | null {
  return pickErpOtpMatch(candidates, notBeforeMs, excludedIds)?.otp || null;
}

export function headersContextFromPayload(payload: GmailPart | undefined): string {
  if (!payload || !Array.isArray(payload.headers)) return "";
  const lines: string[] = [];
  for (const h of payload.headers) {
    const name = String(h?.name || "").toLowerCase();
    if (name === "subject" || name === "from") {
      const val = String(h?.value || "").trim();
      if (val) lines.push(val.slice(0, 500));
    }
  }
  return lines.join("\n");
}

export function textFromGmailPayload(payload: GmailPart | undefined, snippet = ""): string {
  const chunks: string[] = [];
  const headerCtx = headersContextFromPayload(payload);
  if (headerCtx) chunks.push(headerCtx);
  if (snippet) chunks.push(snippet);
  walkParts(payload, chunks, 0);
  return chunks.join("\n").slice(0, MAX_TEXT_CHARS);
}

export function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-cdc-gis="1"]');
    const script = existing || document.createElement("script");
    const finish = () => {
      if (window.google?.accounts?.oauth2) resolve();
      else reject(new Error("Google sign-in did not load."));
    };
    script.addEventListener("load", finish, { once: true });
    script.addEventListener(
      "error",
      () => {
        gisPromise = null;
        script.remove();
        reject(new Error("Could not load Google sign-in."));
      },
      { once: true }
    );
    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      script.dataset.cdcGis = "1";
      document.head.appendChild(script);
    } else if (window.google?.accounts?.oauth2) {
      finish();
    }
  });
  return gisPromise;
}

export function readGmailSessionToken(): GmailSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GmailSession>;
    const accessToken = String(parsed.accessToken || "");
    const expiresAt = Number(parsed.expiresAt || 0);
    const email = sanitizeEmail(String(parsed.email || ""));
    if (!ACCESS_TOKEN_RE.test(accessToken) || !Number.isFinite(expiresAt)) return null;
    if (expiresAt < Date.now() + TOKEN_EXPIRY_BUFFER_MS) return null;
    return { accessToken, expiresAt, email };
  } catch {
    return null;
  }
}

export function clearGmailSessionToken(): void {
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function readConsumedOtpMessageIds(): Set<string> {
  const result = new Set<string>(memoryConsumedIds);
  try {
    const raw = sessionStorage.getItem(CONSUMED_IDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item === "string" && MESSAGE_ID_RE.test(item)) {
            result.add(item);
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return result;
}

export function markOtpMessageConsumed(messageId: string): void {
  if (!MESSAGE_ID_RE.test(messageId)) return;
  const all = readConsumedOtpMessageIds();
  all.delete(messageId);
  all.add(messageId);
  const trimmed = Array.from(all).slice(-MAX_CONSUMED_IDS);
  memoryConsumedIds.clear();
  for (const id of trimmed) memoryConsumedIds.add(id);
  try {
    sessionStorage.setItem(CONSUMED_IDS_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export function connectGmailAccount(): Promise<GmailOtpAccount> {
  const previous = readGmailSessionToken();
  return requestGmailToken({ interactive: true, mode: "select_account" }).then(async (next) => {
    try {
      const email = await fetchGmailAddress(next.accessToken);
      writeGmailSessionToken({ ...next, email });
      if (previous && previous.accessToken !== next.accessToken) {
        void revokeGmailToken(previous.accessToken);
      }
      return saveGmailOtpAccount({ enabled: true, email });
    } catch (err) {
      void revokeGmailToken(next.accessToken);
      if (previous) writeGmailSessionToken(previous);
      else clearGmailSessionToken();
      throw err;
    }
  });
}

export async function disconnectGmailAccount(): Promise<GmailOtpAccount> {
  const previous = readGmailSessionToken();
  clearGmailSessionToken();
  const cleared = clearGmailOtpAccount();
  if (previous) {
    try {
      await revokeGmailToken(previous.accessToken);
    } catch {
      /* Local sign-in is already cleared. The user can also remove access in their Google Account. */
    }
  }
  return cleared;
}

export function requestGmailToken(opts: {
  interactive: boolean;
  mode?: "silent" | "consent" | "select_account";
}): Promise<GmailSession> {
  const savedEmail = loadGmailOtpAccount().email;
  const mode =
    opts.mode ?? (savedEmail ? "silent" : opts.interactive ? "consent" : "silent");

  if (mode !== "select_account") {
    const cached = readGmailSessionToken();
    if (cached && (!savedEmail || !cached.email || cached.email === savedEmail)) {
      return Promise.resolve(cached);
    }
  }

  const clientId = getGmailClientId();
  if (!clientId) {
    return Promise.reject(new Error("Google OAuth client id is not configured."));
  }

  const start = async (): Promise<GmailSession> => {
    const minted = await requestTokenFromGoogle(clientId, mode, savedEmail);
    if (mode === "select_account") {
      return minted;
    }
    const verifiedEmail = await fetchGmailAddress(minted.accessToken);
    if (savedEmail && verifiedEmail !== savedEmail) {
      clearGmailSessionToken();
      void revokeGmailToken(minted.accessToken);
      throw new GmailAuthError(
        `Google signed into ${verifiedEmail} instead of ${savedEmail}. Click Change account in Edit login or pick ${savedEmail}.`
      );
    }
    const verifiedSession: GmailSession = { ...minted, email: verifiedEmail };
    writeGmailSessionToken(verifiedSession);
    return verifiedSession;
  };

  if (window.google?.accounts?.oauth2) return start();
  return loadGoogleIdentityScript().then(start);
}

/**
 * Captures message IDs currently matching the ERP OTP query BEFORE `sendOtp` is called,
 * so stale OTP emails already sitting in the inbox can never be mistaken for the newly requested OTP.
 */
export async function snapshotRecentOtpMessageIds(
  accessToken: string,
  signal?: AbortSignal
): Promise<Set<string>> {
  if (!ACCESS_TOKEN_RE.test(accessToken)) return new Set();
  const listed = await gmailGet(
    `/messages?maxResults=10&includeSpamTrash=true&q=${encodeURIComponent(ERP_OTP_GMAIL_QUERY)}`,
    accessToken,
    signal
  );
  return new Set(parseMessageIds(listed));
}

export async function pollForErpOtp(opts: {
  accessToken: string;
  notBeforeMs: number;
  excludeMessageIds?: ReadonlySet<string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<string> {
  if (!ACCESS_TOKEN_RE.test(opts.accessToken)) {
    throw new GmailAuthError("Saved Gmail sign-in is invalid. Connect Gmail again in Edit login.");
  }
  const timeoutMs = opts.timeoutMs ?? 55_000;
  const deadline = Date.now() + timeoutMs;
  const hasBaseline = Boolean(opts.excludeMessageIds);
  const effectiveNotBeforeMs = hasBaseline
    ? opts.notBeforeMs - CLOCK_SKEW_TOLERANCE_WITH_BASELINE_MS
    : opts.notBeforeMs;

  let attempt = 0;
  let lastError = "No new ERP OTP email arrived in the connected Gmail account yet. You can type it manually.";

  while (Date.now() <= deadline) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const excluded = readConsumedOtpMessageIds();
      if (opts.excludeMessageIds) {
        for (const id of opts.excludeMessageIds) excluded.add(id);
      }
      const match = await findRecentErpOtp(
        opts.accessToken,
        effectiveNotBeforeMs,
        excluded,
        opts.signal
      );
      if (match) {
        if (match.id) markOtpMessageConsumed(match.id);
        return match.otp;
      }
    } catch (err) {
      if (isAbortError(err) || err instanceof GmailAuthError) throw err;
      lastError = err instanceof Error ? err.message : lastError;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const stepDelay =
      opts.intervalMs ??
      ADAPTIVE_POLL_DELAYS_MS[Math.min(attempt, ADAPTIVE_POLL_DELAYS_MS.length - 1)] ??
      3_000;
    attempt += 1;
    await delay(Math.min(stepDelay, remaining), opts.signal);
  }
  throw new Error(lastError);
}

async function findRecentErpOtp(
  accessToken: string,
  notBeforeMs: number,
  excludedIds: ReadonlySet<string>,
  signal?: AbortSignal
): Promise<{ id: string; otp: string } | null> {
  const listed = await gmailGet(
    `/messages?maxResults=6&includeSpamTrash=true&q=${encodeURIComponent(ERP_OTP_GMAIL_QUERY)}`,
    accessToken,
    signal
  );
  const ids = parseMessageIds(listed).filter((id) => !excludedIds.has(id));
  if (ids.length === 0) return null;

  const candidates: OtpCandidateMessage[] = [];

  for (const id of ids) {
    const metadata = await gmailGet(
      `/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
      accessToken,
      signal
    );
    const internalDateMs = readInternalDate(metadata);
    if (internalDateMs < notBeforeMs) continue;

    const snippet = readSnippet(metadata);
    const metaPayload =
      metadata && typeof metadata === "object"
        ? (metadata as { payload?: GmailPart }).payload
        : undefined;
    const metaText = textFromGmailPayload(metaPayload, snippet);
    if (extractErpOtp(metaText)) {
      candidates.push({ id, internalDateMs, text: metaText });
      continue;
    }

    const full = await gmailGet(`/messages/${id}?format=full`, accessToken, signal);
    const fullPayload =
      full && typeof full === "object" ? (full as { payload?: GmailPart }).payload : undefined;
    candidates.push({
      id,
      internalDateMs,
      text: textFromGmailPayload(fullPayload, snippet),
    });
  }

  return pickErpOtpMatch(candidates, notBeforeMs, excludedIds);
}

function requestTokenFromGoogle(
  clientId: string,
  mode: "silent" | "consent" | "select_account",
  hint: string
): Promise<GmailSession> {
  const oauth = window.google?.accounts?.oauth2;
  if (!oauth) return Promise.reject(new Error("Google sign-in did not load."));

  const prompt =
    mode === "select_account" ? "select_account consent" : mode === "consent" ? "consent" : "";
  const account = loadGmailOtpAccount();

  return new Promise<GmailSession>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      fn();
    };
    const timer = window.setTimeout(() => {
      finish(() => reject(new Error("Google sign-in timed out. Click Connect Gmail again.")));
    }, POPUP_TIMEOUT_MS);

    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      hint: hint || undefined,
      callback: (response) => {
        finish(() => {
          if (!response.access_token) {
            const code = response.error || "";
            if (
              code === "interaction_required" ||
              code === "consent_required" ||
              code === "login_required"
            ) {
              reject(
                new GmailAuthError(
                  "Gmail needs approval again. Open Edit login and click Connect Gmail."
                )
              );
              return;
            }
            reject(new Error(response.error_description || "Google did not grant Gmail access."));
            return;
          }
          if (response.scope && !response.scope.includes("gmail.readonly")) {
            void revokeGmailToken(response.access_token);
            reject(new Error("Gmail read access was not granted."));
            return;
          }
          try {
            const session = sessionFromTokenResponse(response, account.email);
            writeGmailSessionToken(session);
            resolve(session);
          } catch (err) {
            reject(err instanceof Error ? err : new Error("Google returned an unusable sign-in."));
          }
        });
      },
      error_callback: (error) => {
        finish(() => reject(new Error(googlePopupMessage(error?.type || ""))));
      },
    });
    client.requestAccessToken({
      prompt,
      hint: hint || undefined,
    });
  });
}

function sessionFromTokenResponse(response: GoogleTokenResponse, email: string): GmailSession {
  const accessToken = String(response.access_token || "");
  if (!ACCESS_TOKEN_RE.test(accessToken)) {
    throw new Error("Google returned an unexpected access token.");
  }
  const seconds = Math.min(Math.max(Number(response.expires_in) || 2700, 60), 3600);
  return {
    accessToken,
    expiresAt: Date.now() + seconds * 1000,
    email: sanitizeEmail(email),
  };
}

async function fetchGmailAddress(accessToken: string): Promise<string> {
  const body = await gmailGet("/profile", accessToken);
  const email =
    body && typeof body === "object"
      ? sanitizeEmail(String((body as { emailAddress?: unknown }).emailAddress || ""))
      : "";
  if (!email) throw new Error("Gmail did not return the account address.");
  return email;
}

async function gmailGet(
  pathAndQuery: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<unknown> {
  if (!pathAndQuery.startsWith("/") || pathAndQuery.includes("://")) {
    throw new Error("Invalid Gmail request.");
  }
  const response = await fetch(`${GMAIL_API}${pathAndQuery}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal,
    credentials: "omit",
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    clearGmailSessionToken();
    throw new GmailAuthError("Gmail rejected the saved sign-in. Connect Gmail again in Edit login.");
  }
  if (!response.ok) {
    throw new Error(`Gmail lookup failed (${response.status}).`);
  }
  return response.json() as Promise<unknown>;
}

async function revokeGmailToken(token: string): Promise<void> {
  if (!ACCESS_TOKEN_RE.test(token)) return;
  const revoke = window.google?.accounts?.oauth2?.revoke;
  if (revoke) {
    await new Promise<void>((resolve) => {
      try {
        revoke(token, () => resolve());
      } catch {
        resolve();
      }
    });
  }
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    credentials: "omit",
    cache: "no-store",
  }).catch(() => undefined);
}

function writeGmailSessionToken(session: GmailSession): void {
  if (!ACCESS_TOKEN_RE.test(session.accessToken)) return;
  try {
    sessionStorage.setItem(
      SESSION_TOKEN_KEY,
      JSON.stringify({
        accessToken: session.accessToken,
        expiresAt: session.expiresAt,
        email: sanitizeEmail(session.email),
      })
    );
  } catch {
    /* Session storage can be unavailable. The in-memory caller still holds this token. */
  }
}

function parseMessageIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return [];
  const ids: string[] = [];
  for (const item of messages) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id === "string" && MESSAGE_ID_RE.test(id)) ids.push(id);
  }
  return ids;
}

function readInternalDate(body: unknown): number {
  if (!body || typeof body !== "object") return 0;
  const raw = (body as { internalDate?: unknown }).internalDate;
  const ms = typeof raw === "string" || typeof raw === "number" ? Number(raw) : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function readSnippet(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const snippet = (body as { snippet?: unknown }).snippet;
  return typeof snippet === "string" ? snippet.slice(0, 1_000) : "";
}

function walkParts(part: GmailPart | undefined, chunks: string[], depth: number): void {
  if (!part || depth > 6 || chunks.join("").length >= MAX_TEXT_CHARS) return;
  if (part.filename) return;
  const data = part.body?.data || "";
  const mime = String(part.mimeType || "").toLowerCase();
  const isText = mime.startsWith("text/plain") || mime.startsWith("text/html") || mime === "";
  if (data && isText && data.length <= MAX_PART_CHARS) {
    const decoded = decodeBase64Url(data);
    if (decoded) chunks.push(decoded);
  }
  for (const child of part.parts || []) walkParts(child, chunks, depth + 1);
}

function decodeBase64Url(data: string): string {
  try {
    const pad = data.length % 4 === 0 ? "" : "=".repeat(4 - (data.length % 4));
    const b64 = data.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

function toPlainText(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_match, digits: string) => {
      const code = Number(digits);
      return code > 31 && code < 127 ? String.fromCharCode(code) : " ";
    })
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : "";
}

function googlePopupMessage(type: string): string {
  if (type === "popup_closed") return "Google sign-in was closed before Gmail access was granted.";
  if (type === "popup_failed_to_open")
    return "The Google window was blocked by the browser. Allow popups for this site and click again.";
  if (type === "access_denied") return "Gmail access was denied.";
  return "Google sign-in did not finish. Click again to retry.";
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
