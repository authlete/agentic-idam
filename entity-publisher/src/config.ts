// Read an env var, falling back to a default when it is unset or empty.
function envString(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : Number(value);
}

export const config = {
  port: envNumber('PORT', 8092),
  publicBaseUrl: envString('PUBLIC_BASE_URL', 'http://localhost:8092'),
} as const;
