import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AtlasPlan } from './AtlasPlan';
import type { AtlasConstraint, Location } from './project.generated';
it('changes only the chosen owner constraint without replacing the approved scenario requirement', () => {
  const sites: Location[] = ['One', 'Two'].map((id) => ({
    id,
    name: id,
    kind: 'city',
    preference: 'any-land',
  }));
  const scenario: AtlasConstraint = {
    from: 'One',
    to: 'Two',
    origin: 'scenario',
    relation: 'near',
    description: 'Canon',
    strength: 'hard',
  };
  const custom: AtlasConstraint = { ...scenario, origin: 'owner', description: 'Market road' };
  const changed = vi.fn();
  render(<AtlasPlan constraints={[scenario, custom]} sites={sites} onChange={changed} />);
  fireEvent.click(screen.getByText('Geography requirements (2)'));
  fireEvent.click(screen.getByRole('button', { name: 'Edit requirement' }));
  fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'soft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save requirement' }));
  expect(changed).toHaveBeenCalledWith([scenario, { ...custom, strength: 'soft' }]);
});
