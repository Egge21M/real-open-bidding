export class OracleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export function requireCondition(
  condition: unknown,
  code: string,
  status = 400,
): asserts condition {
  if (!condition) throw new OracleError(status, code);
}
