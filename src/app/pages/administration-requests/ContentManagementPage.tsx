import { useCallback, useEffect, useState } from 'react';
import { getTaxPayCmsClient, getTaxPayCmsPublicClient } from '../../services/taxpayCmsClient';
import { ImagePlus, Pencil, Plus, Save, Trash2, UploadCloud } from 'lucide-react';
import '../../../styles/content-management.css';
import { SiteLogoPanel } from './SiteLogoPanel';
import { ImageCropDialog } from './ImageCropDialog';
import { IMAGE_FILE_ACCEPT, MAX_IMAGE_BYTES } from './imageCrop';
import { verifyPublicImage } from './verifyPublicImage';
import { useImagePreview } from './useImagePreview';
import { SConfirmModal } from '../../components/modals/SConfirmModal';

type Banner = {
  id: string; service_code: string | null; sort_order: number; published: boolean;
  heading_en: string; heading_bn: string; description_en: string; description_bn: string;
  mobile_heading_en: string; mobile_heading_bn: string;
  mobile_description_en: string; mobile_description_bn: string;
  action_en: string; action_bn: string;
  desktop_image_path: string | null; mobile_image_path: string | null;
  version: number; updated_at: string; updated_by: string | null;
};
type TextKey = 'heading_en' | 'heading_bn' | 'description_en' | 'description_bn' |
  'mobile_heading_en' | 'mobile_heading_bn' | 'mobile_description_en' | 'mobile_description_bn' |
  'action_en' | 'action_bn';

const cms = getTaxPayCmsClient();

const fields: { key: TextKey; label: string; max?: number }[] = [
  { key: 'heading_en', label: 'Desktop heading · English' },
  { key: 'heading_bn', label: 'Desktop heading · বাংলা' },
  { key: 'description_en', label: 'Desktop subheading · English' },
  { key: 'description_bn', label: 'Desktop subheading · বাংলা' },
  { key: 'mobile_heading_en', label: 'Mobile heading · English', max: 24 },
  { key: 'mobile_heading_bn', label: 'Mobile heading · বাংলা', max: 24 },
  { key: 'mobile_description_en', label: 'Mobile subheading · English', max: 34 },
  { key: 'mobile_description_bn', label: 'Mobile subheading · বাংলা', max: 34 },
  { key: 'action_en', label: 'Button · English' },
  { key: 'action_bn', label: 'Button · বাংলা' },
];
const bannerCategories = [
  { value: '', label: 'Main banner' },
  { value: 'TAX_WITH_RETURN', label: 'Tax with Return' },
  { value: 'ADVANCE_TAX', label: 'Advance Income Tax' },
  { value: 'SOURCE_TAX_DEPOSIT', label: 'Source Tax Deposit' },
  { value: 'TRAVEL_TAX', label: 'Travel Tax' },
];

function imageUrl(path: string | null) {
  return path?.startsWith('blob:') ? path : path && cms ? cms.storage.from('taxpay-banners').getPublicUrl(path).data.publicUrl : null;
}

const originalImages: Record<string, string> = {
  intro: 'taxpay-hero-intro-v9.webp',
  return: 'taxpay-hero-return-v9.webp',
  advance: 'taxpay-hero-advance-v9.webp',
  withholding: 'taxpay-hero-withholding-v9.webp',
  travel: 'taxpay-hero-travel-v9.webp',
};
const bannerImageByService: Record<string, string> = {
  TAX_WITH_RETURN: 'return', ADVANCE_TAX: 'advance',
  SOURCE_TAX_DEPOSIT: 'withholding', TRAVEL_TAX: 'travel',
};
function defaultBannerImageId(serviceCode: string | null) {
  return serviceCode ? (bannerImageByService[serviceCode] || 'intro') : 'intro';
}
function originalImageUrl(id: string) {
  return originalImages[id] ? `https://raw.githubusercontent.com/shihab-tech04/nbr-taxpay/main/src/assets/${originalImages[id]}` : null;
}

