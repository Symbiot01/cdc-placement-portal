import { CvNumber, LoginProfile, SecuritySlot, normalizeQuestion } from "./erpParsers";
import type { CvDiffSummary, RoleMatchRecommendation } from "./matcherApi";

export const LOGIN_PROFILE_STORAGE_KEY = "erp_cdc_login_profile_v2";
export const LOGIN_SECRETS_SESSION_KEY = "erp_cdc_login_secrets_session_v1";
export const REMEMBER_SECRETS_STORAGE_KEY = "erp_cdc_remember_secrets_v1";
export const LEGACY_LOGIN_STORAGE_KEY = "erp_cdc_login_fields_v1";
export const READ_NOTICES_STORAGE_KEY = "erp_cdc_read_notice_ids_v1";
export const APPLIED_CV_STORAGE_KEY = "erp_cdc_applied_cv_map_v1";
export const DATA_CONSENT_STORAGE_KEY = "erp_cdc_server_data_consent_v1";
export const AI_CACHE_STORAGE_KEY = "erp_cdc_ai_cache_v1";
export const AI_CACHE_SESSION_KEY = "erp_cdc_ai_cache_session_v1";

export interface LocalAiCacheState {
  cvset_hash: string;
  server_cv_cached: boolean;
  session_token?: string;
  cv_diffs: CvDiffSummary | null;
  recommendations: Record<string, RoleMatchRecommendation>;
}

export function emptySlot(): SecuritySlot {
  return { question: "", answer: "", use: true };
}

export function padSlots(slots?: Partial<SecuritySlot>[]): [SecuritySlot, SecuritySlot, SecuritySlot] {
  const cleaned: SecuritySlot[] = (slots || [])
    .map((s) => ({
      question: normalizeQuestion(s?.question || ""),
      answer: String(s?.answer || "").trim(),
      use: s?.use === false ? false : true,
    }))
    .filter((s) => s.question || s.answer);

  while (cleaned.length < 3) {
    cleaned.push(emptySlot());
  }
  return [cleaned[0], cleaned[1], cleaned[2]];
}

