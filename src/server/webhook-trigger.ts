import { after } from "next/server";
import type { EscrowRepository } from "@/domain/repository";

/**
 * Wraps the repository so that every committed change nudges the webhook engine. It never delays or fails the change:
 * the work runs after the response has gone out (after()), and any problem is only logged.
 * The webhook code is loaded on demand, so this file has no import cycle with the container.
 */
export function withWebhookTrigger(repo: EscrowRepository): EscrowRepository {
  const nudge = () => {
    const run = async () => {
      try {
        const [{ processWebhooks }, { getPlatformRepo }] = await Promise.all([import("./webhooks"), import("./platform")]);
        await processWebhooks({ repo, platforms: await getPlatformRepo() });
      } catch (e) {
        console.warn("[webhooks] processing failed:", e instanceof Error ? e.message : e);
      }
    };
    try {
      after(run);
    } catch {
      void run(); // not inside a request (scripts, tests): there is no after() to hook into
    }
  };

  return new Proxy(repo, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop === "commit") {
        return async (...args: Parameters<EscrowRepository["commit"]>) => {
          const result = await target.commit(...args);
          nudge();
          return result;
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
