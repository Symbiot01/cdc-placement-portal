import { describe, expect, it } from "vitest";
import {
  classifyErpError,
  classifyErpMessage,
  explainErpFailure,
  isAuthLandingUrl,
  isStudentWorkspaceHtml,
  pathnameOf,
} from "../lib/erpSessionGuard";

describe("ERP URL auth-landing detection", () => {
  it("extracts the pathname from absolute URLs and bare paths", () => {
    expect(pathnameOf("https://erp.iitkgp.ac.in/SSOAdministration/login.htm?x=1")).toBe(
      "/SSOAdministration/login.htm"
    );
    expect(pathnameOf("/SSOAdministration/auth.htm")).toBe("/SSOAdministration/auth.htm");
    expect(pathnameOf("https://erp.iitkgp.ac.in/IIT_ERP3/home.htm")).toBe("/IIT_ERP3/home.htm");
    expect(pathnameOf("")).toBe("");
  });

  it("treats login.htm and auth.htm as logged out regardless of query string", () => {
    expect(
      isAuthLandingUrl(
        "https://erp.iitkgp.ac.in/SSOAdministration/login.htm?sessionToken=abc&requestedUrl=x"
      )
    ).toBe(true);
    expect(isAuthLandingUrl("https://erp.iitkgp.ac.in/SSOAdministration/auth.htm")).toBe(true);
    expect(isAuthLandingUrl("/SSOAdministration/login.htm")).toBe(true);
  });

  it("does not treat a real workspace URL as a login page", () => {
    expect(isAuthLandingUrl("https://erp.iitkgp.ac.in/IIT_ERP3/home.htm")).toBe(false);
    expect(
      isAuthLandingUrl("https://erp.iitkgp.ac.in/TrainingPlacementSSO/TPStudent.jsp")
    ).toBe(false);
    expect(isAuthLandingUrl("")).toBe(false);
  });

  it("never false-positives on ERP paths that merely contain the words", () => {
    expect(isAuthLandingUrl("https://erp.iitkgp.ac.in/IIT_ERP3/loginHelp.htm")).toBe(false);
    expect(isAuthLandingUrl("https://erp.iitkgp.ac.in/SSOAdministration/authFailure.jsp")).toBe(
      false
    );
  });
});

describe("student workspace detection", () => {
  it("accepts pages carrying real ERP student scaffolding", () => {
    expect(
      isStudentWorkspaceHtml(
        '<html><script>function TPStudentResume2(r,c){}</script><body>CDC</body></html>'
      )
    ).toBe(true);
    expect(isStudentWorkspaceHtml("<html><div>rollno=22CS10001</div></html>")).toBe(true);
    expect(
      isStudentWorkspaceHtml(
        "<html><body><table id='grid' class='jqGrid'></table></body></html>"
      )
    ).toBe(true);
  });

  it("rejects thin or login-shell pages so a dead session is never 'authenticated'", () => {
    expect(isStudentWorkspaceHtml("")).toBe(false);
    expect(isStudentWorkspaceHtml("<div>short</div>")).toBe(false);
    expect(
      isStudentWorkspaceHtml(
        "<html><body><form id='login-form'><input name='user_id'/></form></body></html>"
      )
    ).toBe(false);
  });

  it("rejects the SSO login shell even though it references TPStudent.jsp", () => {
    // ERP's login.htm carries requestedUrl=...TPStudent.jsp in its form action,
    // so a naive substring check would call this an authenticated workspace.
    const loginShell =
      '<html><body><form id="loginform" action="https://erp.iitkgp.ac.in/' +
      "SSOAdministration/auth.htm?requestedUrl=https://erp.iitkgp.ac.in/" +
      'TrainingPlacementSSO/TPStudent.jsp" method="post">' +
      '<input name="user_id"/><input name="password"/><input name="email_otp"/></form></body></html>';
    expect(isStudentWorkspaceHtml(loginShell)).toBe(false);
  });
});

describe("ERP error classification", () => {
  it("recognises single-session conflicts (the classic stale-session case)", () => {
    expect(classifyErpMessage("You are already logged in from another device")).toBe(
      "session_conflict"
    );
    expect(classifyErpMessage("Session is already active elsewhere")).toBe("session_conflict");
    expect(classifyErpMessage("Please logout from the other browser")).toBe("session_conflict");
    expect(classifyErpMessage("Multiple login detected")).toBe("session_conflict");
  });

  it("distinguishes expired OTPs from simply wrong OTPs", () => {
    expect(classifyErpMessage("The OTP has expired")).toBe("otp_expired");
    expect(classifyErpMessage("Invalid OTP entered")).toBe("otp_invalid");
    expect(classifyErpMessage("OTP mismatch")).toBe("otp_invalid");
  });

  it("recognises dead sessions and bridge problems", () => {
    expect(classifyErpMessage("Session expired, please login again")).toBe("session_stale");
    expect(classifyErpMessage("Not logged in")).toBe("session_stale");
    expect(classifyErpMessage("ERP bridge extension did not respond")).toBe("bridge_missing");
  });

  it("falls back to erp_rejected for unrecognised ERP text", () => {
    expect(classifyErpMessage("Could not fetch 3 unique security questions")).toBe(
      "erp_rejected"
    );
    expect(classifyErpMessage("")).toBe("unknown");
  });
});

describe("failure explanations are always actionable", () => {
  it("gives every non-bridge failure exactly one recovery action", () => {
    const codes = [
      "auth_landing",
      "session_conflict",
      "session_stale",
      "session_reset",
      "otp_required",
      "otp_invalid",
      "otp_expired",
      "erp_rejected",
      "unknown",
    ] as const;
    for (const code of codes) {
      const info = explainErpFailure(code);
      expect(info.title.length).toBeGreaterThan(0);
      expect(info.detail.length).toBeGreaterThan(0);
      expect(info.action).not.toBe("none");
      expect(info.canAutoRecover).toBe(true);
    }
  });

  it("marks a missing extension as user-actionable, not auto-recoverable", () => {
    const info = explainErpFailure("bridge_missing");
    expect(info.action).toBe("none");
    expect(info.canAutoRecover).toBe(false);
  });

  it("classifies thrown values while preserving the raw message", () => {
    const info = classifyErpError(new Error("You are already logged in elsewhere"));
    expect(info.code).toBe("session_conflict");
    expect(info.action).toBe("clean_login");
    expect(info.rawMessage).toBe("You are already logged in elsewhere");
  });

  it("honours an explicit typed code over message sniffing", () => {
    const err = Object.assign(new Error("opaque"), { code: "auth_landing" });
    expect(classifyErpError(err).code).toBe("auth_landing");
  });

  it("handles non-Error throwables without crashing", () => {
    expect(classifyErpError(undefined).code).toBe("unknown");
    expect(classifyErpError("Session expired").code).toBe("session_stale");
  });
});
