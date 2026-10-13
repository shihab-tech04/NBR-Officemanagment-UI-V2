import {getOfficeReviewClient} from './OfficeReviewQueue';
/** Only an authenticated, authorized NBR Office simulation reviewer may read connected SQL. */
export const simulationUsers=['user1','user2','user3','user4','user5','user6','user7','user8','user9','user10'] as const;
export type SimulationUser=typeof simulationUsers[number];
export const simulationCategories=['TAX_WITH_RETURN','ADVANCE_TAX','ASSESSED_DEMAND','PENALTY','SOURCE_TAX_DEPOSIT','APPELLATE_TRIBUNAL','OTHER_TAX_PAYMENT'] as const;
export type SimulationCategory=typeof simulationCategories[number];
export type SimulationLine={beneficiary:SimulationUser;category:SimulationCategory;assessmentYear:string;amountMinor:number};
export type SimulationAllocation=SimulationLine&{id:string;lineNo:number};
export type SimulationEvent={id:number;action:string;note:string;occurredAt:string};
export type SimulationTransaction={id:string;transactionId:string;payer:SimulationUser;state:'SIMULATED'|'PENDING'|'FAILED'|'REVERSED';createdAt:string;simulationOnly:true;totalMinor:number;allocations:SimulationAllocation[];events:SimulationEvent[]};
export type SimulationNotice={id:number;userId:SimulationUser;transactionId:string;messageCode:string;createdAt:string;isRead:boolean};
export type SimSubmission={transactionId:string;reference:string;totalMinor:number;replayed:boolean};
async function officerOnlyRead<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const client=getOfficeReviewClient();
 if(!client)throw Error('Connected SQL requires a configured officer sign-in');
 const {data:identity,error:identityError}=await client.auth.getUser();
 if(identityError||!identity.user)throw Error('Sign in with an authorized officer account to view the shared SQL ledger');
 const active=await client.from('taxpay_officer_roles').select('role,active').eq('user_uid',identity.user.id).maybeSingle();
 if(active.error)throw Error(active.error.message);
 if(!active.data?.active||!['MAKER','REVIEWER','APPROVER'].includes(active.data.role))throw Error('Active officer permission required');
 const {data,error}=await client.rpc(name,args);
 if(error)throw Error(error.message);
 const {data:verified,error:recheck}=await client.auth.getUser();
 if(recheck||verified.user?.id!==identity.user.id)throw Error('Officer session changed during SQL read');
 return data as T;
}
export const loadSimulationHistory=(user:SimulationUser|null,view:'beneficiary'|'payer'|'all'='beneficiary')=>
 officerOnlyRead<SimulationTransaction[]>('sim_payment_history',{p_user_id:user,p_view:view});
export const loadSimulationNotices=(user:SimulationUser)=>
 officerOnlyRead<SimulationNotice[]>('sim_payment_notices',{p_user_id:user});
export const submitSimulatedPayment=(_payer:SimulationUser,_lines:SimulationLine[],_key:string):Promise<SimSubmission>=>Promise.reject(Error('Officers cannot impersonate taxpayer payment submissions'));
/** Decimal money input is converted to integer paisa without floating-point rounding. */
export function parseSimulatedAmount(value:string):number {
 const s=value.trim();
 if(!/^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$/.test(s))throw Error('Use a positive amount with up to two decimals');
 const [whole,fract='']=s.split('.');
 const minor=Number(whole)*100+Number(fract.padEnd(2,'0'));
 if(!Number.isSafeInteger(minor)||minor<=0)throw Error('Enter a positive amount');
 return minor;
}
export const formatSimulatedAmount=(minor:number)=>'৳'+new Intl.NumberFormat('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2}).format(minor/100);
