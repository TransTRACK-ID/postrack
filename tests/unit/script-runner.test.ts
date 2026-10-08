import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module — the real one creates a pg Pool at import time and
// exits the process when DATABASE_URL is unset. The script runner only needs
// chainable select/insert/update/delete calls that resolve.
const harness = vi.hoisted(() => ({
  envRows: [] as Array<{ id: string; environmentId: string; key: string; value: string; isSecret: boolean }>,
  writes: [] as Array<{ op: 'insert' | 'update' | 'delete'; values?: any }>
}));

vi.mock('../../server/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(harness.envRows)
      })
    }),
    insert: () => ({
      values: (values: any) => {
        harness.writes.push({ op: 'insert', values });
        return Promise.resolve();
      }
    }),
    update: () => ({
      set: (values: any) => ({
        where: () => {
          harness.writes.push({ op: 'update', values });
          return Promise.resolve();
        }
      })
    }),
    delete: () => ({
      where: () => {
        harness.writes.push({ op: 'delete' });
        return Promise.resolve();
      }
    })
  }
}));

import { executePreScript, executePostScript } from '../../server/services/script-runner';

const ENV = 'env-test';
const COLL_ENV = 'env-collection';
const baseContext = { url: 'https://api.example.com/login', method: 'POST', headers: {} as Record<string, string> };

const seedEnv = (vars: Record<string, string>) => {
  harness.envRows = Object.entries(vars).map(([key, value], i) => ({
    id: `row-${i}`,
    environmentId: ENV,
    key,
    value,
    isSecret: false
  }));
};

const seedCollectionEnv = (vars: Record<string, string>) => {
  harness.envRows.push(
    ...Object.entries(vars).map(([key, value], i) => ({
      id: `coll-row-${i}`,
      environmentId: COLL_ENV,
      key,
      value,
      isSecret: false
    }))
  );
};

beforeEach(() => {
  harness.envRows = [];
  harness.writes = [];
});

