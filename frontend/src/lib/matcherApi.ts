import { CompanyRole, CvNumber, PlacementNotice } from "./erpParsers";

export interface CvDiffSummary {
  cv1: string;
  cv2: string;
  cv3: string;
}

export interface RoleMatchInput {
  com_id: string;
  jnf_id: string;
  yop: string;
  company: string;
  role: string;
  ctc?: string;
  deadline?: string;
  jd_text: string;
  is_open?: boolean;
}

export interface RoleMatchRecommendation {
  com_id: string;
  jnf_id: string;
  key: string;
  cv: CvNumber;
  confidence: number;
  reason: string;
  cached: boolean;
}

export interface MatchCvsResponse {
  cvset_hash: string;
  session_token?: string | null;
  cv_diffs?: CvDiffSummary | null;
  recommendations: RoleMatchRecommendation[];
}

export interface CvSetStatusResponse {
  cvset_hash: string;
  cv_cached: boolean;
  session_token?: string | null;
  cv_diffs: CvDiffSummary | null;
  recommendations: RoleMatchRecommendation[];
}

export interface SyncCdcSnapshotResponse {
  ok: boolean;
  cv_cached: boolean;
  session_token?: string | null;
  stored_roles: number;
  stored_notices: number;
  cv_diffs: CvDiffSummary | null;
  recommendations: RoleMatchRecommendation[];
}

export async function computeCvSetSha256(cvs: {
  cv1: string;
  cv2: string;
  cv3: string;
}): Promise<string> {
  const combined = `CV1:${cvs.cv1}|CV2:${cvs.cv2}|CV3:${cvs.cv3}`;
  const encoded = new TextEncoder().encode(combined);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || "";

async function backendGet<T>(path: string, sessionToken?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (sessionToken) {
    headers["X-CDC-Session-Token"] = sessionToken;
  }
  const resp = await fetch(`${BACKEND_BASE}${path}`, {
    method: "GET",
    headers,
  });
  const isJson = (resp.headers.get("content-type") || "").includes("application/json");
  const payload = isJson ? await resp.json() : await resp.text();
  if (!resp.ok) {
    const detail =
      isJson && payload && typeof payload.detail === "string"
        ? payload.detail
        : `Backend unavailable (HTTP ${resp.status})`;
    throw new Error(detail);
  }
  return payload as T;
}

async function backendPost<T>(
  path: string,
  body: unknown,
  sessionToken?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (sessionToken) {
    headers["X-CDC-Session-Token"] = sessionToken;
  }
  const resp = await fetch(`${BACKEND_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const isJson = (resp.headers.get("content-type") || "").includes("application/json");
  const payload = isJson ? await resp.json() : await resp.text();
  if (!resp.ok) {
    const detail =
      isJson && payload && typeof payload.detail === "string"
        ? payload.detail
        : `Backend unavailable (HTTP ${resp.status})`;
    throw new Error(detail);
  }
  return payload as T;
}

export async function fetchCvSetStatus(
  cvset_hash: string,
  sessionToken?: string
): Promise<CvSetStatusResponse> {
  return backendGet<CvSetStatusResponse>(
    `/api/v1/cvset-status/${encodeURIComponent(cvset_hash)}`,
    sessionToken
  );
}

export async function syncConsentedCdcSnapshot(params: {
  cvset_hash: string;
  session_token?: string;
  cv_pdfs?: { cv1: string; cv2: string; cv3: string };
  roles: CompanyRole[];
  jds: Record<string, string>;
  notices: PlacementNotice[];
  precompute_matches?: boolean;
}): Promise<SyncCdcSnapshotResponse> {
  return backendPost<SyncCdcSnapshotResponse>(
    "/api/v1/sync-cdc-snapshot",
    {
      cvset_hash: params.cvset_hash,
      cv_pdfs: params.cv_pdfs,
      precompute_matches: params.precompute_matches ?? true,
      roles: params.roles.map((r) => ({
        com_id: r.com_id,
        jnf_id: r.jnf_id,
        yop: r.yop,
        company: r.company,
        role: r.role,
        ctc: r.ctc,
        deadline: r.deadline,
        jd_text: params.jds[r.key] || "",
        is_open: r.is_open,
      })),
      notices: params.notices.map((n) => ({
        id: n.id,
        category: n.category,
        company: n.company,
        notice: n.notice,
        when: n.when,
      })),
    },
    params.session_token
  );
}

export async function requestServerCvMatches(params: {
  cvset_hash: string;
  session_token?: string;
  cv_pdfs?: { cv1: string; cv2: string; cv3: string };
  roles: RoleMatchInput[];
}): Promise<MatchCvsResponse> {
  return backendPost<MatchCvsResponse>(
    "/api/v1/match-cvs",
    {
      cvset_hash: params.cvset_hash,
      cv_pdfs: params.cv_pdfs,
      roles: params.roles,
    },
    params.session_token
  );
}
