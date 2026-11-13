import { describe, expect, it } from "vitest";
import { parseOfficeNoticeId, parseOfficeStoryNoticeReadState } from "../officeStoryNoticeReadState";

describe("authenticated Office Story notice read-state mapping", () => {
  it("accepts a complete, exact per-notice state response", () => {
    expect(parseOfficeStoryNoticeReadState([
      { noticeId: "101", isRead: true },
      { noticeId: "102", isRead: false },
    ], ["101", "102"])).toEqual([
      { noticeId: "101", isRead: true },
      { noticeId: 102, isRead: false },
    ]);
  });

  it("rejects missing, duplicate, extra, malformed, or incomplete notice identities", () => {
    expect(() => parseOfficeStoryNoticeReadState([{ noticeId: "101", isRead: true }], ["101", "102"]))
      .toThrow("incomplete");
    expect(() => parseOfficeStoryNoticeReadState([
      { noticeId: "101", isRead: true }, { noticeId: "101", isRead: false },
    ], ["101"])).toThrow("identity did not match");
    expect(() => parseOfficeStoryNoticeReadState([{ noticeId: "999", isRead: true }], ["101"]))
      .toThrow("identity did not match");
    expect(() => parseOfficeStoryNoticeReadState([{ noticeId: "x", isRead: true }], ["101"]))
      .toThrow("identity did not match");
    expect(() => parseOfficeStoryNoticeReadState([{ noticeId: "101", isRead: "true" }], ["101"]))
      .toThrow("identity did not match");
  });
  it("retains bigint notice IDs beyond JavaScript's safe-integer range", () => {
    const exact = "9007199254740993";
    expect(parseOfficeNoticeId(exact)).toBe(exact);
    expect(parseOfficeStoryNoticeReadState([{ noticeId: exact, isRead: true }], [exact]))
      .toEqual([{ noticeId: exact, isRead: true }]);
    expect(parseOfficeNoticeId(9007199254740993)).toBeNull();
    expect(parseOfficeNoticeId("9223372036854775808")).toBeNull();
    expect(parseOfficeNoticeId("0001")).toBeNull();
  });
});
