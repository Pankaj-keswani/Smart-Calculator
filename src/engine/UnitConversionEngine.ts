/**
 * Deterministic Unit Conversion Engine (UnitConversionEngine)
 *
 * Implements Section 13:
 * Kept separate from the mathematical engine (JevCalculationEngine).
 * Never allows the AI to invent conversion factors; all conversion factors
 * and temperature formulas are deterministically defined and locally verified.
 */

import { ConversionService, UnitCategory } from './ConversionService';

export type { UnitCategory };

export class UnitConversionEngine extends ConversionService {
  /**
   * Converts a numeric value from `sourceUnit` to `targetUnit` deterministically.
   */
  public convert(
    value: number,
    sourceUnit: string,
    targetUnit: string
  ): {
    convertedValue: number;
    formattedResult: string;
    spokenResponse: string;
  } {
    const out = this.executeIntent({
      intent: 'unit_conversion',
      value,
      from_unit: sourceUnit,
      to_unit: targetUnit,
      requires_clarification: false,
    });

    if (!out.success || typeof out.resultNumber !== 'number') {
      throw new Error(out.errorMessage || 'Unit conversion failed.');
    }

    return {
      convertedValue: out.resultNumber,
      formattedResult: out.formattedResult,
      spokenResponse: out.spokenResponse,
    };
  }
}

export const unitConversionEngine = new UnitConversionEngine();
