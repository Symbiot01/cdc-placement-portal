import { describe, expect, it } from "vitest";
import { parseNoticeRow, prettifyNoticeText, splitGluedUrl } from "../lib/erpParsers";

const amexGlued = [
  "https://amex.co1.qualtrics.com/jfe/form/SV_8CYM7ewbkEQzIdEApplication",
  "https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26010998AI",
  "https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26015659Important",
].join(" ");

const amexBody =
  "Qualtrics Form : https://amex.co1.qualtrics.com/jfe/form/SV_8CYM7ewbkEQzIdEApplication Process:1. Fill out the form. Role-Specific Application Requirements:Data Science and Analytics - Credit and Fraud Risk https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26010998AI Research - Credit and Fraud Risk https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26015659Important Notes:Both forms are mandatory.";

describe("notice payload debug", () => {
  it("splits the American Express notice URLs from the pasted payload", () => {
    for (const raw of amexGlued.split(" ")) splitGluedUrl(raw);
    const pretty = prettifyNoticeText(amexBody);
    const cleanHrefHtml = `<a title="short">Urgent</a>`;
    const titleOnly = `<a title="${amexBody.replace(/"/g, "&quot;")}">Urgent</a>`;
    const anchored = [
      "Qualtrics Form : ",
      '<a href="https://amex.co1.qualtrics.com/jfe/form/SV_8CYM7ewbkEQzIdE">https://amex.co1.qualtrics.com/jfe/form/SV_8CYM7ewbkEQzIdE</a>',
      "Application Process:",
      '<a href="https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26010998">https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26010998</a>',
      "AI Research - Credit and Fraud Risk",
      '<a href="https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26015659">https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26015659</a>',
      "Important Notes:",
    ].join("<br>");
    parseNoticeRow(1, ["1", "PLACEMENT", "Urgent", "AMERICAN EXPRESS", titleOnly, "CDC", "29-10-2026 12:38", ""]);
    parseNoticeRow(2, ["2", "PLACEMENT", "Urgent", "AMERICAN EXPRESS", anchored, "CDC", "29-10-2026 12:38", ""]);
    parseNoticeRow(3, ["3", "PLACEMENT", "Urgent", "AMERICAN EXPRESS", cleanHrefHtml, "CDC", "29-10-2026 12:38", ""]);
    expect(pretty).toContain("https://amex.co1.qualtrics.com/jfe/form/SV_8CYM7ewbkEQzIdE\nApplication");
    expect(pretty).toContain("/job/26010998\nAI");
    expect(pretty).toContain("/job/26015659\nImportant");
    expect(pretty).not.toContain("EQzIdEApplication");
    expect(pretty).not.toContain("26010998AI");
    expect(pretty).not.toContain("26015659Important");
  });
});
