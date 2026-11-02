import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PublicIssueReportsPanel } from './PublicIssueReportsPanel';

const row = {
  id:'12345678-1234-4234-8234-123456789abc',
  category:'payment', details:'Unable to locate my receipt reference',
  status:'received', review_note:null,
  submitted_at:'2026-11-02T00:00:00.000Z',
  updated_at:'2026-11-02T00:00:00.000Z',
};
function makeClient(failUpdate=false){
  const updated={...row,status:'in_review',review_note:'Checking the case',
     updated_at:'2026-11-02T01:00:00.000Z'};
  const selectFields=vi.fn();
  const update=vi.fn((_patch:unknown)=>({
    eq:vi.fn((_field:string,_value:unknown)=>({
      eq:vi.fn((_column:string,_timestamp:string)=>({
        select:vi.fn((_fields:string)=>({
          maybeSingle:async()=>failUpdate
            ?{data:null,error:new Error('Stale update')}
            :{data:updated,error:null},
        })),
      })),
    })),
  }));
  const from=vi.fn((name:string)=>{
    if(name!=='taxpay_public_issue_reports')throw new Error('Unexpected table');
    return {
      select:(fields:string)=>{
        selectFields(fields);
        return {order:()=>({limit:async()=>({data:[row],error:null})})};
      },
      update,
    };
  });
  return {client:{from} as unknown as SupabaseClient,from,selectFields,update};
}

describe('verified-admin CMS public report review',()=>{
  it('loads scoped public report columns, searches and saves an optimistic review',async()=>{
    const {client,from,selectFields,update}=makeClient();
    const user=userEvent.setup();
    render(<PublicIssueReportsPanel cms={client} authUid="verified-admin-uuid"/>);
    expect(await screen.findByRole('button',{name:'KRB-123456781234'})).toBeInTheDocument();
    expect(from).toHaveBeenCalledWith('taxpay_public_issue_reports');
    expect(selectFields).toHaveBeenCalledWith('id,category,details,status,review_note,submitted_at,updated_at');
    expect(JSON.stringify(selectFields.mock.calls)).not.toMatch(/source_hash|submission_key|tracking_secret/);
    await user.type(screen.getByRole('searchbox',{name:'Search reports'}),'12345678');
    await user.click(screen.getByRole('button',{name:'KRB-123456781234'}));
    await user.selectOptions(screen.getByRole('combobox',{name:'Review status'}),'in_review');
    await user.type(screen.getByRole('textbox',{name:'Internal review note'}),'Checking the case');
    await user.click(screen.getByRole('button',{name:'Save review'}));
    await waitFor(()=>expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status:'in_review',review_note:'Checking the case',reviewed_by:'verified-admin-uuid',
    })));
    expect(await screen.findByText('Status saved to TaxPay SQL.')).toBeInTheDocument();
    expect(screen.getByRole('combobox',{name:'Review status'})).toHaveValue('in_review');
  });
  it('reports SQL conflict without claiming a save',async()=>{
    const {client}=makeClient(true);
    const user=userEvent.setup();
    render(<PublicIssueReportsPanel cms={client} authUid="verified-admin-uuid"/>);
    await user.click(await screen.findByRole('button',{name:'KRB-123456781234'}));
    await user.click(screen.getByRole('button',{name:'Save review'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the review');
    expect(screen.queryByText('Status saved to TaxPay SQL.')).not.toBeInTheDocument();
  });
});
