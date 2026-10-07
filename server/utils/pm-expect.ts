/**
 * Postman-compatible assertion engine for the pm.* scripting sandbox.
 *
 * Implements the chai-style API surface used by Postman test scripts:
 *   pm.expect(res).to.be.an('object')
 *   pm.expect(res.success).to.eql('S')
 *   pm.expect(list).to.include(item)
 *   pm.response.to.have.status(200)
 */

export class PmAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

const inspect = (value: unknown): string => {
  if (typeof value === 'string') {
    return JSON.stringify(value.length > 200 ? value.slice(0, 197) + '…' : value);
  }
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return String(value);
    return json.length > 200 ? json.slice(0, 197) + '…' : json;
  } catch {
    return String(value);
  }
};

const deepEqual = (a: any, b: any, seen = new Map<any, any>()): boolean => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (seen.get(a) === b) return true;
  seen.set(a, b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(
    k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k], seen)
  );
};

// chai type-detect semantics: 'array', 'null', 'date', 'regexp', 'map', 'set', ...
const typeOf = (value: any): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (value instanceof RegExp) return 'regexp';
  if (value instanceof Map) return 'map';
  if (value instanceof Set) return 'set';
  if (value instanceof ArrayBuffer) return 'arraybuffer';
  if (ArrayBuffer.isView(value)) return 'typedarray';
  return typeof value;
};

const lengthOf = (value: any): number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value.length === 'number') return value.length;
  if (typeof value.size === 'number') return value.size;
  if (typeof value === 'object') return Object.keys(value).length;
  return undefined;
};

// A value that looks like a pm.response facade (status/code + headers object)
const isResponseLike = (v: any): boolean =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  (typeof v.status === 'number' || typeof v.code === 'number') &&
  !!v.headers &&
  typeof v.headers === 'object';

const responseStatus = (v: any): number => v.status ?? v.code;

const getDeepPath = (obj: any, path: string): { found: boolean; value: any } => {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || !(part in Object(current))) {
      return { found: false, value: undefined };
    }
    current = current[part];
  }
  return { found: true, value: current };
};

export class PmExpectation {
  private _value: any;
  private _negated = false;
  private _deep = false;
  private _listMode: 'all' | 'any' = 'all';
  private _msg?: string;

  constructor(value: any, message?: string) {
    this._value = value;
    this._msg = message;
  }

  // ---- Language chain getters (no-ops that return this) ----
  get to() { return this; }
  get be() { return this; }
  get been() { return this; }
  get is() { return this; }
  get and() { return this; }
  get has() { return this; }
  get have() { return this; }
  get with() { return this; }
  get that() { return this; }
  get which() { return this; }
  get at() { return this; }
  get of() { return this; }
  get same() { return this; }
  get but() { return this; }
  get does() { return this; }
  get still() { return this; }
  get also() { return this; }

  // ---- Flags ----
  get not() {
    this._negated = !this._negated;
    return this;
  }
  get deep() {
    this._deep = true;
    return this;
  }
  get all() {
    this._listMode = 'all';
    return this;
  }
  get any() {
    this._listMode = 'any';
    return this;
  }
  get nested() {
    this._deep = true;
    return this;
  }

  private _assert(ok: boolean, expectation: string): this {
    const pass = this._negated ? !ok : ok;
    if (!pass) {
      const prefix = this._msg ? `${this._msg}: ` : '';
      throw new PmAssertionError(
        `${prefix}expected ${inspect(this._value)}${this._negated ? ' not' : ''} ${expectation}`
      );
    }
    this._negated = false;
    this._deep = false;
    this._listMode = 'all';
    return this;
  }

  // ---- Equality ----

  equal(expected: any): this {
    const ok = this._deep ? deepEqual(this._value, expected) : this._value === expected;
    return this._assert(ok, `to ${this._deep ? 'deep ' : ''}equal ${inspect(expected)}`);
  }
  eq(expected: any): this { return this.equal(expected); }
  equals(expected: any): this { return this.equal(expected); }
  eql(expected: any): this {
    return this._assert(deepEqual(this._value, expected), `to deeply equal ${inspect(expected)}`);
  }
  eqls(expected: any): this { return this.eql(expected); }

  // ---- Type ----

  a(type: string): this {
    const t = String(type).toLowerCase();
    const article = /^[aeiou]/i.test(t) ? 'an' : 'a';
    return this._assert(typeOf(this._value) === t, `to be ${article} '${t}'`);
  }
  an(type: string): this { return this.a(type); }

  instanceof(ctor: any): this {
    return this._assert(
      typeof ctor === 'function' && this._value instanceof ctor,
      `to be an instance of ${ctor?.name || 'constructor'}`
    );
  }
  instanceOf(ctor: any): this { return this.instanceof(ctor); }

