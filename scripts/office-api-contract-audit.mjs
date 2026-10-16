#!/usr/bin/env node
/**
 * Read-only Office API contract inventory.
 *
 * Endpoint paths below are proposals recorded in source TODOs, NOT verified API
 * contracts. This tool never contacts an API or reads credentials. Compare them
 * with a separately supplied OpenAPI 3 JSON document before wiring any UI.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const endpointDirectory = join(root, 'src/app/services/endpoints');

export function extractProposedEndpoints(source, file) {
  let functionName = '';
  const entries = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const declaration = line.match(/^\s*export\s+async\s+function\s+(\w+)\s*\(/);
    if (declaration) functionName = declaration[1];
    if (!line.includes('TODO: return apiRequest')) continue;
    const route = line.match(/apiRequest[^()]*\(\s*([`"'])(.*?)\1/);
    if (!functionName || !route) {
      throw new Error(`Cannot parse proposed API contract at ${file}:${index + 1}`);
    }
    entries.push({
      file,
      function: functionName,
      method: 'GET', // Inferred from existing read-only wrapper; not backend-verified.
      proposedPath: route[2].replace(/\$\{([^}]+)\}/g, '{$1}'),
      line: index + 1,
    });
  }
  return entries;
}

export function compareAgainstOpenApi(entries, spec, prefix = '') {
  if (!spec || typeof spec !== 'object' || !spec.paths || typeof spec.paths !== 'object') {
    throw new Error('Expected an OpenAPI JSON document with a paths object');
  }
  const cleanPrefix = prefix.replace(/\/+$/, '');
  return entries.map(entry => {
    const expectedPath = `${cleanPrefix}${entry.proposedPath}`;
    const declaredPath = spec.paths[expectedPath];
    return {
      ...entry,
      expectedPath,
      contractStatus: declaredPath && Object.hasOwn(declaredPath, entry.method.toLowerCase())
        ? 'DECLARED_IN_SPEC'
        : 'NOT_IN_SPEC',
    };
  });
}

async function inventoryProposedEndpoints() {
  const names = (await readdir(endpointDirectory))
    .filter(name => name.endsWith('.ts') && name !== 'index.ts').sort();
  const entries = [];
  for (const name of names) {
    entries.push(...extractProposedEndpoints(
      await readFile(join(endpointDirectory, name), 'utf8'), name,
    ));
  }
  return entries;
}

async function countUiEndpointImports() {
  const directories = [
    join(root, 'src/app/pages'),
    join(root, 'src/app/components'),
    join(root, 'src/app/layouts'),
  ];
  const hits = [];
  for (const directory of directories) {
    const pending = [directory];
    while (pending.length) {
      const current = pending.pop();
      for (const item of await readdir(current, { withFileTypes: true })) {
        const path = join(current, item.name);
        if (item.isDirectory()) pending.push(path);
        else if (/\.tsx?$/.test(item.name) && !/\.test\./.test(item.name)) {
          const source = await readFile(path, 'utf8');
          if (/from\s*['"][^'"]*services\/(?:endpoints|api)(?:\/[^'"]*)?['"]/.test(source)) {
            hits.push(path.slice(root.length + 1));
          }
        }
      }
    }
  }
  return hits.sort();
}

function selfTest() {
  const source = [
    'export async function getReturns(params?: unknown) {',
    '  // TODO: return apiRequest<Foo>("/returns/online", { params });',
    '}',
    'export async function getLedger(tin: string) {',
    '  // TODO: return apiRequest<Bar>(`/ledger/${tin}`);',
    '}',
  ].join('\n');
  const entries = extractProposedEndpoints(source, 'sample.ts');
  assert.deepEqual(entries.map(item => item.proposedPath), ['/returns/online', '/ledger/{tin}']);
  const checked = compareAgainstOpenApi(entries, { paths: {
    '/api/v1/returns/online': { get: {} }, '/api/v1/ledger/{tin}': { post: {} },
  } }, '/api/v1');
  assert.deepEqual(checked.map(item => item.contractStatus), ['DECLARED_IN_SPEC', 'NOT_IN_SPEC']);
  assert.throws(() => compareAgainstOpenApi(entries, {}, ''), /paths object/);
  console.log('PASS: Office API contract parser and OpenAPI method/path comparison self-tests');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) { selfTest(); return; }
  const openApiIndex = args.indexOf('--openapi');
  const prefixIndex = args.indexOf('--prefix');
  if (args.includes('--prefix') && prefixIndex + 1 >= args.length) {
    throw new Error('--prefix needs an explicit path, such as /api/v1');
  }
  const prefix = prefixIndex >= 0 ? args[prefixIndex + 1] : '';
  const entries = await inventoryProposedEndpoints();
  const uiImports = await countUiEndpointImports();
  let results = entries.map(entry => ({ ...entry, contractStatus: 'NO_API_SPEC_PROVIDED' }));
  if (openApiIndex >= 0) {
    const specPath = args[openApiIndex + 1];
    if (!specPath) throw new Error('--openapi needs a local OpenAPI JSON file path');
    const spec = JSON.parse(await readFile(resolve(specPath), 'utf8'));
    results = compareAgainstOpenApi(entries, spec, prefix);
  }
  const summary = {
    proposedReadEndpoints: results.length,
    sourceFiles: [...new Set(results.map(entry => entry.file))],
    uiApiClientImports: uiImports,
    verifiedAgainstProvidedOpenApi: openApiIndex >= 0,
    declaredMethodsAndPaths: results.filter(r => r.contractStatus === 'DECLARED_IN_SPEC').length,
    missingFromProvidedSpec: results.filter(r => r.contractStatus === 'NOT_IN_SPEC').length,
    releaseReady: false, // API spec existence does not prove authentication, writes or persistence.
    proposedEndpoints: results,
  };
  if (args.includes('--json')) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`Office API source inventory: ${summary.proposedReadEndpoints} unimplemented read wrappers in ${summary.sourceFiles.length} files`);
    console.log(`Direct production UI imports of API wrappers/client: ${uiImports.length}`);
    if (openApiIndex >= 0) {
      console.log(`Proposed method/path present in supplied spec: ${summary.declaredMethodsAndPaths}/${results.length}`);
      for (const result of results.filter(r => r.contractStatus === 'NOT_IN_SPEC')) {
        console.log(`NOT IN SPEC: ${result.function} → ${result.expectedPath}`);
      }
    } else console.log('BLOCKED: no authoritative Office OpenAPI contract has been supplied');
    console.log('NOT RELEASE READY: read contract matching alone cannot certify actual integration, roles, writes or SQL read-back');
  }
  if (args.includes('--release')) process.exitCode = 2;
}

main().catch(error => { console.error(`Office API contract audit failed: ${error.message}`); process.exitCode = 1; });
