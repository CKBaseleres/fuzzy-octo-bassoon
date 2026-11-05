import { createHash } from 'node:crypto';
import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import type { QuotaLimit, RefusedResponse } from '@lingo-lens/shared';
import type { CounterKey } from '../azure/port';
import type { Deps } from '../deps';

/** The kill switch and quotas: app settings `TRANSLATIONS_ENABLED`, `DAILY_TRANSLATION_QUOTA`, `HOURLY_PER_IP_QUOTA`. */
export interface Limits {
  translationsEnabled: boolean;
  /** Translations per UTC day, across the whole service. */
  dailyQuota: number;
  /** Translations per client IP per UTC clock hour. */
  hourlyPerIpQuota: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Seconds until the next multiple of `periodMs` (UTC), at least 1. */
const secondsUntilNext = (now: Date, periodMs: number) =>
  Math.max(1, Math.ceil((periodMs - (now.getTime() % periodMs)) / 1000));

function refused(limit: QuotaLimit, retryAfterSeconds: number): HttpResponseInit {
  return {
    status: 429,
    headers: { 'retry-after': String(retryAfterSeconds) },
    jsonBody: { error: 'refused', limit } satisfies RefusedResponse,
  };
}

/** The global counter for the UTC day of `now`. Counts only: no IP, no content. */
const dailyKey = (now: Date): CounterKey => ({ partitionKey: 'daily', rowKey: now.toISOString().slice(0, 10) });

/**
 * The client IP: the first entry of SWA's `X-Forwarded-For`, without a port.
 * Staff behind one office NAT share it. Missing: every such request shares `unknown`.
 */
export function clientIp(request: HttpRequest): string {
  const first = (request.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(first); // [IPv6]:port
  if (bracketed) return bracketed[1]!.toLowerCase();
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(first);
  if (ipv4WithPort) return ipv4WithPort[1]!;
  return first.toLowerCase() || 'unknown';
}

/**
 * The counter for one client IP in the UTC clock hour of `now`. The IP is stored
 * only as a truncated SHA-256, so the Table holds counts, not addresses.
 */
const hourlyKey = (now: Date, ip: string): CounterKey => ({
  partitionKey: `hourly-${now.toISOString().slice(0, 13)}`,
  rowKey: createHash('sha256').update(ip).digest('hex').slice(0, 32),
});

type LimitDeps = Pick<Deps, 'azure' | 'clock' | 'limits'>;

/**
 * The 429 to return when a new Translation may not start now, or undefined when it may.
 * Reads the counters only; `countTranslation` adds to them.
 */
export async function refuseIfOverLimit(
  { azure, clock, limits }: LimitDeps,
  request: HttpRequest,
): Promise<HttpResponseInit | undefined> {
  const now = clock.now();
  if (!limits.translationsEnabled) return refused('daily', secondsUntilNext(now, DAY_MS));
  const [today, thisHour] = await Promise.all([
    azure.counters.get(dailyKey(now)),
    azure.counters.get(hourlyKey(now, clientIp(request))),
  ]);
  if (today >= limits.dailyQuota) return refused('daily', secondsUntilNext(now, DAY_MS));
  if (thisHour >= limits.hourlyPerIpQuota) return refused('hourly', secondsUntilNext(now, HOUR_MS));
  return undefined;
}

/** Counts a Translation that is starting, whatever happens to it next. */
export async function countTranslation({ azure, clock }: LimitDeps, request: HttpRequest): Promise<void> {
  const now = clock.now();
  await Promise.all([
    azure.counters.increment(dailyKey(now)),
    azure.counters.increment(hourlyKey(now, clientIp(request))),
  ]);
}
