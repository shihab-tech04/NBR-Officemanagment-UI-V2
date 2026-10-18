import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Crop, RotateCcw, X } from 'lucide-react';
import { cropWindow, MAX_IMAGE_BYTES, validateImageFile } from './imageCrop';

type ImageCropDialogProps = {
  file: File;
  title: string;
  outputWidth: number;
  outputHeight: number;
  onApply: (file: File) => void;
  onCancel: () => void;
};

const PREVIEW_WIDTH = 760;
const clamp = (value: number) => Math.max(-1, Math.min(1, value));

export function ImageCropDialog({ file, title, outputWidth, outputHeight, onApply, onCancel }: ImageCropDialogProps) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [outputType, setOutputType] = useState(file.type);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const aspect = outputWidth / outputHeight;
  const previewHeight = Math.round(PREVIEW_WIDTH / aspect);

  useEffect(() => {
    let cancelled = false;
    let loaded: ImageBitmap | null = null;
    void (async () => {
      try {
        await validateImageFile(file);
        loaded = await createImageBitmap(file);
        if (loaded.width * loaded.height > 40_000_000 || loaded.width < 100 || loaded.height < 100) {
          throw new Error('Use an image at least 100 × 100 px and no larger than 40 megapixels.');
        }
        if (!cancelled) setBitmap(loaded);
      } catch (reason) {
        if (!cancelled) setError((reason as Error).message || 'Unable to read this image.');
      }
    })();
    return () => { cancelled = true; loaded?.close(); };
  }, [file]);

  useEffect(() => {
    if (!bitmap || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) { setError('Your browser does not support image cropping.'); return; }
    const { sx, sy, sw, sh } = cropWindow(bitmap.width, bitmap.height, aspect, zoom, panX, panY);
    ctx.clearRect(0, 0, PREVIEW_WIDTH, previewHeight);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, PREVIEW_WIDTH, previewHeight);
  }, [bitmap, aspect, zoom, panX, panY, previewHeight]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape' && !processing) onCancel(); }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, processing]);

  function startDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (!bitmap) return;
    dragging.current = { x: event.clientX, y: event.clientY, panX, panY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent<HTMLCanvasElement>) {
    if (!bitmap || !dragging.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const { sw, sh } = cropWindow(bitmap.width, bitmap.height, aspect, zoom, 0, 0);
    const horizontalTravel = (bitmap.width - sw) / 2;
    const verticalTravel = (bitmap.height - sh) / 2;
    if (horizontalTravel > 0) setPanX(clamp(dragging.current.panX - (event.clientX - dragging.current.x) / rect.width * sw / horizontalTravel));
    if (verticalTravel > 0) setPanY(clamp(dragging.current.panY - (event.clientY - dragging.current.y) / rect.height * sh / verticalTravel));
  }

  async function apply() {
    if (!bitmap || processing) return;
    setProcessing(true);
    setError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Your browser cannot export cropped images.');
      if (outputType === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outputWidth, outputHeight);
      }
      const { sx, sy, sw, sh } = cropWindow(bitmap.width, bitmap.height, aspect, zoom, panX, panY);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not export cropped image.')), outputType, 0.9));
      if (blob.size > MAX_IMAGE_BYTES) throw new Error('The crop is larger than 5 MB. Try JPEG output or choose a less detailed image.');
      const extension = outputType === 'image/png' ? 'png' : 'jpg';
      const name = `${file.name.replace(/\.(png|jpe?g)$/i, '')}-cropped.${extension}`;
      onApply(new File([blob], name, { type: outputType }));
    } catch (reason) { setError((reason as Error).message); }
    finally { setProcessing(false); }
  }

  return <div className="cms-crop-backdrop" role="presentation">
    <section className="cms-crop-dialog" role="dialog" aria-modal="true" aria-label={`Crop ${title}`}>
      <div className="cms-crop__heading">
        <div><h2><Crop size={20} /> Crop {title}</h2><p>Drag the image or use the sliders to choose what appears on TaxPay.</p></div>
        <button type="button" onClick={onCancel} aria-label="Close crop editor" disabled={processing}><X size={20}/></button>
      </div>
      <div className="cms-crop__stage">
        {bitmap ? <canvas ref={canvasRef} width={PREVIEW_WIDTH} height={previewHeight} aria-label={`${title} crop preview. Drag to reposition.`}
          onPointerDown={startDrag} onPointerMove={drag} onPointerUp={() => { dragging.current = null; }}
          onPointerCancel={() => { dragging.current = null; }} /> :
          <p>{error || 'Loading image preview…'}</p>}
      </div>
      <div className="cms-crop__controls">
        <label>Zoom <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={event => setZoom(Number(event.target.value))} disabled={!bitmap}/><span>{Math.round(zoom * 100)}%</span></label>
        <label>Horizontal <input type="range" min="-1" max="1" step="0.01" value={panX} onChange={event => setPanX(Number(event.target.value))} disabled={!bitmap}/></label>
        <label>Vertical <input type="range" min="-1" max="1" step="0.01" value={panY} onChange={event => setPanY(Number(event.target.value))} disabled={!bitmap}/></label>
        <label>Save as <select value={outputType} onChange={event => setOutputType(event.target.value)}><option value="image/png">PNG</option><option value="image/jpeg">JPG / JPEG</option></select></label>
      </div>
      <div className="cms-crop__footer">
        <span>{outputWidth} × {outputHeight} px · {aspect.toFixed(2)}:1 · up to 5 MB</span>
        <div className="cms-crop__actions">
          <button type="button" onClick={() => { setZoom(1); setPanX(0); setPanY(0); }} disabled={!bitmap || processing}><RotateCcw size={15}/> Reset</button>
          <button type="button" onClick={onCancel} disabled={processing}>Cancel</button>
          <button className="cms-primary" type="button" onClick={() => void apply()} disabled={!bitmap || processing}><Crop size={15}/>{processing ? 'Cropping…' : 'Apply crop'}</button>
        </div>
      </div>
      {error && <p className="cms-crop__error" role="alert">{error}</p>}
    </section>
  </div>;
}
