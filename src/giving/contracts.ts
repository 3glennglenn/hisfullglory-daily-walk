import {
  nativeGivingAllowed,
  type PaymentGates,
} from "../platform/capabilities";
export interface Recipient {
  id: string;
  providerAccountId: string;
  verification: "pending" | "verified" | "restricted";
  country: string;
}
export interface Checkout {
  id: string;
  provider: "stripe" | "mollie";
  requestId: string;
  recipientId: string;
  amountMinor: number;
  currency: string;
  status: "created" | "paid" | "failed" | "refunded";
}
export interface Contribution {
  id: string;
  checkoutId: string;
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  status: string;
}
export interface WebhookEvent {
  id: string;
  provider: string;
  signatureVerified: boolean;
  receivedAt: string;
  processedAt?: string;
}
export interface Payout {
  id: string;
  recipientId: string;
  providerPayoutId: string;
  amountMinor: number;
  currency: string;
  status: string;
}
export interface Refund {
  id: string;
  contributionId: string;
  providerRefundId: string;
  amountMinor: number;
  status: string;
}
export interface Dispute {
  id: string;
  contributionId: string;
  providerDisputeId: string;
  status: string;
}
export interface PaymentProvider {
  name: "stripe" | "mollie";
  createCheckout(checkout: Checkout, idempotencyKey: string): Promise<Checkout>;
}
export function disabledProvider(name: "stripe" | "mollie"): PaymentProvider {
  return {
    name,
    async createCheckout() {
      throw new Error(
        "Native giving is disabled. Server credentials, verified webhooks, verified recipient, legal approval and explicit production flag are required.",
      );
    },
  };
}
export const stripeProvider = disabledProvider("stripe");
export const mollieProvider = disabledProvider("mollie");
export function assertNativeGiving(gates: PaymentGates) {
  if (!nativeGivingAllowed(gates))
    throw new Error("Native giving is disabled.");
}
// Domain contracts only. No credentials, payment API requests, custody, platform fees or client activation.
