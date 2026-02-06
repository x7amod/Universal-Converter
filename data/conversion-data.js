// Unit conversion data and constants
// This file contains all the conversion ratios, patterns, and aliases

// Global namespace for unit converter data
window.UnitConverterData = window.UnitConverterData || {};

// ============================================================================
// CONVERSION RATIOS
// ============================================================================

window.UnitConverterData.CONVERSION_RATIOS = {
  length: {
    m: 1,
    cm: 100,
    mm: 1000,
    um: 1000000,
    nm: 1000000000,
    km: 0.001,
    in: 39.3701,
    ft: 3.28084,
    yd: 1.09361,
    mi: 0.000621371
  },
  weight: {
    kg: 1,
    g: 1000,
    mg: 1000000,
    lb: 2.20462,
    oz: 35.274,
    t: 0.001
  },
  temperature: {
    c: (val) => val,
    f: (val) => (val * 9/5) + 32,
    k: (val) => val + 273.15
  },
  volume: {
    l: 1,
    ml: 1000,
    gal: 0.264172,
    qt: 1.05669,
    pt: 2.11338,
    cup: 4.22675,
    fl_oz: 33.814,
    tbsp: 67.628,
    tsp: 202.884
  },
  area: {
    m2: 1,
    cm2: 10000,
    mm2: 1000000,
    km2: 0.000001,
    ft2: 10.7639,
    in2: 1550,
    yd2: 1.19599,
    mi2: 3.861e-7,
    acre: 0.000247105
  },
  speed: {
    'ms': 1, // m/s (base unit)
    'cms': 100, // cm/s (for auto-sizing)
    'kmh': 0.277778, // km/h
    'kms': 0.001, // km/s (for auto-sizing)
    'mph': 0.44704, // mph
    'mis': 0.000621371, // mi/s (for auto-sizing)
    'fps': 0.3048, // ft/s
    'kn': 0.514444, // knots
    'mach': 343 // mach
  },
  acceleration: {
    'ms2': 1, // m/s² (base unit)
    'cms2': 100, // cm/s² (for auto-sizing)
    'kms2': 0.001, // km/s² (for auto-sizing)
    'fts2': 3.28084, // ft/s²
    'ins2': 39.3701, // in/s² (for auto-sizing)
    'gforce': 0.101972 // g-force (1 / 9.80665)
  },
  flowRate: {
    'lmin': 1, // L/min (base unit)
    'lpm': 1, // L/min alias
    'mlmin': 1000, // ml/min (for auto-sizing)
    'mls': 16.6667, // ml/s (for auto-sizing)
    'ls': 0.0166667, // L/s (for auto-sizing)
    'lh': 60, // L/h (for auto-sizing)
    'galmin': 0.264172, // gal/min (US)
    'gpm': 0.264172, // gal/min alias
    'gals': 0.00440287, // gal/s (for auto-sizing)
    'galh': 15.8503, // gal/h (for auto-sizing)
    'm3s': 0.0000166667, // m³/s
    'm3h': 0.06, // m³/h
    'm3min': 0.001, // m³/min (for auto-sizing)
    'cfm': 0.0353147, // cubic feet per minute
    'cfs': 0.000588578, // cubic feet per second
    'cfh': 2.11888 // cubic feet per hour
  },
  torque: {
    'Nm': 1,
    'lbft': 1.35582,
    'lbin': 0.112985,
    'kgm': 9.80665,
    'kgfm': 9.80665, // kilogram-force meter
    'ozin': 0.00706155
  },
  pressure: {
    'pa': 1,
    'bar': 100000,
    'mbar': 100, // millibar
    'psi': 6894.76,
    'atm': 101325,
    'mmhg': 133.322,
    'inhg': 3386.39, // inches of mercury
    'torr': 133.322,
    'kpa': 1000,
    'mpa': 1000000,
    'psf': 47.8803 // pounds per square foot
  },
  timezone: {
    // Timezone handling is special - uses offset calculation
    'utc': (date, offset) => new Date(date.getTime() + (offset * 60000)),
    'gmt': (date, offset) => new Date(date.getTime() + (offset * 60000))
  }
};

// ============================================================================
// UNIT SCALING RULES
// ============================================================================

/**
 * Configuration for automatic unit scaling based on value magnitude
 * Used by getBestUnit() to determine the most appropriate display unit
 */
