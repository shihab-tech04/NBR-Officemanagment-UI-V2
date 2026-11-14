import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,renderHook,waitFor} from "@testing-library/react";
import {Provider} from "react-redux";
import {configureStore} from "@reduxjs/toolkit";
import reducer from "../../store/notificationsSlice";
import {useNotificationsState} from "../useNotificationsState";
import {OfficeNoticeAuthorizationError} from "../../services/officeStoryNoticeReadState";
import type {ReactNode} from "react";

const mocks=vi.hoisted(()=>({
  feed:vi.fn(),
  subscription: {callback:null as null|((event:string)=>void)},
}));
vi.mock("../../services/officeStoryNoticePages",()=>({
  getVerifiedOfficerStoryNotices:mocks.feed,
}));
vi.mock("../../pages/audit/auditSharedSql",()=>({
  isSharedAuditMode:()=>true,
  getAuditSqlClient:()=>({
    auth:{onAuthStateChange:(callback:(event:string)=>void)=>{
      mocks.subscription.callback=callback;
      return {data:{subscription:{unsubscribe:()=>{mocks.subscription.callback=null;}}}};
    }},
  }),
}));
vi.mock("react-i18next",()=>({
  useTranslation:()=>({i18n:{resolvedLanguage:"en"}}),
}));
vi.mock("../../pages/payments/story1OfficeApi",()=>({
  getStoryNotices:vi.fn(),getRecentStoryPayments:vi.fn(),
}));
const paymentId="77777777-7777-4777-8777-777777777777";
const notice={
  id:"9007199254740993",paymentId,type:"NEW_SIMULATED_PAYMENT",
  createdAt:"2026-11-14T01:00:00Z",
  payment:{id:paymentId,service:"ADVANCE_TAX",amountMinor:"125050",
    status:"SIMULATED_SUCCESS",createdAt:"2026-11-14T01:00:00Z"},
};
function setup(){
  const store=configureStore({reducer:{notifications:reducer}});
  const wrapper=({children}:{children:ReactNode})=><Provider store={store}>{children}</Provider>;
  return {store,...renderHook(()=>useNotificationsState(),{wrapper})};
}
beforeEach(()=>{mocks.feed.mockReset();mocks.subscription.callback=null;});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe("Office bell network and officer-switch recovery",()=>{
  it("recovers from offline failure on online event without using tab/mock fallbacks",async()=>{
    mocks.feed.mockRejectedValueOnce(Error("offline")).mockResolvedValue({
      officerUid:"maker",notices:[notice],readIds:[],
    });
    const view=setup();
    await waitFor(()=>expect(mocks.feed).toHaveBeenCalledTimes(1));
    expect(view.store.getState().notifications.items.filter(n=>n.type==="payment")).toEqual([]);
    act(()=>{window.dispatchEvent(new Event("online"));});
    await waitFor(()=>expect(view.store.getState().notifications.items.find(n=>n.type==="payment")?.targetNoticeId)
      .toBe(notice.id));
    expect(mocks.feed).toHaveBeenCalledTimes(2);
    view.unmount();
  });
  it("clears private payment items immediately on officer change and ignores late previous-officer fetch",async()=>{
    let resolveReviewer!: (value:unknown)=>void;
    mocks.feed.mockResolvedValueOnce({officerUid:"maker",notices:[notice],readIds:[notice.id]})
      .mockImplementationOnce(()=>new Promise(resolve=>{resolveReviewer=resolve;}));
    const view=setup();
    await waitFor(()=>expect(view.store.getState().notifications.items.find(n=>n.type==="payment")?.isRead)
      .toBe(true));
    act(()=>{mocks.subscription.callback?.("SIGNED_OUT");});
    expect(view.store.getState().notifications.items.filter(n=>n.type==="payment")).toEqual([]);
    await waitFor(()=>expect(mocks.feed).toHaveBeenCalledTimes(2));
    await act(async()=>resolveReviewer({officerUid:"reviewer",notices:[notice],readIds:[]}));
    await waitFor(()=>expect(view.store.getState().notifications.items.find(n=>n.type==="payment")?.isRead)
      .toBe(false));
    expect(view.store.getState().notifications.readStateOfficerUid).toBe("reviewer");
    view.unmount();
  });
  it("clears a previously visible officer feed on confirmed role revocation",async()=>{
    mocks.feed.mockResolvedValueOnce({officerUid:"maker",notices:[notice],readIds:[notice.id]})
      .mockRejectedValueOnce(new OfficeNoticeAuthorizationError());
    const view=setup();
    await waitFor(()=>expect(view.store.getState().notifications.items.find(n=>n.type==="payment")).toBeDefined());
    act(()=>window.dispatchEvent(new Event("online")));
    await waitFor(()=>expect(mocks.feed).toHaveBeenCalledTimes(2));
    await waitFor(()=>expect(view.store.getState().notifications.items.filter(n=>n.type==="payment")).toEqual([]));
    view.unmount();
  });
  it("does not publish a stale in-flight response after signing out",async()=>{
    let resolveOld!: (value:unknown)=>void;
    mocks.feed.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}))
      .mockRejectedValueOnce(Error("signed out"));
    const view=setup();
    await waitFor(()=>expect(mocks.feed).toHaveBeenCalledTimes(1));
    act(()=>mocks.subscription.callback?.("SIGNED_OUT"));
    await waitFor(()=>expect(mocks.feed).toHaveBeenCalledTimes(2));
    await act(async()=>resolveOld({officerUid:"maker",notices:[notice],readIds:[notice.id]}));
    expect(view.store.getState().notifications.items.filter(n=>n.type==="payment")).toEqual([]);
    view.unmount();
  });
});
