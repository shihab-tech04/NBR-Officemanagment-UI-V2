import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTaxPayCmsPublicClient } from '../../services/taxpayCmsClient';
import { verifyPublicImage } from './verifyPublicImage';
import { SConfirmModal } from '../../components/modals/SConfirmModal';
import { Pencil, RefreshCcw, Save, UploadCloud } from 'lucide-react';
import { ImageCropDialog } from './ImageCropDialog';
import { IMAGE_FILE_ACCEPT, isSupportedImageType } from './imageCrop';
import fallbackLogo from '../../../assets/korbritto-brand-locked.svg';

type SiteLogoRecord = {
  id: 'primary'; image_path: string | null; image_width: number | null;
  image_height: number | null; version: number; updated_at: string;
};
type LogoFile = { file: File; width: number; height: number };


function liveLogoUrl(cms: SupabaseClient, path: string | null) {
  return path ? cms.storage.from('taxpay-branding').getPublicUrl(path).data.publicUrl : fallbackLogo;
}

export function SiteLogoPanel({ cms, canPublish = false }: { cms: SupabaseClient | null; canPublish?: boolean }) {
  const [record, setRecord] = useState<SiteLogoRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<LogoFile | null>(null);
  const [cropSource, setCropSource] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [restoreRequested, setRestoreRequested] = useState(false);

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
    setCropSource(null);
    setEditing(false);
    setRestoreRequested(false);
    setMessage('');
  }

  function choose(file: File | null) {
    setMessage('');
    if (!file) return;
    setCropSource(file);
  }

  async function save() {
    if (busy || !selected || !cms || !record) return;
    if (!canPublish) {
      setMessage('Logo was not published. Use your existing Office sign-in with a valid account password and publishing permission.');
      return;
    }
    if (!isSupportedImageType(selected.file)) {
      setMessage('Only PNG, JPG or JPEG files up to 5 MB are accepted.');
      return;
    }
    setBusy(true);
    setMessage('');
    let committed = false;
    let uploadedPath: string | null = null;
    try {
      const ext = selected.file.type === 'image/png' ? 'png' : 'jpg';
      // Matches the existing administrator-only Storage INSERT policy.
      uploadedPath = `logos/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await cms.storage.from('taxpay-branding').upload(
        uploadedPath, selected.file,
        { upsert: false, cacheControl: '3600', contentType: selected.file.type },
      );
      if (uploadError) throw uploadError;
      // A successful Storage INSERT does not prove anonymous image delivery.
      const publicCms = getTaxPayCmsPublicClient();
      if (!publicCms) throw new Error('Public logo verification is not configured.');
      await verifyPublicImage(publicCms, 'taxpay-branding', uploadedPath);

      const { data: saved, error: writeError } = await cms.from('taxpay_site_logo')
        .update({ image_path: uploadedPath, image_width: selected.width, image_height: selected.height })
        .eq('id', 'primary').eq('version', record.version)
        .select('id,image_path,image_width,image_height,version,updated_at').maybeSingle();
      if (writeError) throw writeError;
      if (!saved || saved.image_path !== uploadedPath || saved.version !== record.version + 1) {
        throw new Error('Logo changed in another session or SQL publishing access was denied. Refresh before retrying.');
      }
      committed = true;
      // Read-back verifies that a successful HTTP write actually persisted to SQL.
      const { data: confirmed, error: readError } = await cms.from('taxpay_site_logo')
        .select('id,image_path,image_width,image_height,version,updated_at')
        .eq('id', 'primary').single();
      if (readError || !confirmed || confirmed.image_path !== uploadedPath ||
          confirmed.version !== saved.version) {
        setRecord(saved as SiteLogoRecord);
        throw new Error('Logo was saved to SQL but read-back verification failed. Refresh to verify.');
      }
      // Verify with the same anonymous visibility as the public TaxPay logo.
      const { data: publicLogo, error: publicError } = await publicCms.from('taxpay_site_logo')
        .select('image_path,image_width,image_height,version').eq('id', 'primary').single();
      if (publicError || !publicLogo || publicLogo.image_path !== uploadedPath ||
          publicLogo.image_width !== selected.width || publicLogo.image_height !== selected.height ||
          publicLogo.version !== confirmed.version) {
        throw new Error('Public TaxPay logo does not match the committed SQL version.');
      }
      setRecord(confirmed as SiteLogoRecord);
      setSelected(null);
      setEditing(false);
      const priorPath = record.image_path;
      if (priorPath && priorPath !== uploadedPath) {
        const { error: removeError } = await cms.storage.from('taxpay-branding').remove([priorPath]);
        setMessage(removeError
          ? 'Logo published and verified; previous image cleanup is incomplete.'
          : 'Logo saved to SQL, verified in public TaxPay and previous image replaced.');
      } else {
        setMessage('Logo saved to SQL and verified in the public TaxPay logo feed.');
      }
    } catch (error) {
      if (!committed && uploadedPath) {
        const { error: cleanupError } = await cms.storage.from('taxpay-branding').remove([uploadedPath]);
        if (cleanupError) setMessage('Logo not published; uploaded image cleanup could not complete: ' + (error as Error).message);
      }
      if (committed) void refresh().catch(() => {});
      setMessage(current => current || (committed ? 'Logo saved to SQL; public verification incomplete: ' : 'Logo not published: ') +
        (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restoreOriginal() {
    if (!cms || !record?.image_path || !canPublish || busy) return;
    setRestoreRequested(false);
    setBusy(true);
    setMessage('');
    let committed = false;
    try {
      const oldPath = record.image_path;
      const { data: saved, error: writeError } = await cms.from('taxpay_site_logo')
        .update({ image_path: null, image_width: null, image_height: null })
        .eq('id', 'primary').eq('version', record.version)
        .select('id,image_path,image_width,image_height,version,updated_at').maybeSingle();
      if (writeError) throw writeError;
      if (!saved || saved.image_path !== null || saved.version !== record.version + 1)
        throw new Error('Logo changed in another session. Refresh before restoring.');
      committed = true;
      const { data: confirmed, error: readError } = await cms.from('taxpay_site_logo')
        .select('id,image_path,image_width,image_height,version,updated_at')
        .eq('id', 'primary').single();
      const publicCms = getTaxPayCmsPublicClient();
      if (!publicCms) throw new Error('Public logo verification is not configured.');
      const { data: publicLogo, error: publicError } = await publicCms.from('taxpay_site_logo')
        .select('image_path,image_width,image_height,version').eq('id', 'primary').single();
      if (readError || !confirmed || confirmed.image_path !== null ||
          confirmed.version !== saved.version || publicError || !publicLogo ||
          publicLogo.image_path !== null || publicLogo.version !== saved.version)
        throw new Error('Public restore read-back is incomplete.');
      setRecord(confirmed as SiteLogoRecord);
      setSelected(null);
      setEditing(false);
      const { error: cleanupError } = await cms.storage.from('taxpay-branding').remove([oldPath]);
      setMessage(cleanupError
        ? 'Original Korbritto logo restored and verified; old image cleanup incomplete.'
        : 'Original Korbritto logo restored and verified on public TaxPay.');
    } catch (error) {
      if (committed) void refresh().catch(() => {});
      setMessage((committed ? 'Logo restored in SQL; public verification incomplete: ' : 'Logo not restored: ') +
        (error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const currentUrl = record && cms ? liveLogoUrl(cms, record.image_path) : fallbackLogo;
  const displayUrl = editing && pendingUrl ? pendingUrl : currentUrl;
  const dimensions = editing && selected
    ? `${selected.width} × ${selected.height} px (new)`
    : record?.image_path ? `${record.image_width ?? '—'} × ${record.image_height ?? '—'} px`
      : 'Current Korbritto brand (1469 × 496 px)';

  return <section className="cms-panel cms-logo" aria-label="Site Logo">
    <div className="cms-panel__heading">
      <div><h2>Site Logo</h2><p>Preview the logo in the public header, footer, and taxpayer navigation.</p></div>
      <div className="cms-editor__header-actions">
        <button type="button" aria-label="Refresh site logo" title="Refresh" onClick={() => void refresh().catch(error => setMessage((error as Error).message))}><RefreshCcw size={17}/></button>
        {record && !editing && <button type="button" className="cms-edit-button" onClick={() => { setEditing(true); setMessage(''); }}><Pencil size={16}/> Edit logo</button>}
      </div>
    </div>
    {!cms ? <p>Content service configuration is unavailable.</p> : <>
      <div className="cms-logo__canvas">
        <h3>{editing && selected ? 'New logo preview (not yet published)' : 'Current TaxPay logo'}</h3>
        <div className="cms-logo__image"><img src={displayUrl} alt="Korbritto TaxPay logo preview" /></div>
        <p>Source image: {dimensions}</p>
        {!record?.image_path && <p>Showing the current Korbritto brand used by TaxPay when SQL has no uploaded logo.</p>}
      </div>
      <div className="cms-logo__placement-grid">
        <div className="cms-logo__placement"><h3>Desktop header</h3><div className="cms-logo__slot cms-logo__slot--desktop"><img src={displayUrl} alt="Desktop header logo preview" /></div><p>154 × 52 px slot</p></div>
        <div className="cms-logo__placement"><h3>Mobile header</h3><div className="cms-logo__slot cms-logo__slot--mobile"><img src={displayUrl} alt="Mobile header logo preview" /></div><p>122 × 42 px slot</p></div>
        <div className="cms-logo__placement"><h3>Taxpayer sidebar</h3><div className="cms-logo__slot cms-logo__slot--sidebar"><img src={displayUrl} alt="Taxpayer sidebar logo preview" /></div><p>164 × 58 px slot</p></div>
      </div>
      {editing && <>
        {!canPublish && <p role="status" className="cms-editor__note">You can preview the logo, but publishing requires an Office sign-in with a valid account password and publishing permission.</p>}
        <div className="cms-logo__upload-area">
          <label className="cms-upload-label"><UploadCloud size={16}/> Upload / replace logo
            <input type="file" accept={IMAGE_FILE_ACCEPT} disabled={busy} onChange={event => {
              const file = event.target.files?.[0] || null;
              event.target.value = '';
              choose(file);
            }} />
          </label>
          <p>PNG, JPG or JPEG only · Crop to 1469 × 496 px · Max 5 MB. PNG preserves transparency. The current blue design remains until you save.</p>
        </div>
        <div className="cms-actions"><div className="cms-actions__main">
          <button type="button" className="cms-primary" disabled={busy || !selected || !canPublish} onClick={() => void save()}><Save size={16}/> {busy ? 'Publishing…' : 'Publish to TaxPay'}</button>
          {record?.image_path && <button type="button" disabled={busy || !canPublish} onClick={() => setRestoreRequested(true)}>Restore original logo</button>}
          <button type="button" disabled={busy} onClick={cancel}>Cancel</button>
        </div></div>
      </>}
    </>}
    {message && <p className="cms-message" role="status">{message}</p>}
    {restoreRequested && <SConfirmModal title="Restore original Korbritto logo"
      message="Restore the approved Korbritto logo across TaxPay? The current uploaded logo will be replaced."
      confirmLabel="Restore original logo" onClose={() => setRestoreRequested(false)}
      onConfirm={() => void restoreOriginal()} />}
    {cropSource && <ImageCropDialog file={cropSource} title="site logo" outputWidth={1469} outputHeight={496}
      onCancel={() => setCropSource(null)} onApply={file => {
        setSelected({ file, width: 1469, height: 496 });
        setCropSource(null);
      }} />}
  </section>;
}
