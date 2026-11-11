import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ErpSessionError,
  erpClient,
  setCustomErpBridgeTransport,
} from "../lib/erpBridge";
import { LoginProfile } from "../lib/erpParsers";

const ERP = "https://erp.iitkgp.ac.in";
const LOGIN_URL = `${ERP}/SSOAdministration/login.htm?requestedUrl=${ERP}/IIT_ERP3/`;

function profile(): LoginProfile {
  return {
    rollno: "22CS10001",
    password: "secret",
    slots: [
      { question: "First school?", answer: "kgp", use: true },
      { question: "Favourite city?", answer: "kharagpur", use: true },
      { question: "Pet name?", answer: "tommy", use: true },
    ],
  };
}

const WORKSPACE_HTML =
  '<html><script>function TPStudentResume2(r,c){}</script><div>rollno=22CS10001</div></html>';

type Handler = (url: string, form?: Record<string, string>) => Partial<{
  text: string;
  finalUrl: string;
  contentType: string;
  status: number;
}>;

/** Installs a transport that routes by URL, counting calls per URL. */
function installTransport(handler: Handler) {
  const calls: { url: string; form?: Record<string, string> }[] = [];
  setCustomErpBridgeTransport(async (_action, payload) => {
    const url = payload?.url || "";
    calls.push({ url, form: payload?.form });
    const res = handler(url, payload?.form);
    return {
      ok: true,
      status: res.status ?? 200,
      finalUrl: res.finalUrl ?? url,
      contentType: res.contentType ?? "text/html",
      text: res.text ?? "",
    };
  });
  const countOf = (fragment: string) => calls.filter((c) => c.url.includes(fragment)).length;
  /** Exact-URL counter (needed because /IIT_ERP3/logout.htm also contains /IIT_ERP3/). */
  const countExact = (url: string) => calls.filter((c) => c.url === url).length;
  return { calls, countOf, countExact };
}

afterEach(() => {
  setCustomErpBridgeTransport(null);
});

beforeEach(async () => {
  await resetClient();
});

/**
 * The bridge is a module-level singleton, so every test must both install a
 * transport *and* leave the client logged out. Without this, any test that
 * forgot to stub would fall through to the real 35s window transport.
 */
async function resetClient() {
  setCustomErpBridgeTransport(async (action) => {
    if (action === "CLEAR_COOKIES") return { ok: true };
    return { ok: true, status: 200, finalUrl: "", contentType: "text/html", text: "" };
  });
  await erpClient.resetSession();
}

describe("ensureLoginLanding escalation", () => {
  it("retries until ERP finally serves its login page instead of home.htm", async () => {
    // First two clean-up passes still land on home.htm (leftover ssoToken),
    // the third finally yields login.htm. This is the exact stale-session
    // state that used to make an OTP never verify.
    let landing = 0;
    const { countOf, countExact } = installTransport((url) => {
      if (url.endsWith("/IIT_ERP3/logout.htm")) return { text: "bye" };
      if (url === `${ERP}/IIT_ERP3/`) {
        landing += 1;
        return {
          text: landing <= 2 ? "<html>home</html>" : "<html>login</html>",
          finalUrl: landing <= 2 ? `${ERP}/IIT_ERP3/home.htm` : LOGIN_URL,
        };
      }
      if (url.includes("getSecurityQues.htm")) return { text: "First school?" };
      if (url.includes("getEmilOTP.htm")) {
        return { text: JSON.stringify({ msg: "OTP sent to your email." }) };
      }
      return { text: "" };
    });

    const res = await erpClient.sendOtp(profile());
    expect(res.rollno).toBe("22CS10001");
    // 3 landing attempts, and the OTP was only requested after login.htm.
    expect(countExact(`${ERP}/IIT_ERP3/`)).toBe(3);
    expect(countOf("getEmilOTP.htm")).toBe(1);
  });

  it("throws an actionable session_conflict when ERP refuses to log out", async () => {
    installTransport((url) => {
      if (url === `${ERP}/IIT_ERP3/`) {
        return { text: "<html>home</html>", finalUrl: `${ERP}/IIT_ERP3/home.htm` };
      }
      return { text: "" };
    });

    await expect(erpClient.sendOtp(profile())).rejects.toMatchObject({
      name: "ErpSessionError",
      code: "session_conflict",
    });
  });
});

