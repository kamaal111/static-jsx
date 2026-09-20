import { invariant } from '../src/utils.ts';

describe('invariant', () => {
  it('does not throw when the assertion holds', () => {
    expect(() => invariant(true)).not.toThrow();
  });

  it('throws the supplied message when the assertion fails', () => {
    expect(() => invariant(false, 'Expected condition to hold')).toThrow('Expected condition to hold');
  });

  it('throws the default message when the assertion fails without one', () => {
    expect(() => invariant(false)).toThrow('Assertion failed');
  });
});
