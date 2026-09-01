import type { FastifyReply } from "fastify";
import { ImmichIntegrationNotVerifiedError } from "@immich-polo/immich-client";

export function sendImmichError(reply: FastifyReply, error: unknown) {
  if (error instanceof ImmichIntegrationNotVerifiedError) {
    return reply.code(503).send({ error: "immich_integration_unverified" });
  }
  reply.log.error({ err: error }, "Immich provider operation failed");
  return reply.code(502).send({ error: "immich_upstream_error" });
}
