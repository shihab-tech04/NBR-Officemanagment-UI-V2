import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Pencil, RefreshCcw, Save, UploadCloud } from 'lucide-react';

type SiteLogoRecord = {
  id: 'primary'; image_path: string | null; image_width: number | null;
  image_height: number | null; version: number; updated_at: string;
};
type LogoFile = { file: File; width: number; height: number };

const fallbackLogo = 'https://raw.githubusercontent.com/shihab-tech04/nbr-taxpay/main/src/assets/amar-kor-wordmark-no-wave-20261018.png';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const acceptedTypes = ['image/png', 'image/jpeg', 'image/webp'];

function liveLogoUrl(cms: SupabaseClient, path: string | null) {
  return path ? cms.storage.from('taxpay-branding').getPublicUrl(path).data.publicUrl : fallbackLogo;
}

async function readImage(file: File): Promise<LogoFile> {
  if (!acceptedTypes.includes(file.type) || file.size > MAX_FILE_BYTES)
    throw new Error('Select a PNG, JPG, or WebP image no larger than 5 MB.');
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  bitmap.close();
  if (width < 600 || width > 6000 || height < 120 || height > 2000 || width / height < 3.5 || width / height > 6.5)
    throw new Error('Use a horizontal wordmark, 600–6000 px wide, 120–2000 px tall, with a ratio between 3.5:1 and 6.5:1.');
  return { file, width, height };
}

export function SiteLogoPanel({ cms, officeUserId }: { cms: SupabaseClient | null; officeUserId: string | null }) {
  const [record, setRecord] = useState<SiteLogoRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<LogoFile | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    if (!cms) return;
    const { data, error } = await cms.from('taxpay_site_logo').select('*').eq('id', 'primary').single();
    if (error) throw error;
    setRecord(data as SiteLogoRecord);
  }, [cms]);

  useEffect(() => {
    void refresh().catch(error => setMessage((error as Error).message));
    if (!cms) return;
    const channel = cms.channel('taxpay-site-logo-office')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'taxpay_site_logo' },
        () => { void refresh().catch(() => {}); }).subscribe();
    const onFocus = () => { void refresh().catch(() => {}); };
    window.addEventListener('focus', onFocus);
    return () => { window.removeEventListener('focus', onFocus); void cms.removeChannel(channel); };
  }, [cms, refresh]);

  useEffect(() => {
    if (!selected) { setPendingUrl(null); return; }
    const url = URL.createObjectURL(selected.file);
    setPendingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selected]);

  function cancel() {
    setSelected(null);
    setEditing(false);
    setMessage('');
  }

  async function choose(file: File | null) {
    setMessage('');
    setSelected(null);
    if (!file) return;
    try { setSelected(await readImage(file)); }
    catch (error) { setMessage((error as Error).message); }
  }

  async function save() {
    if (!cms || !record || !selected || busy) return;
    if (officeUserId !== 'admin') { setMessage('Sign in as admin from the main Office login.'); return; }
    setBusy(true);
    setMessage('');
    try {
      // Immutable paths make the public CDN switch atomically when SQL updates.
      const extension = selected.file.type === 'image/png' ? 'png' : selected.file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `logos/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await cms.storage.from('taxpay-branding').upload(path, selected.file, {
        contentType: selected.file.type, cacheControl: '31536000', upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data, error } = await cms.from('taxpay_site_logo').update({
        image_path: path, image_width: selected.width, image_height: selected.height,
      }).eq('id', 'primary').eq('version', record.version).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('The logo changed elsewhere. Refresh and review it before saving again.');
      await refresh();
      setSelected(null);
      setEditing(false);
      setMessage('Logo saved. The public TaxPay portal now reads this version from SQL.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  const currentUrl = record && cms ? liveLogoUrl(cms, record.image_path) : fallbackLogo;
  const displayUrl = editing && pendingUrl ? pendingUrl : currentUrl;
  const dimensions = editing && selected
    ? `${selected.width} × ${selected.height} px (new)`
    : `${record?.image_width ?? 2150} × ${record?.image_height ?? 440} px`;

  return <section className="cms-panel cms-logo" aria-label="Site Logo">
    <div className="cms-panel__heading">
      <div><h2>Site Logo</h2><p>The same logo appears in the public header, footer, and taxpayer navigation.</p></div>
      <div className="cms-editor__header-actions">
        <button type="button" aria-label="Refresh site logo" title="Refresh" onClick={() => void refresh().catch(error => setMessage((error as Error).message))}><RefreshCcw size={17}/></button>
        {record && !editing && <button type="button" className="cms-edit-button" onClick={() => { setEditing(true); setMessage(''); }}><Pencil size={16}/> Edit logo</button>}
      </div>
    </div>
    {!cms ? <p>Content service configuration is unavailable.</p> : <>
      <div className="cms-logo__canvas">
        <h3>{editing && selected ? 'New logo preview' : 'Current published logo'}</h3>
        <div className="cms-logo__image"><img src={displayUrl} alt="Amar Kor site logo preview" /></div>
        <p>Source image: {dimensions}</p>
      </div>
      <div className="cms-logo__placement-grid">
        <div className="cms-logo__placement"><h3>Desktop header</h3><div className="cms-logo__slot cms-logo__slot--desktop"><img src={displayUrl} alt="Desktop header logo preview" /></div><p>154 × 52 px slot</p></div>
        <div className="cms-logo__placement"><h3>Mobile header</h3><div className="cms-logo__slot cms-logo__slot--mobile"><img src={displayUrl} alt="Mobile header logo preview" /></div><p>122 × 42 px slot</p></div>
        <div className="cms-logo__placement"><h3>Taxpayer sidebar</h3><div className="cms-logo__slot cms-logo__slot--sidebar"><img src={displayUrl} alt="Taxpayer sidebar logo preview" /></div><p>164 × 58 px slot</p></div>
      </div>
      {editing && <>
        <div className="cms-logo__upload-area">
          <label className="cms-upload-label"><UploadCloud size={16}/> Upload / replace logo
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => void choose(event.target.files?.[0] || null)} />
          </label>
          <p>Recommended: transparent PNG or WebP, 2150 × 440 px. Accepted ratio 3.5:1–6.5:1; max 5 MB. The current blue design remains until you save.</p>
        </div>
        <div className="cms-actions"><div className="cms-actions__main">
          <button type="button" className="cms-primary" disabled={busy || !selected} onClick={() => void save()}><Save size={16}/> Save changes</button>
          <button type="button" disabled={busy} onClick={cancel}>Cancel</button>
        </div></div>
      </>}
    </>}
    {message && <p className="cms-message" role="status">{message}</p>}
  </section>;
}
