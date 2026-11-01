import { signSession, COOKIE_NAME } from '../../src/lib/server/auth';
import fs from 'node:fs';

const token = signSession({
  email: 'lutfidmz@gmail.com',
  name: 'Lutfi',
  picture: '',
  issuedAt: Date.now(),
  expiresAt: Date.now() + 7 * 86400 * 1000,
});
const state = {
  cookies: [
    {
      name: COOKIE_NAME,
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax' as const,
    },
  ],
};
fs.writeFileSync('tests/fixtures/auth-state.json', JSON.stringify(state, null, 2));
console.log('✓ Auth fixture generated');
