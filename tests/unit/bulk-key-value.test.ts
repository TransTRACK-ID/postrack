/**
 * Unit tests for bulk key-value parse/serialize utilities.
 * Run with: pnpm test:run tests/unit/bulk-key-value.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  parseBulkKeyValue,
  serializeBulkKeyValue,
} from '../../app/utils/bulk-key-value';

describe('parseBulkKeyValue', () => {
  it('parses Postman-style colon-separated lines', () => {
    const result = parseBulkKeyValue('Content-Type:application/json\nAccept:application/json');

    expect(result).toEqual([
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Accept', value: 'application/json' },
    ]);
  });

  it('parses URL query string format', () => {
    const result = parseBulkKeyValue('foo=bar&hello=world');

    expect(result).toEqual([
      { key: 'foo', value: 'bar' },
      { key: 'hello', value: 'world' },
    ]);
  });

  it('preserves values containing colons', () => {
    const result = parseBulkKeyValue('url:https://example.com:8080/path');

    expect(result).toEqual([
      { key: 'url', value: 'https://example.com:8080/path' },
    ]);
  });

  it('handles keys without values', () => {
    const result = parseBulkKeyValue('flag\nname:value');

    expect(result).toEqual([
      { key: 'flag', value: '' },
      { key: 'name', value: 'value' },
    ]);
  });
});

describe('serializeBulkKeyValue', () => {
  it('serializes enabled items in colon format by default', () => {
    const result = serializeBulkKeyValue([
      { key: 'foo', value: 'bar', enabled: true },
      { key: 'disabled', value: 'x', enabled: false },
      { key: 'baz', value: 'qux', enabled: true },
    ]);

    expect(result).toBe('foo:bar\nbaz:qux');
  });

  it('serializes in ampersand format when requested', () => {
    const result = serializeBulkKeyValue(
      [{ key: 'a b', value: 'c=d', enabled: true }],
      { format: 'ampersand' },
    );

    expect(result).toBe('a%20b=c%3Dd');
  });
});