export function loadRememberSecretsPreference(): boolean {
  try {
    return localStorage.getItem(REMEMBER_SECRETS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function loadLoginProfile(): LoginProfile {
  try {
    localStorage.removeItem(LEGACY_LOGIN_STORAGE_KEY);
  } catch {
    /* ignore */
  }

  let sessionSecrets: { password?: string; answers?: Record<string, string> } = {};
  try {
    const rawSession = sessionStorage.getItem(LOGIN_SECRETS_SESSION_KEY);
    if (rawSession) {
      const parsed = JSON.parse(rawSession);
      if (parsed && typeof parsed === "object") {
        sessionSecrets = parsed;
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const raw = localStorage.getItem(LOGIN_PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const baseSlots = padSlots(parsed.slots);
        const answerMap = sessionSecrets.answers || {};
        const mergedSlots = padSlots(
          baseSlots.map((s) => ({
            question: s.question,
            use: s.use,
            answer:
              (s.question && answerMap[s.question.toLowerCase()]) ||
              s.answer ||
              "",
          }))
        );
        const mergedPassword = String(sessionSecrets.password || parsed.password || "");

        // If secrets were previously in localStorage without remember opt-in, migrate them into sessionStorage
        if (!loadRememberSecretsPreference() && (parsed.password || baseSlots.some((s) => s.answer))) {
          saveLoginProfile(
            {
              rollno: String(parsed.rollno || "").trim(),
              password: mergedPassword,
              slots: mergedSlots,
            },
            false
          );
        }

        return {
          rollno: String(parsed.rollno || "").trim(),
          password: mergedPassword,
          slots: mergedSlots,
        };
      }
    }
  } catch {
    /* ignore */
  }

  return {
    rollno: "",
    password: "",
    slots: [emptySlot(), emptySlot(), emptySlot()],
  };
}

export function saveLoginProfile(
  profile: LoginProfile,
  rememberSecrets: boolean = loadRememberSecretsPreference()
): LoginProfile {
  const normalized: LoginProfile = {
    rollno: profile.rollno.trim(),
    password: profile.password,
    slots: padSlots(profile.slots),
  };

  try {
    localStorage.setItem(REMEMBER_SECRETS_STORAGE_KEY, rememberSecrets ? "1" : "0");
    const answersByQ: Record<string, string> = {};
    for (const s of normalized.slots) {
      if (s.question) {
        answersByQ[s.question.toLowerCase()] = s.answer;
      }
    }
    sessionStorage.setItem(
      LOGIN_SECRETS_SESSION_KEY,
      JSON.stringify({
        password: normalized.password,
        answers: answersByQ,
      })
    );

    // By default, only store non-sensitive rollno + question texts in persistent localStorage
    const persistentPayload: LoginProfile = rememberSecrets
      ? normalized
      : {
          rollno: normalized.rollno,
          password: "",
          slots: normalized.slots.map((s) => ({
            question: s.question,
            answer: "",
            use: s.use,
          })) as [SecuritySlot, SecuritySlot, SecuritySlot],
        };
    localStorage.setItem(LOGIN_PROFILE_STORAGE_KEY, JSON.stringify(persistentPayload));
  } catch {
    /* ignore storage quota errors */
  }

  return normalized;
}

export function clearSavedLoginSecrets(): void {
  try {
    sessionStorage.removeItem(LOGIN_SECRETS_SESSION_KEY);
    localStorage.removeItem(LOGIN_PROFILE_STORAGE_KEY);
    localStorage.removeItem(REMEMBER_SECRETS_STORAGE_KEY);
    localStorage.removeItem(LEGACY_LOGIN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasUsableLoginProfile(profile?: LoginProfile): boolean {
  const p = profile || loadLoginProfile();
  return Boolean(
    p.rollno &&
      p.password &&
      p.slots.some((s) => s.use !== false && s.question.trim() !== "" && s.answer.trim() !== "")
  );
}

export function loadReadNoticeIds(): Set<string> {
  try {
    const arr = JSON.parse(localStorage.getItem(READ_NOTICES_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveReadNoticeIds(ids: Set<string>): void {
  localStorage.setItem(READ_NOTICES_STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

export function loadAppliedCvMap(): Record<string, CvNumber> {
  try {
    const parsed = JSON.parse(localStorage.getItem(APPLIED_CV_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAppliedCvMap(map: Record<string, CvNumber>): void {
  localStorage.setItem(APPLIED_CV_STORAGE_KEY, JSON.stringify(map));
}

export function loadServerDataConsent(): boolean | null {
  const val = localStorage.getItem(DATA_CONSENT_STORAGE_KEY);
  if (val === "granted") return true;
  if (val === "denied") return false;
  return null;
}

export function saveServerDataConsent(granted: boolean): void {
  localStorage.setItem(DATA_CONSENT_STORAGE_KEY, granted ? "granted" : "denied");
}

function parseAiCachePayload(raw: string | null): LocalAiCacheState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const rawRecs =
      parsed.recommendations && typeof parsed.recommendations === "object"
        ? (parsed.recommendations as Record<string, RoleMatchRecommendation>)
        : {};
    const cleanRecs: Record<string, RoleMatchRecommendation> = {};
    for (const [k, rec] of Object.entries(rawRecs)) {
      if (rec && (rec.cv === 1 || rec.cv === 2 || rec.cv === 3)) {
        cleanRecs[k] = {
          com_id: String(rec.com_id || k.split("_")[0] || ""),
          jnf_id: String(rec.jnf_id || k.split("_")[1] || ""),
          key: String(rec.key || k),
          cv: rec.cv,
          confidence: typeof rec.confidence === "number" ? rec.confidence : 0.85,
          reason: String(rec.reason || ""),
          cached: Boolean(rec.cached ?? true),
        };
      }
    }
    return {
      cvset_hash: String(parsed.cvset_hash || ""),
      server_cv_cached: Boolean(parsed.server_cv_cached),
      session_token: parsed.session_token ? String(parsed.session_token) : undefined,
      cv_diffs:
        parsed.cv_diffs &&
        typeof parsed.cv_diffs === "object" &&
        parsed.cv_diffs.cv1 &&
        parsed.cv_diffs.cv2 &&
        parsed.cv_diffs.cv3
          ? {
              cv1: String(parsed.cv_diffs.cv1),
              cv2: String(parsed.cv_diffs.cv2),
              cv3: String(parsed.cv_diffs.cv3),
            }
          : null,
      recommendations: cleanRecs,
    };
  } catch {
    return null;
  }
}

export function loadLocalAiCache(): LocalAiCacheState {
  let sessionState: LocalAiCacheState | null = null;
  let localState: LocalAiCacheState | null = null;
  try {
    sessionState = parseAiCachePayload(sessionStorage.getItem(AI_CACHE_SESSION_KEY));
  } catch {
    /* ignore */
  }
  try {
    localState = parseAiCachePayload(localStorage.getItem(AI_CACHE_STORAGE_KEY));
  } catch {
    /* ignore */
  }

  if (sessionState && localState && sessionState.cvset_hash === localState.cvset_hash) {
    const merged: LocalAiCacheState = {
      cvset_hash: sessionState.cvset_hash || localState.cvset_hash,
      server_cv_cached: sessionState.server_cv_cached || localState.server_cv_cached,
      session_token: sessionState.session_token || localState.session_token,
      cv_diffs: sessionState.cv_diffs || localState.cv_diffs,
      recommendations: {
        ...localState.recommendations,
        ...sessionState.recommendations,
      },
    };
    return merged;
  }

  if (sessionState && sessionState.cvset_hash) {
    return sessionState;
  }
  if (localState && localState.cvset_hash) {
    try {
      sessionStorage.setItem(AI_CACHE_SESSION_KEY, JSON.stringify(localState));
    } catch {
      /* ignore */
    }
    return localState;
  }

  return {
    cvset_hash: "",
    server_cv_cached: false,
    cv_diffs: null,
    recommendations: {},
  };
}

export function saveLocalAiCache(state: LocalAiCacheState): void {
  const serialized = JSON.stringify(state);
  try {
    sessionStorage.setItem(AI_CACHE_SESSION_KEY, serialized);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(AI_CACHE_STORAGE_KEY, serialized);
  } catch {
    /* ignore */
  }
}