  // ---- Truthiness / presence (property-style assertions) ----

  get ok(): this {
    // Response-aware: pm.response.to.be.ok asserts a 2xx/3xx success; otherwise truthy.
    const ok = isResponseLike(this._value)
      ? responseStatus(this._value) < 400
      : !!this._value;
    return this._assert(ok, 'to be ok');
  }
  get true(): this {
    return this._assert(this._value === true, 'to be true');
  }
  get false(): this {
    return this._assert(this._value === false, 'to be false');
  }
  get null(): this {
    return this._assert(this._value === null, 'to be null');
  }
  get undefined(): this {
    return this._assert(this._value === undefined, 'to be undefined');
  }
  get exist(): this {
    return this._assert(this._value !== null && this._value !== undefined, 'to exist');
  }
  get exists(): this { return this.exist; }
  get empty(): this {
    const v = this._value;
    let ok: boolean;
    if (typeof v === 'string' || Array.isArray(v)) ok = v.length === 0;
    else if (v instanceof Map || v instanceof Set) ok = v.size === 0;
    else if (v && typeof v === 'object') ok = Object.keys(v).length === 0;
    else ok = !v;
    return this._assert(ok, 'to be empty');
  }

  // ---- Response status classes (pm.response.to.be.success etc.) ----

  private _statusClass(expectation: string, test: (status: number) => boolean): this {
    if (!isResponseLike(this._value)) {
      return this._assert(false, `to ${expectation} (value is not a response)`);
    }
    return this._assert(test(responseStatus(this._value)), `to ${expectation}`);
  }

  get info(): this { return this._statusClass('be informational (1xx)', s => s >= 100 && s < 200); }
  get informational(): this { return this.info; }
  get success(): this { return this._statusClass('be successful (2xx)', s => s >= 200 && s < 300); }
  get successful(): this { return this.success; }
  get redirection(): this { return this._statusClass('be a redirection (3xx)', s => s >= 300 && s < 400); }
  get clientError(): this { return this._statusClass('be a client error (4xx)', s => s >= 400 && s < 500); }
  get serverError(): this { return this._statusClass('be a server error (5xx)', s => s >= 500 && s < 600); }
  get error(): this { return this._statusClass('be an error (4xx/5xx)', s => s >= 400); }

  // ---- Inclusion ----

  include(expected: any): this {
    const v = this._value;
    let ok = false;
    if (typeof v === 'string' && typeof expected === 'string') {
      ok = v.includes(expected);
    } else if (Array.isArray(v)) {
      ok = this._deep ? v.some(item => deepEqual(item, expected)) : v.includes(expected);
    } else if (v instanceof Map) {
      ok = v.has(expected);
    } else if (v instanceof Set) {
      ok = v.has(expected);
    } else if (v && typeof v === 'object' && expected && typeof expected === 'object') {
      ok = Object.entries(expected).every(
        ([k, ev]) =>
          Object.prototype.hasOwnProperty.call(v, k) &&
          (this._deep ? deepEqual(v[k], ev) : v[k] === ev)
      );
    }
    return this._assert(ok, `to include ${inspect(expected)}`);
  }
  includes(expected: any): this { return this.include(expected); }
  contain(expected: any): this { return this.include(expected); }
  contains(expected: any): this { return this.include(expected); }

  string(substring: string): this {
    const ok = typeof this._value === 'string' && this._value.includes(String(substring));
    return this._assert(ok, `to contain string ${inspect(substring)}`);
  }

  // ---- Properties / keys / members ----

  property(name: string, expectedValue?: any): this {
    const path = getDeepPath(this._value, String(name));
    let ok = path.found;
    if (ok && arguments.length > 1) {
      ok = this._deep ? deepEqual(path.value, expectedValue) : path.value === expectedValue;
    }
    const expectation =
      arguments.length > 1
        ? `to have property '${name}' with value ${inspect(expectedValue)}`
        : `to have property '${name}'`;
    return this._assert(ok, expectation);
  }
  ownProperty(name: string, expectedValue?: any): this {
    return arguments.length > 1 ? this.property(name, expectedValue) : this.property(name);
  }
  haveOwnProperty(name: string, expectedValue?: any): this {
    return arguments.length > 1 ? this.property(name, expectedValue) : this.property(name);
  }

  keys(...names: any[]): this {
    const flat = names.length === 1 && Array.isArray(names[0]) ? names[0] : names;
    const expected = flat.map(String);
    const v = this._value;
    const actual =
      v instanceof Map
        ? Array.from(v.keys()).map(String)
        : v && typeof v === 'object'
          ? Object.keys(v)
          : [];
    const ok =
      this._listMode === 'any'
        ? expected.some(k => actual.includes(k))
        : expected.every(k => actual.includes(k));
    return this._assert(ok, `to have ${this._listMode === 'any' ? 'any' : 'all'} keys ${inspect(expected)}`);
  }

