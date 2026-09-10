import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';

const EVENT_NAMES = [
  'install',
  'popup_open',
  'active_day',
  'resume_generated',
  'cover_letter_generated',
  'generation_error',
  'tracker_opened',
  'application_added',
  'refine_used',
  'extract_json_used',
  'form_filled',
  'form_fill_error',
  'form_filler_setup',
  'form_profile_autofill',
];

const PARAM_FIELDS = ['style', 'provider', 'layout', 'source', 'code', 'cached'] as const;

const MAX_EVENTS_PER_BATCH = 50;
const MAX_EVENTS_PER_CLIENT_PER_MINUTE = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RAW_EVENT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const DAILY_ACTIVE_RETENTION_MS = 400 * 24 * 60 * 60 * 1000;

function dateStr(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

async function incrementCounter(ctx, key) {
  const doc = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .first();
  if (doc) {
    await ctx.db.patch(doc._id, { value: doc.value + 1 });
  } else {
    await ctx.db.insert('counters', { key, value: 1 });
  }
}

async function incrementDailyCounter(ctx, date, name) {
  const doc = await ctx.db
    .query('dailyCounters')
    .withIndex('by_date_name', (q) => q.eq('date', date).eq('name', name))
    .first();
  if (doc) {
    await ctx.db.patch(doc._id, { value: doc.value + 1 });
  } else {
    await ctx.db.insert('dailyCounters', { date, name, value: 1 });
  }
}

async function markActive(ctx, date, clientId) {
  const doc = await ctx.db
    .query('dailyActive')
    .withIndex('by_date_client', (q) => q.eq('date', date).eq('clientId', clientId))
    .first();
  if (!doc) {
    await ctx.db.insert('dailyActive', { date, clientId });
  }
}

export const ingestBatch = mutation({
  args: {
    events: v.array(
      v.object({
        name: v.string(),
        clientId: v.string(),
        version: v.string(),
        ts: v.number(),
        style: v.optional(v.string()),
        provider: v.optional(v.string()),
        layout: v.optional(v.string()),
        source: v.optional(v.string()),
        code: v.optional(v.string()),
        cached: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    if (args.events.length > MAX_EVENTS_PER_BATCH) {
      throw new Error('Too many events in batch');
    }
    const now = Date.now();
    let inserted = 0;
    for (const ev of args.events) {
      if (!EVENT_NAMES.includes(ev.name)) continue;
      if (!UUID_RE.test(ev.clientId)) continue;
      if (!Number.isFinite(ev.ts) || ev.ts > now + 60_000 || ev.ts < now - 30 * 24 * 60 * 60 * 1000) continue;

      const recent = await ctx.db
        .query('analyticsEvents')
        .withIndex('by_client_ts', (q) => q.eq('clientId', ev.clientId).gte('ts', now - 60_000))
        .collect();
      if (recent.length >= MAX_EVENTS_PER_CLIENT_PER_MINUTE) continue;

      const doc = {
        name: ev.name,
        clientId: ev.clientId,
        version: String(ev.version).slice(0, 20),
        ts: ev.ts,
      };
      for (const field of PARAM_FIELDS) {
        const val = ev[field];
        if (typeof val === 'string' && val.length <= 40) {
          doc[field] = val;
        }
      }
      await ctx.db.insert('analyticsEvents', doc);

      const date = dateStr(ev.ts);
      await incrementCounter(ctx, ev.name);
      await incrementDailyCounter(ctx, date, ev.name);
      await markActive(ctx, date, ev.clientId);
      inserted += 1;
    }
    return { inserted };
  },
});

async function sumCounters(ctx) {
  const rows = await ctx.db.query('counters').collect();
  const totals = {};
  for (const row of rows) {
    totals[row.key] = row.value;
  }
  return totals;
}

async function recentDates(now, days) {
  const dates = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    dates.push(dateStr(now - i * 24 * 60 * 60 * 1000));
  }
  return dates;
}

async function distinctClientsInWindow(ctx, dates) {
  const clients = new Set();
  for (const date of dates) {
    const rows = await ctx.db
      .query('dailyActive')
      .withIndex('by_date', (q) => q.eq('date', date))
      .collect();
    for (const row of rows) {
      clients.add(row.clientId);
    }
  }
  return clients.size;
}

export const summary = query({
  args: {
    // Optional current time (ms). Rounded to the hour for query-cache friendliness.
    // Defaults to server time.
    now: v.optional(v.number()),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = Math.min(Math.max(args.days ?? 30, 1), 90);
    const now = args.now ?? Date.now();

    const dates = await recentDates(now, days);
    const dateSet = new Set(dates);

    const dailyRows = await ctx.db.query('dailyCounters').collect();
    const daily = {};
    for (const row of dailyRows) {
      if (!dateSet.has(row.date)) continue;
      if (!daily[row.date]) daily[row.date] = {};
      daily[row.date][row.name] = row.value;
    }

    const byStyle = {};
    const byProvider = {};
    const byLayout = {};
    const errors = {};
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const weekRows = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_ts', (q) => q.gte('ts', weekAgo))
      .collect();
    for (const row of weekRows) {
      if (row.name === 'resume_generated') {
        const key = row.style || 'unknown';
        byStyle[key] = (byStyle[key] || 0) + 1;
        if (row.layout) {
          byLayout[row.layout] = (byLayout[row.layout] || 0) + 1;
        }
        if (row.provider) {
          byProvider[row.provider] = (byProvider[row.provider] || 0) + 1;
        }
      } else if (row.name === 'generation_error') {
        const key = `${row.provider || 'unknown'}:${row.code || 'unknown'}`;
        errors[key] = (errors[key] || 0) + 1;
      }
    }

    const dau = [];
    for (const date of dates) {
      const rows = await ctx.db
        .query('dailyActive')
        .withIndex('by_date', (q) => q.eq('date', date))
        .collect();
      dau.push({ date, users: rows.length });
    }

    const wau = await distinctClientsInWindow(ctx, dates.slice(-7));
    const mau = await distinctClientsInWindow(ctx, dates.slice(-30));

    return {
      totals: await sumCounters(ctx),
      dau,
      wau,
      mau,
      last7Days: {
        byStyle,
        byProvider,
        byLayout,
        errors,
      },
      generatedAt: now,
    };
  },
});

export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rawCutoff = now - RAW_EVENT_RETENTION_MS;
    const activeCutoff = dateStr(now - DAILY_ACTIVE_RETENTION_MS);

    let deletedEvents = 0;
    const oldEvents = await ctx.db
      .query('analyticsEvents')
      .withIndex('by_ts', (q) => q.lt('ts', rawCutoff))
      .collect();
    for (const row of oldEvents) {
      await ctx.db.delete(row._id);
      deletedEvents += 1;
    }

    let deletedActive = 0;
    const oldDates = await ctx.db.query('dailyActive').collect();
    for (const row of oldDates) {
      if (row.date < activeCutoff) {
        await ctx.db.delete(row._id);
        deletedActive += 1;
      }
    }

    return { deletedEvents, deletedActive };
  },
});
