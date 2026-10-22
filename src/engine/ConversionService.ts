/**
 * Deterministic Unit Conversion Engine (ConversionService)
 *
 * Supports 8 categories:
 * - length
 * - weight / mass
 * - temperature
 * - volume
 * - area
 * - speed
 * - time
 * - data / storage & transfer rate (e.g. Mbps to MB/s)
 */

import { CalculationOutput, StructuredAIIntent } from '../models/types';
import { calculationService } from './CalculationService';

export type UnitCategory =
  | 'length'
  | 'weight'
  | 'temperature'
  | 'volume'
  | 'area'
  | 'speed'
  | 'time'
  | 'data';

interface UnitDefinition {
  canonical: string;
  singular: string;
  plural: string;
  symbol: string;
  category: UnitCategory;
  /** Factor to convert 1 of this unit into the category's base unit (unused for temperature) */
  toBase: number;
  aliases: string[];
}

const UNIT_DEFINITIONS: UnitDefinition[] = [
  // ================= LENGTH (base: meter) =================
  {
    canonical: 'millimeter',
    singular: 'millimeter',
    plural: 'millimeters',
    symbol: 'mm',
    category: 'length',
    toBase: 0.001,
    aliases: ['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'],
  },
  {
    canonical: 'centimeter',
    singular: 'centimeter',
    plural: 'centimeters',
    symbol: 'cm',
    category: 'length',
    toBase: 0.01,
    aliases: ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'],
  },
  {
    canonical: 'meter',
    singular: 'meter',
    plural: 'meters',
    symbol: 'm',
    category: 'length',
    toBase: 1,
    aliases: ['m', 'meter', 'meters', 'metre', 'metres', 'mtr', 'mtrs'],
  },
  {
    canonical: 'kilometer',
    singular: 'kilometer',
    plural: 'kilometers',
    symbol: 'km',
    category: 'length',
    toBase: 1000,
    aliases: ['km', 'kms', 'kilometer', 'kilometers', 'kilometre', 'kilometres'],
  },
  {
    canonical: 'inch',
    singular: 'inch',
    plural: 'inches',
    symbol: 'in',
    category: 'length',
    toBase: 0.0254,
    aliases: ['in', 'inch', 'inches'],
  },
  {
    canonical: 'foot',
    singular: 'foot',
    plural: 'feet',
    symbol: 'ft',
    category: 'length',
    toBase: 0.3048,
    aliases: ['ft', 'foot', 'feet'],
  },
  {
    canonical: 'yard',
    singular: 'yard',
    plural: 'yards',
    symbol: 'yd',
    category: 'length',
    toBase: 0.9144,
    aliases: ['yd', 'yds', 'yard', 'yards'],
  },
  {
    canonical: 'mile',
    singular: 'mile',
    plural: 'miles',
    symbol: 'mi',
    category: 'length',
    toBase: 1609.344,
    aliases: ['mi', 'mile', 'miles'],
  },
  {
    canonical: 'nautical_mile',
    singular: 'nautical mile',
    plural: 'nautical miles',
    symbol: 'nmi',
    category: 'length',
    toBase: 1852,
    aliases: ['nmi', 'nautical mile', 'nautical miles'],
  },

  // ================= WEIGHT / MASS (base: gram) =================
  {
    canonical: 'milligram',
    singular: 'milligram',
    plural: 'milligrams',
    symbol: 'mg',
    category: 'weight',
    toBase: 0.001,
    aliases: ['mg', 'milligram', 'milligrams'],
  },
  {
    canonical: 'gram',
    singular: 'gram',
    plural: 'grams',
    symbol: 'g',
    category: 'weight',
    toBase: 1,
    aliases: ['g', 'gm', 'gms', 'gram', 'grams'],
  },
  {
    canonical: 'kilogram',
    singular: 'kilogram',
    plural: 'kilograms',
    symbol: 'kg',
    category: 'weight',
    toBase: 1000,
    aliases: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'],
  },
  {
    canonical: 'metric_ton',
    singular: 'metric ton',
    plural: 'metric tons',
    symbol: 't',
    category: 'weight',
    toBase: 1_000_000,
    aliases: ['t', 'ton', 'tons', 'tonne', 'tonnes', 'metric ton', 'metric tons'],
  },
  {
    canonical: 'ounce',
    singular: 'ounce',
    plural: 'ounces',
    symbol: 'oz',
    category: 'weight',
    toBase: 28.349523125,
    aliases: ['oz', 'ounce', 'ounces'],
  },
  {
    canonical: 'pound',
    singular: 'pound',
    plural: 'pounds',
    symbol: 'lb',
    category: 'weight',
    toBase: 453.59237,
    aliases: ['lb', 'lbs', 'pound', 'pounds'],
  },
  {
    canonical: 'stone',
    singular: 'stone',
    plural: 'stones',
    symbol: 'st',
    category: 'weight',
    toBase: 6350.29318,
    aliases: ['st', 'stone', 'stones'],
  },

  // ================= TEMPERATURE (special formulas) =================
  {
    canonical: 'celsius',
    singular: 'degree Celsius',
    plural: 'degrees Celsius',
    symbol: '°C',
    category: 'temperature',
    toBase: 1,
    aliases: ['c', '°c', 'celsius', 'centigrade', 'degree celsius', 'degrees celsius'],
  },
  {
    canonical: 'fahrenheit',
    singular: 'degree Fahrenheit',
    plural: 'degrees Fahrenheit',
    symbol: '°F',
    category: 'temperature',
    toBase: 1,
    aliases: ['f', '°f', 'fahrenheit', 'degree fahrenheit', 'degrees fahrenheit'],
  },
  {
    canonical: 'kelvin',
    singular: 'Kelvin',
    plural: 'Kelvin',
    symbol: 'K',
    category: 'temperature',
    toBase: 1,
    aliases: ['k', 'kelvin', 'kelvins'],
  },

  // ================= VOLUME (base: liter) =================
  {
    canonical: 'milliliter',
    singular: 'milliliter',
    plural: 'milliliters',
    symbol: 'mL',
    category: 'volume',
    toBase: 0.001,
    aliases: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'cc'],
  },
  {
    canonical: 'liter',
    singular: 'liter',
    plural: 'liters',
    symbol: 'L',
    category: 'volume',
    toBase: 1,
    aliases: ['l', 'ltr', 'ltrs', 'liter', 'liters', 'litre', 'litres'],
  },
  {
    canonical: 'cubic_meter',
    singular: 'cubic meter',
    plural: 'cubic meters',
    symbol: 'm³',
    category: 'volume',
    toBase: 1000,
    aliases: ['m3', 'm³', 'cubic meter', 'cubic meters', 'cubic metre', 'cubic metres'],
  },
  {
    canonical: 'teaspoon',
    singular: 'teaspoon',
    plural: 'teaspoons',
    symbol: 'tsp',
    category: 'volume',
    toBase: 0.00492892159375,
    aliases: ['tsp', 'teaspoon', 'teaspoons'],
  },
  {
    canonical: 'tablespoon',
    singular: 'tablespoon',
    plural: 'tablespoons',
    symbol: 'tbsp',
    category: 'volume',
    toBase: 0.01478676478125,
    aliases: ['tbsp', 'tablespoon', 'tablespoons'],
  },
  {
    canonical: 'fluid_ounce',
    singular: 'fluid ounce',
    plural: 'fluid ounces',
    symbol: 'fl oz',
    category: 'volume',
    toBase: 0.0295735295625,
    aliases: ['fl oz', 'floz', 'fluid ounce', 'fluid ounces'],
  },
  {
    canonical: 'cup',
    singular: 'cup',
    plural: 'cups',
    symbol: 'cup',
    category: 'volume',
    toBase: 0.2365882365,
    aliases: ['cup', 'cups'],
  },
  {
    canonical: 'pint',
    singular: 'pint',
    plural: 'pints',
    symbol: 'pt',
    category: 'volume',
    toBase: 0.473176473,
    aliases: ['pt', 'pint', 'pints'],
  },
  {
    canonical: 'quart',
    singular: 'quart',
    plural: 'quarts',
    symbol: 'qt',
    category: 'volume',
    toBase: 0.946352946,
    aliases: ['qt', 'quart', 'quarts'],
  },
  {
    canonical: 'gallon',
    singular: 'gallon',
    plural: 'gallons',
    symbol: 'gal',
    category: 'volume',
    toBase: 3.785411784,
    aliases: ['gal', 'gallon', 'gallons'],
  },

  // ================= AREA (base: square meter) =================
  {
    canonical: 'sq_millimeter',
    singular: 'square millimeter',
    plural: 'square millimeters',
    symbol: 'mm²',
    category: 'area',
    toBase: 1e-6,
    aliases: ['mm2', 'mm²', 'sq mm', 'square millimeter', 'square millimeters'],
  },
  {
    canonical: 'sq_centimeter',
    singular: 'square centimeter',
    plural: 'square centimeters',
    symbol: 'cm²',
    category: 'area',
    toBase: 1e-4,
    aliases: ['cm2', 'cm²', 'sq cm', 'square centimeter', 'square centimeters'],
  },
  {
    canonical: 'sq_meter',
    singular: 'square meter',
    plural: 'square meters',
    symbol: 'm²',
    category: 'area',
    toBase: 1,
    aliases: ['m2', 'm²', 'sq m', 'sqm', 'square meter', 'square meters', 'square metre', 'square metres'],
  },
  {
    canonical: 'hectare',
    singular: 'hectare',
    plural: 'hectares',
    symbol: 'ha',
    category: 'area',
    toBase: 10_000,
    aliases: ['ha', 'hectare', 'hectares'],
  },
  {
    canonical: 'sq_kilometer',
    singular: 'square kilometer',
    plural: 'square kilometers',
    symbol: 'km²',
    category: 'area',
    toBase: 1_000_000,
    aliases: ['km2', 'km²', 'sq km', 'square kilometer', 'square kilometers'],
  },
  {
    canonical: 'sq_inch',
    singular: 'square inch',
    plural: 'square inches',
    symbol: 'in²',
    category: 'area',
    toBase: 0.00064516,
    aliases: ['in2', 'in²', 'sq in', 'square inch', 'square inches'],
  },
  {
    canonical: 'sq_foot',
    singular: 'square foot',
    plural: 'square feet',
    symbol: 'ft²',
    category: 'area',
    toBase: 0.09290304,
    aliases: ['ft2', 'ft²', 'sq ft', 'sqft', 'square foot', 'square feet'],
  },
  {
    canonical: 'sq_yard',
    singular: 'square yard',
    plural: 'square yards',
    symbol: 'yd²',
    category: 'area',
    toBase: 0.83612736,
    aliases: ['yd2', 'yd²', 'sq yd', 'square yard', 'square yards'],
  },
  {
    canonical: 'acre',
    singular: 'acre',
    plural: 'acres',
    symbol: 'ac',
    category: 'area',
    toBase: 4046.8564224,
    aliases: ['ac', 'acre', 'acres'],
  },
  {
    canonical: 'sq_mile',
    singular: 'square mile',
    plural: 'square miles',
    symbol: 'mi²',
    category: 'area',
    toBase: 2589988.110336,
    aliases: ['mi2', 'mi²', 'sq mi', 'square mile', 'square miles'],
  },

  // ================= SPEED (base: meter per second) =================
  {
    canonical: 'meter_per_second',
    singular: 'meter per second',
    plural: 'meters per second',
    symbol: 'm/s',
    category: 'speed',
    toBase: 1,
    aliases: ['m/s', 'mps', 'meter per second', 'meters per second'],
  },
  {
    canonical: 'kilometer_per_hour',
    singular: 'kilometer per hour',
    plural: 'kilometers per hour',
    symbol: 'km/h',
    category: 'speed',
    toBase: 1 / 3.6,
    aliases: ['km/h', 'kmph', 'kph', 'kilometer per hour', 'kilometers per hour'],
  },
  {
    canonical: 'mile_per_hour',
    singular: 'mile per hour',
    plural: 'miles per hour',
    symbol: 'mph',
    category: 'speed',
    toBase: 0.44704,
    aliases: ['mph', 'mile per hour', 'miles per hour'],
  },
  {
    canonical: 'knot',
    singular: 'knot',
    plural: 'knots',
    symbol: 'kn',
    category: 'speed',
    toBase: 1852 / 3600,
    aliases: ['kn', 'kt', 'knot', 'knots'],
  },
  {
    canonical: 'foot_per_second',
    singular: 'foot per second',
    plural: 'feet per second',
    symbol: 'ft/s',
    category: 'speed',
    toBase: 0.3048,
    aliases: ['ft/s', 'fps', 'foot per second', 'feet per second'],
  },

  // ================= TIME (base: second) =================
  {
    canonical: 'millisecond',
    singular: 'millisecond',
    plural: 'milliseconds',
    symbol: 'ms',
    category: 'time',
    toBase: 0.001,
    aliases: ['ms', 'millisecond', 'milliseconds'],
  },
  {
    canonical: 'second',
    singular: 'second',
    plural: 'seconds',
    symbol: 's',
    category: 'time',
    toBase: 1,
    aliases: ['s', 'sec', 'secs', 'second', 'seconds'],
  },
  {
    canonical: 'minute',
    singular: 'minute',
    plural: 'minutes',
    symbol: 'min',
    category: 'time',
    toBase: 60,
    aliases: ['min', 'mins', 'minute', 'minutes'],
  },
  {
    canonical: 'hour',
    singular: 'hour',
    plural: 'hours',
    symbol: 'hr',
    category: 'time',
    toBase: 3600,
    aliases: ['hr', 'hrs', 'hour', 'hours'],
  },
  {
    canonical: 'day',
    singular: 'day',
    plural: 'days',
    symbol: 'day',
    category: 'time',
    toBase: 86400,
    aliases: ['day', 'days'],
  },
  {
    canonical: 'week',
    singular: 'week',
    plural: 'weeks',
    symbol: 'wk',
    category: 'time',
    toBase: 604800,
    aliases: ['wk', 'wks', 'week', 'weeks'],
  },
  {
    canonical: 'month',
    singular: 'month',
    plural: 'months',
    symbol: 'mo',
    category: 'time',
    toBase: 2629800, // 30.4375 days average
    aliases: ['mo', 'month', 'months'],
  },
  {
    canonical: 'year',
    singular: 'year',
    plural: 'years',
    symbol: 'yr',
    category: 'time',
    toBase: 31557600, // 365.25 days
    aliases: ['yr', 'yrs', 'year', 'years'],
  },

  // ================= DATA / STORAGE & TRANSFER RATE (base: bit) =================
  {
    canonical: 'bit',
    singular: 'bit',
    plural: 'bits',
    symbol: 'b',
    category: 'data',
    toBase: 1,
    aliases: ['bit', 'bits', 'b', 'bps', 'bit per second', 'bits per second'],
  },
  {
    canonical: 'byte',
    singular: 'byte',
    plural: 'bytes',
    symbol: 'B',
    category: 'data',
    toBase: 8,
    aliases: ['byte', 'bytes', 'b/s', 'byte per second', 'bytes per second'],
  },
  {
    canonical: 'kilobit',
    singular: 'kilobit',
    plural: 'kilobits',
    symbol: 'Kb',
    category: 'data',
    toBase: 1000,
    aliases: ['kb', 'kbit', 'kilobit', 'kilobits', 'kbps', 'kilobit per second', 'kilobits per second'],
  },
  {
    canonical: 'kilobyte',
    singular: 'KB',
    plural: 'KB',
    symbol: 'KB',
    category: 'data',
    toBase: 8000,
    aliases: ['kilobyte', 'kilobytes', 'kb/s', 'kb per second', 'kilobyte per second', 'kilobytes per second'],
  },
  {
    canonical: 'megabit',
    singular: 'Mbps',
    plural: 'Mbps',
    symbol: 'Mb',
    category: 'data',
    toBase: 1_000_000,
    aliases: ['mbit', 'megabit', 'megabits', 'mbps', 'megabit per second', 'megabits per second'],
  },
  {
    canonical: 'megabyte',
    singular: 'MB',
    plural: 'MB',
    symbol: 'MB',
    category: 'data',
    toBase: 8_000_000,
    aliases: [
      'mb',
      'megabyte',
      'megabytes',
      'mb/s',
      'mb per second',
      'megabyte per second',
      'megabytes per second',
    ],
  },
  {
    canonical: 'gigabit',
    singular: 'Gbps',
    plural: 'Gbps',
    symbol: 'Gb',
    category: 'data',
    toBase: 1_000_000_000,
    aliases: ['gbit', 'gigabit', 'gigabits', 'gbps', 'gigabit per second', 'gigabits per second'],
  },
  {
    canonical: 'gigabyte',
    singular: 'GB',
    plural: 'GB',
    symbol: 'GB',
    category: 'data',
    toBase: 8_000_000_000,
    aliases: [
      'gb',
      'gigabyte',
      'gigabytes',
      'gb/s',
      'gb per second',
      'gigabyte per second',
      'gigabytes per second',
    ],
  },
  {
    canonical: 'terabyte',
    singular: 'TB',
    plural: 'TB',
    symbol: 'TB',
    category: 'data',
    toBase: 8_000_000_000_000,
    aliases: ['tb', 'terabyte', 'terabytes'],
  },
  {
    canonical: 'petabyte',
    singular: 'PB',
    plural: 'PB',
    symbol: 'PB',
    category: 'data',
    toBase: 8_000_000_000_000_000,
    aliases: ['pb', 'petabyte', 'petabytes'],
  },
];

