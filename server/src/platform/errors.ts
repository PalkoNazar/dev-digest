/**
 * Domain error taxonomy + structured API error envelope. The UX taxonomy
 * (toast/inline/full-screen) is the frontend's concern; the API returns a
 * stable structured body (ApiErrorBody): { error: { code, message, details } }.
 */

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', details?: unknown) {
    super('not_found', message, 404, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super('validation_error', message, 422, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super('conflict', message, 409, details);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, details?: unknown) {
    super('external_service_error', message, 502, details);
  }
}

export class ConfigError extends AppError {
  constructor(message: string, details?: unknown) {
    super('config_error', message, 500, details);
  }
}

/**
 * Mask API-key-like tokens in a message before it is stored or shown. Provider
 * errors echo the (partly masked) key, e.g. "Incorrect API key provided: sk-or-v1***8443";
 * secrets must never reach the DB, logs or traces.
 */
export function redactSecrets(message: string): string {
  return message.replace(
    /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|github_pat|xox[abp])[-_][A-Za-z0-9_*-]{4,}/g,
    '[redacted]',
  );
}
