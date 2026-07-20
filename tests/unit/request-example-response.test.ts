import { describe, expect, it } from 'vitest';
import {
  formatRequestExampleResponse,
  normalizeRequestExampleInput,
  serializeRequestExampleInput
} from '../../server/utils/request-example-response';

describe('request-example-response', () => {
  it('parses stored JSON text fields when formatting example responses', () => {
    const formatted = formatRequestExampleResponse({
      id: 'example-1',
      requestId: 'request-1',
      name: 'Success',
      statusCode: 200,
      headers: '{"content-type":"application/json"}',
      body: '{"msg":"pong!"}',
      requestQueryParams: '[{"key":"ABC","value":"OK","enabled":true}]',
      requestBody: '{"ABC":"AA"}',
      isDefault: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    });

    expect(formatted.headers).toEqual({ 'content-type': 'application/json' });
    expect(formatted.body).toEqual({ msg: 'pong!' });
    expect(formatted.requestQueryParams).toEqual([{ key: 'ABC', value: 'OK', enabled: true }]);
    expect(formatted.requestBody).toEqual({ ABC: 'AA' });
  });

  it('normalizes stringified JSON input before persistence', () => {
    const normalized = normalizeRequestExampleInput({
      headers: '{"content-type":"application/json"}',
      requestQueryParams: '[{"key":"ABC","value":"OK","enabled":true}]'
    });

    expect(normalized.headers).toEqual({ 'content-type': 'application/json' });
    expect(normalized.requestQueryParams).toEqual([{ key: 'ABC', value: 'OK', enabled: true }]);
  });

  it('serializes array query params to JSON text for database storage', () => {
    const serialized = serializeRequestExampleInput({
      requestQueryParams: [{ key: 'ABC', value: 'OK', enabled: true }],
      headers: { 'content-type': 'application/json' }
    });

    expect(serialized.requestQueryParams).toBe('[{"key":"ABC","value":"OK","enabled":true}]');
    expect(serialized.headers).toBe('{"content-type":"application/json"}');
    expect(JSON.parse(serialized.requestQueryParams!)).toEqual([{ key: 'ABC', value: 'OK', enabled: true }]);
  });
});
