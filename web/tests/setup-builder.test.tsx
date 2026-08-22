import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SetupBuilder } from '@/components/SetupBuilder';

describe('setup journey', () => {
  beforeEach(() => localStorage.clear());

  it('turns one prompt into a private local command', () => {
    render(<SetupBuilder />);
    fireEvent.change(screen.getByLabelText('Representative user prompt'), {
      target: { value: 'Review this pull request for security problems' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build my test command →' }));
    expect(screen.getByText('Run one real agent session.')).toBeInTheDocument();
    expect(screen.getByText(/npx tripwire-skills@latest test/)).toHaveTextContent('--expect activate --agent claude');
    expect(screen.getByRole('button', { name: /^Behavior matched/ })).toBeInTheDocument();
  });
});
