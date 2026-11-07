import { action } from './_generated/server';
import { v } from 'convex/values';

const CLERK_API = 'https://api.clerk.com/v1';
const PRO_PLAN_SLUGS = new Set([
  'pocketresume_pro',
  'pocketresume_weekly',
  'pocketresume_yearly',
  'cloud_sync',
  'pro',
  'premium',
]);

async function clerkFetch(path, init = {}) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error('CLERK_SECRET_KEY is not set on the Convex deployment.');
  const response = await fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`Clerk ${init.method || 'GET'} ${path} failed (${response.status}): ${detail.slice(0, 300)}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function planSlugOf(plan) {
  if (!plan) return '';
  if (typeof plan === 'string') return plan;
  return String(plan.slug || plan.key || plan.id || '');
}

// The hidden free plan is also an active subscription item, so the extension
// must only ever target a Pro plan item.
function proSubscriptionItem(subscription) {
  const items = Array.isArray(subscription?.items)
    ? subscription.items
    : Array.isArray(subscription?.subscription_items)
      ? subscription.subscription_items
      : [];
  return items.find((item) => {
    if (!item || !['active', 'upcoming', 'trialing'].includes(String(item.status || '').toLowerCase())) return false;
    return PRO_PLAN_SLUGS.has(planSlugOf(item.plan));
  }) || null;
}

function softFailure(error) {
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  const message = String((error && error.message) || '');
  if (status === 403 || message.includes('plan_free_trials_disabled')) return 'trials_disabled';
  if (status === 404) return 'no_subscription';
  return '';
}

export const extendEarlyTrial = action({
  args: { extendTo: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Unauthorized');
    if (!Number.isFinite(args.extendTo) || args.extendTo <= Date.now()) {
      throw new Error('Trial extension date must be in the future.');
    }

    const subscription = await clerkFetch(`/users/${encodeURIComponent(identity.subject)}/billing/subscription`);
    const item = proSubscriptionItem(subscription);
    if (!item || !item.id) return { extended: false, reason: 'not_pro_plan' };

    const currentEnd = item.trialEndsAt || item.trial_ends_at || '';
    const currentEndAt = currentEnd ? new Date(currentEnd).getTime() : 0;
    if (currentEndAt >= args.extendTo) {
      return { extended: false, reason: 'already_extended' };
    }

    const path = `/billing/subscription_items/${encodeURIComponent(item.id)}/extend_free_trial`;
    const extendTo = new Date(args.extendTo).toISOString();
    const post = (body) => clerkFetch(path, { method: 'POST', body: JSON.stringify(body) });
    try {
      try {
        await post({ extend_to: extendTo });
      } catch (error) {
        const reason = softFailure(error);
        if (reason) return { extended: false, reason };
        const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
        if (status !== 400 && status !== 422) throw error;
        // Clerk's REST layer has shipped both snake_case and camelCase bodies.
        await post({ extendTo });
      }
    } catch (error) {
      const reason = softFailure(error);
      if (reason) return { extended: false, reason };
      throw error;
    }
    return { extended: true, extendTo: args.extendTo };
  },
});