window.UnitConverterData.UNIT_SCALING_RULES = {
  length: {
    m: [
      { threshold: 1000, direction: 'up', targetUnit: 'km' },
      { threshold: 1, direction: 'down', targetUnit: 'cm', minValue: 1 },
      { threshold: 1, direction: 'down', targetUnit: 'mm' }
    ],
    ft: [
      { threshold: 5280, direction: 'up', targetUnit: 'mi' },
      { threshold: 1, direction: 'down', targetUnit: 'in' }
    ],
    yd: [
      { threshold: 1, direction: 'down', targetUnit: 'ft', minValue: 1 },
      { threshold: 1, direction: 'down', targetUnit: 'in' }
    ],
    nm: [
      { threshold: 1000000, direction: 'up', targetUnit: 'mm' },
      { threshold: 100, direction: 'up', targetUnit: 'um' }
    ],
    um: [
      { threshold: 1000, direction: 'up', targetUnit: 'mm' },
      { threshold: 1, direction: 'down', targetUnit: 'nm' }
    ]
  },
  weight: {
    kg: [
      { threshold: 1000, direction: 'up', targetUnit: 't' },
      { threshold: 1, direction: 'down', targetUnit: 'g' }
    ],
    lb: [
      { threshold: 1, direction: 'down', targetUnit: 'oz' }
    ]
  },
  volume: {
    l: [
      { threshold: 1, direction: 'down', targetUnit: 'ml' }
    ],
    gal: [
      { threshold: 1, direction: 'down', targetUnit: 'qt', minValue: 1 },
      { threshold: 1, direction: 'down', targetUnit: 'pt', minValue: 1 },
      { threshold: 1, direction: 'down', targetUnit: 'cup', minValue: 1 },
      { threshold: 1, direction: 'down', targetUnit: 'floz' }
    ],
    tbsp: [
      { threshold: 1, direction: 'down', targetUnit: 'tsp' }
    ],
    tsp: [
      { threshold: 3, direction: 'up', targetUnit: 'tbsp' }
    ]
  },
  area: {
    m2: [
      { threshold: 1000000, direction: 'up', targetUnit: 'km2' },
      { threshold: 1, direction: 'down', targetUnit: 'cm2', minValue: 1 },
      { threshold: 1, direction: 'down', targetUnit: 'mm2' }
    ],
    ft2: [
      { threshold: 43560, direction: 'up', targetUnit: 'acre' },
      { threshold: 1, direction: 'down', targetUnit: 'in2' }
    ]
  },
  speed: {
    ms: [
      { threshold: 1000, direction: 'up', targetUnit: 'kms' },
      { threshold: 50, direction: 'up', targetUnit: 'kmh', convertFn: (v, u) => v / u.kmh },
      { threshold: 1, direction: 'down', targetUnit: 'cms' }
    ],
    kmh: [
      { threshold: 3600, direction: 'up', targetUnit: 'kms', convertFn: (v, u) => v * u.kmh * u.kms },
      { threshold: 1, direction: 'down', targetUnit: 'ms', convertFn: (v, u) => v * u.kmh }
    ],
    mph: [
      { threshold: 3600, direction: 'up', targetUnit: 'mis', convertFn: (v, u) => v * u.mph * u.mis },
      { threshold: 1, direction: 'down', targetUnit: 'fps', convertFn: (v, u) => v * u.mph / u.fps }
    ],
    fps: [
      { threshold: 5280, direction: 'up', targetUnit: 'mph', convertFn: (v, u) => v * u.fps / u.mph }
    ]
  },
  acceleration: {
    ms2: [
      { threshold: 1000, direction: 'up', targetUnit: 'kms2', excludeSource: 'kms2' },
      { threshold: 0.01, direction: 'down', targetUnit: 'cms2', excludeSource: 'cms2' }
    ],
    fts2: [
      { threshold: 1, direction: 'down', targetUnit: 'ins2' }
    ],
    cms2: [
      { threshold: 100, direction: 'up', targetUnit: 'ms2', convertFn: (v, u) => v / u.cms2 }
    ],
    kms2: [
      { threshold: 1, direction: 'down', targetUnit: 'ms2', convertFn: (v, u) => v / u.kms2 }
    ]
  },
  flowRate: {
    lmin: [
      { threshold: 1000, direction: 'up', targetUnit: 'm3min' },
      { threshold: 60, direction: 'up', targetUnit: 'ls', excludeSource: 'ls' },
      { threshold: 1, direction: 'down', targetUnit: 'mlmin', excludeSource: 'mlmin' }
    ],
    galmin: [
      { threshold: 60, direction: 'up', targetUnit: 'gals' },
      { threshold: 1, direction: 'down', targetUnit: 'galh' }
    ],
    mlmin: [
      { threshold: 1000, direction: 'up', targetUnit: 'lmin', convertFn: (v, u) => v / u.mlmin },
      { threshold: 60, direction: 'up', targetUnit: 'mls', convertFn: (v, u) => v * u.mlmin / u.mls }
    ],
    ls: [
      { threshold: 1, direction: 'down', targetUnit: 'lmin', convertFn: (v, u) => v / u.ls }
    ],
    m3s: [
      { threshold: 0.001, direction: 'down', targetUnit: 'lmin', convertFn: (v, u) => v / u.m3s }
    ]
  },
  pressure: {
    pa: [
      { threshold: 100000, direction: 'up', targetUnit: 'bar', convertFn: (v, u) => v / u.bar },
      { threshold: 1000, direction: 'up', targetUnit: 'kpa', convertFn: (v, u) => v / u.kpa }
    ],
    kpa: [
      { threshold: 100, direction: 'up', targetUnit: 'bar', convertFn: (v, u) => v / (u.bar / u.kpa) },
      { threshold: 1, direction: 'down', targetUnit: 'pa', convertFn: (v, u) => v * u.kpa / u.pa }
    ],
    bar: [
      { threshold: 0.01, direction: 'down', targetUnit: 'kpa', convertFn: (v, u) => v * u.bar / u.kpa }
    ],
    mbar: [
      { threshold: 1000, direction: 'up', targetUnit: 'bar' }
    ]
  }
};