describe("sendOtp self-healing", () => {
  it("purges the session and retries once when ERP drops the login page", async () => {
    let otpAttempts = 0;
    const { countOf } = installTransport((url) => {
      if (url === `${ERP}/IIT_ERP3/`) {
        return { text: "<html>login</html>", finalUrl: LOGIN_URL };
      }
      if (url.includes("getSecurityQues.htm")) return { text: "First school?" };
      if (url.includes("getEmilOTP.htm")) {
        otpAttempts += 1;
        // First attempt: ERP bounces us to the login shell (session died).
        if (otpAttempts === 1) {
          return { text: "", finalUrl: LOGIN_URL };
        }
        return { text: JSON.stringify({ msg: "OTP sent to your email." }) };
      }
      return { text: "" };
    });

    const res = await erpClient.sendOtp(profile());
    expect(res.message).toContain("OTP sent");
    expect(otpAttempts).toBe(2);
    // Recovery must have cleared cookies before retrying.
    expect(countOf("getEmilOTP.htm")).toBe(2);
  });

  it("surfaces a real credential error without silently retrying forever", async () => {
    let otpAttempts = 0;
    installTransport((url) => {
      if (url === `${ERP}/IIT_ERP3/`) {
        return { text: "<html>login</html>", finalUrl: LOGIN_URL };
      }
      if (url.includes("getSecurityQues.htm")) return { text: "First school?" };
      if (url.includes("getEmilOTP.htm")) {
        otpAttempts += 1;
        return { text: JSON.stringify({ msg: "Unable to send OTP: invalid password" }) };
      }
      return { text: "" };
    });

    await expect(erpClient.sendOtp(profile())).rejects.toThrow(/invalid password/i);
    expect(otpAttempts).toBe(1);
  });

  it("does not retry when the security question simply has no saved answer", async () => {
    let otpAttempts = 0;
    installTransport((url) => {
      if (url === `${ERP}/IIT_ERP3/`) {
        return { text: "<html>login</html>", finalUrl: LOGIN_URL };
      }
      if (url.includes("getSecurityQues.htm")) return { text: "An unknown question?" };
      if (url.includes("getEmilOTP.htm")) {
        otpAttempts += 1;
        return { text: "{}" };
      }
      return { text: "" };
    });

    await expect(erpClient.sendOtp(profile())).rejects.toThrow(/marked as correct/i);
    expect(otpAttempts).toBe(0);
  });
});

describe("verifyOtpAndOpenCdc session handling", () => {
  async function primeOtpSent() {
    installTransport((url) => {
      if (url === `${ERP}/IIT_ERP3/`) {
        return { text: "<html>login</html>", finalUrl: LOGIN_URL };
      }
      if (url.includes("getSecurityQues.htm")) return { text: "First school?" };
      if (url.includes("getEmilOTP.htm")) {
        return { text: JSON.stringify({ msg: "OTP sent." }) };
      }
      return { text: "" };
    });
    await erpClient.sendOtp(profile());
  }

  it("reports otp_invalid but keeps the login retryable when auth bounces to login", async () => {
    await primeOtpSent();
    installTransport((url) => {
      if (url.includes("auth.htm")) return { text: "", finalUrl: LOGIN_URL };
      return { text: "" };
    });

    await expect(erpClient.verifyOtpAndOpenCdc(profile(), "123456")).rejects.toMatchObject({
      code: "otp_invalid",
    });
    // A mistyped code must not throw the user back to square one — the form
    // stays usable so the correct OTP can be retyped immediately.
    expect(erpClient.getSessionState().stage).toBe("otp_sent");
  });

  it("reports otp_required when no OTP was ever requested", async () => {
    await resetClient();
    await expect(erpClient.verifyOtpAndOpenCdc(profile(), "123456")).rejects.toMatchObject({
      code: "otp_required",
    });
  });

  it("surfaces auth_landing when the session dies while opening CDC", async () => {
    await primeOtpSent();
    installTransport((url) => {
      if (url.includes("auth.htm")) {
        return { text: "<html>home</html>", finalUrl: `${ERP}/IIT_ERP3/home.htm` };
      }
      // Session dies at the menu launcher.
      if (url.includes("showmenu.htm")) return { text: "<html></html>", finalUrl: LOGIN_URL };
      return { text: "" };
    });

    await expect(erpClient.verifyOtpAndOpenCdc(profile(), "123456")).rejects.toMatchObject({
      code: "auth_landing",
    });
  });
});

