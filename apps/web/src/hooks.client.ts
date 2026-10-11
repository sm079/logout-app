import type { HandleClientError } from '@sveltejs/kit/hooks';
import { report } from '#lib/observe/errors.ts';

// Anything that goes wrong while a page loads or renders is reported (without entry text); a missing page isn't
export const handleError: HandleClientError = ({ kind, error }) => {
  if (kind === 'framework' && error.status === 404) return;
  report(error, { kind });
};
