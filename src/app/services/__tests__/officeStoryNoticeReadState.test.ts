import { describe, expect, it } from "vitest";
import { parseOfficeStoryNoticeReadState } from "../officeStoryNoticeReadState";

describe("authenticated Office Story notice read-state mapping", () => {
  it("accepts a complete, exact per-notice state response", () => {
    expect(parseOfficeStoryNoticeReadState([
      { noticeId: 101, isRead: true },
      { noticeId: "102", isRead: false },
    ], [101, 102])).toEqual([
      { noticeId: 101, isRead: true },
      { noticeId: 102, isRead: false },
    ]);
  });

  it("rejects missing, duplicate, extra, malformed, or incomplete notice identities", () => {
    expect(() => parseOfficeStoryNoticeReadState([{ noticeId: 101, isRead: true }], [101, 102]))
      .toThrow("incomplete");
    expect(() => parseOfficeStoryNoticeReadState([
      { noticeId: 101, isRead: true }, { noticeId: 101, isRead: false },
    ], [101])).toThrow("identity did not match");
    expect(() => parseOfficeStoryNoticeReadState([{ noticeId: 999, isRead: true }], [101]))
      .toThrow("identity did not match");
    expect(() => parseOfficeStoryNoticeReadState([{ noticeId: "x", isRead: true }], [101]))
      .toThrow("identity did not match");
    expect(() => parseOfficeStoryNoticeReadState([{ noticeId: 101, isRead: "true" }], [101]))
      .toThrow("identity did not match");
  });
});
