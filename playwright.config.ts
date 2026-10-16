import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./qa',testMatch:'**/*.pw.ts',timeout:30000,retries:1,workers:2,
  // Matched-state images have a separately owner-approved, SHA-locked main-branch baseline.
  snapshotPathTemplate: 'qa/approved-visuals/register4/{arg}',
  use:{baseURL:'http://127.0.0.1:3000',browserName:'chromium',headless:true},
  webServer:{command:'npm run dev',url:'http://127.0.0.1:3000',reuseExistingServer:false,timeout:120000},
  reporter:[['list'],['html',{outputFolder:'playwright-report',open:'never'}]],
});
