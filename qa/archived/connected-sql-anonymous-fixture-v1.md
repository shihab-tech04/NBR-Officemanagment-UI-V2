# Historical regression (before authorized officer-only SQL)

Original test assertions preserved verbatim. Anonymous transport mocking is intentionally invalid after role-gated API migration. Current positive multi-beneficiary TaxPay-to-Office E2E lives in the isolated Supabase authenticated browser harness.

```typescript
test('Office Transactions uses the shared SQL simulation payload, with allocation timeline and no credit',async({page})=>{
  await page.route('**/rest/v1/rpc/sim_payment_history',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{
      id:'SIM-SQL-TEST-001',transactionId:'11111111-2222-4333-8444-555555555555',
      payer:'user6',state:'SIMULATED',createdAt:'2026-10-13T03:00:00Z',
      simulationOnly:true,totalMinor:12500,
      allocations:[
        {id:'11111111-aaaa-4aaa-8aaa-111111111111',lineNo:1,beneficiary:'user6',category:'ADVANCE_TAX',assessmentYear:'2026-27',amountMinor:10000},
        {id:'22222222-aaaa-4aaa-8aaa-222222222222',lineNo:2,beneficiary:'user7',category:'PENALTY',assessmentYear:'2025-26',amountMinor:2500}
      ],
      events:[
        {id:1,action:'CREATED',note:'Created',occurredAt:'2026-10-13T03:00:00Z'},
        {id:2,action:'REVIEWED',note:'Checked',occurredAt:'2026-10-13T03:00:01Z'},
        {id:3,action:'SIMULATION_RECORDED',note:'Confirmed, no gateway',occurredAt:'2026-10-13T03:00:02Z'}
      ]
    }])});
  });
  await page.route('**/rest/v1/rpc/sim_payment_notices',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await page.goto('/payments/transactions');
  await expect(page.getByText(/Shared SQL simulation: 1 transactions, 2 allocations/)).toBeVisible();
  await page.locator('#payment-dataset-scope').click();
  await page.getByRole('option',{name:'Connected SQL payment simulation'}).click();
  const rows=page.locator('.card-table tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('user6, user7');
  await expect(rows.first()).toContainText('৳125');
  await rows.first().click();
  await expect(page.getByText('SIM-SQL-TEST-001').first()).toBeVisible();
  await expect(page.getByText(/SIMULATION_RECORDED/).first()).toBeVisible();
});

```
