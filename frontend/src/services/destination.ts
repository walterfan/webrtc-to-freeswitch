// eslint-disable-next-line no-control-regex -- reject C0 controls before URI parse
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const NUMERIC_EXTENSION = /^\d{1,20}$/;

export type SipUriLike = { toString(): string };

export type UriBuilder = {
  parse(value: string): SipUriLike | undefined;
  fromUserHost(user: string, host: string): SipUriLike;
};

export function rejectControlCharacters(value: string): void {
  if (CONTROL_CHARS.test(value)) {
    throw new Error("validation");
  }
}

export function normalizeDestination(raw: string, sipDomain: string, uri: UriBuilder): string {
  const trimmed = raw.trim();
  rejectControlCharacters(trimmed);
  rejectControlCharacters(sipDomain);
  if (!trimmed) {
    throw new Error("validation");
  }
  if (NUMERIC_EXTENSION.test(trimmed)) {
    return uri.fromUserHost(trimmed, sipDomain).toString();
  }
  const parsed = uri.parse(trimmed);
  if (!parsed) {
    throw new Error("validation");
  }
  const normalized = parsed.toString();
  if (!normalized.toLowerCase().startsWith("sip:")) {
    throw new Error("validation");
  }
  return normalized;
}
