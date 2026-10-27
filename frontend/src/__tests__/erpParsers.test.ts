import { describe, expect, it } from "vitest";
import {
  SecuritySlot,
  classifyDeadline,
  decideSecurityAnswer,
  noticeTextFromHtml,
  prettifyNoticeText,
  parseCompanyRow,
  parseJnfHtml,
  parseJqgridXml,
  parseNoticeRow,
} from "../lib/erpParsers";

describe("decideSecurityAnswer", () => {
  const baseSlots: SecuritySlot[] = [
    { question: "What is your mother's maiden name?", answer: "Alpha", use: true },
    { question: "What was your first school?", answer: "Beta", use: false },
    { question: "What is your favourite sport?", answer: "", use: true },
  ];

  it("returns fill when the live question is usable and has an answer", () => {
    const res = decideSecurityAnswer("What is your mother's maiden name?", baseSlots);
    expect(res).toEqual({ action: "fill", answer: "Alpha" });
  });

  it("returns retry when the live question has use === false", () => {
    const res = decideSecurityAnswer("What was your first school?", baseSlots);
    expect(res).toEqual({ action: "retry" });
  });

  it("returns missing when the live question is enabled but has an empty answer", () => {
    const res = decideSecurityAnswer("What is your favourite sport?", baseSlots);
    expect(res).toEqual({ action: "missing" });
  });

  it("returns none-usable when no slot has both use=true and a non-empty answer", () => {
    const res = decideSecurityAnswer("Any question", [
      { question: "Q1", answer: "", use: true },
      { question: "Q2", answer: "Ans", use: false },
    ]);
    expect(res).toEqual({ action: "none-usable" });
  });
});

describe("ERP XML & HTML parsers", () => {
  it("parses jqGrid XML rows and company cells accurately", () => {
    const xml = `
      <rows>
        <page>1</page>
        <row id="0">
          <cell><![CDATA[<a title="HILABS" onclick='TPComView("2026-2027","197");'>HILABS</a>]]></cell>
          <cell><![CDATA[]]></cell>
          <cell><![CDATA[]]></cell>
          <cell><![CDATA[<a title="AI Engineer" onclick='TPJNFView("2","197","2026-2027");'>AI Engineer</a>]]></cell>
          <cell><![CDATA[]]></cell>
          <cell><![CDATA[32 LPA]]></cell>
          <cell><![CDATA[INR]]></cell>
          <cell><![CDATA[]]></cell>
          <cell><![CDATA[Y]]></cell>
          <cell><![CDATA[2026-10-27 08:00]]></cell>
          <cell><![CDATA[2026-10-28 14:00]]></cell>
          <cell><![CDATA[Shortlisted]]></cell>
          <cell><![CDATA[No Bond]]></cell>
        </row>
      </rows>
    `;
    const rows = parseJqgridXml(xml);
    expect(rows).toHaveLength(1);
    const parsed = parseCompanyRow(1, rows[0], new Date(2026, 9, 27, 12, 0, 0));
    expect(parsed.company).toBe("HILABS");
    expect(parsed.role).toBe("AI Engineer");
    expect(parsed.com_id).toBe("197");
    expect(parsed.jnf_id).toBe("2");
    expect(parsed.applied).toBe(true);
    expect(parsed.is_open).toBe(true);
  });

  it("preserves paragraphs, bullets, bold, and links in placement notices", () => {
    const html = `<p><b>Shortlist Out</b></p><ul><li>Candidate 1</li><li>Candidate 2</li></ul><p>Join https://meet.google.com/abc-defg-hij</p>`;
    const text = noticeTextFromHtml(html);
    expect(text).toContain("**Shortlist Out**");
    expect(text).toContain("• Candidate 1");
    expect(text).toContain("https://meet.google.com/abc-defg-hij");

    const noticeRow = parseNoticeRow(1, [
      "1221",
      "PLACEMENT",
      "Shortlist",
      "HILABS",
      `<a title="${html.replace(/"/g, "&quot;")}">Shortlist</a>`,
      "CDC",
      "27-10-2026 14:00",
      `NoticeView('1221','2026-2027')`,
    ]);
    expect(noticeRow.has_attachment).toBe(true);
    expect(noticeRow.company).toBe("HILABS");
  });

  it("prettifies run-on CDC notice bodies into readable lines", () => {
    const raw =
      "The Pre-Placement Talk for Deloitte US-India, will be held on 27th October 2026 from 6:00 PM.Join link: https://deloitte.zoom.us/j/93492406162?pwd=abc.Note: Attendance is compulsory.POC: Neev (+91 9001346350)CDC, IIT Kharagpur";
    const pretty = prettifyNoticeText(raw);
    expect(pretty).toContain("Join link:");
    expect(pretty).toMatch(/PM\.\nJoin link:/);
    expect(pretty).toContain("https://deloitte.zoom.us/j/93492406162?pwd=abc");
    expect(pretty).not.toMatch(/Join\nlink:/);
    expect(pretty).toMatch(/\nNote:/);
    expect(pretty).toMatch(/\nPOC:/);
    expect(pretty).toMatch(/\nCDC, IIT Kharagpur/);

    const ppo =
      "Google India has extended the offer to the following student(s):SUJAY VIVEK - 22EE38016BALA DHARNESH - 23CS10008SOBHAN MISHRA - 22CE3FP14The students are advised";
    const ppoPretty = prettifyNoticeText(ppo);
    expect(ppoPretty).toContain("22EE38016\nBALA DHARNESH");
    expect(ppoPretty).toContain("22CE3FP14\nThe students");

    const dateThenSentence =
      "The Pre-Placement Talk have been rescheduled to 5:00 PM to 6:00 PM, 26th October, 2026. Link: https://us06web.zoom.us/j/83367015087";
    const datePretty = prettifyNoticeText(dateThenSentence);
    expect(datePretty).toContain("26th October, 2026.");
    expect(datePretty).not.toMatch(/20\n26/);

    const parenRunOn =
      "1. POCKET FM (Profiles: Member of Technical Staff, Management Trainee)Interested and eligible students are advised to apply.";
    expect(prettifyNoticeText(parenRunOn)).toContain("Management Trainee)\nInterested and eligible");
  });

  it("extracts applied CV number and JD fields from TPJNFView.jsp HTML", () => {
    const page = `
      <table>
        <tr><td>Designation:</td><td>AI Engineer</td></tr>
        <tr><td>Job Description:</td><td>Build clinical NLP &amp; LLM pipelines with PyTorch, Qwen, and vLLM across production clusters with strict latency SLAs.</td></tr>
      </table>
      <a href="TPStudenApply.jsp?mode=cancel&com_id=197&jnf_id=2">Cancel</a>
      <a onclick="TPStudentResume2('22XX10001', '2')">View Resume</a>
    `;
    const jnf = parseJnfHtml(page, "197", "2");
    expect(jnf.applied_cv).toBe(2);
    expect(jnf.is_applied).toBe(true);
    expect(jnf.can_cancel).toBe(true);
    expect(jnf.fields["Designation"]).toBe("AI Engineer");
  });

  it("classifies deadlines accurately", () => {
    const now = new Date(2026, 9, 27, 12, 0, 0);
    const meta = classifyDeadline("2026-10-27 08:00", "2026-10-27 13:30", now);
    expect(meta.is_open).toBe(true);
    expect(meta.urgency).toBe("critical");
  });
});
