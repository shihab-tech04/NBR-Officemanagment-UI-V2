import {describe,it,expect} from 'vitest';
import {collectOfficeBeneficiaryPages} from '../BeneficiaryDirectoryPage';

describe('TaxPay Office beneficiary SQL readback',()=>{
  it('loads beyond the PostgREST 1,000-row limit without missing rows',async()=>{
    const all=Array.from({length:1205},(_,i)=>({id:i}));
    const ranges:Array<[number,number]>=[];
    const result=await collectOfficeBeneficiaryPages(async(from,to)=>{
      ranges.push([from,to]);return all.slice(from,to+1);
    });
    expect(result).toEqual(all);
    expect(ranges).toEqual([[0,499],[500,999],[1000,1499]]);
  });
  it('rejects invalid page sizes',async()=>{
    await expect(collectOfficeBeneficiaryPages(async()=>[],0)).rejects.toThrow('Invalid page size');
  });
});
