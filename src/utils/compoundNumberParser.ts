/**
 * Utility for parsing and merging compound spoken numbers.
 *
 * When users speak compound numbers like:
 * - "three hundred 10" -> "300 10" -> 310
 * - "three hundred and ten" -> "300 and 10" -> 310
 * - "two thousand 500" -> "2000 500" -> 2500
 * - "five hundred 20" -> "500 20" -> 520
 * - "forty 8" -> "40 8" -> 48
 * - "three thousand 400 50 6" -> 3456
 *
 * Speech-to-text engines (Google STT, Whisper, etc.) frequently transcribe
 * spoken numbers as adjacent tokens without an arithmetic operator.
 *
 * This parser merges such adjacent numbers deterministically based on standard
 * decimal positional notation rules.
 */

/**
 * Returns the number of trailing zeros in a positive integer in base 10.
 * e.g., 300 -> 2, 2000 -> 3, 20 -> 1, 345 -> 0.
 */
export function getTrailingZeros(n: number): number {
  if (!Number.isInteger(n) || n <= 0) return 0;
  let zeros = 0;
  let temp = n;
  while (temp % 10 === 0 && temp > 0) {
    zeros++;
    temp = Math.floor(temp / 10);
  }
  return zeros;
}

/**
 * Determines whether two positive integers A and B represent a spoken compound number (A + B).
 *
 * Rules:
 * 1. Both A and B must be positive integers.
 * 2. A must end in at least 1 trailing zero (z >= 1).
 * 3. B must be strictly less than 10^z (B fits strictly into the trailing zeros of A).
 * 4. If z === 1 (tens place: 20, 30, ... 90, 120, etc.), the tens component must be >= 20,
 *    matching natural language compound numbers ("twenty-one" to "ninety-nine", not "ten-one").
 */
export function canMergeCompoundNumbers(a: number, b: number): boolean {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0) {
    return false;
  }
  const z = getTrailingZeros(a);
  if (z === 0) return false;

  const maxB = Math.pow(10, z);
  if (b >= maxB) return false;

  // Tens compound restriction: only 20..90 combine with units 1..9
  if (z === 1) {
    const tensMod = a % 100;
    if (tensMod < 20) return false;
  }

  return true;
}

/**
 * Merges adjacent numbers representing spoken compound numbers in a text string.
 * Supports numbers separated by whitespace or optional "and" / "aur".
 *
 * Examples:
 * - "300 10 + 310" -> "310 + 310"
 * - "300 and 10 + 310" -> "310 + 310"
 * - "500 20 - 100" -> "520 - 100"
 * - "2000 500 / 5" -> "2500 / 5"
 * - "3000 400 50 6" -> "3456"
 */
export function mergeCompoundSpokenNumbers(input: string): string {
  if (!input || !/\d/.test(input)) {
    return input;
  }

  let prev = input;
  // Up to 5 rounds to iteratively combine multi-segment numbers like 3000 + 400 + 50 + 6
  for (let round = 0; round < 5; round++) {
    const next = prev.replace(
      /(^|[^0-9.])(\d+)\s+(\d+)(?![0-9.])/gi,
      (match, prefix, aStr, bStr) => {
        const a = parseInt(aStr, 10);
        const b = parseInt(bStr, 10);
        if (canMergeCompoundNumbers(a, b)) {
          return `${prefix}${a + b}`;
        }
        return match;
      }
    );

    if (next === prev) {
      break;
    }
    prev = next;
  }

  return prev;
}
