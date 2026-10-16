// token = base64(JSON payload); good enough to exercise auth checks
export function sign(payload) { return Buffer.from(JSON.stringify(payload)).toString('base64') }
export function verify(token) { try { return JSON.parse(Buffer.from(token, 'base64').toString()) } catch { throw new Error('bad token') } }
export default { sign, verify }