// ============================================================================
// UNIT PATTERNS (REGEX)
// ============================================================================

window.UnitConverterData.UNIT_PATTERNS = {
  length: /(?:^|\s|^[\s]*|[\s]*$)(\d+(?:\.\d+)?)\s*-?\s*(m|cm|mm|um|nm|km|in|inch|inches|ft|foot|feet|yd|yard|yards|mi|mile|miles|meter|meters|centimeter|centimeters|millimeter|millimeters|micrometer|micrometers|micron|microns|nanometer|nanometers|kilometer|kilometers)(?=\s*$|\s*[.,!?;:]|\s*\n|\s*\r)/gi,
  weight: /(?:^|\s|^[\s]*|[\s]*$)(\d+(?:\.\d+)?)\s*(kg|g|mg|lb(?![\s\.\-⋅\/]*(?:ft|foot|feet|in|inch|inches))|lbs|oz(?![\s\.\-⋅\/]*(?:in|inch|inches))|ounce|ounces|pound(?![\s\-]*(?:foot|feet|inch|inches))|pounds(?![\s\-]*(?:foot|feet|inch|inches))|kilogram|kilograms|gram|grams|milligram|milligrams|tonne|tonnes|t)(?=\s*$|\s*[.,!?;:]|\s*\n|\s*\r)/gi,
  temperature: /(?:^|\s|^[\s]*|[\s]*$)(\d+(?:\.\d+)?)\s*°?\s*(c|f|k|celsius|fahrenheit|kelvin|degrees?\s*celsius|degrees?\s*fahrenheit)(?=\s*$|\s*[.,!?;:]|\s*\n|\s*\r)/gi,
  volume: /(?:^|\s|^[\s]*|[\s]*$)(\d+(?:\.\d+)?)\s*(l|ml|gal|gallon|gallons|qt|quart|quarts|pt|pint|pints|cup|cups|fl\s*oz|fluid\s*ounce|fluid\s*ounces|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|liter|liters|milliliter|milliliters)(?=\s*$|\s*[.,!?;:]|\s*\n|\s*\r)/gi,
  area: /(?:^|\s|^[\s]*|[\s]*$)(\d+(?:\.\d+)?)\s*-?\s*(m²|cm²|mm²|km²|ft²|in²|yd²|mi²|m2|cm2|mm2|km2|ft2|in2|yd2|mi2|acre|acres|square\s*meter|square\s*meters|square\s*centimeter|square\s*centimeters|square\s*millimeter|square\s*millimeters|square\s*kilometer|square\s*kilometers|square\s*foot|square\s*feet|square\s*inch|square\s*inches|square\s*yard|square\s*yards|square\s*mile|square\s*miles|meters?\s*squared|meter\s*squared|feet\s*squared|foot\s*squared|inches?\s*squared|inch\s*squared|yards?\s*squared|yard\s*squared|miles?\s*squared|mile\s*squared|centimeters?\s*squared|centimeter\s*squared|millimeters?\s*squared|millimeter\s*squared|kilometers?\s*squared|kilometer\s*squared)(?=\s*$|\s*[.,!?;:]|\s*\n|\s*\r)/gi,
  // Two dimension patterns: with units on each number, and with unit at the end
  dimensionsWithUnits: /(?:^|\s|^[\s]*|[\s]*$)(\d+(?:\.\d+)?)\s*(m|cm|mm|um|nm|km|in|inch|inches|ft|foot|feet|yd|yard|yards|mi|mile|miles|meter|meters|centimeter|centimeters|millimeter|millimeters|micrometer|micrometers|micron|microns|nanometer|nanometers|kilometer|kilometers)\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)\s*\2\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)\s*\2(?=\s*$|\s*[.,!?;:]|\s*\n|\s*\r)/gi,
  dimensions: /(?:^|\s|^[\s]*|[\s]*$)(\d+(?:\.\d+)?)\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)\s*-?\s*(m|cm|mm|um|nm|km|in|inch|inches|ft|foot|feet|yd|yard|yards|mi|mile|miles|meter|meters|centimeter|centimeters|millimeter|millimeters|micrometer|micrometers|micron|microns|nanometer|nanometers|kilometer|kilometers)(?=\s*$|\s*[.,!?;:]|\s*\n|\s*\r)/gi,
  speed: /(?:^|\s|^[\s]*|[\s]*$)(\d+(?:\.\d+)?)\s*-?\s*(m\/s|ms|cm\/s|cms|km\/s|kms|km\/h|kmh|km\/hr|mph|mi\/h|mi\/s|mis|ft\/s|fps|knots?|kn|nautical\s*miles?\s*per\s*hour|mach|meters?\s*per\s*second|centimeters?\s*per\s*second|kilometers?\s*per\s*second|kilometers?\s*per\s*hour|miles?\s*per\s*hour|miles?\s*per\s*second|feet\s*per\s*second)(?=\s*$|\s*[.,!?;:]|\s*\n|\s*\r)/gi,
  acceleration: /(?:^|\s|^[\s]*|[\s]*$)(\d+(?:\.\d+)?)\s*-?\s*(m\/s²|m\/s2|ms2|cm\/s²|cm\/s2|cms2|km\/s²|km\/s2|kms2|ft\/s²|ft\/s2|fts2|in\/s²|in\/s2|ins2|g-force|gee|meters?\s*per\s*second\s*squared|centimeters?\s*per\s*second\s*squared|kilometers?\s*per\s*second\s*squared|feet\s*per\s*second\s*squared|inches?\s*per\s*second\s*squared)(?=\s*$|\s*[.,!?;:]|\s*\n|\s*\r)/gi,
  flowRate: /(?:^|\s|^[\s]*|[\s]*$)(\d+(?:\.\d+)?)\s*-?\s*(L\/min|l\/min|lpm|lmin|mL\/min|ml\/min|mlmin|mL\/s|ml\/s|mls|L\/s|l\/s|ls|L\/h|l\/h|lh|gal\/min|gpm|gal\/s|gals|gal\/h|galh|m³\/s|m3\/s|m3s|m³\/min|m3\/min|m3min|m³\/h|m3\/h|m3h|cubic\s*meters?\s*per\s*second|cubic\s*meters?\s*per\s*minute|cubic\s*meters?\s*per\s*hour|cfm|cfs|cfh|cubic\s*feet\s*per\s*minute|cubic\s*feet\s*per\s*second|cubic\s*feet\s*per\s*hour|liters?\s*per\s*minute|milliliters?\s*per\s*minute|milliliters?\s*per\s*second|liters?\s*per\s*second|liters?\s*per\s*hour|gallons?\s*per\s*minute|gallons?\s*per\s*second|gallons?\s*per\s*hour)(?=\s*$|\s*[.,!?;:]|\s*\n|\s*\r)/gi,
  torque: /(?:^|\s|^[\s]*|[\s]*$)(\d+(?:\.\d+)?)\s*-?\s*(N[\s\.\-⋅]?m|N\.m|N·m|N⋅m|lb[\s\.\-⋅]?ft|lbft|ft[\s\.\-⋅]?lbs?|lb[\s\.\-⋅]?in|lbin|in[\s\.\-⋅]?lbs?|kg[\s\.\-⋅]?m|kgm|kgf[\s\.\-⋅]?m|oz[\s\.\-⋅]?in|ozin|newton[\s\-]?meters?|pound[\s\-]?feet|foot[\s\-]?pounds?|pound[\s\-]?inches?|inch[\s\-]?pounds?|kilogram[\s\-]?force[\s\-]?meters?)(?=\s*$|\s*[.,!?;:]|\s*\n|\s*\r)/gi,
  pressure: /(?:^|\s|^[\s]*|[\s]*$)(\d+(?:\.\d+)?)\s*-?\s*(Pa|bar|mbar|psi|atm|mmHg|inHg|torr|kPa|MPa|psf|pascal|millibar|atmosphere|atmospheres|pounds?\s*per\s*square\s*inch|pounds?\s*per\s*square\s*foot|millimeters?\s*of\s*mercury|inches?\s*of\s*mercury)(?=\s*$|\s*[.,!?;:]|\s*\n|\s*\r)/gi,
  timezone: /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\s*((EST|EDT|ET|PST|PDT|PT|CST|CDT|CT|MST|MDT|MT|AST|ADT|NST|NDT|HST|AKST|AKDT|EASTERN|PACIFIC|CENTRAL|MOUNTAIN|GMT|UTC|CET|CEST|EET|EEST|WET|WEST|BST|MSK|FET|IST|PKT|ICT|SGT|HKT|JST|KST|ACST|ACDT|AEST|AEDT|AWST|AWDT|NZST|NZDT|IRST|IDT|CAT|EAT|WAT|SAST|ART|BRT|BRST|CLT|CLST|PET|COT)([+-]\d{1,2})?|([+-]\d{1,2}):?(\d{2})?)/gi,
  // Currency pattern will be generated dynamically from currency mappings
  currency: null 
};