describe('executePreScript', () => {
  it('supports the imported Postman script pattern (replaceIn + CryptoJS + body.update formdata)', async () => {
    seedEnv({ username: 'alice', password: 's3cret', uuid: 'uuid-123' });

    const code = `
const template = pm.variables.replaceIn('{"username":"{{username}}","password":"{{password}}","UUID":"{{uuid}}"}');
const postData = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(template));
pm.request.body.update({
  mode: "formdata",
  formdata: [{ key: "postData", value: postData, type: "text" }]
});
console.log("JSON " + template);
console.log("postData " + postData);
`;

    const result = await executePreScript({ code, context: { ...baseContext }, environmentId: ENV });

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);

    const expectedTemplate = '{"username":"alice","password":"s3cret","UUID":"uuid-123"}';
    const expectedBase64 = Buffer.from(expectedTemplate, 'utf8').toString('base64');

    // body.update produces the serializable form-data marker the request layer converts
    const body = result.modifiedContext?.body;
    expect(body?.__formData).toBe(true);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({
      key: 'postData',
      value: expectedBase64,
      type: 'text',
      isFile: false
    });

    const messages = result.logs.map(l => l.message);
    expect(messages[0]).toBe(`JSON ${expectedTemplate}`);
    expect(messages[1]).toBe(`postData ${expectedBase64}`);
  });

  it('resolves collection variables when the selected environment lacks them (env wins on conflicts)', async () => {
    // Mirrors the reported scenario: selected env has `password` but not
    // `username`/`uuid`; the collection's variables env provides all three.
    seedEnv({ password: 's3cret' });
    seedCollectionEnv({ username: 'kevin', uuid: 'device-001', password: 'kevin' });

    const code = `
const template = pm.variables.replaceIn('{"username":"{{username}}","password":"{{password}}","UUID":"{{uuid}}"}');
const postData = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(template));
pm.request.body.update({
  mode: "formdata",
  formdata: [{ key: "postData", value: postData, type: "text" }]
});
console.log("JSON " + template);
`;

    const result = await executePreScript({
      code,
      context: { ...baseContext },
      environmentId: ENV,
      collectionEnvironmentId: COLL_ENV
    });

    expect(result.success).toBe(true);
    // username/uuid resolved from collection scope; env's password wins over collection's
    expect(result.logs[0].message).toBe('JSON {"username":"kevin","password":"s3cret","UUID":"device-001"}');
    const body = result.modifiedContext?.body;
    expect(body?.__formData).toBe(true);
    expect(body.entries[0].value).toBe(
      Buffer.from('{"username":"kevin","password":"s3cret","UUID":"device-001"}', 'utf8').toString('base64')
    );
  });

  it('pm.collectionVariables writes target the collection scope, pm.variables reads through it', async () => {
    seedEnv({ fromEnv: 'env-value' });
    seedCollectionEnv({ fromCollection: 'coll-value' });

    const result = await executePreScript({
      code: `
console.log(pm.variables.get('fromCollection'));
console.log(pm.variables.get('fromEnv'));
console.log(pm.collectionVariables.get('fromCollection'));
pm.collectionVariables.set('cv', 'x');
pm.environment.set('ev', 'y');
`,
      context: { ...baseContext },
      environmentId: ENV,
      collectionEnvironmentId: COLL_ENV
    });

    expect(result.success).toBe(true);
    expect(result.logs.map(l => l.message).slice(0, 3)).toEqual(['coll-value', 'env-value', 'coll-value']);
    expect(result.environmentChanges).toEqual([
      { key: 'cv', value: 'x', action: 'set', environmentId: COLL_ENV },
      { key: 'ev', value: 'y', action: 'set', environmentId: ENV }
    ]);
    // The collection write persists to the collection environment, not the selected one
    expect(harness.writes.some(
      w => w.op === 'insert' && w.values?.environmentId === COLL_ENV && w.values?.key === 'cv'
    )).toBe(true);
    expect(harness.writes.some(
      w => w.op === 'insert' && w.values?.environmentId === ENV && w.values?.key === 'ev'
    )).toBe(true);
  });

  it('runs without an environment — magic vars resolve, env writes warn instead of persisting', async () => {
    const result = await executePreScript({
      code: `
console.log(pm.variables.replaceIn('{{$randomUUID}}'));
pm.environment.set('x', '1');
`,
      context: { ...baseContext }
    });

    expect(result.success).toBe(true);
    expect(result.logs[0].message).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.logs.some(l => l.type === 'warn')).toBe(true);
    expect(result.environmentChanges).toEqual([]);
    expect(harness.writes).toEqual([]);
  });

  it('resolves pm.variables.get/set in local scope and leaves env vars untouched', async () => {
    const result = await executePreScript({
      code: `
pm.variables.set('scratch', 'local-value');
console.log(pm.variables.get('scratch'));
pm.test('local var visible', function () {
  pm.expect(pm.variables.get('scratch')).to.eql('local-value');
});
`,
      context: { ...baseContext },
      environmentId: ENV
    });

    expect(result.success).toBe(true);
    expect(result.logs[0].message).toBe('local-value');
    expect(result.testResults?.[0]).toMatchObject({ name: 'local var visible', passed: true, phase: 'pre' });
    // pm.variables is script-local — nothing should be persisted
    expect(result.environmentChanges ?? []).toEqual([]);
  });

  it('supports require("crypto-js") and rejects non-whitelisted modules', async () => {
    const ok = await executePreScript({
      code: `
const CJS = require('crypto-js');
console.log(CJS.enc.Base64.stringify(CJS.enc.Utf8.parse('abc')));
`,
      context: { ...baseContext },
      environmentId: ENV
    });
    expect(ok.success).toBe(true);
    expect(ok.logs[0].message).toBe('YWJj');

    const bad = await executePreScript({
      code: `require('fs');`,
      context: { ...baseContext },
      environmentId: ENV
    });
    expect(bad.success).toBe(false);
    expect(bad.errors.join(' ')).toContain('not available');
  });

  it('persists pm.environment.set writes to the database', async () => {
    const result = await executePreScript({
      code: `pm.environment.set('token', 'abc123');`,
      context: { ...baseContext },
      environmentId: ENV
    });

    expect(result.success).toBe(true);
    expect(result.environmentChanges).toEqual([{ key: 'token', value: 'abc123', action: 'set', environmentId: ENV }]);
    expect(harness.writes.some(w => w.op === 'insert' && w.values?.key === 'token' && w.values?.value === 'abc123')).toBe(true);
  });
});

