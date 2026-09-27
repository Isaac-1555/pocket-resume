import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  resumes: defineTable({
    userId: v.string(),
    resumeId: v.string(),
    label: v.string(),
    content: v.string(),
    jsonContent: v.string(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_user_resume', ['userId', 'resumeId']),
});
