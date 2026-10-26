import {
  clearLastResult,
  parseDeepLink,
  parsePendingAction,
  publishLastResult,
  takePendingAction,
} from '../src/utils/appleWidgets';

describe('deep links (widget, Android tile/shortcuts, Siri)', () => {
  test.each([
    ['smartcalc://voice', { action: 'voice' }],
    ['smartcalc:///voice', { action: 'voice' }],
    ['smartcalc://keypad', { action: 'keypad' }],
    ['smartcalc://history', { action: 'history' }],
    ['smartcalc://calc?q=18%25%20of%20420', { action: 'calc', query: '18% of 420' }],
    ['smartcalc://calc?q=half+of+3+lakh', { action: 'calc', query: 'half of 3 lakh' }],
  ])('%s', (url, expected) => {
    expect(parseDeepLink(url)).toEqual(expected);
  });

  test('ignores empty or unknown links', () => {
    expect(parseDeepLink(null)).toBeNull();
    expect(parseDeepLink('smartcalc://calc?q=')).toBeNull();
    expect(parseDeepLink('smartcalc://somewhere')).toBeNull();
  });

  test('bad percent-encoding does not throw', () => {
    expect(parseDeepLink('smartcalc://calc?q=50%')).toEqual({ action: 'calc', query: '50%' });
  });
});

describe('pending actions from Siri / Control Center', () => {
  const now = 1_800_000_000_000;

  test('voice and calc actions', () => {
    expect(parsePendingAction(JSON.stringify({ action: 'voice', ts: now }), now)).toEqual({
      action: 'voice',
    });
    expect(
      parsePendingAction(JSON.stringify({ action: 'calc', q: ' 2 plus 2 ', ts: now - 1000 }), now)
    ).toEqual({ action: 'calc', query: '2 plus 2' });
  });

  test('pretty-printed JSON from the native module', () => {
    const raw = '{\n  "action" : "voice",\n  "ts" : 1800000000000\n}';
    expect(parsePendingAction(raw, now)).toEqual({ action: 'voice' });
  });

  test('rejects stale, malformed or empty actions', () => {
    expect(parsePendingAction(JSON.stringify({ action: 'voice', ts: now - 10 * 60 * 1000 }), now)).toBeNull();
    expect(parsePendingAction('not json', now)).toBeNull();
    expect(parsePendingAction(JSON.stringify({ action: 'calc', q: '', ts: now }), now)).toBeNull();
    expect(parsePendingAction(undefined, now)).toBeNull();
  });

  test('is a silent no-op without the iOS native module (Android, tests)', () => {
    expect(() => publishLastResult('2 + 2', '4')).not.toThrow();
    expect(() => clearLastResult()).not.toThrow();
    expect(takePendingAction()).toBeNull();
  });
});
