export type CheckoutInput = {
  amount: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail: string;
  metadata: Record<string, string>;
};

export type CheckoutResult = {
  externalId: string;
  checkoutUrl: string;
  raw: unknown;
};

export interface PaymentProvider {
  code: string;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  verifyWebhook(headers: Record<string, unknown>, rawBody: string): boolean;
}
