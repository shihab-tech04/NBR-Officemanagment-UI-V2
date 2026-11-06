/**
 * Holds an unpublished CMS crop/draft only in this browser tab's JavaScript memory
 * while the user returns through the existing Office sign-in. Never persist files,
 * credentials, or publishing authority in browser storage.
 */
export type PendingCmsPublish =
  | { kind: 'logo'; selected: { file: File; width: number; height: number } | null }
  | {
      kind: 'banner';
      selectedId: string | null;
      draft: unknown;
      newDraft: unknown;
      desiredPosition: number;
      desktopFile: File | null;
      mobileFile: File | null;
    };

export const CMS_PUBLISH_SIGN_IN_EVENT = 'office:cms-publish-sign-in';

let pending: PendingCmsPublish | null = null;

export function getPendingCmsPublish(): PendingCmsPublish | null {
  return pending;
}

export function clearPendingCmsPublish(): void {
  pending = null;
}

export function requestCmsPublishingSignIn(draft: PendingCmsPublish): void {
  pending = draft;
  window.dispatchEvent(new Event(CMS_PUBLISH_SIGN_IN_EVENT));
}
