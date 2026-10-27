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
  parseCompanyRow,
  parseJnfHtml,
  parseJqgridXml,
  parseNoticeRow,
  stripHtmlInline,
} from "./erpParsers";

const ERP_HOST = "https://erp.iitkgp.ac.in";
const SOURCE_PAGE = "ERP_CDC_PAGE";
const SOURCE_EXT = "ERP_CDC_EXT";

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
          "ERP Companion Extension bridge did not respond. Load the unpacked extension from ./extension in chrome://extensions."
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

export async function isExtensionBridgeAvailable(): Promise<boolean> {
  if (customTransport) return true;
  if (
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-erp-cdc-bridge")
  ) {
    return true;
  }
  try {
    await sendBridgeMessage("PING");
    return true;
  } catch {
    return false;
  }
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

export function base64ToBlob(base64: string, _contentType = "application/pdf"): Blob {
  const binary = atob(base64);
  if (!binary.startsWith("%PDF")) {
    throw new Error("ERP did not return a valid PDF document (session may have expired).");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  // Always enforce application/pdf so an HTML error page from ERP can never execute as a same-origin document
  return new Blob([bytes], { type: "application/pdf" });
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
  private cvPdfBase64Cache = new Map<CvNumber, string>();

  getSessionState(): ErpSessionState {
    return { ...this.state };
  }

  /**
   * ERP keeps separate servlet sessions. An existing Chrome login lands on
   * home.htm instead of login.htm — so always logout + wipe cookies first.
   */
  private async ensureLoginLanding(): Promise<string> {
    const attempt = async (): Promise<string> => {
      await erpFetchText(`${ERP_HOST}/IIT_ERP3/logout.htm`).catch(() => undefined);
      await sendBridgeMessage("CLEAR_COOKIES").catch(() => undefined);
      const { finalUrl } = await erpFetchText(`${ERP_HOST}/IIT_ERP3/`);
      return finalUrl;
    };

    let finalUrl = await attempt();
    if (finalUrl.includes("login.htm")) return finalUrl;

    // Second pass: leftover ssoToken / JSESSIONID can still skip the login page.
    finalUrl = await attempt();
    if (finalUrl.includes("login.htm")) return finalUrl;

    throw new Error(
      `ERP did not redirect to SSOAdministration/login.htm (got ${finalUrl}). ` +
        "Open erp.iitkgp.ac.in in this Chrome profile, log out, reload the companion extension, then retry."
    );
  }

  async fetchAllSecurityQuestions(rollno: string): Promise<string[]> {
    const roll = rollno.trim();
    if (!/^[A-Za-z0-9]{5,20}$/.test(roll)) {
      throw new Error("Invalid roll number");
    }

    await this.ensureLoginLanding();

    const questions: string[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < MAX_SECURITY_QUESTION_FETCH_TRIES; i++) {
      if (questions.length >= REQUIRED_SECURITY_QUESTIONS) break;
      const { text } = await erpFetchText(
        `${ERP_HOST}/SSOAdministration/getSecurityQues.htm`,
        { user_id: roll },
        true
      );
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

    const { text: otpBody } = await erpFetchText(
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

    let payload: { msg?: string };
    try {
      payload = JSON.parse(otpBody);
    } catch {
      throw new Error("ERP getEmilOTP.htm did not return valid JSON");
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
      throw new Error("Please click 'Send OTP' first to initialize the login session");
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

    if (finalUrl.includes("login.htm")) {
      throw new Error("Login stayed on login.htm — the OTP was invalid or expired");
    }

    await this.openPlacementSession();
    this.state.stage = "authenticated";
    this.state.rollno = profile.rollno.trim();

    const [companies, notices] = await Promise.all([
      this.fetchCompanies(),
      this.fetchNotices(50, true),
    ]);

    return {
      rollno: this.state.rollno,
      companies,
      notices,
    };
  }

  async openPlacementSession(): Promise<void> {
    const { text: page } = await erpFetchText(`${ERP_HOST}/IIT_ERP3/showmenu.htm`, {
      module_id: "26",
      menu_id: "11",
      link: `${ERP_HOST}/TrainingPlacementSSO/TPStudent.jsp`,
      module_name: "CDC",
      parent_display_name: "Student",
      display_name: "Application of Placement/Internship",
    });

    const ssoToken = extractHiddenInput(page, "ssoToken");
    if (!ssoToken) {
      throw new Error("Menu launcher did not return an ssoToken for CDC Placement");
    }

    await erpFetchText(`${ERP_HOST}/TrainingPlacementSSO/TPStudent.jsp`, {
      ssoToken,
      module_id: "26",
      menu_id: "11",
    });
  }

  async fetchCompanies(): Promise<CompanyRole[]> {
    await erpFetchText(`${ERP_HOST}/TrainingPlacementSSO/TPStudent.jsp`);
    let { text: payload } = await erpFetchText(
      `${ERP_HOST}/TrainingPlacementSSO/ERPMonitoring.htm?action=fetchData&jqqueryid=37`
    );

    let rows: string[][];
    try {
      rows = parseJqgridXml(payload);
    } catch {
      await this.openPlacementSession();
      await erpFetchText(`${ERP_HOST}/TrainingPlacementSSO/TPStudent.jsp`);
      const retry = await erpFetchText(
        `${ERP_HOST}/TrainingPlacementSSO/ERPMonitoring.htm?action=fetchData&jqqueryid=37`
      );
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
  }

  async fetchNotices(rows = 50, placementOnly = true): Promise<PlacementNotice[]> {
    const clamped = Math.max(1, Math.min(100, rows));
    await erpFetchText(`${ERP_HOST}/TrainingPlacementSSO/Notice.jsp`);
    const epochMs = Date.now();
    const { text: payload } = await erpFetchText(
      `${ERP_HOST}/TrainingPlacementSSO/ERPMonitoring.htm?action=fetchData&jqqueryid=54&_search=false&nd=${epochMs}&rows=${clamped}&page=1&sidx=&sord=asc&totalrows=${clamped}`
    );
    const parsed = parseJqgridXml(payload).map((cells, idx) => parseNoticeRow(idx + 1, cells));
    return placementOnly ? parsed.filter((n) => n.type.toUpperCase() === "PLACEMENT") : parsed;
  }

  async fetchJnf(
    com_id: string,
    jnf_id: string,
    yop = DEFAULT_YOP,
    forceRefresh = false
  ): Promise<JnfDetails> {
    const key = `${com_id}_${jnf_id}`;
    if (!forceRefresh && this.jnfCache.has(key)) {
      return this.jnfCache.get(key)!;
    }

    const params = new URLSearchParams({
      jnf_id,
      com_id,
      yop: yop || DEFAULT_YOP,
      user_type: "SU",
      rollno: this.state.rollno,
    });
    const { text } = await erpFetchText(
      `${ERP_HOST}/TrainingPlacementSSO/TPJNFView.jsp?${params.toString()}`
    );
    const details = parseJnfHtml(text, com_id, jnf_id);
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
    await erpFetchText(
      `${ERP_HOST}/TrainingPlacementSSO/TPJNFViewAction.jsp?${params.toString()}`
    );
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
    await erpFetchText(
      `${ERP_HOST}/TrainingPlacementSSO/TPStudenApply.jsp?${params.toString()}`
    );
    const details = await this.fetchJnf(com_id, jnf_id, yop, true);
    return { cancelled: !details.is_applied };
  }

  async fetchCvPdfBase64(cvNo: CvNumber): Promise<string> {
    if (this.cvPdfBase64Cache.has(cvNo)) {
      return this.cvPdfBase64Cache.get(cvNo)!;
    }
    const { base64 } = await erpFetchBinary(
      `${ERP_HOST}/TrainingPlacementSSO/cvGenerate.jsp?resume_no=${cvNo}`
    );
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

  async openCvPreview(cvNo: CvNumber): Promise<void> {
    const base64 = await this.fetchCvPdfBase64(cvNo);
    const blob = base64ToBlob(base64, "application/pdf");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async openNoticeAttachment(noticeId: string, year = DEFAULT_YOP): Promise<void> {
    const params = new URLSearchParams({
      type: "NOTICE",
      year: year || DEFAULT_YOP,
      id: noticeId,
    });
    const { base64 } = await erpFetchBinary(
      `${ERP_HOST}/TrainingPlacementSSO/AdmFilePDF.htm?${params.toString()}`
    );
    const blob = base64ToBlob(base64, "application/pdf");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async keepalive(): Promise<void> {
    if (this.state.stage !== "authenticated") return;
    const randId = Math.floor(1e14 + Math.random() * 9e14);
    await erpFetchText(`${ERP_HOST}/IIT_ERP3/holdSession.htm?rand_id=${randId}`);
  }

  async logout(): Promise<void> {
    try {
      await erpFetchText(`${ERP_HOST}/IIT_ERP3/logout.htm`);
    } catch {
      /* ignore */
    }
    await sendBridgeMessage("CLEAR_COOKIES").catch(() => undefined);
    this.jnfCache.clear();
    this.cvPdfBase64Cache.clear();
    this.state = {
      stage: "uninitialized",
      rollno: "",
      requestedUrl: `${ERP_HOST}/IIT_ERP3/home.htm`,
      matchedQuestion: "",
      matchedAnswer: "",
    };
  }
}

export const erpClient = new ClientErpRunner();
