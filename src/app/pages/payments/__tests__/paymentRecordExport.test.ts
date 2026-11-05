import {describe,expect,it} from 'vitest';
import type {ColDef,TableRow} from '../../modulePageUtils';
import {paymentFilterMatches,paymentTableCsv} from '../paymentRecordExport';

const cols:ColDef[]=[
  {type:'col',col:{key:'tin',label:'TIN'}},
  {type:'col',col:{key:'taxpayer_name',label:'Taxpayer'}},
  {type:'col',col:{key:'assessment_year',label:'Assessment Year'}},
  {type:'col',col:{key:'amount',label:'Amount'}},
];
const row:TableRow={tin:'001234567890',taxpayer_name:'Rahman, "Company"',assessment_year:'2026–27, 2025-26',amount:'৳1,500',
  __internal_admin_id:'Never export',admin_secret:'Hidden value'};

describe('Payments table multi-year filtering and CSV export',()=>{
  it('matches each full assessment year even when one payment contains multiple years',()=>{
    expect(paymentFilterMatches(row,'assessment_year','2026-27')).toBe(true);
    expect(paymentFilterMatches(row,'assessment_year','2025-26')).toBe(true);
    expect(paymentFilterMatches(row,'assessment_year','2024-25')).toBe(false);
    expect(paymentFilterMatches(row,'assessment_year','2026')).toBe(false);
  });
  it('keeps exact matching for status, receipt and other controlled filters',()=>{
    expect(paymentFilterMatches({status:'Failed'},'status','Failed')).toBe(true);
    expect(paymentFilterMatches({status:'Failed - retry'},'status','Failed')).toBe(false);
  });
  it('exports visible column labels only, with UTF-8 BOM and proper CSV quoting',()=>{
    const csv=paymentTableCsv(cols,[row]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Rahman, ""Company"""');
    expect(csv).toContain('"৳1,500"');
    expect(csv).not.toContain('Never export');
    expect(csv).not.toContain('Hidden value');
    expect(csv).toContain('"\'001234567890"');
  });
  it('protects against spreadsheet formula injection and preserves long numerical identifiers',()=>{
    const csv=paymentTableCsv(cols,[{tin:'123456789012',taxpayer_name:'\t=HYPERLINK("https://example.invalid")',
      assessment_year:'2026-27',amount:'-100'}]);
    expect(csv).toContain('"\'123456789012"');
    expect(csv).toContain('"\'\t=HYPERLINK(""https://example.invalid"")"');
    expect(csv).toContain('"\'-100"');
    expect(csv).not.toContain('"\t=HYPERLINK');
  });
  it('writes a valid header-only file when no rows match a search',()=>{
    const csv=paymentTableCsv(cols,[]);
    expect(csv).toBe('\uFEFF"TIN","Taxpayer","Assessment Year","Amount"\r\n');
  });
  it('supports grouped columns with the same order as the Office table',()=>{
    const grouped:ColDef[]=[{type:'group',group:{label:'Identity',cols:[{key:'tin',label:'TIN'},{key:'taxpayer_name',label:'Name'}]}}];
    expect(paymentTableCsv(grouped,[row])).toContain('"TIN","Name"\r\n');
  });
});
