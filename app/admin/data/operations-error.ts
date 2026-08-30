export class OperationsError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 | 404 | 409 | 422 | 500,
    public readonly code: string,
  ) {
    super(message);
    this.name = "OperationsError";
  }
}
