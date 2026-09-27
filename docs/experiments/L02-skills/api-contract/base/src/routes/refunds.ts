import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const RefundBody = z.object({
  paymentId: z.string().min(1),
  /** Amount to refund, in dollars. */
  amount: z.number().positive(),
});

export async function refundRoutes(app: FastifyInstance) {
  // POST /refunds → 200 { id, status }
  app.post('/refunds', async (req, reply) => {
    const body = RefundBody.parse(req.body);
    const refund = await app.payments.refund(body.paymentId, body.amount);
    return reply.status(200).send({ id: refund.id, status: refund.status });
  });
}
