import type {ColDef,TableRow} from '../modulePageUtils';

/** Assessment years may be comma-separated because one payment covers more than
 * one year; never match a substring that would admit the wrong tax period. */
export function paymentFilterMatches(row:TableRow,key:string,wanted:string):boolean {
  if(!wanted||wanted==='All')return true;
  const observed=String(row[key]??'');
  if(key==='assessment_year'||key==='ay'){
    const clean=(value:string)=>value.trim().replace(/–/g,'-');
    return observed.split(',').some(value=>clean(value)===clean(wanted));
  }
  return observed===wanted;
}

function exportColumns(columns:readonly ColDef[]):Array<{key:string;label:string}> {
  return columns.flatMap(c=>c.type==='col'
    ?[{key:c.col.key,label:c.col.label}]
    :c.group.cols.map(col=>({key:col.key,label:col.label})));
}

/** Spreadsheet-cell escaping also prevents Excel/LibreOffice formula execution.
 * Do not include hidden row metadata; use ONLY columns visibly present in Office.
 */
export function paymentTableCsv(columns:readonly ColDef[],rows:readonly TableRow[]):string {
  const cols=exportColumns(columns);
  const encode=(input:unknown,key:string)=>{
    const value=typeof input==='string'?input:
      typeof input==='number'||typeof input==='boolean'?String(input):
      Array.isArray(input)?String(input.length)+' attachments':'';
    const preserveIdentifier=/^(?:tin|taxpayer_tin|payer_tin|payment_ref|reference|id)$/i.test(key)
      &&/^\d{10,}$/.test(value.trim());
    const mayExecute=/^[\s\u0000-\u001f]*[=+\-@]/u.test(value);
    const guarded=preserveIdentifier||mayExecute?"'"+value:value;
    return '"'+guarded.replace(/"/g,'""')+'"';
  };
  const header=cols.map(c=>encode(c.label,'_header')).join(',');
  const body=rows.map(row=>cols.map(c=>encode(row[c.key],c.key)).join(','));
  return '\uFEFF'+[header,...body].join('\r\n')+'\r\n';
}

/** Export the full currently filtered and sorted set, not only its visible page. */
export function downloadPaymentTableCsv(kind:string,columns:readonly ColDef[],rows:readonly TableRow[]):void {
  const body=paymentTableCsv(columns,rows);
  const blob=new Blob([body],{type:'text/csv;charset=utf-8'});
  const objectUrl=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=objectUrl;
  a.download='office-'+kind.replace(/[^a-z0-9-]/gi,'')+'-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);
  try{a.click();}finally{a.remove();window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);}
}
