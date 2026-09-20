export function invariant<Assertion extends boolean>(assertion: Assertion, message?: string): asserts assertion {
  if (!assertion) {
    throw new Error(message ?? 'Assertion failed');
  }
}
