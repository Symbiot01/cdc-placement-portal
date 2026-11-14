import { afterEach, describe, expect, it } from "vitest";
import {
  classifyBridgePing,
  erpClient,
  extractRollNumberFromErpHtml,
  inspectErpAttachmentBase64,
  isVersionAtLeast,
  sanitizeDownloadFilename,
  sanitizeErpNumericId,
  setCustomErpBridgeTransport,
} from "../lib/erpBridge";

describe("extension bridge version gate", () => {
  it("accepts the current bridge and rejects older builds", () => {
    expect(isVersionAtLeast("1.0.5", "1.0.5")).toBe(true);
    expect(isVersionAtLeast("1.0.10", "1.0.5")).toBe(true);
    expect(isVersionAtLeast("1.0.4", "1.0.5")).toBe(false);
    expect(isVersionAtLeast("1.0.3", "1.0.5")).toBe(false);
    expect(isVersionAtLeast("not-a-version", "1.0.5")).toBe(false);
  });

  it("treats a current ping as connected and an older ping as outdated", () => {
    expect(classifyBridgePing(true, "1.0.5")).toEqual({
      status: "connected",
      version: "1.0.5",
    });
    expect(classifyBridgePing(true, "1.0.4")).toEqual({
      status: "outdated",
      version: "1.0.4",
    });
    expect(classifyBridgePing(true, "1.0.2")).toEqual({
      status: "outdated",
      version: "1.0.2",
    });
    expect(classifyBridgePing(true, null)).toEqual({
      status: "outdated",
      version: null,
    });
    expect(classifyBridgePing(false, "1.0.4")).toEqual({
      status: "missing",
      version: null,
    });
  });
});

describe("extractRollNumberFromErpHtml & tryResumeSession", () => {
  afterEach(() => {
    setCustomErpBridgeTransport(null);
  });

  it("extracts roll numbers from ERP welcome banners and placement scripts", () => {
    expect(extractRollNumberFromErpHtml("<div>Welcome STUDENT (22CS10001)</div>")).toBe(
      "22CS10001"
    );
    expect(
      extractRollNumberFromErpHtml("<a onclick=\"TPStudentResume2('23EC30015', '1')\">CV1</a>")
    ).toBe("23EC30015");
  });

  it("returns null without clearing cookies when ERP redirects to login.htm", async () => {
    const actions: string[] = [];
    setCustomErpBridgeTransport(async (action, payload) => {
      actions.push(action);
      return {
        ok: true,
        status: 200,
        finalUrl: "https://erp.iitkgp.ac.in/SSOAdministration/login.htm",
        contentType: "text/html",
        text: "<form></form>",
        url: payload?.url,
      };
    });

    const resumed = await erpClient.tryResumeSession("22CS10001");
    expect(resumed).toBeNull();
    expect(actions).not.toContain("CLEAR_COOKIES");
  });

  it("refuses to auto-resume if the active ERP cookie belongs to a different roll number", async () => {
    setCustomErpBridgeTransport(async (_action, payload) => {
      const url = payload?.url || "";
      if (url.endsWith("/IIT_ERP3/")) {
        return {
          ok: true,
          status: 200,
          finalUrl: "https://erp.iitkgp.ac.in/IIT_ERP3/home.htm",
          contentType: "text/html",
          text: "<div>Welcome OTHER USER (22EE10099)</div>",
        };
      }
      if (url.includes("showmenu.htm")) {
        return {
          ok: true,
          status: 200,
          finalUrl: url,
          contentType: "text/html",
          text: '<input type="hidden" name="ssoToken" value="tok123" />',
        };
      }
      return {
        ok: true,
        status: 200,
        finalUrl: url,
        contentType: "text/html",
        text: "<div>rollno=22EE10099</div>",
      };
    });

    const resumed = await erpClient.tryResumeSession("22CS10001");
    expect(resumed).toBeNull();
  });

  it("resumes an active ERP session cleanly with 0 OTPs when roll number matches", async () => {
    setCustomErpBridgeTransport(async (_action, payload) => {
      const url = payload?.url || "";
      if (url.endsWith("/IIT_ERP3/")) {
        return {
          ok: true,
          status: 200,
          finalUrl: "https://erp.iitkgp.ac.in/IIT_ERP3/home.htm",
          contentType: "text/html",
          text: "<div>Welcome STUDENT (22CS10001)</div>",
        };
      }
      if (url.includes("showmenu.htm")) {
        return {
          ok: true,
          status: 200,
          finalUrl: url,
          contentType: "text/html",
          text: '<input type="hidden" name="ssoToken" value="tok123" />',
        };
      }
      if (url.includes("jqqueryid=37")) {
        return {
          ok: true,
          status: 200,
          finalUrl: url,
          contentType: "text/xml",
          text: "<rows><page>1</page></rows>",
        };
      }
      if (url.includes("jqqueryid=54")) {
        return {
          ok: true,
          status: 200,
          finalUrl: url,
          contentType: "text/xml",
          text: "<rows><page>1</page></rows>",
        };
      }
      return {
        ok: true,
        status: 200,
        finalUrl: url,
        contentType: "text/html",
        text: "<div>rollno=22CS10001</div>",
      };
    });

    const resumed = await erpClient.tryResumeSession("22CS10001");
    expect(resumed).toEqual({
      rollno: "22CS10001",
      companies: [],
      notices: [],
    });
    expect(erpClient.getSessionState().stage).toBe("authenticated");
  });

  it("enforces strict magic-byte validation on ERP binary attachments and blocks HTML/XSS responses", () => {
    const htmlPayload = btoa("<!DOCTYPE html><html><script>alert(1)</script></html>");
    expect(() => inspectErpAttachmentBase64(htmlPayload, "Notice_1569")).toThrow(
      /No file was returned by ERP/i
    );

    const validPdf = btoa("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
    const pdfRes = inspectErpAttachmentBase64(validPdf, "Airbus India / Shortlist");
    expect(pdfRes.previewKind).toBe("pdf");
    expect(pdfRes.mimeType).toBe("application/pdf");
    expect(pdfRes.filename).toBe("Airbus_India_Shortlist.pdf");

    // OOXML .xlsx magic bytes (PK\x03\x04 ... xl/workbook.xml) -> forced download-only octet-stream
    const fakeXlsx = btoa("PK\x03\x04\x14\x00\x00\x00xl/workbook.xml");
    const xlsxRes = inspectErpAttachmentBase64(fakeXlsx, "Shortlist_Sheet");
    expect(xlsxRes.previewKind).toBe("download");
    expect(xlsxRes.mimeType).toBe("application/octet-stream");
    expect(xlsxRes.extension).toBe("xlsx");
    expect(xlsxRes.filename).toBe("Shortlist_Sheet.xlsx");

    // Input parameter & filename sanitization
    expect(() => sanitizeErpNumericId("302&evil=1", "company")).toThrow(/Invalid ERP company/i);
    expect(sanitizeDownloadFilename("../../etc/passwd", "pdf")).toBe("etc_passwd.pdf");
  });
});
