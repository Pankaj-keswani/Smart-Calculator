/**
 * Safe Deterministic Calculation Service (CalculationService)
 *
 * Powered by JevCalculationEngine (`src/engine/JevCalculationEngine.ts`).
 * Guarantees deterministic local evaluation + independent AST validation
 * with zero dynamic code execution (`eval` is strictly forbidden).
 */

import {
  CalcDomainError,
  JevCalculationEngine,
  jevCalculationEngine,
} from './JevCalculationEngine';

export { CalcDomainError, JevCalculationEngine, jevCalculationEngine };

export class CalculationService extends JevCalculationEngine {}

export const calculationService = jevCalculationEngine;
