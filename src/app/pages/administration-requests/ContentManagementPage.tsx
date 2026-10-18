import { useEffect, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import { ImagePlus, RefreshCcw, Save, Trash2, UploadCloud } from 'lucide-react';
import '../../../styles/content-management.css';

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
  const [desktopFile, setDesktopFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    if (!cms) return;
    const { data, error } = await cms.from('taxpay_site_banners').select('*').order('sort_order');
    if (error) throw error;
    const next = (data || []) as Banner[];
    setBanners(next);
    setSelectedId(id => id && next.some(row => row.id === id) ? id : next[0]?.id || null);
  };

  useEffect(() => {
    void refresh().catch(err => setMessage(err.message));
  }, []);

  useEffect(() => {
    setDraft(banners.find(row => row.id === selectedId) || null);
    setDesktopFile(null);
    setMobileFile(null);
  }, [banners, selectedId]);

  function update(key: TextKey, value: string) {
    setDraft(current => current ? { ...current, [key]: value } : null);
  }

  async function upload(file: File, id: string, device: 'desktop' | 'mobile') {
    if (!cms) throw new Error('Storage is unavailable.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
      throw new Error('Upload a JPG, PNG, or WebP image of 5 MB or less.');
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${id}/${device}-${crypto.randomUUID()}.${extension}`;
    const { error } = await cms.storage.from('taxpay-banners').upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  }

  async function save(publish?: boolean) {
    if (!cms || !draft || busy) return;
    if (officeUserId !== 'admin') { setMessage('Sign in as admin from the main Office login.'); return; }
    if (fields.some(field => !draft[field.key].trim() || (field.max && Array.from(draft[field.key]).length > field.max))) {
      setMessage('Complete all English and Bangla fields within the mobile character limits.');
      return;
    }
    setBusy(true); setMessage('');
    try {
      const current = banners.find(row => row.id === draft.id);
      if (!current || current.version !== draft.version) throw new Error('The banner changed. Refresh before saving.');
      const desktop = desktopFile ? await upload(desktopFile, draft.id, 'desktop') : draft.desktop_image_path;
      const mobile = mobileFile ? await upload(mobileFile, draft.id, 'mobile') : draft.mobile_image_path;
      const payload = Object.fromEntries(fields.map(field => [field.key, draft[field.key]]));
      const { data, error } = await cms.from('taxpay_site_banners').update({ ...payload,
        desktop_image_path: desktop, mobile_image_path: mobile,
        published: publish ?? draft.published, updated_by: null,
      }).eq('id', draft.id).eq('version', draft.version).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A newer edit was published. Refresh and review it before retrying.');
      await refresh();
      setMessage('Saved to the shared banner database and read back successfully.');
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

  return <main className="cms-page">
    <header className="cms-page__heading">
      <div><h1>Content Management</h1><p>Manage content shown on the public TaxPay website.</p></div>
    </header>
    <div className="tab-bar" role="tablist" aria-label="Content type">
      <button type="button" role="tab" aria-selected={tab === 'banners'} className={`tab-bar__tab${tab === 'banners' ? ' tab-bar__tab--active' : ''}`} onClick={() => setTab('banners')}>Banner</button>
      <button type="button" role="tab" aria-selected={tab === 'logo'} className={`tab-bar__tab${tab === 'logo' ? ' tab-bar__tab--active' : ''}`} onClick={() => setTab('logo')}>Site Logo</button>
    </div>
    {tab === 'logo' ? <section className="cms-panel"><h2>Site Logo</h2><p>Logo management will be developed in the next phase.</p></section> : !cms ?
      <section className="cms-panel"><p>Content service configuration is unavailable. Publishing is disabled.</p></section> : <div className="cms-layout">
        <section className="cms-panel cms-list" aria-label="Banner list">
          <div className="cms-panel__heading"><h2>Banners</h2><button type="button" aria-label="Refresh banners" onClick={() => void refresh().catch(err => setMessage(err.message))}><RefreshCcw size={18}/></button></div>
          {banners.map(row => <button key={row.id} type="button" className={`cms-banner-item${selectedId === row.id ? ' is-selected' : ''}`} onClick={() => setSelectedId(row.id)}>
            <span><strong>{row.heading_en}</strong><small>{row.id === 'intro' ? 'Main Banner' : 'Service Banner'} · #{row.sort_order + 1}</small></span>
            <span className={`cms-status${row.published ? ' is-published' : ''}`}>{row.published ? 'Published' : 'Unpublished'}</span>
          </button>)}
        </section>
        {draft && <section className="cms-panel cms-editor" aria-label="Edit banner">
          <div className="cms-panel__heading"><div><h2>{draft.id === 'intro' ? 'Main Banner' : 'Service Banner'}</h2><p>{draft.heading_en}</p></div><span className="cms-status">v{draft.version}</span></div>
          <div className="cms-image-grid">
            {(['desktop','mobile'] as const).map(device => {
              const path = device === 'desktop' ? draft.desktop_image_path : draft.mobile_image_path;
              const file = device === 'desktop' ? desktopFile : mobileFile;
              const preview = imageUrl(path) || (device === 'mobile' ? imageUrl(draft.desktop_image_path) : null) || originalImageUrl(draft.id);
              return <div className="cms-upload" key={device}>
                <h3>{device === 'desktop' ? 'Desktop image' : 'Mobile image'}</h3>
                {preview ? <img src={preview} alt={`${device} banner preview`} /> : <div className="cms-no-image"><ImagePlus size={26}/><p>No image selected</p></div>}
                {file && <p>New image selected: {file.name}</p>}
                <label className="cms-upload-label"><UploadCloud size={16}/> Upload / replace
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => device === 'desktop' ? setDesktopFile(event.target.files?.[0] || null) : setMobileFile(event.target.files?.[0] || null)} />
                </label>
                {path && <button type="button" className="cms-text-button" onClick={() => setDraft(current => current ? { ...current, [device === 'desktop' ? 'desktop_image_path' : 'mobile_image_path']: null } : null)}>Remove image</button>}
                <p>JPG, PNG or WebP · Max 5 MB</p>
              </div>;
            })}
          </div>
          <div className="cms-fields">{fields.map(field => <label key={field.key}>{field.label}
            {field.key.includes('description') ? <textarea rows={2} maxLength={field.max} value={draft[field.key]} onChange={event => update(field.key, event.target.value)} /> :
              <input maxLength={field.max} value={draft[field.key]} onChange={event => update(field.key, event.target.value)} />}
            {field.max && <small>{Array.from(draft[field.key]).length}/{field.max} characters · one line on mobile</small>}
          </label>)}</div>
          <div className="cms-actions">
            <button type="button" className="cms-danger" disabled={busy} onClick={() => void remove()}><Trash2 size={16}/> Remove banner</button>
            <div><button type="button" disabled={busy} onClick={() => void save()}><Save size={16}/> Save changes</button>
              <button type="button" className="cms-primary" disabled={busy} onClick={() => void save(!draft.published)}>{draft.published ? 'Unpublish' : 'Publish'}</button></div>
          </div>
        </section>}
      </div>}
    {message && <p className="cms-message" role="status">{message}</p>}
  </main>;
}
