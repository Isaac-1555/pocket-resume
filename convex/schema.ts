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
  analyticsEvents: defineTable({
    name: v.string(),
    clientId: v.string(),
    version: v.string(),
    ts: v.number(),
    style: v.optional(v.string()),
    provider: v.optional(v.string()),
    layout: v.optional(v.string()),
    source: v.optional(v.string()),
    code: v.optional(v.string()),
  })
    .index('by_name_ts', ['name', 'ts'])
    .index('by_client_ts', ['clientId', 'ts'])
    .index('by_ts', ['ts']),
  counters: defineTable({
    key: v.string(),
    value: v.number(),
  }).index('by_key', ['key']),
  dailyCounters: defineTable({
    date: v.string(),
    name: v.string(),
    value: v.number(),
  }).index('by_date_name', ['date', 'name']),
  dailyActive: defineTable({
    date: v.string(),
    clientId: v.string(),
  })
    .index('by_date', ['date'])
    .index('by_date_client', ['date', 'clientId']),
});
