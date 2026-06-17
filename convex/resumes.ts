import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Unauthorized');
    }
    const userId = identity.subject;

    const resumes = await ctx.db
      .query('resumes')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();

    return resumes;
  },
});

export const upsert = mutation({
  args: {
    resumeId: v.string(),
    label: v.string(),
    content: v.string(),
    jsonContent: v.string(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Unauthorized');
    }
    const userId = identity.subject;

    const existing = await ctx.db
      .query('resumes')
      .withIndex('by_user_resume', (q) => q.eq('userId', userId).eq('resumeId', args.resumeId))
      .first();

    if (existing) {
      // Update if cloud is older or equal (last-write-wins)
      if (existing.updatedAt <= args.updatedAt) {
        await ctx.db.patch(existing._id, {
          label: args.label,
          content: args.content,
          jsonContent: args.jsonContent,
          updatedAt: args.updatedAt,
        });
        return existing._id;
      } else {
        // Cloud is newer, skip
        return existing._id;
      }
    } else {

      const id = await ctx.db.insert('resumes', {
        userId,
        resumeId: args.resumeId,
        label: args.label,
        content: args.content,
        jsonContent: args.jsonContent,
        updatedAt: args.updatedAt,
      });
      return id;
    }
  },
});

export const remove = mutation({
  args: { resumeId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Unauthorized');
    }
    const userId = identity.subject;

    const doc = await ctx.db
      .query('resumes')
      .withIndex('by_user_resume', (q) => q.eq('userId', userId).eq('resumeId', args.resumeId))
      .first();

    if (doc) {
      await ctx.db.delete(doc._id);
    }
  },
});