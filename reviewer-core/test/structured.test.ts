import { describe, it, expect } from 'vitest';
import { Review } from '@devdigest/shared';
import { inlineDefinitions, toJsonSchema } from '../src/llm/structured.js';

describe('toJsonSchema', () => {
  it('emits the Review schema without $ref/definitions (Gemini rejects them)', () => {
    const json = JSON.stringify(toJsonSchema(Review, 'Review').schema);
    expect(json).not.toContain('$ref');
    expect(json).not.toContain('"definitions"');
    // the reused sub-schema is now inlined where it was referenced
    expect(json).toContain('trifecta_components');
  });

  it('inlines refs and leaves a self-reference as a ref', () => {
    const out = inlineDefinitions({
      type: 'object',
      properties: { a: { $ref: '#/definitions/A' }, b: { $ref: '#/definitions/A' } },
      definitions: { A: { type: 'object', properties: { self: { $ref: '#/definitions/A' } } } },
    });
    expect(out).toEqual({
      type: 'object',
      properties: {
        a: { type: 'object', properties: { self: { $ref: '#/definitions/A' } } },
        b: { type: 'object', properties: { self: { $ref: '#/definitions/A' } } },
      },
    });
  });
});