export class ConversionService {
  /**
   * Resolves a human-friendly or abbreviated unit string into its UnitDefinition.
   * Preserves case sensitivity where needed (e.g. 'MB' vs 'Mb' / 'Mbps').
   */
  public resolveUnit(rawUnit: string): UnitDefinition | null {
    if (!rawUnit || typeof rawUnit !== 'string') return null;
    const trimmed = rawUnit.trim();

    // Exact case-sensitive checks for data transfer & storage ambiguity
    if (trimmed === 'MB' || /^MB\s*(?:\/s|per\s+second)$/i.test(trimmed)) {
      return UNIT_DEFINITIONS.find((u) => u.canonical === 'megabyte')!;
    }
    if (
      trimmed === 'Mb' ||
      trimmed === 'Mbps' ||
      /^mbps$/i.test(trimmed) ||
      /^megabits?\s*(?:\/s|per\s+second)?$/i.test(trimmed)
    ) {
      return UNIT_DEFINITIONS.find((u) => u.canonical === 'megabit')!;
    }
    if (trimmed === 'KB' || /^KB\s*(?:\/s|per\s+second)$/i.test(trimmed)) {
      return UNIT_DEFINITIONS.find((u) => u.canonical === 'kilobyte')!;
    }
    if (trimmed === 'Kb' || /^kbps$/i.test(trimmed)) {
      return UNIT_DEFINITIONS.find((u) => u.canonical === 'kilobit')!;
    }
    if (trimmed === 'GB' || /^GB\s*(?:\/s|per\s+second)$/i.test(trimmed)) {
      return UNIT_DEFINITIONS.find((u) => u.canonical === 'gigabyte')!;
    }
    if (trimmed === 'Gb' || /^gbps$/i.test(trimmed)) {
      return UNIT_DEFINITIONS.find((u) => u.canonical === 'gigabit')!;
    }

    const lower = trimmed
      .toLowerCase()
      .replace(/^degrees?\s+/, 'degree ')
      .replace(/\s+/g, ' ');

    for (const def of UNIT_DEFINITIONS) {
      if (
        def.canonical === lower ||
        def.singular.toLowerCase() === lower ||
        def.plural.toLowerCase() === lower ||
        def.aliases.includes(lower)
      ) {
        return def;
      }
    }

    return null;
  }

