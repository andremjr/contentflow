export function sanitizeEvent(input: unknown): Record<string, string | number> | undefined;
export function safeError(error: unknown): Record<string, string | number>;
export function safeConsoleError(details: unknown): Record<string, string | number>;
export function hashId(value: unknown): string;
export function version(value: unknown): string | undefined;
