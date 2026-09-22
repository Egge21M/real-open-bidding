export class PublisherError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

export function requireCondition(
  value: unknown,
  code: string,
  status = 400,
): asserts value {
  if (!value) throw new PublisherError(status, code);
}