  /**
   * Performs a deterministic unit conversion and returns the numeric value.
   */
  public convertValue(
    value: number,
    fromDef: UnitDefinition,
    toDef: UnitDefinition
  ): number {
    if (fromDef.category !== toDef.category) {
      throw new Error(
        `Cannot convert between ${fromDef.category} (${fromDef.plural}) and ${toDef.category} (${toDef.plural}).`
      );
    }

    if (fromDef.category === 'temperature') {
      return this.convertTemperature(value, fromDef.canonical, toDef.canonical);
    }

    const baseVal = value * fromDef.toBase;
    const converted = baseVal / toDef.toBase;
    return calculationService.sanitizeNumber(converted);
  }

  private convertTemperature(
    val: number,
    fromCanonical: string,
    toCanonical: string
  ): number {
    if (fromCanonical === toCanonical) {
      return calculationService.sanitizeNumber(val);
    }

    // Convert to Celsius first
    let celsius = val;
    if (fromCanonical === 'fahrenheit') {
      celsius = ((val - 32) * 5) / 9;
    } else if (fromCanonical === 'kelvin') {
      celsius = val - 273.15;
    }

    // Convert from Celsius to target
    let target = celsius;
    if (toCanonical === 'fahrenheit') {
      target = (celsius * 9) / 5 + 32;
    } else if (toCanonical === 'kelvin') {
      target = celsius + 273.15;
    }

    // Round temperature to at most 4 decimal places for clean readability
    const rounded = Number(target.toFixed(4));
    return calculationService.sanitizeNumber(rounded);
  }

