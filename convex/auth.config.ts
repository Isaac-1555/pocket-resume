import { AuthConfig } from 'convex/server';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required. Set it in .env.local (see .env.example) or via the Convex dashboard.`
    );
  }
  return value;
}

export default {
  providers: [
    {
      domain: requireEnv('CLERK_FRONTEND_API_URL'),
      applicationID: 'convex',
    },
  ],
} satisfies AuthConfig;
