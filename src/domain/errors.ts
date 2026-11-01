export type DomainErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION"
  | "ILLEGAL_TRANSITION"
  | "INSUFFICIENT_FUNDS"
  | "CONFLICT"
  | "LIMIT"
  | "GATEWAY_FAILED"
  | "IDEMPOTENCY_KEY_REQUIRED";

/** Errors whose message is safe and useful to show to the user (NFR-1.10, NFR-5.5). */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export class ConflictError extends DomainError {
  constructor() {
    super("CONFLICT", "This contract changed while you were working. Reload the page and try again.");
  }
}

export class InsufficientFundsError extends DomainError {
  constructor(message = "Your available balance is too low for this. Top up your wallet and try again.") {
    super("INSUFFICIENT_FUNDS", message);
  }
}
