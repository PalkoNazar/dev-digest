import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const RefundBody = z.object({
  paymentId: z.string().min(1),
  /** Amount to refund, in cents (avoids float rounding). */
  amountCents: z.number().int().positive(),
  /** Why the refund was issued — required for the audit log. */
  reason: z.string().min(1),
});

export async function refundRoutes(app: FastifyInstance) {
  // POST /refunds → 201 { refund: { id, state } }
  app.post('/refunds', async (req, reply) => {
    const body = RefundBody.parse(req.body);
    const refund = await app.payments.refund(body.paymentId, body.amountCents / 100, body.reason);
    return reply.status(201).send({ refund: { id: refund.id, state: refund.status } });
  });
}
