import { describe, it, expect } from 'vitest';
import { applyDiscount } from './discount';

describe('applyDiscount', () => {
  it('gives members 10% off a large order', () => {
    expect(applyDiscount({ subtotal: 150, isMember: true })).toBe(135);
  });
});
