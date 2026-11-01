import { describe, expect, it } from "vitest";
import {
  CONTRACT_STATES,
  EVENTS,
  RULES,
  TERMINAL_STATES,
  IllegalTransitionError,
  canTransition,
  nextState,
  type ActorKind,
} from "./states";

const ACTORS: ActorKind[] = ["client", "freelancer", "arbitrator", "scheduler", "system"];

describe("escrow state machine", () => {
  it("accepts exactly the moves in the transition table and rejects every other state/event/actor combination [FR-3.5, FR-3.6]", () => {
    let legal = 0;
    let illegal = 0;
    for (const from of CONTRACT_STATES) {
      for (const event of EVENTS) {
        for (const actor of ACTORS) {
          const rule = RULES.find((r) => r.event === event && r.from.includes(from));
          const allowed = !!rule && rule.by.includes(actor);
          if (allowed) {
            legal += 1;
            const to = nextState(from, event, actor, "in_progress");
            expect(CONTRACT_STATES).toContain(to);
          } else {
            illegal += 1;
            expect(() => nextState(from, event, actor, "in_progress")).toThrow(IllegalTransitionError);
          }
          expect(canTransition(from, event, actor)).toBe(allowed);
        }
      }
    }
    expect(legal).toBeGreaterThan(20);
    expect(illegal).toBeGreaterThan(legal);
  });

  it("has no outgoing moves from terminal states [FR-3.5]", () => {
    for (const state of TERMINAL_STATES) {
      expect(RULES.filter((r) => r.from.includes(state))).toHaveLength(0);
    }
  });

  it("walks the happy path [FR-3.5]", () => {
    let s = nextState("draft", "send_proposal", "client");
    s = nextState(s, "accept", "freelancer");
    s = nextState(s, "fund", "client");
    s = nextState(s, "start_work", "freelancer");
    s = nextState(s, "deliver", "freelancer");
    s = nextState(s, "approve", "client");
    s = nextState(s, "release", "system");
    expect(s).toBe("completed");
  });

  it("reports who is not allowed, separately from an impossible move [FR-1.12, FR-3.6]", () => {
    try {
      nextState("delivered", "approve", "freelancer");
      expect.unreachable();
    } catch (e) {
      expect((e as IllegalTransitionError).code).toBe("FORBIDDEN_ACTOR");
    }
    try {
      nextState("draft", "release", "system");
      expect.unreachable();
    } catch (e) {
      expect((e as IllegalTransitionError).code).toBe("ILLEGAL_TRANSITION");
    }
  });

  it("never lets a user release funds, and never lets anyone release an unfunded contract [FR-3.6, FR-5.5]", () => {
    for (const actor of ["client", "freelancer", "arbitrator", "scheduler"] as ActorKind[]) {
      expect(canTransition("approved", "release", actor)).toBe(false);
    }
    for (const state of ["draft", "proposed", "accepted"] as const) {
      expect(canTransition(state, "release", "system")).toBe(false);
    }
  });

  it("returns a disputed contract to its previous state only when that state is known [FR-6.8]", () => {
    expect(nextState("disputed", "withdraw_dispute", "client", "delivered")).toBe("delivered");
    expect(() => nextState("disputed", "withdraw_dispute", "client")).toThrow(IllegalTransitionError);
  });
});
