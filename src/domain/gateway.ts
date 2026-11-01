import { randomUUID } from "node:crypto";
import type { Minor } from "./money";

/**
 * The external payment dependency sits behind this interface (NFR-6.5, Dependency Inversion).
 * Any implementation (simulated, failing, delayed) can replace another without changing the escrow rules (Liskov).
 */
export type GatewayResult = { ok: true; reference: string; method: string } | { ok: false; reason: "failed" | "timeout" };

export interface PaymentGateway {
  charge(request: { userId: string; amount: Minor }): Promise<GatewayResult>;
  payout(request: { userId: string; amount: Minor }): Promise<GatewayResult>;
}

export type SimulatedMode = "success" | "fail" | "timeout";

/** Never contacts a real service. Can be told to fail so error paths can be tested (FR-2.9). */
export class SimulatedGateway implements PaymentGateway {
  constructor(public mode: SimulatedMode = "success") {}

  private respond(prefix: string, method: string): GatewayResult {
    if (this.mode === "fail") return { ok: false, reason: "failed" };
    if (this.mode === "timeout") return { ok: false, reason: "timeout" };
    return { ok: true, reference: `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`, method };
  }

  async charge() {
    return this.respond("TX", "M-Pesa");
  }
  async payout() {
    return this.respond("WD", "bank");
  }
}
