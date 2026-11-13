import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  resumes: defineTable({
    userId: v.string(),
    resumeId: v.string(),
    label: v.string(),
    content: v.string(),
    jsonContent: v.string(),
    coverLetter: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_user_resume', ['userId', 'resumeId']),
  feedback: defineTable({
    email: v.string(),
    message: v.string(),
    pageUrl: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    browser: v.optional(v.string()),
    userId: v.optional(v.string()),
    emailed: v.boolean(),
    createdAt: v.number(),
  }).index('by_createdAt', ['createdAt']),
});
