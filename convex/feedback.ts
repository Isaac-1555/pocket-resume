import { action, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_TO_EMAIL = 'feedback@pocket-resume.xyz';
const DEFAULT_FROM_EMAIL = 'onboarding@resend.dev';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_EMAIL_PER_WINDOW = 3;
const MAX_TOTAL_PER_WINDOW = 20;

function trimTo(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

async function sendEmail({ to, from, replyTo, subject, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { emailed: false };
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      reply_to: replyTo,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend returned ${response.status}: ${detail.slice(0, 300)}`);
  }
  return { emailed: true };
}

// Actions have no ctx.db, so the row is written through an internal mutation
// and the counts come from an internal query.
export const recentCount = internalQuery({
  args: { email: v.string(), since: v.number() },
  handler: async (ctx, args) => {
    const recent = await ctx.db
      .query('feedback')
      .withIndex('by_createdAt', (q) => q.gte('createdAt', args.since))
      .collect();
    return {
      total: recent.length,
      perEmail: recent.filter((row) => row.email === args.email).length,
    };
  },
});

export const store = internalMutation({
  args: {
    email: v.string(),
    message: v.string(),
    pageUrl: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    browser: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('feedback', {
      email: args.email,
      message: args.message,
      pageUrl: args.pageUrl || '',
      appVersion: args.appVersion || '',
      browser: args.browser || '',
      userId: args.userId || '',
      emailed: false,
      createdAt: Date.now(),
    });
  },
});

export const markEmailed = internalMutation({
  args: { id: v.id('feedback') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { emailed: true });
  },
});

// Public on purpose: feedback must work without an account. The honeypot and
// the rate limits are what keep the endpoint from being abused.
export const submit = action({
  args: {
    email: v.string(),
    message: v.string(),
    pageUrl: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    browser: v.optional(v.string()),
    userId: v.optional(v.string()),
    company: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (trimTo(args.company, 100)) {
      return { ok: true, emailed: false };
    }

    const email = trimTo(args.email, 200).toLowerCase();
    const message = trimTo(args.message, MAX_MESSAGE_LENGTH);
    if (!EMAIL_PATTERN.test(email)) throw new Error('invalid_email');
    if (message.length < MIN_MESSAGE_LENGTH) throw new Error('invalid_message');

    const counts = await ctx.runQuery(internal.feedback.recentCount, {
      email,
      since: Date.now() - RATE_WINDOW_MS,
    });
    if (counts.total >= MAX_TOTAL_PER_WINDOW) throw new Error('rate_limited');
    if (counts.perEmail >= MAX_PER_EMAIL_PER_WINDOW) throw new Error('rate_limited');

    const id = await ctx.runMutation(internal.feedback.store, {
      email,
      message,
      pageUrl: trimTo(args.pageUrl, 500),
      appVersion: trimTo(args.appVersion, 40),
      browser: trimTo(args.browser, 200),
      userId: trimTo(args.userId, 100),
    });

    const to = (process.env.FEEDBACK_TO_EMAIL || DEFAULT_TO_EMAIL).trim();
    const from = (process.env.FEEDBACK_FROM_EMAIL || DEFAULT_FROM_EMAIL).trim();
    const text = [
      `From: ${email}`,
      trimTo(args.userId, 100) ? `Account: ${trimTo(args.userId, 100)}` : '',
      trimTo(args.appVersion, 40) ? `Extension version: ${trimTo(args.appVersion, 40)}` : '',
      trimTo(args.browser, 200) ? `Browser: ${trimTo(args.browser, 200)}` : '',
      trimTo(args.pageUrl, 500) ? `Page: ${trimTo(args.pageUrl, 500)}` : '',
      '',
      message,
    ]
      .filter((line) => line !== '')
      .join('\n');

    try {
      const result = await sendEmail({
        to,
        from,
        replyTo: email,
        subject: `PocketResume feedback from ${email}`,
        text,
      });
      if (result.emailed) await ctx.runMutation(internal.feedback.markEmailed, { id });
      return { ok: true, emailed: result.emailed };
    } catch (error) {
      // The message is already stored, so a mail failure never loses it.
      console.error('[Feedback] email failed:', error);
      return { ok: true, emailed: false };
    }
  },
});
