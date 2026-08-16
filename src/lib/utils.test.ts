import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('TwoTab Utility Helpers Unit Tests', () => {
  it('cn: merges basic class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('cn: resolves Tailwind CSS class conflicts using twMerge rules', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    expect(cn('bg-card', 'bg-primary')).toBe('bg-primary');
  });

  it('cn: filters out falsy, null, and undefined values cleanly', () => {
    expect(cn('base-class', false && 'hidden', null, undefined, 0 && 'zero', 'visible')).toBe('base-class visible');
  });

  it('cn: handles conditional object syntax and nested arrays', () => {
    expect(
      cn(
        'font-medium',
        { 'text-primary': true, 'opacity-50': false },
        ['rounded-xl', ['shadow-sm', { 'border border-border': true }]]
      )
    ).toBe('font-medium text-primary rounded-xl shadow-sm border border-border');
  });
});
