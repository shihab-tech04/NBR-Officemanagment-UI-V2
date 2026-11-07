import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SiteLogoPanel } from './SiteLogoPanel';
import { getTaxPayCmsPublicClient } from '../../services/taxpayCmsClient';
import { verifyPublicImage } from './verifyPublicImage';

const office = vi.hoisted(() => ({ verified: vi.fn(), call: vi.fn() }));
vi.mock('../../services/officeCmsBridge', () => ({
  isVerifiedOfficeCmsPublisher: office.verified,
  callOfficeCmsBridge: office.call,
}));
vi.mock('../../services/taxpayCmsClient', () => ({ getTaxPayCmsPublicClient: vi.fn() }));
vi.mock('./verifyPublicImage', () => ({ verifyPublicImage: vi.fn(async () => {}) }));
vi.mock('./ImageCropDialog', () => ({
  ImageCropDialog: ({ onApply }: { onApply: (file: File) => void }) =>
    <button type="button" onClick={() => onApply(new File([new Uint8Array([137,80,78,71])], 'cropped.png', {type:'image/png'}))}>
      Apply test crop
    </button>,
}));

type Logo = { id:'primary';image_path:string|null;image_width:number|null;image_height:number|null;version:number;updated_at:string };
function logoCms(mode:'ok'|'reject'|'conflict'|'publicStale'='ok', existingOfficeSession=false) {
  let row: Logo = {id:'primary',image_path:null,image_width:null,image_height:null,version:9,updated_at:'2026-10-29T00:00:00Z'};
  const from=vi.fn((name:string)=>{
    if(name!=='taxpay_site_logo') throw new Error('Unexpected table: '+name);
    return { select:vi.fn(()=>({eq:()=>({single:async()=>({data:row,error:null})})})) };
  });
  const client={
    from,channel:()=>({on:vi.fn().mockReturnThis(),subscribe:vi.fn().mockReturnThis()}),
    removeChannel:vi.fn(async()=>{}),
    storage:{from:()=>({getPublicUrl:(path:string)=>({data:{publicUrl:'https://images.test/'+path}})})},
  } as unknown as SupabaseClient;
  const stalePublicClient={
    from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:'primary',image_path:null,version:9,image_width:null,image_height:null},error:null})})})}),
  } as unknown as SupabaseClient;
  vi.mocked(getTaxPayCmsPublicClient).mockReturnValue(mode==='publicStale'?stalePublicClient:client);
  office.verified.mockResolvedValue(existingOfficeSession);
  office.call.mockImplementation(async (action:string,fields:{expectedVersion:number},files?:{image?:File})=>{
    if(mode==='reject') throw new Error('RLS denied');
    if(mode==='conflict') throw new Error('Logo changed in another session');
    if(fields.expectedVersion!==row.version) throw new Error('Logo changed in another session');
    if(action==='publish-logo') {
      expect(files?.image).toBeInstanceOf(File);
      row={...row,image_path:'logos/00000000-0000-4000-8000-000000000001.png',image_width:1469,image_height:496,version:row.version+1};
      return {logo:row};
    }
    if(action==='restore-logo') {
      row={...row,image_path:null,image_width:null,image_height:null,version:row.version+1};
      return {logo:row};
    }
    throw new Error('Unexpected Office CMS action: '+action);
  });
  return {client,from};
}
async function prepareLogo(user:ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button',{name:'Edit logo'}));
  await user.upload(screen.getByLabelText('Upload / replace logo'),
    new File([new Uint8Array([137,80,78,71])],'logo.png',{type:'image/png'}));
  await user.click(await screen.findByRole('button',{name:'Apply test crop'}));
}

