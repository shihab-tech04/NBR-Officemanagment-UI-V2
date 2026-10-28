/** Only source-verified simulation records may reach the privileged mirror RPC. */
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

export function verifiedPaymentMirror(id: string, sessionId: string, payload: unknown): Record<string, unknown> | null {
  if (!uuidPattern.test(id) || !uuidPattern.test(sessionId)) return null;
  const envelope = object(payload);
  const record = object(envelope?.data);
  const data = object(record?.data);
  if (envelope?.success !== true || envelope.simulationOnly !== true || record?.status !== 'SIMULATED_SUCCESS' ||
      typeof record.id !== 'string' || record.id.toLowerCase() !== id.toLowerCase() ||
      !data || typeof data.sessionId !== 'string' || data.sessionId.toLowerCase() !== sessionId.toLowerCase() ||
      typeof data.service !== 'string' || typeof data.amountMinor !== 'number' ||
      !Number.isSafeInteger(data.amountMinor) || data.amountMinor <= 0 || typeof record.createdAt !== 'string') return null;
  // Do not use caller-supplied amount, status, service, timestamp, or details.
  return { id: record.id, sessionId, service: data.service, amountMinor: data.amountMinor,
    data, status: record.status, createdAt: record.createdAt };
}

export function verifiedAuthorizationMirror(id: string, payload: unknown): Record<string, unknown> | null {
  if (!uuidPattern.test(id)) return null;
  const envelope = object(payload);
  const data = object(envelope?.data);
  return envelope?.success === true && envelope.simulationOnly === true && typeof data?.id === 'string' &&
    data.id.toLowerCase() === id.toLowerCase() ? data : null;
}