export function ContentManagementPage() {
  const [tab, setTab] = useState<'banners' | 'logo'>('banners');
  const [banners, setBanners] = useState<Banner[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Banner | null>(null);
  const [newDraft, setNewDraft] = useState<Banner | null>(null);
  const [desiredPosition, setDesiredPosition] = useState(1);
  const [editing, setEditing] = useState(false);
  const [desktopFile, setDesktopFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [cropTask, setCropTask] = useState<{ device: 'desktop' | 'mobile'; file: File } | null>(null);
  const desktopPreview = useImagePreview(desktopFile);
  const mobilePreview = useImagePreview(mobileFile);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [authState, setAuthState] = useState<'checking' | 'signed-out' | 'denied' | 'authorized'>('checking');
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [deleteRequested, setDeleteRequested] = useState(false);

  const refreshSession = useCallback(async () => {
    if (!cms) { setAuthState('signed-out'); setAuthUid(null); return; }
    const { data: { session }, error: sessionError } = await cms.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) { setAuthUid(null); setAuthState('signed-out'); return; }
    const { data: isAdmin, error: accessError } = await cms.rpc('taxpay_is_verified_portal_admin');
    if (accessError) throw accessError;
    setAuthUid(isAdmin ? session.user.id : null);
    setAuthState(isAdmin ? 'authorized' : 'denied');
  }, []);

  useEffect(() => {
    let active = true;
    const update = () => { void refreshSession().catch(error => {
      if (active) { setAuthUid(null); setAuthState('denied'); setMessage((error as Error).message); }
    }); };
    update();
    const { data: { subscription } } = cms?.auth.onAuthStateChange(() => {
      // Let the Supabase auth callback finish before checking RLS membership.
      queueMicrotask(update);
    }) ?? { data: { subscription: null } };
    return () => { active = false; subscription?.unsubscribe(); };
  }, [refreshSession]);

  const refresh = async (): Promise<Banner[]> => {
    if (!cms) { setBanners([]); setSelectedId(null); return []; }
    const { data, error } = await cms.from('taxpay_site_banners').select('*').order('sort_order').order('id');
    if (error) throw error;
    const next = (data || []) as Banner[];
    setBanners(next);
    setSelectedId(id => id && next.some(row => row.id === id) ? id : next[0]?.id || null);
    return next;
  };

  useEffect(() => {
    // The public SQL policy permits reading published banners without
    // administrator credentials. Never blank the entire CMS for Office users.
    // RLS still restricts unpublished records and all writes to verified admins.
    void refresh().catch(err => setMessage((err as Error).message));
  }, [authState]);

  useEffect(() => {
    if (!cms) return;
    const sync = () => {
      // Preserve in-progress edits. Versioned SQL saves reject stale drafts.
      if (editing) return;
      void refresh().catch(error => setMessage((error as Error).message));
    };
    const channel = cms.channel('verified-office-banner-updates')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'taxpay_site_banners',
      }, sync)
      .subscribe();
    window.addEventListener('focus', sync);
    window.addEventListener('online', sync);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') sync();
    }, 30_000);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('online', sync);
      window.clearInterval(interval);
      void cms.removeChannel(channel);
    };
  }, [authState, editing]);

  useEffect(() => {
    // A delayed SQL read, role refresh or reconnect can replace the rows
    // while the user is editing. Never silently close the editor or discard
    // an unsaved draft unless the selected record actually changes.
    if (editing && draft?.id === selectedId) return;
    const index = banners.findIndex(row => row.id === selectedId);
    if (newDraft && newDraft.id === selectedId) {
      setDraft(newDraft);
      setDesiredPosition(banners.length + 1);
      setEditing(true);
    } else {
      setDraft(index >= 0 ? banners[index] : null);
      setDesiredPosition(Math.max(1, index + 1));
      setEditing(false);
    }
    setDesktopFile(null);
    setMobileFile(null);
    setCropTask(null);
  }, [banners, selectedId, newDraft, editing, draft?.id]);

  function addBanner() {
    const id = `banner_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const blank: Banner = {
      id, service_code: null, sort_order: banners.length, published: false,
      heading_en: '', heading_bn: '', description_en: '', description_bn: '',
      mobile_heading_en: '', mobile_heading_bn: '',
      mobile_description_en: '', mobile_description_bn: '', action_en: '', action_bn: '',
      desktop_image_path: null, mobile_image_path: null, version: 1,
      updated_at: new Date().toISOString(), updated_by: null,
    };
    setNewDraft(blank);
    setSelectedId(id);
    setMessage('');
  }

  function update(key: TextKey, value: string) {
    setDraft(current => current ? { ...current, [key]: value } : null);
  }

  function cancelEdit() {
    if (newDraft && newDraft.id === selectedId) {
      setNewDraft(null);
      setSelectedId(banners[0]?.id || null);
      setMessage('');
      return;
    }
    setDraft(banners.find(row => row.id === selectedId) || null);
    setDesiredPosition(Math.max(1, banners.findIndex(row => row.id === selectedId) + 1));
    setDesktopFile(null);
    setMobileFile(null);
    setCropTask(null);
    setEditing(false);
    setMessage('');
  }

  async function uploadImage(file: File, bannerId: string): Promise<string> {
    if (!cms || !authUid) throw new Error('Your Office session does not have content publishing permission.');
    if (!IMAGE_FILE_ACCEPT.includes(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      throw new Error('Select a cropped PNG or JPEG image up to 5 MB.');
    }
    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const key = `banners/${bannerId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await cms.storage.from('taxpay-banners').upload(key, file, {
      cacheControl: '3600', upsert: false, contentType: file.type,
    });
    if (error) throw error;
    return key;
  }

  async function cleanupUnusedImages(paths: string[]) {
    if (!cms || !paths.length) return;
    const { data, error } = await cms.from('taxpay_site_banners')
      .select('desktop_image_path, mobile_image_path');
    if (error) throw error;
    const unused = paths.filter(path => !(data || []).some(row =>
      row.desktop_image_path === path || row.mobile_image_path === path,
    ));
    if (!unused.length) return;
    const { error: cleanupError } = await cms.storage.from('taxpay-banners').remove(unused);
    if (cleanupError) throw cleanupError;
  }

  async function save() {
    if (!cms || !draft || !authUid || authState !== 'authorized' || busy) return;
    if (fields.some(field => !draft[field.key].trim() || (field.max && Array.from(draft[field.key]).length > field.max))) {
      setMessage('Complete English and Bangla fields within the mobile character limits.');
      return;
    }
    setBusy(true); setMessage('');
    const uploads: string[] = [];
    let committed = false;
    let publicVerified = false;
    let committedRow: Banner | null = null;
    try {
      let desktopPath = draft.desktop_image_path;
      let mobilePath = draft.mobile_image_path;
      if (desktopFile) { desktopPath = await uploadImage(desktopFile, draft.id); uploads.push(desktopPath); }
      if (mobileFile) { mobilePath = await uploadImage(mobileFile, draft.id); uploads.push(mobilePath); }
      // Validate freshly uploaded public images BEFORE a banner record references them.
      const publicCms = getTaxPayCmsPublicClient();
      if (!publicCms) throw new Error('Public TaxPay verification is not configured.');
      for (const path of uploads) await verifyPublicImage(publicCms, 'taxpay-banners', path);
      const isNew = newDraft?.id === draft.id;
      const payload = {
        id: draft.id,
        service_code: draft.service_code,
        heading_en: draft.heading_en,
        heading_bn: draft.heading_bn,
        description_en: draft.description_en,
        description_bn: draft.description_bn,
        mobile_heading_en: draft.mobile_heading_en,
        mobile_heading_bn: draft.mobile_heading_bn,
        mobile_description_en: draft.mobile_description_en,
        mobile_description_bn: draft.mobile_description_bn,
        action_en: draft.action_en,
        action_bn: draft.action_bn,
        desktop_image_path: desktopPath,
        mobile_image_path: mobilePath,
        published: draft.published,
      };
      const { data: saved, error } = await cms.rpc('taxpay_save_banner', {
        p_banner: payload,
        p_expected_version: isNew ? null : draft.version,
        p_position: desiredPosition,
      });
      if (error) throw error;
      // A successful RPC can have committed even if the follow-up read fails.
      // Never delete uploaded assets or retry an already committed write.
      committed = true;
      committedRow = saved as Banner | null;
      const matchesPayload = (value: Banner | null): value is Banner =>
        !!value && Object.entries(payload).every(([key, expected]) =>
          value[key as keyof Banner] === expected);
      const result = saved as Banner | null;
      if (!matchesPayload(result) || (!isNew && result.version <= draft.version)) {
        throw new Error('SQL returned an unexpected banner. Refresh to verify before editing again.');
      }
      // Independently read the committed row back through the same RLS-bound
      // client. Do not claim a public publish from a successful RPC alone.
      const persisted = (await refresh()).find(row => row.id === draft.id) || null;
      if (!matchesPayload(persisted) || persisted.version !== result.version ||
          persisted.sort_order !== desiredPosition - 1) {
        throw new Error('SQL read-back did not match the published banner. Refresh to verify.');
      }
      // Verify what an anonymous TaxPay visitor can read, not just Office RLS.
      const { data: publicRows, error: publicError } = await publicCms.from('taxpay_site_banners')
        .select('*').eq('published', true).order('sort_order', { ascending: true });
      if (publicError) throw new Error('Public TaxPay read-back failed: ' + publicError.message);
      const publicRow = (publicRows || []).find(row => row.id === draft.id) || null;
      if (draft.published
        ? !matchesPayload(publicRow as Banner | null) || publicRow?.version !== persisted.version ||
          publicRow?.sort_order !== persisted.sort_order
        : publicRow !== null) {
        throw new Error('Public TaxPay visibility does not match the committed SQL banner.');
      }
      if (draft.published) {
        // SQL path equality is not evidence that the public asset can load.
        for (const path of new Set([desktopPath, mobilePath].filter((value): value is string => !!value))) {
          await verifyPublicImage(publicCms, 'taxpay-banners', path);
        }
      }
      publicVerified = true;
      setNewDraft(null); setEditing(false); setDesktopFile(null); setMobileFile(null);
      const oldPaths = [draft.desktop_image_path, draft.mobile_image_path].filter(
        (path): path is string => !!path && ![desktopPath, mobilePath].includes(path),
      );
      await cleanupUnusedImages(oldPaths);
      setMessage(previous => previous || 'Saved to SQL; public TaxPay text and images verified.');
    } catch (error) {
      let cleanupFailed = false;
      if (!committed && uploads.length) {
        const { error: cleanupError } = await cms.storage.from('taxpay-banners').remove(uploads);
        cleanupFailed = !!cleanupError;
      }
      // A committed version must replace the stale editor version before retry.
      if (committedRow?.id) {
        setDraft(committedRow);
        setSelectedId(committedRow.id);
        setDesiredPosition(committedRow.sort_order + 1);
        setNewDraft(null);
      }
      setMessage(committed
        ? (publicVerified ? 'Published and public read-back verified; image cleanup incomplete: ' :
          'Saved in SQL, public verification incomplete: ') + (error as Error).message
        : (cleanupFailed ? 'Save failed; uploaded asset cleanup incomplete: ' : 'Save not completed: ') +
          (error as Error).message);
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!cms || !draft || !authUid || busy || banners.length <= 1 || draft.id === 'intro') return;
    setBusy(true); setMessage('');
    let removed = false;
    try {
      const { data, error } = await cms.from('taxpay_site_banners').delete()
        .eq('id', draft.id).eq('version', draft.version).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('This banner changed in another session. Reload before deleting.');
      removed = true;
      const paths = [draft.desktop_image_path, draft.mobile_image_path].filter((path): path is string => !!path);
      setNewDraft(null); setEditing(false);
      const remaining = await refresh();
      if (remaining.some(row => row.id === draft.id)) {
        throw new Error('Deleted banner remains visible in Office SQL read-back.');
      }
      const publicCms = getTaxPayCmsPublicClient();
      if (!publicCms) throw new Error('Public TaxPay read-back is not configured.');
      const { data: publicRow, error: publicError } = await publicCms.from('taxpay_site_banners')
        .select('id').eq('published', true).eq('id', draft.id).maybeSingle();
      if (publicError || publicRow) throw new Error('Public TaxPay still shows the removed banner.');
      await cleanupUnusedImages(paths);
      setMessage('Banner deletion verified in Office SQL and public TaxPay.');
    } catch (error) {
      setMessage((removed
        ? 'Banner deleted from SQL, but refresh or image cleanup failed: '
        : 'Delete not completed: ') + (error as Error).message);
    } finally { setBusy(false); }
  }
  const isNewBanner = !!draft && newDraft?.id === draft.id;
  const publishedCount = banners.filter(row => row.published).length;

  return <main className="cms-page">
    <header className="cms-page__heading">
      <div><h1>Content Management</h1><p>Manage TaxPay banner images, order and bilingual content.</p></div>
      <div className="cms-editor__header-actions">
        <button type="button" onClick={() => {
          if (editing && !window.confirm('Discard unsaved banner changes and refresh?')) return;
          void refresh().catch(err => setMessage((err as Error).message));
        }}>Refresh</button>
      </div>
    </header>
    {authState === 'checking' && !banners.length && <p role="status">Loading TaxPay content…</p>}
    {authState !== 'authorized' && authState !== 'checking' && <p className="cms-editor__note" role="status">You can edit and preview content here. To publish live changes, sign in to Office once with the password for your authorized Office account.</p>}
    <div className="tab-bar" role="tablist" aria-label="Content type">
      <button type="button" role="tab" aria-selected={tab === 'banners'} className={`tab-bar__tab${tab === 'banners' ? ' tab-bar__tab--active' : ''}`} onClick={() => setTab('banners')}>Banner</button>
      <button type="button" role="tab" aria-selected={tab === 'logo'} className={`tab-bar__tab${tab === 'logo' ? ' tab-bar__tab--active' : ''}`} onClick={() => setTab('logo')}>Site Logo</button>
    </div>
    {tab === 'logo' ? <SiteLogoPanel cms={cms} canPublish={authState === 'authorized'} /> : <div className="cms-layout">
        <section className="cms-panel cms-list" aria-label="Banner list">
          <div className="cms-panel__heading cms-list__heading"><h2>Banners <span className="cms-count">{banners.length}</span></h2><button type="button" className="cms-add-button" onClick={() => { if (!editing || window.confirm('Discard unsaved banner changes?')) addBanner(); }}><Plus size={16}/> Add banner</button></div>
          {banners.map((row, index) => <button key={row.id} type="button" className={`cms-banner-item${selectedId === row.id ? ' is-selected' : ''}`} onClick={() => { if (editing && row.id !== selectedId && !window.confirm('Discard unsaved banner changes?')) return; setNewDraft(null); setSelectedId(row.id); setEditing(false); }}>
            <span><strong>{row.heading_en}</strong><small>{row.service_code ? 'Service Banner' : 'Main Banner'} · Serial {index + 1}</small></span>
            <span className={`cms-status${row.published ? ' is-published' : ''}`}>{row.published ? 'Published' : 'Unpublished'}</span>
          </button>)}
          {isNewBanner && <div className="cms-banner-item is-selected"><span><strong>New banner</strong><small>Unsaved · Serial {desiredPosition}</small></span><span className="cms-status">Draft</span></div>}
        </section>
        {draft && <section className="cms-panel cms-editor" aria-label="Banner details">
          <div className="cms-panel__heading"><div><h2>{isNewBanner ? 'New Banner' : draft.service_code ? 'Service Banner' : 'Main Banner'}</h2><p>{draft.heading_en || 'Set banner images and bilingual content'}</p></div><div className="cms-editor__header-actions">{!isNewBanner && <span className="cms-status">v{draft.version}</span>}{!editing && <button type="button" className="cms-edit-button" onClick={() => { setEditing(true); setMessage(''); }}><Pencil size={16}/> Edit banner</button>}</div></div>
          <div className="cms-order-field"><div><label htmlFor="cms-banner-category">Banner category</label><small>Choose a main banner or a linked tax service</small></div>{editing && draft.id !== 'intro' ? <select id="cms-banner-category" value={draft.service_code || ''} onChange={event => setDraft(current => current ? { ...current, service_code: event.target.value || null } : null)}>{bannerCategories.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <strong>{draft.id === 'intro' ? 'Main banner (fixed)' : (bannerCategories.find(option => option.value === (draft.service_code || ''))?.label || 'Main banner')}</strong>}</div>
          <div className="cms-order-field"><div><label htmlFor="cms-banner-order">Banner serial</label><small>Published order in TaxPay</small></div>{editing ? <select id="cms-banner-order" value={desiredPosition} onChange={event => setDesiredPosition(Number(event.target.value))}>{Array.from({ length: banners.length + (isNewBanner ? 1 : 0) }, (_, index) => <option value={index + 1} key={index + 1}>#{index + 1}</option>)}</select> : <strong>#{desiredPosition}</strong>}</div>
          <div className="cms-image-grid">
            {(['desktop','mobile'] as const).map(device => {
              const path = device === 'desktop' ? draft.desktop_image_path : draft.mobile_image_path;
              const file = device === 'desktop' ? desktopFile : mobileFile;
              // Keep the unsaved preview and the published TaxPay carousel in
              // agreement: category controls the default, not the record ID.
              // Previously uploaded/cropped artwork remains authoritative.
              const preview = (editing && (device === 'desktop' ? desktopPreview : mobilePreview)) || imageUrl(path) || (device === 'mobile' ? imageUrl(draft.desktop_image_path) : null) || originalImageUrl(defaultBannerImageId(draft.service_code));
              return <div className={`cms-upload cms-upload--${device}`} key={device}>
                <h3>{device === 'desktop' ? 'Desktop image' : 'Mobile image'}</h3>
                {preview ? <img src={preview} alt={`${device} banner preview`} /> : <div className="cms-no-image"><ImagePlus size={26}/><p>No image selected</p></div>}
                {editing && file && <p>Cropped image ready: {file.name}</p>}
                {editing && <label className="cms-upload-label"><UploadCloud size={16}/> Upload / replace
                  <input type="file" accept={IMAGE_FILE_ACCEPT} disabled={busy} onChange={event => {
                    const picked = event.target.files?.[0];
                    event.target.value = '';
                    if (picked) { setMessage(''); setCropTask({ device, file: picked }); }
                  }} />
                </label>}
                {editing && (path || file) && <button type="button" className="cms-text-button" onClick={() => {
                  setDraft(current => current ? { ...current, [device === 'desktop' ? 'desktop_image_path' : 'mobile_image_path']: null } : null);
                  if (device === 'desktop') setDesktopFile(null);
                  else setMobileFile(null);
                }}>Remove image</button>}
                {editing && <p>PNG or JPEG · Desktop 2172 × 724 · Mobile 768 × 520 · Max 5 MB</p>}
              </div>;
            })}
          </div>
          <p className="cms-editor__note">{draft.service_code
            ? 'Taxpayer displays this service artwork while the visible left heading and payment actions remain fixed. This service heading and description are announced for accessibility. Only the Travel Tax action label changes the second visible button.'
            : draft.id === 'intro'
              ? 'This banner controls the Taxpayer homepage’s fixed left heading, description and primary payment button. The right illustration changes as other banners rotate.'
              : 'Only the original Main banner controls Taxpayer’s visible left copy. This additional uncategorized record rotates its illustration but does not replace the original Main heading.'}</p>
          <div className="cms-fields">{fields.map(field => <div className="cms-field" key={field.key}><label htmlFor={`cms-${field.key}`}>{field.label}</label>
            {editing ? (field.key.includes('description') ? <textarea id={`cms-${field.key}`} rows={2} maxLength={field.max} value={draft[field.key]} onChange={event => update(field.key, event.target.value)} /> :
              <input id={`cms-${field.key}`} maxLength={field.max} value={draft[field.key]} onChange={event => update(field.key, event.target.value)} />) :
              <p className="cms-readonly-value">{draft[field.key]}</p>}
            {field.max && <small>{Array.from(draft[field.key]).length}/{field.max} characters · one line on mobile</small>}
          </div>)}</div>
          {editing && authState !== 'authorized' && <p role="status" className="cms-editor__note">This is an unpublished preview. Publishing requires an Office sign-in with a valid account password and publishing permission.</p>}
          {editing && <div className="cms-actions">
            <div className="cms-actions__secondary"><div className="cms-publish-control"><span>Publish</span><button type="button" role="switch" aria-label="Publish banner" aria-checked={draft.published} className={`cms-switch${draft.published ? ' is-on' : ''}`} disabled={busy || draft.id === 'intro' || (draft.published && !isNewBanner && publishedCount <= 1)} onClick={() => setDraft(current => current ? { ...current, published: !current.published } : null)}><span/></button><strong>{draft.published ? 'Published' : 'Unpublished'}</strong></div>
              {!isNewBanner && draft.id !== 'intro' && <button type="button" className="cms-danger" disabled={busy || banners.length <= 1 || (draft.published && publishedCount <= 1)} onClick={() => setDeleteRequested(true)}><Trash2 size={16}/> Remove banner</button>}</div>
            <div className="cms-actions__main"><button type="button" className="cms-primary" disabled={busy || authState !== 'authorized'} onClick={() => void save()}><Save size={16}/> {busy ? 'Saving…' : authState !== 'authorized' ? 'Publish to TaxPay' : isNewBanner ? 'Save banner' : 'Save changes'}</button><button type="button" disabled={busy} onClick={cancelEdit}>Cancel</button></div>
          </div>}
        </section>}
      </div>}
    {message && <p className="cms-message" role="status">{message}</p>}
    {deleteRequested && draft && <SConfirmModal
      title="Remove banner"
      message={`Delete “${draft.heading_en}” from shared SQL and public TaxPay? This cannot be undone.`}
      confirmLabel="Delete banner"
      danger
      onClose={() => setDeleteRequested(false)}
      onConfirm={() => { setDeleteRequested(false); void remove(); }}
    />}
    {cropTask && <ImageCropDialog key={`${cropTask.device}-${cropTask.file.name}-${cropTask.file.lastModified}`} file={cropTask.file}
      title={`${cropTask.device} banner`} outputWidth={cropTask.device === 'desktop' ? 2172 : 768}
      outputHeight={cropTask.device === 'desktop' ? 724 : 520} onCancel={() => setCropTask(null)} onApply={cropped => {
        if (cropTask.device === 'desktop') setDesktopFile(cropped);
        else setMobileFile(cropped);
        setCropTask(null);
      }} />}
  </main>;
}
