/**
 * Bridge between the app and the iPhone widget / Siri / Control Center.
 *
 * Both sides share the App Group "group.app.voicecalcai":
 *  - the app writes the last answer ("lastResult") so the widget can show it;
 *  - Siri, Shortcuts, the Action button and Control Center write "pendingAction"
 *    (targets/widget/SharedIntents.swift) and the app picks it up when it opens.
 *
 * Uses the ExtensionStorage native module from @bacons/apple-targets, which only
 * exists on iOS. On Android, web and in tests every call is a silent no-op.
 */

export const APP_GROUP = 'group.app.voicecalcai';
const LAST_RESULT_KEY = 'lastResult';
const PENDING_ACTION_KEY = 'pendingAction';
/** Ignore actions older than this (e.g. left over from a crash). */
const PENDING_ACTION_MAX_AGE_MS = 2 * 60 * 1000;

export type PendingAction = { action: 'voice' } | { action: 'calc'; query: string };

interface ExtensionStorageModule {
  setObject(key: string, value: Record<string, string>, group: string): boolean;
  get(key: string, group: string): string | null | undefined;
  remove(key: string, group: string): void;
  reloadWidget(kind?: string): void;
}

function storage(): ExtensionStorageModule | null {
  try {
    const mod = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules
      ?.ExtensionStorage as ExtensionStorageModule | undefined;
    return mod ?? null;
  } catch {
    return null;
  }
}

/** Show this answer on the home screen / lock screen widget. */
export function publishLastResult(expression: string, result: string): void {
  const mod = storage();
  if (!mod) return;
  try {
    mod.setObject(LAST_RESULT_KEY, { expression, result }, APP_GROUP);
    mod.reloadWidget();
  } catch {
    // Widget refresh is best-effort and must never break a calculation.
  }
}

/** Clear the widget (history was cleared). */
export function clearLastResult(): void {
  const mod = storage();
  if (!mod) return;
  try {
    mod.remove(LAST_RESULT_KEY, APP_GROUP);
    mod.reloadWidget();
  } catch {
    // best-effort
  }
}

/** Parse the JSON written by SharedIntents.swift. Exported for tests. */
export function parsePendingAction(raw: unknown, now: number = Date.now()): PendingAction | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const data = JSON.parse(raw) as { action?: unknown; q?: unknown; ts?: unknown };
    const ts = Number(data.ts);
    if (!Number.isFinite(ts) || now - ts > PENDING_ACTION_MAX_AGE_MS) return null;
    if (data.action === 'voice') return { action: 'voice' };
    if (data.action === 'calc' && typeof data.q === 'string' && data.q.trim() !== '') {
      return { action: 'calc', query: data.q.trim() };
    }
    return null;
  } catch {
    return null;
  }
}

/** Read and clear the action Siri / Shortcuts / Control Center left for the app. */
export function takePendingAction(): PendingAction | null {
  const mod = storage();
  if (!mod) return null;
  try {
    const raw = mod.get(PENDING_ACTION_KEY, APP_GROUP);
    if (!raw) return null;
    mod.remove(PENDING_ACTION_KEY, APP_GROUP);
    return parsePendingAction(raw);
  } catch {
    return null;
  }
}

export type DeepLinkAction =
  | { action: 'voice' }
  | { action: 'keypad' }
  | { action: 'history' }
  | { action: 'calc'; query: string };

/**
 * Understands smartcalc://voice, smartcalc://keypad, smartcalc://history and
 * smartcalc://calc?q=18%25%20of%20420 (also used by the Android widget and tile).
 */
export function parseDeepLink(url: string | null | undefined): DeepLinkAction | null {
  if (!url) return null;
  const match = /^[a-z][a-z0-9+.-]*:\/\/\/?([^/?#]*)(?:[/?#](.*))?$/i.exec(url.trim());
  const route = (match ? match[1] : '').toLowerCase();
  if (route === 'calc') {
    const query = /(?:^|[?&])q=([^&#]*)/.exec(match?.[2] ?? '');
    if (!query) return null;
    let text = query[1].replace(/\+/g, ' ');
    try {
      text = decodeURIComponent(text);
    } catch {
      // keep the raw text
    }
    text = text.trim();
    return text ? { action: 'calc', query: text } : null;
  }
  if (route === 'voice') return { action: 'voice' };
  if (route === 'keypad' || route === 'calculator') return { action: 'keypad' };
  if (route === 'history') return { action: 'history' };
  return null;
}
