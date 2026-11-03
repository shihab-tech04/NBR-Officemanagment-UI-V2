import {describe,it,expect} from 'vitest';
import {collectOfficeBeneficiaryPages,tagName} from '../BeneficiaryDirectoryPage';

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
  it('shows self-declared Others descriptions in Office without claiming kinship',()=>{
    expect(tagName('others',null,false,'Neighbourhood representative')).toBe('Others · Neighbourhood representative');
    expect(tagName('others',null,true,'পাড়ার পরিচিত')).toBe('অন্যান্য · পাড়ার পরিচিত');
    expect(tagName('others',null,false,null)).toBe('Others');
    expect(tagName('friends_family','father',false,null)).toBe('Friends & family members · Father');
  });
  it('rejects invalid page sizes',async()=>{
    await expect(collectOfficeBeneficiaryPages(async()=>[],0)).rejects.toThrow('Invalid page size');
  });
});
