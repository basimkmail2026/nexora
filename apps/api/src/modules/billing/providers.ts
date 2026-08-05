import crypto from "crypto";
import { PaymentProvider, CheckoutInput, CheckoutResult } from "./provider.js";

class PlaceholderProvider implements PaymentProvider {
  constructor(public code: string, private config: Record<string, any>) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    // Production connectors need real merchant credentials and provider-specific API calls.
    // For now, generate a safe test checkout URL inside Nexora.
    const externalId = `${this.code}_${crypto.randomUUID()}`;
    return {
      externalId,
      checkoutUrl: `${input.successUrl}&test_payment=1&provider=${encodeURIComponent(this.code)}&external_id=${encodeURIComponent(externalId)}`,
      raw: { mode: "test", provider: this.code }
    };
  }

  verifyWebhook(): boolean {
    return Boolean(this.config.webhookSecret);
  }
}

export function providerFactory(code: string, config: Record<string, any>): PaymentProvider {
  return new PlaceholderProvider(code, config);
}