describe('executePostScript', () => {
  const loginResponse = () => ({
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: 'S',
      data: {
        driverId: 'd-1',
        companyId: 'c-1',
        userId: 'u-1',
        vehicleNo: 'B 1234 CD',
        username: 'alice',
        api_key: 'key-9',
        external_driver_id: 'ext-7',
        currency: 'IDR',
        selaride_base_url: 'https://selaride.example.com/api'
      }
    })
  });

  it('runs pm.test assertions, parses JSON and writes env/collection variables', async () => {
    const code = `
let res = {};
try { res = pm.response.json(); } catch (e) { res = {}; }
pm.test("Response is JSON", function () { pm.expect(res).to.be.an("object"); });
pm.test("success is S", function () { pm.expect(res.success).to.eql("S"); });
if (res.success === "S" && res.data) {
  const d = res.data;
  const copy = {
    driverId: d.driverId,
    companyId: d.companyId,
    userId: d.userId,
    vehicleNo: d.vehicleNo,
    username: d.username,
    api_key: d.api_key,
    external_driver_id: d.external_driver_id,
    currency: d.currency
  };
  Object.keys(copy).forEach((key) => {
    if (copy[key] !== undefined && copy[key] !== null && copy[key] !== "") {
      pm.environment.set(key, String(copy[key]));
      pm.collectionVariables.set(key, String(copy[key]));
    }
  });
  if (d.selaride_base_url) {
    let base = String(d.selaride_base_url);
    if (!base.endsWith("/")) base += "/";
    pm.environment.set("selarideBaseUrl", base);
    pm.collectionVariables.set("selarideBaseUrl", base);
  }
}
`;

    const result = await executePostScript({
      code,
      context: { ...baseContext },
      response: loginResponse(),
      environmentId: ENV
    });

    expect(result.success).toBe(true);
    expect(result.testResults).toHaveLength(2);
    expect(result.testResults?.every(t => t.passed && t.phase === 'post')).toBe(true);
    expect(result.testResults?.map(t => t.name)).toEqual(['Response is JSON', 'success is S']);

    const changes = result.environmentChanges ?? [];
    // environment.set + collectionVariables.set both write to the env-backed store
    expect(changes.some(c => c.key === 'driverId' && c.value === 'd-1' && c.action === 'set')).toBe(true);
    expect(changes.some(c => c.key === 'currency' && c.value === 'IDR' && c.action === 'set')).toBe(true);
    // base URL gets the trailing slash appended
    expect(changes.some(c => c.key === 'selarideBaseUrl' && c.value === 'https://selaride.example.com/api/')).toBe(true);
  });

  it('records assertion failures without aborting the script', async () => {
    const result = await executePostScript({
      code: `
const res = pm.response.json();
pm.test("success is S", function () { pm.expect(res.success).to.eql("S"); });
pm.test("wrong assertion", function () { pm.expect(res.success).to.eql("F"); });
pm.environment.set("after", "still-ran");
`,
      context: { ...baseContext },
      response: loginResponse(),
      environmentId: ENV
    });

    expect(result.success).toBe(true);
    expect(result.testResults?.[0].passed).toBe(true);
    expect(result.testResults?.[1]).toMatchObject({ name: 'wrong assertion', passed: false, phase: 'post' });
    expect(result.testResults?.[1].error).toContain('deeply equal');
    // script continued past the failing test
    expect(result.environmentChanges?.some(c => c.key === 'after')).toBe(true);
  });

  it('awaits async pm.test callbacks and supports pm.response.to.have.status()', async () => {
    const result = await executePostScript({
      code: `
pm.test("status check", function () { pm.response.to.have.status(200); });
pm.test("async check", async function () {
  await Promise.resolve();
  pm.expect(pm.response.code).to.eql(200);
});
pm.test.skip("skipped one");
`,
      context: { ...baseContext },
      response: loginResponse(),
      environmentId: ENV
    });

    expect(result.success).toBe(true);
    expect(result.testResults).toHaveLength(3);
    expect(result.testResults?.map(t => [t.name, t.passed, !!t.skipped])).toEqual([
      ['status check', true, false],
      ['async check', true, false],
      ['skipped one', true, true]
    ]);
  });

  it('handles non-JSON response bodies like Postman (pm.response.json throws)', async () => {
    const result = await executePostScript({
      code: `
let res = {};
try { res = pm.response.json(); } catch (e) { res = {}; }
pm.test("empty object fallback", function () { pm.expect(res).to.be.an("object"); });
console.log('text:' + pm.response.text());
`,
      context: { ...baseContext },
      response: { status: 200, statusText: 'OK', headers: {}, body: '<html>nope</html>' },
      environmentId: ENV
    });

    expect(result.success).toBe(true);
    expect(result.testResults?.[0].passed).toBe(true);
    expect(result.logs[0].message).toBe('text:<html>nope</html>');
  });
});

describe('sandbox safety', () => {
  it('exposes legacy postman.* aliases', async () => {
    const result = await executePreScript({
      code: `
postman.setEnvironmentVariable('legacy', 'yes');
console.log(postman.getEnvironmentVariable('legacy'));
`,
      context: { ...baseContext },
      environmentId: ENV
    });

    expect(result.success).toBe(true);
    expect(result.logs[0].message).toBe('yes');
    expect(result.environmentChanges?.[0]).toEqual({ key: 'legacy', value: 'yes', action: 'set', environmentId: ENV });
  });

  it('does not expose Node.js builtins or process', async () => {
    const result = await executePreScript({
      code: `console.log(typeof process, typeof require === 'function' ? 'fn' : typeof require);`,
      context: { ...baseContext },
      environmentId: ENV
    });
    expect(result.logs[0].message).toBe('undefined fn');
  });
});
