import { AuthConfig } from 'convex/server';

export default {
  providers: [
    {
      // Replace with your Clerk Frontend API URL
      // e.g. https://my-app-123.clerk.accounts.dev
      // Set CLERK_FRONTEND_API_URL env var or replace directly
      domain: process.env.CLERK_FRONTEND_API_URL || 'https://touched-flamingo-72.clerk.accounts.dev',
      applicationID: 'convex',
    },
  ],
} satisfies AuthConfig;
