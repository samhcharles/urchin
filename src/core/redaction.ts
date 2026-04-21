const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]'],
  [/\bsk-[A-Za-z0-9]{20,}\b/g, '[REDACTED_API_KEY]'],
  [/\b\d+\|[A-Za-z0-9]{20,}\b/g, '[REDACTED_TOKEN]'],
  [
    /\b((?:access|api|auth|bearer|coolify|db|github|openai|token|secret|password|key)[A-Za-z0-9_]*)(\s*[:=]\s*)([^\s"']+)/gi,
    '$1$2[REDACTED]',
  ],
  [
    /\b((?:access|api|auth|bearer|coolify|db|github|openai|token|secret|password|key)[A-Za-z0-9_]*)(\s*[:=]\s*["'])([^"']+)(["'])/gi,
    '$1$2[REDACTED]$4',
  ],
  [/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/g, '$1[REDACTED]:[REDACTED]@'],
];

export function redact(text: string): string {
  let output = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (const [pattern, replacement] of SECRET_PATTERNS) {
    output = output.replace(pattern, replacement);
  }

  return output;
}

export function truncate(text: string, limit = 1500): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(0, limit - 3).trimEnd()}...`;
}

export function sanitize(text: string, limit = 1500): string {
  return truncate(redact(text), limit);
}
