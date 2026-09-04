import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.daily(
  'analytics-cleanup',
  { hourUTC: 4, minuteUTC: 0 },
  internal.analytics.cleanup,
  {}
);

export default crons;
