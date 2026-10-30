/**
 * Website build of the app's real pipeline: the same normalizer, parser, engines and
 * running-total logic the phone uses (src/), with phone-only services replaced by stubs.
 * Built by tools/web-engine/build.mjs into Website/js/engine.js (global: VoiceCalcEngine).
 */
import { SmartCalcOrchestrator } from '../../src/services/SmartCalcOrchestrator';
import { TextToSpeechService } from '../../src/services/TextToSpeechService';
import { groupDigits } from '../../src/utils/numberFormat';

const tts = new TextToSpeechService();
tts.setMockSpeakHandler(async () => {});
const orchestrator = new SmartCalcOrchestrator({ tts });

export interface WebResult {
  ok: boolean;
  result: string;
  expression: string;
  breakdown: string | null;
  message: string | null;
  runningTotal: string | null;
}

export async function calculate(text: string): Promise<WebResult> {
  const out = await orchestrator.processCommand(text);
  const ctx = orchestrator.getContext() as unknown as { lastResult?: number | null; lastFormattedResult?: string | null };
  return {
    ok: !!out.success,
    result: out.formattedResult,
    expression: out.displayExpression,
    breakdown: out.breakdown ?? null,
    message: out.success ? null : (out.errorMessage || out.spokenResponse || "Didn't catch that."),
    runningTotal: ctx.lastFormattedResult ?? (ctx.lastResult != null ? String(ctx.lastResult) : null),
  };
}

export function reset(): void {
  orchestrator.resetContext();
}

export function group(text: string, style: 'indian' | 'western' = 'indian'): string {
  return groupDigits(text, style);
}