describe("stale-session detection on live data fetches", () => {
  it("fetchCompanies throws auth_landing instead of returning an empty grid", async () => {
    installTransport((url) => {
      if (url.includes("TPStudent.jsp")) return { text: WORKSPACE_HTML };
      if (url.includes("jqqueryid=37")) {
        return { text: "", finalUrl: LOGIN_URL };
      }
      return { text: "" };
    });

    await expect(erpClient.fetchCompanies()).rejects.toMatchObject({
      code: "auth_landing",
    });
  });

  it("fetchNotices throws auth_landing when ERP redirects to login", async () => {
    installTransport((url) => {
      if (url.includes("Notice.jsp")) return { text: "", finalUrl: LOGIN_URL };
      return { text: "" };
    });

    await expect(erpClient.fetchNotices(50)).rejects.toMatchObject({
      code: "auth_landing",
    });
  });

  it("tryResumeSession refuses a login shell that mentions TPStudent.jsp", async () => {
    installTransport((url) => {
      if (url === `${ERP}/IIT_ERP3/`) {
        return { text: "<html>welcome</html>", finalUrl: `${ERP}/IIT_ERP3/home.htm` };
      }
      if (url.includes("showmenu.htm")) {
        return {
          text: '<input type="hidden" name="ssoToken" value="tok" />',
          finalUrl: url,
        };
      }
      if (url.includes("TPStudent.jsp")) {
        // 200 OK, but it is the login shell referring back to TPStudent.jsp.
        return {
          text:
            '<form id="loginform" action="SSOAdministration/auth.htm">' +
            '<input name="password"/><input name="email_otp"/></form>',
          finalUrl: url,
        };
      }
      return { text: "" };
    });

    expect(await erpClient.tryResumeSession("22CS10001")).toBeNull();
    expect(erpClient.getSessionState().stage).toBe("uninitialized");
  });

  it("keepalive downgrades the session when ERP has logged us out", async () => {
    installTransport((url) => {
      if (url === `${ERP}/IIT_ERP3/`) {
        return { text: "<html>welcome</html>", finalUrl: `${ERP}/IIT_ERP3/home.htm` };
      }
      if (url.includes("showmenu.htm")) {
        return { text: '<input type="hidden" name="ssoToken" value="tok" />', finalUrl: url };
      }
      if (url.includes("TPStudent.jsp")) return { text: WORKSPACE_HTML, finalUrl: url };
      if (url.includes("jqqueryid=37")) return { text: "<rows><page>1</page></rows>", finalUrl: url };
      if (url.includes("jqqueryid=54")) return { text: "<rows><page>1</page></rows>", finalUrl: url };
      return { text: "" };
    });

    expect(await erpClient.tryResumeSession("22CS10001")).not.toBeNull();
    expect(erpClient.getSessionState().stage).toBe("authenticated");

    installTransport(() => ({ text: "", finalUrl: LOGIN_URL }));
    await expect(erpClient.keepalive()).rejects.toMatchObject({ code: "auth_landing" });
    expect(erpClient.getSessionState().stage).toBe("uninitialized");
  });

  it("isSessionAlive returns false and logs out locally when ERP expired", async () => {
    installTransport(() => ({ text: "", finalUrl: LOGIN_URL }));
    expect(await erpClient.isSessionAlive()).toBe(false);
    expect(erpClient.getSessionState().stage).toBe("uninitialized");
  });

  it("isSessionAlive is false for a session that was never authenticated", async () => {
    await resetClient();
    expect(await erpClient.isSessionAlive()).toBe(false);
  });
});

describe("resetSession", () => {
  it("always clears cookies and never throws, even if the logout call fails", async () => {
    const actions: string[] = [];
    setCustomErpBridgeTransport(async (action, payload) => {
      actions.push(action);
      if (action === "CLEAR_COOKIES") return { ok: true };
      if ((payload?.url || "").includes("logout.htm")) {
        throw new Error("network down");
      }
      return { ok: true, status: 200, finalUrl: payload?.url, contentType: "text/html", text: "" };
    });

    const res = await erpClient.resetSession();
    expect(res.cleared).toBe(true);
    expect(actions).toContain("CLEAR_COOKIES");
    expect(erpClient.getSessionState().stage).toBe("uninitialized");
    expect(erpClient.getSessionState().rollno).toBe("");
  });

  it("reports cleared:false when the extension refuses to clear cookies", async () => {
    setCustomErpBridgeTransport(async (action) => {
      if (action === "CLEAR_COOKIES") throw new Error("bridge offline");
      return { ok: true, status: 200, finalUrl: "", contentType: "text/html", text: "" };
    });

    const res = await erpClient.resetSession();
    expect(res.cleared).toBe(false);
  });
});

describe("ErpSessionError contract", () => {
  it("carries a machine-readable code and the Error shape", () => {
    const err = new ErpSessionError("auth_landing", "session gone");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ErpSessionError");
    expect(err.code).toBe("auth_landing");
    expect(err.message).toBe("session gone");
  });
});
