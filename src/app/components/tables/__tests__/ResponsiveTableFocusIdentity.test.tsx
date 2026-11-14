import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import type {ColDef,TableRow} from '../../../pages/modulePageUtils';

vi.mock('react-i18next',()=>({
  useTranslation:()=>({t:(key:string)=>key}),
}));
vi.mock('../CardTable',()=>({CardTable:()=>null}));
vi.mock('../UnifiedMobileCard',()=>({
  UnifiedMobileCard:({row,onCardClick}:{row:TableRow;onCardClick?:()=>void})=>
    <button type="button" data-testid={'mobile-'+String(row.id??row.taxpayer_name)}
      onClick={onCardClick}>{String(row.taxpayer_name)}</button>,
}));

import {ResponsiveTable} from '../ResponsiveTable';
const cols:ColDef[]=[{type:'col',col:{key:'taxpayer_name',label:'Taxpayer'}}];
const alpha:TableRow={id:'original-A',taxpayer_name:'Alpha'};
const beta:TableRow={id:'original-B',taxpayer_name:'Beta'};
const example=(rows:TableRow[])=>
  <ResponsiveTable rows={rows} cols={cols} onRowClick={()=>{}} aria-label="Officers"/>;
afterEach(()=>cleanup());

describe('Office shared mobile table record identity',()=>{
  it('does not transfer keyboard focus to a different record when the focused row is filtered out',()=>{
    const {rerender}=render(example([alpha,beta]));
    const first=screen.getByTestId('mobile-original-A');
    first.focus();
    expect(document.activeElement).toBe(first);
    rerender(example([beta]));
    const survivor=screen.getByTestId('mobile-original-B');
    expect(screen.queryByTestId('mobile-original-A')).toBeNull();
    expect(document.activeElement).not.toBe(survivor);
  });

  it('keeps the same record DOM node when the table is sorted',()=>{
    const {rerender}=render(example([alpha,beta]));
    const originalBeta=screen.getByTestId('mobile-original-B');
    rerender(example([beta,alpha]));
    expect(screen.getByTestId('mobile-original-B')).toBe(originalBeta);
  });

  it('preserves stable record identity for old Office tables without IDs',()=>{
    const a={taxpayer_name:'Alpha',assessment_year:'2026-27'};
    const b={taxpayer_name:'Beta',assessment_year:'2025-26'};
    const {rerender}=render(example([a,b]));
    const originalBeta=screen.getByTestId('mobile-Beta');
    rerender(example([b,a]));
    expect(screen.getByTestId('mobile-Beta')).toBe(originalBeta);
  });
});