describe('Site Logo Office-authenticated publishing and Korbritto parity',()=>{
  beforeEach(()=>{vi.clearAllMocks();vi.mocked(verifyPublicImage).mockResolvedValue(undefined);});
  it('uses exact Korbritto fallback when SQL has no uploaded logo',async()=>{
    const cms=logoCms();render(<SiteLogoPanel cms={cms.client}/>);
    await screen.findByRole('button',{name:'Edit logo'});
    expect(screen.getByRole('heading',{name:'Current TaxPay logo'})).toBeInTheDocument();
    expect(screen.getByText(/Current Korbritto brand/)).toBeInTheDocument();
    const src=screen.getByAltText('Korbritto TaxPay logo preview').getAttribute('src')||'';
    expect(src).toMatch(/korbritto-brand-locked|data:image/);
    expect(src).not.toContain('amar-kor');
    expect(cms.from).toHaveBeenCalledWith('taxpay_site_logo');
  });
  it('falls back to approved brand on image-load error',async()=>{
    const user=userEvent.setup();const cms=logoCms();render(<SiteLogoPanel cms={cms.client} canPublish/>);
    await prepareLogo(user);await user.click(screen.getByRole('button',{name:'Publish to TaxPay'}));
    await screen.findByText(/verified in the public TaxPay logo feed/);
    const img=screen.getByAltText('Korbritto TaxPay logo preview');fireEvent.error(img);
    await waitFor(()=>expect(img.getAttribute('src')).toMatch(/korbritto-brand-locked|data:image/));
  });
  it('preserves draft without publishing when Office account is unverified',async()=>{
    const user=userEvent.setup();const cms=logoCms();render(<SiteLogoPanel cms={cms.client} canPublish={false}/>);
    await prepareLogo(user);await user.click(screen.getByRole('button',{name:'Publish to TaxPay'}));
    expect(await screen.findByText(/no active TaxPay publishing access/)).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'New logo preview (not yet published)'})).toBeInTheDocument();
    expect(screen.queryByRole('dialog',{name:/publishing/i})).not.toBeInTheDocument();
    expect(office.call).not.toHaveBeenCalled();
  });
  it('rechecks a stale Office permission state without a second login',async()=>{
    const user=userEvent.setup();const cms=logoCms('ok',true);
    render(<SiteLogoPanel cms={cms.client} canPublish={false}/>);
    await prepareLogo(user);await user.click(screen.getByRole('button',{name:'Publish to TaxPay'}));
    expect(await screen.findByText(/verified in the public TaxPay logo feed/)).toBeInTheDocument();
    expect(office.verified).toHaveBeenCalledOnce();
    expect(office.call).toHaveBeenCalledWith('publish-logo',{expectedVersion:9},{image:expect.any(File)});
  });
  it('allows ordinary Office users to crop and cancel without calling publishing API',async()=>{
    const user=userEvent.setup();const cms=logoCms();render(<SiteLogoPanel cms={cms.client} canPublish={false}/>);
    await prepareLogo(user);expect(screen.getByRole('button',{name:'Publish to TaxPay'})).toBeEnabled();
    expect(office.call).not.toHaveBeenCalled();await user.click(screen.getByRole('button',{name:'Cancel'}));
    expect(screen.getByRole('button',{name:'Edit logo'})).toBeInTheDocument();
  });
  it('sends cropped artwork and exact SQL version to Office publishing bridge',async()=>{
    const user=userEvent.setup();const cms=logoCms();render(<SiteLogoPanel cms={cms.client} canPublish/>);
    await prepareLogo(user);await user.click(screen.getByRole('button',{name:'Publish to TaxPay'}));
    await waitFor(()=>expect(office.call).toHaveBeenCalledWith('publish-logo',{expectedVersion:9},{image:expect.any(File)}));
    expect(await screen.findByText(/Logo saved to SQL and verified in the public TaxPay logo feed/)).toBeInTheDocument();
    expect(screen.getByAltText('Korbritto TaxPay logo preview').getAttribute('src')).toMatch(/^https:\/\/images\.test\/logos\//);
    expect(screen.getByRole('button',{name:'Edit logo'})).toBeInTheDocument();
  });
  it('restores original logo with Office-verified versioned server action',async()=>{
    const user=userEvent.setup();const cms=logoCms();render(<SiteLogoPanel cms={cms.client} canPublish/>);
    await prepareLogo(user);await user.click(screen.getByRole('button',{name:'Publish to TaxPay'}));
    await screen.findByText(/verified in the public TaxPay logo feed/);
    await user.click(screen.getByRole('button',{name:'Edit logo'}));
    await user.click(screen.getByRole('button',{name:'Restore original logo'}));
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Restore original logo'}));
    expect(await screen.findByText(/Original Korbritto logo restored and verified/)).toBeInTheDocument();
    expect(office.call).toHaveBeenCalledWith('restore-logo',{expectedVersion:10});
    expect(screen.getByText(/Current Korbritto brand/)).toBeVisible();
  });
  it('reports incomplete public image readback after SQL commit instead of claiming success',async()=>{
    const user=userEvent.setup();const cms=logoCms();
    vi.mocked(verifyPublicImage).mockRejectedValueOnce(new Error('Public image cannot be decoded.'));
    render(<SiteLogoPanel cms={cms.client} canPublish/>);
    await prepareLogo(user);await user.click(screen.getByRole('button',{name:'Publish to TaxPay'}));
    expect(await screen.findByText(/Logo saved to SQL; public verification incomplete: Public image cannot be decoded/)).toBeInTheDocument();
    expect(office.call).toHaveBeenCalledOnce();
  });
  it('does not claim public publish when anonymous logo SQL feed is stale',async()=>{
    const user=userEvent.setup();const cms=logoCms('publicStale');render(<SiteLogoPanel cms={cms.client} canPublish/>);
    await prepareLogo(user);await user.click(screen.getByRole('button',{name:'Publish to TaxPay'}));
    expect(await screen.findByText(/Public TaxPay logo does not match the committed SQL version/)).toBeInTheDocument();
    expect(screen.queryByText(/verified in the public TaxPay logo feed/)).not.toBeInTheDocument();
  });
  it('preserves draft on authorization or SQL rejection',async()=>{
    const user=userEvent.setup();const cms=logoCms('reject');render(<SiteLogoPanel cms={cms.client} canPublish/>);
    await prepareLogo(user);await user.click(screen.getByRole('button',{name:'Publish to TaxPay'}));
    expect(await screen.findByText(/Logo not published: RLS denied/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Publish to TaxPay'})).toBeEnabled();
  });
  it('blocks stale SQL versions without replacing published logo',async()=>{
    const user=userEvent.setup();const cms=logoCms('conflict');render(<SiteLogoPanel cms={cms.client} canPublish/>);
    await prepareLogo(user);await user.click(screen.getByRole('button',{name:'Publish to TaxPay'}));
    expect(await screen.findByText(/Logo changed in another session/)).toBeInTheDocument();
    expect(screen.getByAltText('Korbritto TaxPay logo preview').getAttribute('src')).not.toContain('https://images.test/logos/');
  });
});