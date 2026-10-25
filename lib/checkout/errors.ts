export class CheckoutError extends Error {}

export class InsufficientStockError extends CheckoutError {
  constructor(
    message: string,
    readonly stockKey: string,
    readonly productName: string,
    readonly sizeLabel: string | null,
  ) {
    super(message);
  }
}
