import { Agent, ReviewRecord, Severity } from '@devdigest/shared';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { agentDto, reviewDto } from './helpers/fixtures.js';

// @devdigest/shared is imported as source from ../server/src/vendor/shared. Its `import 'zod'`
// must resolve to THIS package's zod (tsconfig paths + vitest alias), not server/node_modules.
describe('@devdigest/shared from the server copy', () => {
  it('parses an Agent and a ReviewRecord fixture', () => {
    expect(Agent.parse(agentDto()).name).toBe('Security Reviewer');
    const review = ReviewRecord.parse(reviewDto());
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0]?.severity).toBe('WARNING');
  });

  it('builds its schemas with the same zod instance as this package', () => {
    expect(Agent).toBeInstanceOf(z.ZodObject);
    expect(Severity).toBeInstanceOf(z.ZodEnum);
    expect(z.object({ agent: Agent }).safeParse({ agent: agentDto() }).success).toBe(true);
  });
});
