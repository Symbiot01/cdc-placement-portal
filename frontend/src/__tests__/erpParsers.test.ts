import { describe, expect, it } from "vitest";
import {
  SecuritySlot,
  classifyDeadline,
  decideSecurityAnswer,
  doesNoticeMatchCompany,
  formatCtcBreakupText,
  formatCtcDisplay,
  hasErpDownloadLink,
  noticeTextFromHtml,
  prettifyErpRichText,
  prettifyNoticeText,
  parseComViewHtml,
  parseCompanyRow,
  parseJnfHtml,
  parseJnfMoreDetHtml,
  parseJqgridXml,
  parseNoticeRow,
  splitGluedUrl,
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

    // Glued forms.gle shortlink followed directly by "All the eligible students..."
    const ycpAuctus =
      "Please note that all the students who have applied for the Analyst Role for YCP Auctus are required to fill the following additional details form by 4:00 PM, 29th October, 2026. Link: https://forms.gle/fA5w7bkMxYGXCeG19All the eligible students are advised to fill the form within the given deadline. No further extensions will be given CDC, IIT Kharagpur";
    const ycpPretty = prettifyNoticeText(ycpAuctus);
    expect(ycpPretty).toContain("Link: https://forms.gle/fA5w7bkMxYGXCeG19\nAll the eligible students");
    expect(ycpPretty).not.toContain("fA5w7bkMxYGXCeG19All");

    // Glued Google Meet, Zoom, and Google Docs links
    expect(splitGluedUrl("https://meet.google.com/abc-defg-hijPlease").url).toBe(
      "https://meet.google.com/abc-defg-hij"
    );
    expect(splitGluedUrl("https://us06web.zoom.us/j/83367015087Interested").url).toBe(
      "https://us06web.zoom.us/j/83367015087"
    );
    expect(
      splitGluedUrl("https://docs.google.com/forms/d/e/1FAIpQLSd/viewformKindly").url
    ).toBe("https://docs.google.com/forms/d/e/1FAIpQLSd/viewform");
    expect(splitGluedUrl("https://example.com/register?id=42Students").url).toBe(
      "https://example.com/register?id=42"
    );
    expect(splitGluedUrl("https://amex.co1.qualtrics.com/jfe/form/SV_8CYM7ewbkEQzIdEApplication")).toEqual({
      url: "https://amex.co1.qualtrics.com/jfe/form/SV_8CYM7ewbkEQzIdE",
      tail: "\nApplication",
    });
    expect(
      splitGluedUrl("https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26010998AI")
    ).toEqual({
      url: "https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26010998",
      tail: "\nAI",
    });
    expect(
      splitGluedUrl("https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26015659Important")
    ).toEqual({
      url: "https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26015659",
      tail: "\nImportant",
    });
    expect(
      splitGluedUrl(
        "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210797409/?utm_medium=jobshare&utm_source=External+Job+Share"
      ).url
    ).toBe(
      "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210797409/?utm_medium=jobshare&utm_source=External+Job+Share"
    );
    // Preserves balanced parentheses in URLs while stripping outer closing paren
    expect(splitGluedUrl("https://en.wikipedia.org/wiki/C_(programming_language)).")).toEqual({
      url: "https://en.wikipedia.org/wiki/C_(programming_language)",
      tail: ").",
    });
  });

  it("handles truncated empty jqGrid <rows> stubs without throwing", () => {
    const stub = '<?xml version="1.0" encoding="UTF-8"?><rows><page>1</page>';
    expect(parseJqgridXml(stub)).toEqual([]);
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

  it("accurately distinguishes real CDC TPNotice/TPJNFDescription downloads from empty anchors", () => {
    const emptyNoticeAnchor = `<a title='' href='javascript:void(0);' onclick='TPNotice("2026-2027","1567");'></a>`;
    const realNoticeAnchor = `<a title='Download' href='javascript:void(0);' onclick='TPNotice("2026-2027","1569");'>Download</a>`;

    expect(hasErpDownloadLink(emptyNoticeAnchor)).toBe(false);
    expect(hasErpDownloadLink(realNoticeAnchor)).toBe(true);

    const rowWithoutAttach = parseNoticeRow(1, [
      "1567",
      "PLACEMENT",
      "Announcement",
      "IQVIA",
      "<a>Shortlist notice</a>",
      "CDC",
      "21-04-2026 10:00",
      emptyNoticeAnchor,
    ]);
    expect(rowWithoutAttach.has_attachment).toBe(false);

    const rowWithAttach = parseNoticeRow(2, [
      "1569",
      "PLACEMENT",
      "Shortlist",
      "Airbus India Pvt Ltd",
      "<a>Shortlisted candidates attached</a>",
      "CDC",
      "21-04-2026 14:27",
      realNoticeAnchor,
    ]);
    expect(rowWithAttach.has_attachment).toBe(true);
    expect(rowWithAttach.id).toBe("1569");
    expect(rowWithAttach.attachment_year).toBe("2026-2027");

    // Company row where view2/view3 are empty anchors and view1 has real Download
    const compRow = parseCompanyRow(1, [
      `<a title="Accenture Japan Ltd" onclick='TPComView("2026-2027","302");'>Accenture Japan Ltd</a>`,
      `<a title='' href='javascript:void(0);' onclick='TPComDescription("2026-2027","302");'></a>`,
      `<a title='' href='javascript:void(0);' onclick='TPPPTDescription("2026-2027","302");'></a>`,
      `<a title="Digital Consultant" onclick='TPJNFView("1","302","2026-2027");'>Digital Consultant</a>`,
      "",
      "8214021",
      "JPY",
      `<a title='Download' href='javascript:void(0);' onclick='TPJNFDescription("2026-2027","302","1");'>Download</a>`,
      "Y",
      "20-04-2026 08:00",
      "22-04-2026 23:59",
      "",
      "No",
    ]);
    expect(compRow.has_com_doc).toBe(false);
    expect(compRow.has_ppt_doc).toBe(false);
    expect(compRow.has_jnf_doc).toBe(true);
    expect(compRow.com_id).toBe("302");
    expect(compRow.jnf_id).toBe("1");
  });

  it("formats Indian LPA and foreign CTC values cleanly and sorts accurately", () => {
    const inr = formatCtcDisplay("2459400", "INR");
    expect(inr.primary).toBe("₹24.59 LPA");
    expect(inr.secondary).toBe("₹24,59,400");
    expect(inr.inrSortValue).toBe(2459400);

    const jpy = formatCtcDisplay("8214021", "JPY");
    expect(jpy.primary).toBe("¥8.21M JPY");
    expect(jpy.inrSortValue).toBeGreaterThan(4_000_000);
  });

  it("cross-matches notices to applied company names despite corporate suffixes", () => {
    expect(doesNoticeMatchCompany("Airbus", "Airbus India Private Limited")).toBe(true);
    expect(doesNoticeMatchCompany("Accenture Japan", "Accenture Japan Ltd.")).toBe(true);
    expect(doesNoticeMatchCompany("CDC General", "Airbus India")).toBe(false);
    expect(doesNoticeMatchCompany("Google", "Microsoft India")).toBe(false);
  });

  it("parses TPJNFView multi-column headers, separates Allowed Departments, and parses JnfMoreDet & TPComView", () => {
    const realJnfPage = `
      <table>
        <tr><th>Designation</th><th>Job Location</th><th>CTC (in Lakh)</th></tr>
        <tr><td>AI Scientist</td><td>Bengaluru</td><td>2459400 (INR)</td></tr>
        <tr><td>Job Description</td></tr>
        <tr><td>Work on Physical AI robotics &#9679; Foundation models &#9675; Reinforcement learning control loops.</td></tr>
        <tr><td>View More Details</td></tr>
        <tr><td><a href="javascript:void(0);" onclick="jnfMoreDet('2026-2027', '22NA30028', '506', '1')">Click Here for more details</a></td></tr>
        <tr><td>Allowed Departments and degrees</td></tr>
        <tr><td>CS - Computer Science and Engineering (B.Tech 4Y)</td></tr>
        <tr><td>NA - Ocean Engineering and Naval Architecture (M.Tech Dual 5Y)</td></tr>
      </table>
    `;
    const parsed = parseJnfHtml(realJnfPage, "506", "1");
    expect(parsed.fields["Designation"]).toBe("AI Scientist");
    expect(parsed.fields["Job Location"]).toBe("Bengaluru");
    expect(parsed.more_details_params).toEqual({
      year: "2026-2027",
      rollno: "22NA30028",
      com_id: "506",
      jnf_id: "1",
    });
    expect(parsed.jd_text).toContain("• Foundation models");
    expect(parsed.jd_text).toContain("◦ Reinforcement learning");
    expect(parsed.jd_text).not.toContain("Ocean Engineering");
    expect(parsed.allowed_departments).toHaveLength(2);

    const moreDetHtml = `
      <h4>Job Profile</h4>
      <table>
        <thead><tr><th>Form Type</th><th>Designation</th><th>Cost to Company per year</th></tr></thead>
        <tbody><tr><td>PLACEMENT</td><td>Software Development Engineer I</td><td>4838500 INR</td></tr></tbody>
      </table>
      <h4>Job Description</h4>
      <div>Build distributed cloud services &#9679; High scale systems &#9675; Low latency storage</div>
      <h4>Other Details</h4>
      <div class="row">
        <div class="col-xs-3 text-left"><div>CTC Breakup :</div></div>
        <div class="col-xs-3"><div><b>Base Pay (INR) 2,030,000 Sign-on Bonus Year 1 (INR) 643,500 Sign-on Bonus Year 2 (INR) 579,000 Restricted Stock Unit Value (RSU) (4 years) * (INR) 1,586,000 INR</b></div></div>
        <div class="col-xs-3 text-left"><div>Base Salary :</div></div>
        <div class="col-xs-3"><div><b>4800000</b></div></div>
        <div class="col-xs-3 text-left"><div>Joining Bonus, if any :</div></div>
        <div class="col-xs-3"><div><b>500000</b></div></div>
      </div>
      <div class="row">
        <div class="col-xs-3 text-left"><div>Bonds :</div></div>
        <div class="col-xs-3"><div><b>No</b></div></div>
        <div class="col-xs-3 text-left"><div>Bond Duration :</div></div>
        <div class="col-xs-3"><div><b></b></div></div>
        <div class="col-xs-3 text-left"><div>Bond Amount :</div></div>
        <div class="col-xs-3"><div><b>0</b></div></div>
      </div>
      <div class="row">
        <div class="col-xs-3 text-left"><div>Is there a CGPA Criteria? :</div></div>
        <div class="col-xs-3"><div><b>Yes</b></div></div>
        <div class="col-xs-3 text-left"><div>If Yes, minimum CGPA required :</div></div>
        <div class="col-xs-3"><div><b>6.5</b></div></div>
      </div>
      <h4>Selection Details</h4>
      <div class="row">
        <div class="col-xs-3 text-left"><div>Shortlist from resumes :</div></div>
        <div class="col-xs-3"><div><b>No</b></div></div>
        <div class="col-xs-3 text-left"><div>Written Test :</div></div>
        <div class="col-xs-3"><div><b>Yes</b></div></div>
        <div class="col-xs-3 text-left"><div>If Yes, Mode :</div></div>
        <div class="col-xs-3"><div><b>Online</b></div></div>
      </div>
    `;
    const more = parseJnfMoreDetHtml(moreDetHtml);
    expect(more.job_profile["Designation"]).toBe("Software Development Engineer I");
    expect(more.job_description).toContain("• High scale systems");
    expect(more.compensation_details["Base Salary"]).toBe("4800000");
    expect(more.compensation_details["Joining Bonus"]).toBe("500000");
    expect(more.compensation_details["CTC Breakup"]).toContain("• Sign-on Bonus Year 1");
    expect(more.eligibility_details["Bond / Service Contract"]).toBe("No");
    expect(more.eligibility_details["CGPA Criteria"]).toBe("Yes (Minimum CGPA: 6.5)");
    expect(more.selection_details["Shortlist from resumes"]).toBe("No");
    expect(more.selection_details["Written Test"]).toBe("Yes (Online)");

    // Pipe & comma CTC breakup formatters + ERP 500 error guard
    expect(
      formatCtcBreakupText("Fixed 2222222 | Performance Bonus 177778 | Total CTC 2400000")
    ).toContain("\n• Performance Bonus 177778");
    expect(
      prettifyErpRichText("AI: * Design of vision models. * Development of segmentation pipelines.")
    ).toContain("\n• Design of vision models.");
    expect(parseJnfMoreDetHtml("<html><body>500 Internal Server</body></html>").compensation_details).toEqual({});

    const comHtml = `
      <table>
        <tr><td>Company</td><td>Accenture Japan Ltd</td></tr>
        <tr><td>Industry Sector</td><td>IT Consulting</td></tr>
        <tr><td>Website</td><td>http://https://www.accenture.com/jp-ja</td></tr>
      </table>
    `;
    const com = parseComViewHtml(comHtml);
    expect(com["Company"]).toBe("Accenture Japan Ltd");
    expect(com["Website"]).toBe("https://www.accenture.com/jp-ja");
  });
});
