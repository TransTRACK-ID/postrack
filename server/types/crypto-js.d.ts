/**
 * Ambient declaration for crypto-js, which ships no bundled types.
 * The script sandbox exposes the library dynamically (CryptoJS global and
 * require('crypto-js')), so `any` coverage is sufficient here — Postman
 * compatibility is validated by tests, not types.
 */
declare module 'crypto-js' {
  const CryptoJS: any;
  export = CryptoJS;
}
