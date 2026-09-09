/** Strip unified API envelope (`success` / `ok` / `message` / `requestId`). */

const ENVELOPE_KEYS = new Set(['ok', 'success', 'message', 'requestId'])

export function stripApiEnvelope (obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj
  const out = { ...obj }
  for (const k of ENVELOPE_KEYS) {
    delete out[k]
  }
  /** Flatten `{ data: { users, … } }` so list keys match what controllers send under `ok(..., data)`. */
  if (out.data != null && typeof out.data === 'object' && !Array.isArray(out.data)) {
    const inner = { ...out.data }
    const rest = { ...out }
    delete rest.data
    return { ...inner, ...rest }
  }
  const keys = Object.keys(out)
  if (keys.length === 1 && keys[0] === 'data' && out.data != null && typeof out.data === 'object' && !Array.isArray(out.data)) {
    return { ...out.data }
  }
  return out
}