  /**
   * Executes a StructuredAIIntent for unit conversion.
   */
  public executeIntent(intent: StructuredAIIntent): CalculationOutput {
    const val = intent.value ?? intent.values?.[0];
    const rawFrom = intent.from_unit || '';
    const rawTo = intent.to_unit || '';

    if (val === undefined || val === null || !Number.isFinite(val)) {
      return {
        success: false,
        formattedResult: '?',
        displayExpression: 'Unit conversion',
        spokenResponse: 'What value would you like me to convert?',
        requiresClarification: true,
        clarificationQuestion: 'What value would you like me to convert?',
        intent,
      };
    }

    if (!rawFrom || !rawTo) {
      const q = !rawTo
        ? `What unit would you like to convert ${val} ${rawFrom || ''} to?`.trim()
        : 'Which units would you like me to convert between?';
      return {
        success: false,
        formattedResult: '?',
        displayExpression: `Convert ${val} ${rawFrom}`,
        spokenResponse: q,
        requiresClarification: true,
        clarificationQuestion: q,
        intent,
      };
    }

    const fromDef = this.resolveUnit(rawFrom);
    const toDef = this.resolveUnit(rawTo);

    if (!fromDef || !toDef) {
      const unknownUnit = !fromDef ? rawFrom : rawTo;
      const msg = `I don't recognize the unit "${unknownUnit}".`;
      return {
        success: false,
        formattedResult: 'Error',
        displayExpression: `${val} ${rawFrom} → ${rawTo}`,
        spokenResponse: msg,
        errorCode: 'UNSUPPORTED_UNIT',
        errorMessage: msg,
        intent,
      };
    }

    if (fromDef.category !== toDef.category) {
      const msg = `I can't convert ${fromDef.plural} (${fromDef.category}) into ${toDef.plural} (${toDef.category}).`;
      return {
        success: false,
        formattedResult: 'Error',
        displayExpression: `${val} ${fromDef.symbol} → ${toDef.symbol}`,
        spokenResponse: msg,
        errorCode: 'INCOMPATIBLE_UNITS',
        errorMessage: msg,
        intent,
      };
    }

    const convertedNum = this.convertValue(val, fromDef, toDef);
    // Show conversions like people say them: 31.0686 miles, not 31.0685596119
    const displayNum =
      Math.abs(convertedNum) >= 1
        ? Number(convertedNum.toFixed(4))
        : Number(convertedNum.toPrecision(6));
    const formattedNum = calculationService.formatNumber(displayNum);
    const inputFormatted = calculationService.formatNumber(val);

    // Determine human-friendly unit labels
    const isRateConversion =
      /per\s+second|\/s|bps/i.test(rawFrom) ||
      /per\s+second|\/s|bps/i.test(rawTo);

    let fromLabel = Math.abs(val) === 1 ? fromDef.singular : fromDef.plural;
    let toLabel =
      Math.abs(convertedNum) === 1 ? toDef.singular : toDef.plural;

    if (isRateConversion && toDef.category === 'data') {
      if (toDef.canonical === 'megabyte') {
        toLabel = /per\s+second/i.test(rawTo) ? 'MB per second' : 'MB/s';
      } else if (toDef.canonical === 'kilobyte') {
        toLabel = /per\s+second/i.test(rawTo) ? 'KB per second' : 'KB/s';
      } else if (toDef.canonical === 'gigabyte') {
        toLabel = /per\s+second/i.test(rawTo) ? 'GB per second' : 'GB/s';
      }
    }

    const formattedResult = `${formattedNum} ${toLabel}`;
    const displayExpression = `${inputFormatted} ${fromLabel} → ${toLabel}`;
    const spokenResponse = `${inputFormatted} ${fromLabel} is equal to ${formattedNum} ${toLabel}.`;

    return {
      success: true,
      resultNumber: convertedNum,
      formattedResult,
      displayExpression,
      spokenResponse,
      unit: toLabel,
      intent,
    };
  }
}

export const conversionService = new ConversionService();
