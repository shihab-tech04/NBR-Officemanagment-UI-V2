import { describe, it, expect } from 'vitest';
import { ALL_TAXPAYER_ROWS } from './auditData';
describe('Audit source count',()=>{it('loads 70 taxpayer profiles',()=>expect(ALL_TAXPAYER_ROWS).toHaveLength(70));});