// ============================================================================
// UNIT ALIASES
// ============================================================================

window.UnitConverterData.UNIT_ALIASES = {
  // Length aliases
  'inch': 'in', 'inches': 'in',
  'foot': 'ft', 'feet': 'ft',
  'yard': 'yd', 'yards': 'yd',
  'mile': 'mi', 'miles': 'mi',
  'meter': 'm', 'meters': 'm',
  'centimeter': 'cm', 'centimeters': 'cm',
  'millimeter': 'mm', 'millimeters': 'mm',
  'micrometer': 'um', 'micrometers': 'um', 'micron': 'um', 'microns': 'um',
  'nanometer': 'nm', 'nanometers': 'nm',
  'kilometer': 'km', 'kilometers': 'km',
    // Weight aliases
  'kilogram': 'kg', 'kilograms': 'kg',
  'gram': 'g', 'grams': 'g',
  'milligram': 'mg', 'milligrams': 'mg',
  'pound': 'lb', 'pounds': 'lb', 'lbs': 'lb',
  'ounce': 'oz', 'ounces': 'oz',
  'tonne': 't', 'tonnes': 't',
  
  // Temperature aliases
  'celsius': 'c', 'fahrenheit': 'f', 'kelvin': 'k',
  'degrees celsius': 'c', 'degrees fahrenheit': 'f', 
  'degree celsius': 'c', 'degree fahrenheit': 'f',
  
  // Volume aliases
  'liter': 'l', 'liters': 'l',
  'milliliter': 'ml', 'milliliters': 'ml',
  'gallon': 'gal', 'gallons': 'gal',
  'quart': 'qt', 'quarts': 'qt',
  'pint': 'pt', 'pints': 'pt',
  'cup': 'cup', 'cups': 'cup',
  'fl oz': 'fl_oz', 'fluid ounce': 'fl_oz', 'fluid ounces': 'fl_oz',
  'tablespoon': 'tbsp', 'tablespoons': 'tbsp',
  'teaspoon': 'tsp', 'teaspoons': 'tsp',  
  // Area aliases
  'square meter': 'm2', 'square meters': 'm2',
  'square centimeter': 'cm2', 'square centimeters': 'cm2',
  'square millimeter': 'mm2', 'square millimeters': 'mm2',
  'square kilometer': 'km2', 'square kilometers': 'km2',
  'square foot': 'ft2', 'square feet': 'ft2',
  'square inch': 'in2', 'square inches': 'in2',
  'square yard': 'yd2', 'square yards': 'yd2',
  'square mile': 'mi2', 'square miles': 'mi2',
  'meters squared': 'm2', 'meter squared': 'm2',
  'feet squared': 'ft2', 'foot squared': 'ft2',
  'inches squared': 'in2', 'inch squared': 'in2',
  'yards squared': 'yd2', 'yard squared': 'yd2',
  'miles squared': 'mi2', 'mile squared': 'mi2',
  'centimeters squared': 'cm2', 'centimeter squared': 'cm2',
  'millimeters squared': 'mm2', 'millimeter squared': 'mm2',
  'kilometers squared': 'km2', 'kilometer squared': 'km2',
  'acre': 'acre', 'acres': 'acre',
  // Unicode area symbols
  'm²': 'm2', 'cm²': 'cm2', 'mm²': 'mm2', 'km²': 'km2',
  'ft²': 'ft2', 'in²': 'in2', 'yd²': 'yd2', 'mi²': 'mi2',
  
  // Speed aliases
  'm/s': 'ms', 'ms': 'ms', 'meters per second': 'ms', 'meter per second': 'ms',
  'cm/s': 'cms', 'cms': 'cms', 'centimeters per second': 'cms', 'centimeter per second': 'cms',
  'km/s': 'kms', 'kms': 'kms', 'kilometers per second': 'kms', 'kilometer per second': 'kms',
  'km/h': 'kmh', 'kmh': 'kmh', 'km/hr': 'kmh', 'kilometers per hour': 'kmh', 'kilometer per hour': 'kmh',
  'miles per hour': 'mph', 'mile per hour': 'mph', 'mi/h': 'mph', 'mph': 'mph',
  'mi/s': 'mis', 'mis': 'mis', 'miles per second': 'mis', 'mile per second': 'mis',
  'ft/s': 'fps', 'fps': 'fps', 'feet per second': 'fps', 'foot per second': 'fps',
  'knot': 'kn', 'knots': 'kn', 'kn': 'kn', 'nautical miles per hour': 'kn', 'nautical mile per hour': 'kn',
  
  // Acceleration aliases
  'm/s²': 'ms2', 'm/s2': 'ms2', 'ms2': 'ms2', 'meters per second squared': 'ms2', 'meter per second squared': 'ms2',
  'cm/s²': 'cms2', 'cm/s2': 'cms2', 'cms2': 'cms2', 'centimeters per second squared': 'cms2', 'centimeter per second squared': 'cms2',
  'km/s²': 'kms2', 'km/s2': 'kms2', 'kms2': 'kms2', 'kilometers per second squared': 'kms2', 'kilometer per second squared': 'kms2',
  'ft/s²': 'fts2', 'ft/s2': 'fts2', 'fts2': 'fts2', 'feet per second squared': 'fts2', 'foot per second squared': 'fts2',
  'in/s²': 'ins2', 'in/s2': 'ins2', 'ins2': 'ins2', 'inches per second squared': 'ins2', 'inch per second squared': 'ins2',
  'g-force': 'gforce', 'gee': 'gforce', 'gforce': 'gforce',
  
  // Flow rate aliases
  'l/min': 'lmin', 'L/min': 'lmin', 'lmin': 'lmin', 'liters per minute': 'lmin', 'liter per minute': 'lmin', 'lpm': 'lmin',
  'ml/min': 'mlmin', 'mL/min': 'mlmin', 'mlmin': 'mlmin', 'milliliters per minute': 'mlmin', 'milliliter per minute': 'mlmin',
  'ml/s': 'mls', 'mL/s': 'mls', 'mls': 'mls', 'milliliters per second': 'mls', 'milliliter per second': 'mls',
  'l/s': 'ls', 'L/s': 'ls', 'ls': 'ls', 'liters per second': 'ls', 'liter per second': 'ls',
  'l/h': 'lh', 'L/h': 'lh', 'lh': 'lh', 'liters per hour': 'lh', 'liter per hour': 'lh',
  'gal/min': 'galmin', 'galmin': 'galmin', 'gallons per minute': 'galmin', 'gallon per minute': 'galmin', 'gpm': 'galmin',
  'gal/s': 'gals', 'gals': 'gals', 'gallons per second': 'gals', 'gallon per second': 'gals',
  'gal/h': 'galh', 'galh': 'galh', 'gallons per hour': 'galh', 'gallon per hour': 'galh',
  'm³/s': 'm3s', 'm3/s': 'm3s', 'm3s': 'm3s', 'cubic meters per second': 'm3s', 'cubic meter per second': 'm3s',
  'm³/min': 'm3min', 'm3/min': 'm3min', 'm3min': 'm3min', 'cubic meters per minute': 'm3min', 'cubic meter per minute': 'm3min',
  'm³/h': 'm3h', 'm3/h': 'm3h', 'm3h': 'm3h', 'cubic meters per hour': 'm3h', 'cubic meter per hour': 'm3h',
  'cfm': 'cfm', 'cubic feet per minute': 'cfm', 'cubic foot per minute': 'cfm',
  'cfs': 'cfs', 'cubic feet per second': 'cfs', 'cubic foot per second': 'cfs',
  'cfh': 'cfh', 'cubic feet per hour': 'cfh', 'cubic foot per hour': 'cfh',
  
  // Torque aliases
  'n.m': 'Nm', 'n·m': 'Nm', 'n⋅m': 'Nm', 'n-m': 'Nm', 'Nm': 'Nm', 'newton meter': 'Nm', 'newton meters': 'Nm', 'newton-meters': 'Nm', 'newton-meter': 'Nm',
  'lb.ft': 'lbft', 'lb·ft': 'lbft', 'lb⋅ft': 'lbft', 'lb-ft': 'lbft', 'pound foot': 'lbft', 'pound feet': 'lbft', 'pound-feet': 'lbft', 'pound-foot': 'lbft',
  'foot pound': 'lbft', 'foot pounds': 'lbft', 'foot-pounds': 'lbft', 'foot-pound': 'lbft', 'ft-lbs': 'lbft', 'ft⋅lbs': 'lbft',
  'lb.in': 'lbin', 'lb·in': 'lbin', 'lb⋅in': 'lbin', 'lb-in': 'lbin', 'pound inch': 'lbin', 'pound inches': 'lbin', 'pound-inches': 'lbin', 'pound-inch': 'lbin',
  'in-lbs': 'lbin', 'inch-pounds': 'lbin', 'inch-pound': 'lbin', 'inch pounds': 'lbin', 'inch pound': 'lbin',
  'kg.m': 'kgm', 'kg·m': 'kgm', 'kg⋅m': 'kgm', 'kg-m': 'kgm', 'kilogram meter': 'kgm', 'kilogram meters': 'kgm',
  'kgf.m': 'kgfm', 'kgf·m': 'kgfm', 'kgf⋅m': 'kgfm', 'kgf-m': 'kgfm', 'kilogram force meter': 'kgfm', 'kilogram force meters': 'kgfm', 'kilogram-force meters': 'kgfm', 'kilogram-force meter': 'kgfm',
  'oz.in': 'ozin', 'oz·in': 'ozin', 'oz⋅in': 'ozin', 'oz-in': 'ozin', 'ounce inch': 'ozin', 'ounce inches': 'ozin',
  
  // Pressure aliases
  'pascal': 'pa', 'pascals': 'pa',
  'millibar': 'mbar',
  'atmosphere': 'atm', 'atmospheres': 'atm',
  'pounds per square inch': 'psi', 'pound per square inch': 'psi',
  'pounds per square foot': 'psf', 'pound per square foot': 'psf',
  'millimeters of mercury': 'mmhg', 'millimeter of mercury': 'mmhg',
  'inches of mercury': 'inhg', 'inch of mercury': 'inhg', 'inhg': 'inhg',
  'mm Hg': 'mmhg', 'mmhg': 'mmhg',
  'in Hg': 'inhg', 'inHg': 'inhg',
  'kilopascal': 'kpa', 'kilopascals': 'kpa', 'kPa': 'kpa',
  'megapascal': 'mpa', 'megapascals': 'mpa', 'MPa': 'mpa'
};

