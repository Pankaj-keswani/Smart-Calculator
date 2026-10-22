/**
 * SpeechService error-recovery tests against a fake native recognizer.
 */

type Listener = (event: any) => void;

const listeners: Record<string, Listener[]> = {};
const fakeModule = {
  start: jest.fn(),
  stop: jest.fn(async () => undefined),
  abort: jest.fn(),
  isRecognitionAvailable: jest.fn(() => true),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  addListener: jest.fn((name: string, fn: Listener) => {
    (listeners[name] = listeners[name] || []).push(fn);
    return {
      remove: () => {
        listeners[name] = (listeners[name] || []).filter((l) => l !== fn);
      },
    };
  }),
};
const emit = (name: string, event: any = {}) => (listeners[name] || []).forEach((l) => l(event));

jest.mock('expo-speech-recognition', () => ({ ExpoSpeechRecognitionModule: fakeModule }), {
  virtual: false,
});

import { SpeechService } from '../src/services/SpeechService';

describe('SpeechService recovery', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    for (const k of Object.keys(listeners)) delete listeners[k];
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('passes all recognizer hypotheses with the final result', async () => {
    const svc = new SpeechService();
    const onFinal = jest.fn();
    await svc.startListening({ onFinalResult: onFinal });
    emit('result', {
      isFinal: true,
      results: [{ transcript: 'for plus for' }, { transcript: '4 + 4' }, { transcript: '4 plus 4' }],
    });
    expect(onFinal).toHaveBeenCalledWith('for plus for', ['4 + 4', '4 plus 4']);
    expect(fakeModule.start.mock.calls[0][0]).toMatchObject({ maxAlternatives: 5 });
    await svc.stopListening();
  });

  test('no-speech re-arms the recognizer silently', async () => {
    const svc = new SpeechService();
    const onError = jest.fn();
    await svc.startListening({ onFinalResult: jest.fn(), onError });
    emit('error', { error: 'no-speech' });
    jest.advanceTimersByTime(500);
    expect(fakeModule.start).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    await svc.stopListening();
  });

  test('repeated network errors stop the mic with a clear message', async () => {
    const svc = new SpeechService();
    const onError = jest.fn();
    const onEnd = jest.fn();
    await svc.startListening({ onFinalResult: jest.fn(), onError, onEnd });
    emit('error', { error: 'network' });
    jest.advanceTimersByTime(1000);
    emit('error', { error: 'network' });
    expect(onError).toHaveBeenCalledWith('NO_INTERNET', expect.any(String));
    expect(onEnd).toHaveBeenCalled();
    expect(svc.isListening()).toBe(false);
  });

  test('gives up after repeated busy/client errors instead of looping forever', async () => {
    const svc = new SpeechService();
    const onError = jest.fn();
    await svc.startListening({ onFinalResult: jest.fn(), onError });
    for (let i = 0; i < 6; i++) {
      emit('error', { error: 'busy' });
      jest.advanceTimersByTime(2000);
    }
    expect(onError).toHaveBeenCalledWith('SPEECH_RECOGNITION_FAILED', expect.any(String));
    expect(svc.isListening()).toBe(false);
  });

  test('switches itself off after a long silence', async () => {
    const svc = new SpeechService();
    const onEnd = jest.fn();
    await svc.startListening({ onFinalResult: jest.fn(), onEnd });
    jest.advanceTimersByTime(16000);
    await Promise.resolve();
    expect(onEnd).toHaveBeenCalled();
    expect(svc.isListening()).toBe(false);
  });

  test('suspend() ignores recognizer events; resume() restarts listening', async () => {
    const svc = new SpeechService();
    const onFinal = jest.fn();
    await svc.startListening({ onFinalResult: onFinal });
    await svc.suspend();
    expect(fakeModule.abort).toHaveBeenCalled();
    emit('result', { isFinal: true, results: [{ transcript: 'the answer is 42' }] });
    emit('end');
    expect(onFinal).not.toHaveBeenCalled();
    const resumed = await svc.resume();
    expect(resumed).toBe(true);
    jest.advanceTimersByTime(300);
    expect(fakeModule.start).toHaveBeenCalledTimes(2);
    await svc.stopListening();
  });

  test('resume() after the user stopped the mic does not restart it', async () => {
    const svc = new SpeechService();
    await svc.startListening({ onFinalResult: jest.fn() });
    await svc.suspend();
    await svc.stopListening();
    expect(await svc.resume()).toBe(false);
    jest.advanceTimersByTime(1000);
    expect(fakeModule.start).toHaveBeenCalledTimes(1);
  });
});
