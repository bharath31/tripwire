import type { Assertion, AssertionResult } from './types.js';

export function checkAssertion(output: string, assertion: Assertion): AssertionResult {
  const found = output.includes(assertion.value);
  const passed = assertion.type === 'contains' ? found : !found;
  return { assertion, passed };
}

export function checkAssertions(output: string, assertions: Assertion[]): AssertionResult[] {
  return assertions.map((a) => checkAssertion(output, a));
}
