import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    session: locals.session
      ? {
          email: locals.session.email,
          name: locals.session.name,
          picture: locals.session.picture,
        }
      : null,
  };
};
