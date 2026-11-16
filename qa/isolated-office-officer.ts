import type {Page} from '@playwright/test';

/**
 * Browser-test-only Office Auth fixture for isolated, mocked SQL page results.
 * No login, JWT or privileged record is created in the hosted Supabase project.
 * The application still uses its real getUser -> getSession -> bearer flow.
 */
const officerId='70000000-0000-4000-8000-000000000011';
const officer={
 id:officerId,aud:'authenticated',role:'authenticated',
 email:'isolated-office-officer@example.invalid',app_metadata:{provider:'email',providers:['email']},
 user_metadata:{},identities:[],created_at:'2026-11-14T00:00:00.000Z',
 updated_at:'2026-11-14T00:00:00.000Z',is_anonymous:false,
};
const payload=Buffer.from(JSON.stringify({
 sub:officerId,aud:'authenticated',role:'authenticated',exp:4102444800,
 iat:1794614400,iss:'https://isolated-office.invalid/auth/v1',
})).toString('base64url');
const bearer='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'+payload+'.synthetic-test-signature';
const session={
 access_token:bearer,refresh_token:'isolated-browser-refresh-only',token_type:'bearer',
 expires_at:4102444800,expires_in:2307820000,user:officer,
};

export async function installIsolatedOfficeOfficer(page:Page):Promise<void>{
 await page.route('https://ihbtabrvmyiwikqqbhrf.supabase.co/auth/v1/user',route=>{
   const h=route.request().headers();
   if(h.authorization!=='Bearer '+bearer)
     return route.fulfill({status:401,contentType:'application/json',
       body:JSON.stringify({message:'Invalid office session'})});
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(officer)});
 });
 await page.addInitScript(({storageKey,value})=>{
   sessionStorage.setItem(storageKey,JSON.stringify(value));
 },{storageKey:'nbr-office-management-cms-session',value:session});
}
