// Browser globals used by the clients, including on the supported Node 18 test runtime.
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'en', languages: ['en'] } });
