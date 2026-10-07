// Vercel Routing Middleware: every request (app, assets, species, brand images) passes the password gate.
// Only the fonts the login pop-up itself uses are public. Set SITE_PASSWORD (and optionally AUTH_SECRET)
// in the Vercel project's Environment Variables.
import { next } from '@vercel/functions';
import { gate } from './auth/gate.js';

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!fonts/Novo-Regular\\.woff2|fonts/Novo-Bold\\.woff2).*)'],
};

export default async function middleware(request) {
  const res = await gate(request, process.env);
  return res || next();
}
