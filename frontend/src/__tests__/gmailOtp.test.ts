import { describe, expect, it, beforeEach } from "vitest";
import {
  extractErpOtp,
  markOtpMessageConsumed,
  pickErpOtp,
  pickErpOtpMatch,
  readConsumedOtpMessageIds,
  textFromGmailPayload,
} from "../lib/gmailOtp";

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

describe("extractErpOtp", () => {
  it("reads a 6-digit code that follows the OTP label in an ERP mail", () => {
    expect(
      extractErpOtp("Your OTP for ERP login at IIT Kharagpur is 482913. It expires shortly.")
    ).toBe("482913");
  });

  it("reads a code that appears before the OTP label", () => {
    expect(extractErpOtp("482913 is your one-time password for IIT Kharagpur ERP.")).toBe("482913");
  });

  it("reads the code from simple HTML", () => {
    expect(extractErpOtp("<p>ERP IIT Kharagpur</p><p>OTP: <b>110294</b></p>")).toBe("110294");
  });

  it("ignores mail that is not from the ERP context", () => {
    expect(extractErpOtp("Your bank OTP is 482913.")).toBeNull();
  });

  it("does not take a longer number or a roll number as the OTP", () => {
    expect(extractErpOtp("ERP IIT Kharagpur OTP 4829137 for roll 22CS10001")).toBeNull();
  });
});

describe("pickErpOtp & pre-send baseline exclusion", () => {
  it("uses the newest mail at or after the send time", () => {
    const otp = pickErpOtp(
      [
        { id: "m1", internalDateMs: 1_000, text: "IIT Kharagpur ERP OTP 111111" },
        { id: "m2", internalDateMs: 5_000, text: "IIT Kharagpur ERP OTP 222222" },
        { id: "m3", internalDateMs: 9_000, text: "IIT Kharagpur ERP OTP 333333" },
      ],
      4_000
    );
    expect(otp).toBe("333333");
  });

  it("skips a pre-existing stale OTP mail when its message ID is in excludedIds", () => {
    const preSendBaseline = new Set(["staleMsgId"]);
    const match = pickErpOtpMatch(
      [
        // Arrived 5 seconds before click, would pass notBeforeMs without baseline exclusion!
        { id: "staleMsgId", internalDateMs: 95_000, text: "IIT Kharagpur ERP OTP 111111" },
        { id: "freshMsgId", internalDateMs: 102_000, text: "IIT Kharagpur ERP OTP 777888" },
      ],
      85_000,
      preSendBaseline
    );
    expect(match).toEqual({ id: "freshMsgId", otp: "777888" });

    // And if the fresh message has not arrived yet, returns null instead of using the stale OTP
    const whileWaiting = pickErpOtpMatch(
      [{ id: "staleMsgId", internalDateMs: 95_000, text: "IIT Kharagpur ERP OTP 111111" }],
      85_000,
      preSendBaseline
    );
    expect(whileWaiting).toBeNull();
  });

  it("skips a newer unrelated mail and keeps the ERP code", () => {
    const otp = pickErpOtp(
      [
        { id: "bank1", internalDateMs: 8_000, text: "Your bank OTP is 999999" },
        { id: "erp1", internalDateMs: 6_000, text: "OTP 246810 for ERP IIT Kharagpur" },
      ],
      5_000
    );
    expect(otp).toBe("246810");
  });
});

describe("consumed message deduplication", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("tracks consumed message IDs so an OTP mail is never reused", () => {
    markOtpMessageConsumed("abc123def");
    const consumed = readConsumedOtpMessageIds();
    expect(consumed.has("abc123def")).toBe(true);
  });
});

describe("textFromGmailPayload", () => {
  it("decodes text parts, includes Subject/From headers, and ignores attachments", () => {
    const text = textFromGmailPayload(
      {
        mimeType: "multipart/alternative",
        headers: [
          { name: "Subject", value: "OTP for Sign In in ERP Portal of IIT Kharagpur" },
          { name: "From", value: "erpsupport@adm.iitkgp.ac.in" },
        ],
        parts: [
          {
            mimeType: "text/plain",
            body: { data: base64Url("Dear Student, Your OTP is 654321.") },
          },
          {
            mimeType: "application/pdf",
            filename: "notice.pdf",
            body: { data: base64Url("should not be read") },
          },
        ],
      },
      ""
    );
    expect(extractErpOtp(text)).toBe("654321");
    expect(text).not.toContain("should not be read");
  });
});
