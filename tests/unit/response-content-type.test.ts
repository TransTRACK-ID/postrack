import { describe, expect, it } from 'vitest';
import {
  extractDownloadFilenameFromHeaders,
  getExtensionForContentType,
  getFilenameFromContentDisposition,
  isBinaryResponseContentType,
  isJsonResponseContentType,
  isTextResponseContentType,
  isXmlResponseContentType,
  resolveDownloadFilename
} from '../../app/utils/response-content-type';

describe('response-content-type', () => {
  it('treats spreadsheet and other vendor application types as binary', () => {
    expect(
      isBinaryResponseContentType(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
    ).toBe(true);
    expect(isBinaryResponseContentType('application/vnd.ms-excel')).toBe(true);
    expect(isBinaryResponseContentType('application/pdf')).toBe(true);
    expect(isBinaryResponseContentType('application/zip')).toBe(true);
    expect(isBinaryResponseContentType('application/octet-stream')).toBe(true);
  });

  it('keeps text-based application types as non-binary', () => {
    expect(isBinaryResponseContentType('application/json')).toBe(false);
    expect(isBinaryResponseContentType('application/xml')).toBe(false);
    expect(isBinaryResponseContentType('application/javascript')).toBe(false);
    expect(isBinaryResponseContentType('application/x-www-form-urlencoded')).toBe(false);
    expect(isBinaryResponseContentType('application/problem+json')).toBe(false);
    expect(isBinaryResponseContentType('application/vnd.api+json')).toBe(false);
    expect(isBinaryResponseContentType('application/soap+xml')).toBe(false);
  });

  it('does not treat office openxml spreadsheets as XML', () => {
    const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    expect(isXmlResponseContentType(xlsx)).toBe(false);
    expect(isBinaryResponseContentType(xlsx)).toBe(true);
    expect(isJsonResponseContentType(xlsx)).toBe(false);
  });

  it('still treats real XML content types as XML', () => {
    expect(isXmlResponseContentType('application/xml')).toBe(true);
    expect(isXmlResponseContentType('text/xml')).toBe(true);
    expect(isXmlResponseContentType('application/soap+xml')).toBe(true);
  });

  it('classifies common media families', () => {
    expect(isBinaryResponseContentType('image/png')).toBe(true);
    expect(isBinaryResponseContentType('audio/mpeg')).toBe(true);
    expect(isBinaryResponseContentType('video/mp4')).toBe(true);
    expect(isTextResponseContentType('text/plain')).toBe(true);
    expect(isTextResponseContentType('text/html')).toBe(true);
    expect(isJsonResponseContentType('application/json; charset=utf-8')).toBe(true);
  });

  it('maps known mime types to extensions', () => {
    expect(
      getExtensionForContentType(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
    ).toBe('xlsx');
    expect(getExtensionForContentType('application/pdf')).toBe('pdf');
  });

  it('extracts filenames from content-disposition headers', () => {
    expect(getFilenameFromContentDisposition('attachment; filename="report.xlsx"')).toBe('report.xlsx');
    expect(getFilenameFromContentDisposition("attachment; filename*=UTF-8''report%20file.xlsx")).toBe('report file.xlsx');
    expect(getFilenameFromContentDisposition('attachment;filename=export.xlsx')).toBe('export.xlsx');
    expect(getFilenameFromContentDisposition('attachment; filename="postrack.xlsx"; filename*=UTF-8\'\'api-report.xlsx')).toBe('api-report.xlsx');
    expect(getFilenameFromContentDisposition('attachment; fileName="devices-report.xlsx"')).toBe('devices-report.xlsx');
    expect(getFilenameFromContentDisposition('attachment; filename=report%20devices.xlsx')).toBe('report devices.xlsx');
  });

  it('extracts filenames from response headers and custom filename headers', () => {
    expect(extractDownloadFilenameFromHeaders({
      'content-disposition': 'attachment; filename="api-report.xlsx"'
    })).toBe('api-report.xlsx');

    expect(extractDownloadFilenameFromHeaders({
      'X-Filename': 'api-report.xlsx'
    })).toBe('api-report.xlsx');
  });

  it('prefers upstream filename over postrack fallback when resolving downloads', () => {
    expect(resolveDownloadFilename({
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bodyFilename: 'api-report.xlsx'
    })).toBe('api-report.xlsx');

    expect(resolveDownloadFilename({
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentDisposition: 'attachment; filename="api-report.xlsx"'
    })).toBe('api-report.xlsx');

    expect(resolveDownloadFilename({
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      headers: { 'X-Filename': 'api-report.xlsx' }
    })).toBe('api-report.xlsx');

    expect(resolveDownloadFilename({
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      requestUrl: 'https://api.example.com/api/v1/report-devices/excel'
    })).toBe('excel.xlsx');
  });
});
