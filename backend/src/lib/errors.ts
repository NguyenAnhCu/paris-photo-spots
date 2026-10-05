// Lives in lib/ (not middleware/) so services and repositories can throw it without depending on the HTTP layer.
// `code` is a stable identifier the frontend translates (errors.<CODE>); `message` is for logs/debugging only.
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details: unknown[] = [],
  ) {
    super(message)
  }
}
