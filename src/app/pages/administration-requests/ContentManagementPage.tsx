import { useEffect, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import { ImagePlus, Pencil, Plus, Save, Trash2, UploadCloud } from 'lucide-react';
import '../../../styles/content-management.css';
import { SiteLogoPanel } from './SiteLogoPanel';
import { ImageCropDialog } from './ImageCropDialog';
import { IMAGE_FILE_ACCEPT, isSupportedImageType, MAX_IMAGE_BYTES } from './imageCrop';
import { useImagePreview } from './useImagePreview';

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

const backendUrl = import.meta.env.VITE_TAXPAY_CMS_SUPABASE_URL;
const backendKey = import.meta.env.VITE_TAXPAY_CMS_SUPABASE_PUBLISHABLE_KEY;
const cms: SupabaseClient | null = backendUrl && backendKey
  ? createClient(backendUrl, backendKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;

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
  return path && cms ? cms.storage.from('taxpay-banners').getPublicUrl(path).data.publicUrl : null;
}

const originalImages: Record<string, string> = {
  intro: 'taxpay-hero-payment-v3.webp',
  return: 'taxpay-hero-return-v3.webp',
  advance: 'taxpay-hero-advance-v3.webp',
  withholding: 'taxpay-hero-withholding-v3.webp',
  travel: 'taxpay-hero-travel-v6.webp',
};
function originalImageUrl(id: string) {
  return originalImages[id] ? `https://raw.githubusercontent.com/shihab-tech04/nbr-taxpay/main/src/assets/${originalImages[id]}` : null;
}

export function ContentManagementPage() {
  const [tab, setTab] = useState<'banners' | 'logo'>('banners');
  const officeUserId = useSelector((state: RootState) => state.auth.userId);
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

  const refresh = async () => {
    if (!cms) return;
    const { data, error } = await cms.from('taxpay_site_banners').select('*').order('sort_order').order('id');
    if (error) throw error;
    const next = (data || []) as Banner[];
    setBanners(next);
    setSelectedId(id => id && next.some(row => row.id === id) ? id : next[0]?.id || null);
  };

  useEffect(() => {
    void refresh().catch(err => setMessage(err.message));
  }, []);

  useEffect(() => {
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
  }, [banners, selectedId, newDraft]);

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

  async function upload(file: File, id: string, device: 'desktop' | 'mobile') {
    if (!cms) throw new Error('Storage is unavailable.');
    if (!isSupportedImageType(file))
      throw new Error(`Upload a PNG, JPG, or JPEG image no larger than ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`);
    const extension = file.type === 'image/png' ? 'png' : 'jpg';
    const path = `${id}/${device}-${crypto.randomUUID()}.${extension}`;
    const { error } = await cms.storage.from('taxpay-banners').upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  }

  async function save() {
    if (!cms || !draft || busy) return;
    if (officeUserId !== 'admin') { setMessage('Sign in as admin from the main Office login.'); return; }
    if (fields.some(field => !draft[field.key].trim() || (field.max && Array.from(draft[field.key]).length > field.max))) {
      setMessage('Complete all English and Bangla fields within the mobile character limits.');
      return;
    }
    setBusy(true); setMessage('');
    try {
      const current = banners.find(row => row.id === draft.id);
      const isNew = !current && newDraft?.id === draft.id;
      if (!isNew && (!current || current.version !== draft.version)) throw new Error('The banner changed. Refresh before saving.');
      const desktop = desktopFile ? await upload(desktopFile, draft.id, 'desktop') : draft.desktop_image_path;
      const mobile = mobileFile ? await upload(mobileFile, draft.id, 'mobile') : draft.mobile_image_path;
      const payload = Object.fromEntries(fields.map(field => [field.key, draft[field.key]]));
      const values = {
        ...payload, service_code: draft.service_code, desktop_image_path: desktop, mobile_image_path: mobile,
        published: draft.published, updated_by: null,
      };
      const { data, error } = isNew
        ? await cms.from('taxpay_site_banners').insert({ id: draft.id, sort_order: banners.length, ...values }).select('id').maybeSingle()
        : await cms.from('taxpay_site_banners').update(values).eq('id', draft.id).eq('version', draft.version).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A newer edit was published. Refresh and review it before retrying.');
      if (isNew || desiredPosition !== banners.findIndex(row => row.id === draft.id) + 1) {
        const { error: orderError } = await cms.rpc('taxpay_set_banner_position', {
          p_banner_id: draft.id, p_position: desiredPosition,
        });
        if (orderError) throw new Error(`Banner saved, but serial update failed: ${orderError.message}`);
      }
      setNewDraft(null);
      setSelectedId(draft.id);
      await refresh();
      setEditing(false);
      setMessage(isNew ? 'New banner added to the shared TaxPay catalog.' : 'Banner changes saved to TaxPay.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!cms || !draft || busy) return;
    if (officeUserId !== 'admin') { setMessage('Sign in as admin from the main Office login.'); return; }
    if (!window.confirm(`Remove ${draft.heading_en}? This will remove it from the public carousel.`)) return;
    setBusy(true); setMessage('');
    try {
      const { data, error } = await cms.from('taxpay_site_banners').delete()
        .eq('id', draft.id).eq('version', draft.version).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('This banner changed. Refresh and try again.');
      await refresh();
      setMessage('Banner removed from the shared database. Its change history is preserved.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  const isNewBanner = !!draft && newDraft?.id === draft.id;
  const publishedCount = banners.filter(row => row.published).length;

  return <main className="cms-page">
    <header className="cms-page__heading">
      <div><h1>Content Management</h1><p>Manage content shown on the public TaxPay website.</p></div>
    </header>
    <div className="tab-bar" role="tablist" aria-label="Content type">
      <button type="button" role="tab" aria-selected={tab === 'banners'} className={`tab-bar__tab${tab === 'banners' ? ' tab-bar__tab--active' : ''}`} onClick={() => setTab('banners')}>Banner</button>
      <button type="button" role="tab" aria-selected={tab === 'logo'} className={`tab-bar__tab${tab === 'logo' ? ' tab-bar__tab--active' : ''}`} onClick={() => setTab('logo')}>Site Logo</button>
    </div>
    {tab === 'logo' ? <SiteLogoPanel cms={cms} officeUserId={officeUserId} /> : !cms ?
      <section className="cms-panel"><p>Content service configuration is unavailable. Publishing is disabled.</p></section> : <div className="cms-layout">
        <section className="cms-panel cms-list" aria-label="Banner list">
          <div className="cms-panel__heading cms-list__heading"><h2>Banners <span className="cms-count">{banners.length}</span></h2><button type="button" className="cms-add-button" onClick={addBanner}><Plus size={16}/> Add banner</button></div>
          {banners.map((row, index) => <button key={row.id} type="button" className={`cms-banner-item${selectedId === row.id ? ' is-selected' : ''}`} onClick={() => { setNewDraft(null); setSelectedId(row.id); setEditing(false); }}>
            <span><strong>{row.heading_en}</strong><small>{row.service_code ? 'Service Banner' : 'Main Banner'} · Serial {index + 1}</small></span>
            <span className={`cms-status${row.published ? ' is-published' : ''}`}>{row.published ? 'Published' : 'Unpublished'}</span>
          </button>)}
          {isNewBanner && <div className="cms-banner-item is-selected"><span><strong>New banner</strong><small>Unsaved · Serial {desiredPosition}</small></span><span className="cms-status">Draft</span></div>}
        </section>
        {draft && <section className="cms-panel cms-editor" aria-label="Banner details">
          <div className="cms-panel__heading"><div><h2>{isNewBanner ? 'New Banner' : draft.service_code ? 'Service Banner' : 'Main Banner'}</h2><p>{draft.heading_en || 'Set banner images and bilingual content'}</p></div><div className="cms-editor__header-actions">{!isNewBanner && <span className="cms-status">v{draft.version}</span>}{!editing && <button type="button" className="cms-edit-button" onClick={() => { setEditing(true); setMessage(''); }}><Pencil size={16}/> Edit banner</button>}</div></div>
          <div className="cms-order-field"><div><label htmlFor="cms-banner-category">Banner category</label><small>Choose a main banner or a linked tax service</small></div>{editing ? <select id="cms-banner-category" value={draft.service_code || ''} onChange={event => setDraft(current => current ? { ...current, service_code: event.target.value || null } : null)}>{bannerCategories.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <strong>{bannerCategories.find(option => option.value === (draft.service_code || ''))?.label || 'Main banner'}</strong>}</div>
          <div className="cms-order-field"><div><label htmlFor="cms-banner-order">Banner serial</label><small>Controls the display order on TaxPay</small></div>{editing ? <select id="cms-banner-order" value={desiredPosition} onChange={event => setDesiredPosition(Number(event.target.value))}>{Array.from({ length: banners.length + (isNewBanner ? 1 : 0) }, (_, index) => <option value={index + 1} key={index + 1}>#{index + 1}</option>)}</select> : <strong>#{desiredPosition}</strong>}</div>
          <div className="cms-image-grid">
            {(['desktop','mobile'] as const).map(device => {
              const path = device === 'desktop' ? draft.desktop_image_path : draft.mobile_image_path;
              const file = device === 'desktop' ? desktopFile : mobileFile;
              const preview = (editing && (device === 'desktop' ? desktopPreview : mobilePreview)) || imageUrl(path) || (device === 'mobile' ? imageUrl(draft.desktop_image_path) : null) || originalImageUrl(draft.id);
              return <div className="cms-upload" key={device}>
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
                {editing && <p>PNG, JPG or JPEG · Crop before saving · Max 5 MB</p>}
              </div>;
            })}
          </div>
          <div className="cms-fields">{fields.map(field => <div className="cms-field" key={field.key}><label htmlFor={`cms-${field.key}`}>{field.label}</label>
            {editing ? (field.key.includes('description') ? <textarea id={`cms-${field.key}`} rows={2} maxLength={field.max} value={draft[field.key]} onChange={event => update(field.key, event.target.value)} /> :
              <input id={`cms-${field.key}`} maxLength={field.max} value={draft[field.key]} onChange={event => update(field.key, event.target.value)} />) :
              <p className="cms-readonly-value">{draft[field.key]}</p>}
            {field.max && <small>{Array.from(draft[field.key]).length}/{field.max} characters · one line on mobile</small>}
          </div>)}</div>
          {editing && <div className="cms-actions">
            <div className="cms-actions__secondary"><div className="cms-publish-control"><span>Publish</span><button type="button" role="switch" aria-label="Publish banner" aria-checked={draft.published} className={`cms-switch${draft.published ? ' is-on' : ''}`} disabled={busy || (draft.published && !isNewBanner && publishedCount <= 1)} onClick={() => setDraft(current => current ? { ...current, published: !current.published } : null)}><span/></button><strong>{draft.published ? 'Published' : 'Unpublished'}</strong></div>
              {!isNewBanner && <button type="button" className="cms-danger" disabled={busy || banners.length <= 1 || (draft.published && publishedCount <= 1)} onClick={() => void remove()}><Trash2 size={16}/> Remove banner</button>}</div>
            <div className="cms-actions__main"><button type="button" className="cms-primary" disabled={busy} onClick={() => void save()}><Save size={16}/> {isNewBanner ? 'Save banner' : 'Save changes'}</button><button type="button" disabled={busy} onClick={cancelEdit}>Cancel</button></div>
          </div>}
        </section>}
      </div>}
    {message && <p className="cms-message" role="status">{message}</p>}
    {cropTask && <ImageCropDialog key={`${cropTask.device}-${cropTask.file.name}-${cropTask.file.lastModified}`} file={cropTask.file}
      title={`${cropTask.device} banner`} outputWidth={cropTask.device === 'desktop' ? 1600 : 1200}
      outputHeight={800} onCancel={() => setCropTask(null)} onApply={cropped => {
        if (cropTask.device === 'desktop') setDesktopFile(cropped);
        else setMobileFile(cropped);
        setCropTask(null);
      }} />}
  </main>;
}