// ============================================================================
// DEFAULT UNITS
// ============================================================================

window.UnitConverterData.DEFAULT_UNITS = {
  length: 'm',
  weight: 'kg',
  temperature: 'c',
  volume: 'l',
  area: 'm2',
  speed: 'ms',
  acceleration: 'ms2',
  flowRate: 'lmin',
  torque: 'Nm',
  pressure: 'pa',
  timezone: 'auto', // Will be auto-detected
  currency: 'usd'
};

// ============================================================================
// AREA TO LINEAR MAPPING
// ============================================================================

window.UnitConverterData.AREA_TO_LINEAR_MAP = {
  'm2': 'm', 
  'cm2': 'cm', 
  'mm2': 'mm', 
  'km2': 'km',
  'ft2': 'ft', 
  'in2': 'in',
  'yd2': 'yd',
  'mi2': 'mi'
};

// ============================================================================
// TIMEZONE MAPPINGS
// ============================================================================

window.UnitConverterData.TIMEZONE_MAPPINGS = {
  // US Timezones
  'PST': -8, 'PDT': -7, 'PT': -8, 'PACIFIC': -8,
  'MST': -7, 'MDT': -6, 'MT': -7, 'MOUNTAIN': -7,
  'CST': -6, 'CDT': -5, 'CT': -6, 'CENTRAL': -6,
  'EST': -5, 'EDT': -4, 'ET': -5, 'EASTERN': -5,
  'AST': -4, 'ADT': -3,
  'NST': -3.5, 'NDT': -2.5,
  'HST': -10, 'AKST': -9, 'AKDT': -8,
  
  // International - UTC/GMT
  'UTC': 0, 'GMT': 0,
  
  // European
  'CET': 1, 'CEST': 2,
  'EET': 2, 'EEST': 3,
  'WET': 0, 'WEST': 1,
  'BST': 1,
  'MSK': 3, // Moscow Time
  'FET': 3, // Further-Eastern European Time
  
  // Asian
  'IST': 5.5, // India Standard Time
  'PKT': 5, // Pakistan Standard Time
  'BST_BD': 6, // Bangladesh Standard Time
  'ICT': 7, // Indochina Time
  'SGT': 8, // Singapore Time
  'HKT': 8, // Hong Kong Time
  'CST_CN': 8, // China Standard Time
  'JST': 9, // Japan Standard Time
  'KST': 9, // Korea Standard Time
  'ACST': 9.5, // Australian Central Standard Time
  'ACDT': 10.5, // Australian Central Daylight Time
  
  // Australian & Pacific
  'AEST': 10, 'AEDT': 11,
  'NZST': 12, 'NZDT': 13,
  'AWST': 8, // Australian Western Standard Time
  'AWDT': 9, // Australian Western Daylight Time
  
  // Middle East
  'AST_AR': 3, // Arabia Standard Time
  'IRST': 3.5, // Iran Standard Time
  
  // African
  'CAT': 2, // Central Africa Time
  'EAT': 3, // East Africa Time
  'WAT': 1, // West Africa Time
  'SAST': 2, // South Africa Standard Time
  
  // South American
  'ART': -3, // Argentina Time
  'BRT': -3, // Brasília Time
  'BRST': -2, // Brasília Summer Time
  'CLT': -4, // Chile Standard Time
  'CLST': -3, // Chile Summer Time
  'PET': -5, // Peru Time
  'COT': -5 // Colombia Time
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get user's current timezone offset
 */
window.UnitConverterData.getUserTimezone = function() {
  const offset = -(new Date().getTimezoneOffset() / 60);
  return offset;
};

/**
 * Get timezone name from offset
 */
window.UnitConverterData.getTimezoneFromOffset = function(offset) {
  for (const [tz, tz_offset] of Object.entries(window.UnitConverterData.TIMEZONE_MAPPINGS)) {
    if (tz_offset === offset) {
      return tz;
    }
  }
  return `UTC${offset >= 0 ? '+' : ''}${offset}`;
};

/**
 * Generate currency regex pattern from currency mappings
 * This ensures all currencies and symbols are covered automatically
 */
window.UnitConverterData.generateCurrencyPattern = function() {
  // Wait for currency mappings to be loaded
  if (!window.currencySymbolToCurrencyCode) {
    return null;
  }
  
  // Extract all currency symbols and codes
  const symbols = Object.keys(window.currencySymbolToCurrencyCode);
  
  // Escape special regex characters
  const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };
  
  // Sort by length (longest first) to prevent shorter patterns from matching first
  const sortedSymbols = symbols.sort((a, b) => b.length - a.length);
  
  // Escape and join all symbols
  const escapedSymbols = sortedSymbols.map(escapeRegex).join('|');
  
  // Create more restrictive pattern - only matches standalone currency values
  // Matches: symbol + number OR number + symbol, but only at line boundaries or with specific terminators
  const pattern = new RegExp(
    `(?:(?:^|\\s|^[\\s]*|[\\s]*$)(${escapedSymbols})(?=\\s*\\d)\\s*(\\d+(?:[.,\\d' \\s]*\\d)?)(?=\\s*$|\\s*[.,!?;:]|\\s*\\n|\\s*\\r)|` +
    `(?:^|\\s|^[\\s]*|[\\s]*$)(\\d+(?:[.,\\d' \\s]*\\d)?)\\s*(${escapedSymbols})(?=\\s*$|\\s*[.,!?;:]|\\s*\\n|\\s*\\r))`,
    'gi'
  );
  
  return pattern;
};

/**
 * Initialize currency pattern after mappings are loaded
 */
window.UnitConverterData.initializeCurrencyPattern = function() {
  const pattern = window.UnitConverterData.generateCurrencyPattern();
  if (pattern) {
    window.UnitConverterData.UNIT_PATTERNS.currency = pattern;
    //console.log('Currency pattern initialized with', Object.keys(window.currencySymbolToCurrencyCode || {}).length, 'symbols'); // Uncomment for debugging
  }
};