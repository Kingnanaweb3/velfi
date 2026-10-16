// Privy's wallet code uses Node's Buffer, which browsers don't have. Without
// this, signing a payment fails inside Privy with "Buffer is not defined".
// Imported first in main.jsx so it is in place before any wallet code runs.
import { Buffer } from 'buffer'

if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = Buffer
if (typeof window !== 'undefined' && typeof window.global === 'undefined') window.global = globalThis
