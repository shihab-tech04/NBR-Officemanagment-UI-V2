/**
 * Receipt export adapted from the canonical Sohojkor receiptDocumentExport.ts
 * (Taxpayer c1da1537). Render only the currently authorized displayed paper.
 * No API request, synthetic payment, or separate reconstructed receipt.
 */
export async function downloadDisplayedOfficeReceiptPdf(reference: string, paper: HTMLElement) {
  const title = reference.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
  if (!title || !paper.isConnected) throw new Error('Document is not ready');
  const [{ default: renderPaper }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);
  await document.fonts.ready;
  const scale = 2;
  let breaks: number[] = [];
  const canvas = await renderPaper(paper, {
    backgroundColor: '#fff', logging: false, scale,
    // A4 export uses one stable desktop media-query viewport on all devices.
    windowWidth: 1280, windowHeight: 900,
    ignoreElements: element => element.matches('button, .no-print'),
    onclone: (_document, clonedPaper) => {
      // Use a print-sized paper in the clone; never reflow the visible modal.
      Object.assign(clonedPaper.style, { width: '704px', maxWidth: 'none', minWidth: '0', boxSizing: 'border-box', overflow: 'visible', height: 'auto', maxHeight: 'none', boxShadow: 'none' });
      clonedPaper.querySelectorAll<HTMLElement>('.office-receipt__scroll, .receipt-view__allocation-scroll').forEach(viewport => {
        Object.assign(viewport.style, { overflow: 'visible', minWidth: '0', maxWidth: '100%', width: '100%' });
        viewport.querySelectorAll<HTMLElement>('table').forEach(table => {
          Object.assign(table.style, { minWidth: '0', width: '100%', tableLayout: 'fixed' });
          table.querySelectorAll<HTMLElement>('th,td').forEach(cell => {
            Object.assign(cell.style, { minWidth: '0', whiteSpace: 'normal', overflowWrap: 'anywhere' });
          });
        });
      });
      const top = clonedPaper.getBoundingClientRect().top;
      // Read break positions after export reflow, not from the mobile source.
      breaks = Array.from(clonedPaper.querySelectorAll('tr, header, section'))
        .map(element => Math.floor((element.getBoundingClientRect().bottom - top) * scale))
        .filter(position => position > 0)
        .sort((left, right) => right - left);
    },
  });
  if (!canvas.width || !canvas.height) throw new Error('Document is not ready');
  const pdf = new jsPDF({ format: 'a4', unit: 'mm', compress: true });
  const margin = 12;
  const width = pdf.internal.pageSize.getWidth() - 2 * margin;
  const pixelsPerMm = canvas.width / width;
  const pageHeight = Math.floor((pdf.internal.pageSize.getHeight() - 2 * margin) * pixelsPerMm);
  const page = document.createElement('canvas');
  page.width = canvas.width;
  const context = page.getContext('2d');
  if (!context || pageHeight < 1) throw new Error('Unable to render the payment receipt');
  for (let start = 0; start < canvas.height;) {
    const limit = Math.min(start + pageHeight, canvas.height);
    const end = limit === canvas.height ? limit :
      breaks.find(position => position <= limit && position >= start + pageHeight / 2) ?? limit;
    const height = end - start;
    page.height = height;
    context.drawImage(canvas, 0, start, canvas.width, height, 0, 0, canvas.width, height);
    if (start > 0) pdf.addPage();
    pdf.addImage(page, 'PNG', margin, margin, width, height / pixelsPerMm);
    start = end;
  }
  pdf.setProperties({ title: 'Sohojkor Payment Receipt ' + title });
  pdf.save('office-payment-' + title + '.pdf');
}
