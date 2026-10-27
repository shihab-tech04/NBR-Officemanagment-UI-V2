/** Only an authenticated, authorized NBR Office simulation reviewer may read connected SQL. */
export {simulationUsers,simulationCategories,TAXPAY_SIMULATION_CONTRACT_VERSION,simulationCategoryLabels,paymentJourneyStages,paymentStageLabels} from '../../contracts/paymentSimulationContract';
export type {SimulationUser,SimulationCategory,SimulationLine,SimulationAllocation,SimulationEvent,SimulationTransaction,SimulationNotice,SimSubmission} from '../../contracts/paymentSimulationContract';
import type {SimulationUser,SimulationLine,SimulationTransaction,SimulationNotice,SimSubmission} from '../../contracts/paymentSimulationContract';
/** Public preview never reads private taxpayer histories or impersonates an officer. */
export const loadSimulationHistory = async (_user:SimulationUser|null, _view:'beneficiary'|'payer'|'all'='beneficiary'):Promise<SimulationTransaction[]> => [];
export const loadSimulationNotices = async (_user:SimulationUser):Promise<SimulationNotice[]> => [];
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