  members(expected: any[]): this {
    const v = this._value;
    const ok =
      Array.isArray(v) &&
      Array.isArray(expected) &&
      (this._listMode === 'any'
        ? expected.some(e => v.some(item => (this._deep ? deepEqual(item, e) : item === e)))
        : expected.every(e => v.some(item => (this._deep ? deepEqual(item, e) : item === e))));
    return this._assert(!!ok, `to have members ${inspect(expected)}`);
  }

  // ---- Length / size ----

  length(n: number): this {
    const len = lengthOf(this._value);
    return this._assert(len === n, `to have a length of ${n}`);
  }
  lengthOf(n: number): this { return this.length(n); }

  // ---- Numeric comparisons ----

  private _compare(expectation: string, test: (n: number) => boolean): this {
    const n = lengthOf(this._value);
    return this._assert(n !== undefined && test(n), expectation);
  }

  above(n: number): this { return this._compare(`to be above ${n}`, v => v > n); }
  gt(n: number): this { return this.above(n); }
  greaterThan(n: number): this { return this.above(n); }
  least(n: number): this { return this._compare(`to be at least ${n}`, v => v >= n); }
  gte(n: number): this { return this.least(n); }
  below(n: number): this { return this._compare(`to be below ${n}`, v => v < n); }
  lt(n: number): this { return this.below(n); }
  lessThan(n: number): this { return this.below(n); }
  most(n: number): this { return this._compare(`to be at most ${n}`, v => v <= n); }
  lte(n: number): this { return this.most(n); }
  within(min: number, max: number): this {
    return this._compare(`to be within ${min}..${max}`, v => v >= min && v <= max);
  }
  closeTo(expected: number, delta: number): this {
    return this._compare(
      `to be close to ${expected} +/- ${delta}`,
      v => Math.abs(v - expected) <= delta
    );
  }
  approximately(expected: number, delta: number): this { return this.closeTo(expected, delta); }

  // ---- Pattern / misc ----

  match(re: RegExp | string): this {
    const ok =
      typeof this._value === 'string' &&
      (re instanceof RegExp ? re.test(this._value) : this._value.includes(re));
    return this._assert(ok, `to match ${String(re)}`);
  }

  oneOf(list: any[]): this {
    const ok =
      Array.isArray(list) &&
      list.some(item => (this._deep ? deepEqual(item, this._value) : item === this._value));
    return this._assert(ok, `to be one of ${inspect(list)}`);
  }

  satisfy(fn: (value: any) => boolean): this {
    let ok = false;
    try {
      ok = typeof fn === 'function' && !!fn(this._value);
    } catch {
      ok = false;
    }
    return this._assert(ok, 'to satisfy the given predicate');
  }

  startWith(prefix: string): this {
    const ok = typeof this._value === 'string' && this._value.startsWith(String(prefix));
    return this._assert(ok, `to start with ${inspect(prefix)}`);
  }
  endWith(suffix: string): this {
    const ok = typeof this._value === 'string' && this._value.endsWith(String(suffix));
    return this._assert(ok, `to end with ${inspect(suffix)}`);
  }

  // ---- Response assertions (pm.response.to.have.status(200) etc.) ----

  status(code: number): this {
    if (!isResponseLike(this._value)) {
      return this._assert(false, `to have status ${code} (value is not a response)`);
    }
    return this._assert(responseStatus(this._value) === code, `to have status ${code}`);
  }

  header(name: string): this {
    const v = this._value;
    if (!isResponseLike(v)) {
      return this._assert(false, `to have header '${name}' (value is not a response)`);
    }
    const wanted = String(name).toLowerCase();
    const ok = Object.keys(v.headers).some(k => k.toLowerCase() === wanted);
    return this._assert(ok, `to have header '${name}'`);
  }

  jsonBody(): this {
    const v = this._value;
    if (!isResponseLike(v)) {
      return this._assert(false, 'to have a JSON body (value is not a response)');
    }
    let ok = false;
    if (v.body && typeof v.body === 'object') {
      ok = true;
    } else if (typeof v.body === 'string') {
      try {
        JSON.parse(v.body);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      const contentType = Object.keys(v.headers).find(k => k.toLowerCase() === 'content-type');
      if (contentType && /json/i.test(v.headers[contentType])) ok = true;
    }
    return this._assert(ok, 'to have a JSON body');
  }
  json(): this { return this.jsonBody(); }
}

/**
 * Create a Postman-style pm.expect(value[, message]) function.
 */
export function createExpect() {
  const expectFn: any = (value: any, message?: string) => new PmExpectation(value, message);
  expectFn.fail = (message?: string) => {
    throw new PmAssertionError(message || 'pm.expect.fail() was called');
  };
  return expectFn;
}
