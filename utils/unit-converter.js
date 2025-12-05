// Unit conversion utilities and helper functions

// Global namespace for unit converter
window.UnitConverter = window.UnitConverter || {};

window.UnitConverter.UnitConverter = class {
  constructor() {
    this.conversions = window.UnitConverterData.CONVERSION_RATIOS;
    this.unitAliases = window.UnitConverterData.UNIT_ALIASES;
    this.defaultUnits = window.UnitConverterData.DEFAULT_UNITS;
    this.areaToLinearMap = window.UnitConverterData.AREA_TO_LINEAR_MAP;
  }
  
  /**
   * Normalize unit string to standard format
   * @param {string} unit - The unit string to normalize
   * @returns {string} - Normalized unit string
   */
  normalizeUnit(unit) {
    const normalized = unit.toLowerCase().replace(/\s+/g, ' ').trim();
    return this.unitAliases[normalized] || normalized;
  }
  
  /**
   * Get the type of unit (length, weight, temperature, etc.)
   * @param {string} unit - The unit to check
   * @returns {string|null} - The unit type or null if not found
   */
  getUnitType(unit) {
    const normalizedUnit = this.normalizeUnit(unit);
    for (const [type, units] of Object.entries(this.conversions)) {
      if (type === 'temperature') continue;      if (units.hasOwnProperty(normalizedUnit)) {
        return type;
      }
    }
    if (['c', 'f', 'k'].includes(normalizedUnit)) {
      return 'temperature';
    }
    
    // Check if it's a currency using Currency-Converter-master detection
    if (window.UnitConverter.currencyConverter) {
      const currencyConverter = window.UnitConverter.currencyConverter;
      const detectedCurrency = currencyConverter.detectCurrency(unit);
      if (detectedCurrency !== 'Unknown currency') {
        return 'currency';
      }
    }
    
    return null;
  }
  
  /**
   * Convert a value from one unit to another
   * @param {number} value - The value to convert
   * @param {string} fromUnit - Source unit
   * @param {string} toUnit - Target unit
   * @returns {number|null} - Converted value or null if conversion not possible
   */
  convert(value, fromUnit, toUnit) {
    const normalizedFrom = this.normalizeUnit(fromUnit);
    const normalizedTo = this.normalizeUnit(toUnit);
    const unitType = this.getUnitType(normalizedFrom);
    
    if (!unitType || this.getUnitType(normalizedTo) !== unitType) {
      return null;
    }
    
    switch (unitType) {
      case 'temperature':
        return this.convertTemperature(value, normalizedFrom, normalizedTo);
      
      case 'speed':
        return this.convertSpeed(value, normalizedFrom, normalizedTo);
      
      case 'acceleration':
        return this.convertAcceleration(value, normalizedFrom, normalizedTo);
      
      case 'flowRate':
        return this.convertFlowRate(value, normalizedFrom, normalizedTo);
      
      case 'torque':
        return this.convertTorque(value, normalizedFrom, normalizedTo);
      
      case 'pressure':
        return this.convertPressure(value, normalizedFrom, normalizedTo);
      
      case 'timezone':
        // Timezone conversion is handled differently - returns object not number
        return null; // Use convertTimezone method directly
      
      default: {
        // Generic conversion for length, weight, volume, area
        const conversions = this.conversions[unitType];
        if (!conversions[normalizedFrom] || !conversions[normalizedTo]) {
          return null;
        }
        const valueInBase = value / conversions[normalizedFrom];
        return valueInBase * conversions[normalizedTo];
      }
    }
  }
  
  /**
   * Convert temperature between different scales
   * @param {number} value - Temperature value
   * @param {string} from - Source temperature scale
   * @param {string} to - Target temperature scale
   * @returns {number} - Converted temperature
   */
  convertTemperature(value, from, to) {
    let celsius = value;
    
    // Convert to Celsius first
    if (from === 'f') {
      celsius = (value - 32) * 5/9;
    } else if (from === 'k') {
      celsius = value - 273.15;
    }
    
    // Convert from Celsius to target
    if (to === 'f') {
      return (celsius * 9/5) + 32;
    } else if (to === 'k') {
      return celsius + 273.15;
    }
    
    return celsius;
  }
  
  /**
   * Get the default target unit for a given source unit based on user settings
   * @param {string} sourceUnit - The source unit
   * @param {Object} userSettings - User preference settings
   * @returns {string|null} - Target unit or null
   */
  getDefaultTargetUnit(sourceUnit, userSettings) {
    const unitType = this.getUnitType(sourceUnit);
    if (!unitType) return null;
    
    const settingKey = unitType === 'weight' ? 'weightUnit' : 
                      unitType === 'temperature' ? 'temperatureUnit' :
                      unitType === 'volume' ? 'volumeUnit' :
                      unitType === 'area' ? 'areaUnit' : 
                      unitType === 'speed' ? 'speedUnit' :
                      unitType === 'acceleration' ? 'accelerationUnit' :
                      unitType === 'flowRate' ? 'flowRateUnit' :
                      unitType === 'torque' ? 'torqueUnit' :
                      unitType === 'pressure' ? 'pressureUnit' :
                      unitType === 'timezone' ? 'timezoneUnit' :
                      unitType === 'currency' ? 'currencyUnit' : 'lengthUnit';
    
    return userSettings[settingKey] || this.defaultUnits[unitType];
  }

  /**
   * Convert speed units
   * @param {number} value - Speed value
   * @param {string} fromUnit - Source unit
   * @param {string} toUnit - Target unit
   * @returns {number|null} - Converted value or null
   */
  convertSpeed(value, fromUnit, toUnit) {
    const normalizedFrom = this.normalizeUnit(fromUnit);
    const normalizedTo = this.normalizeUnit(toUnit);
    
    if (!this.conversions.speed[normalizedFrom] || !this.conversions.speed[normalizedTo]) {
      return null;
    }
    
    // Convert to m/s first, then to target unit
    const metersPerSecond = value * this.conversions.speed[normalizedFrom];
    return metersPerSecond / this.conversions.speed[normalizedTo];
  }

  /**
   * Convert acceleration units
   * @param {number} value - Acceleration value
   * @param {string} fromUnit - Source unit
   * @param {string} toUnit - Target unit
   * @returns {number|null} - Converted value or null
   */
  convertAcceleration(value, fromUnit, toUnit) {
    const normalizedFrom = this.normalizeUnit(fromUnit);
    const normalizedTo = this.normalizeUnit(toUnit);
    
    if (!this.conversions.acceleration[normalizedFrom] || !this.conversions.acceleration[normalizedTo]) {
      return null;
    }
    
    // Convert to m/s² first (base unit), then to target unit
    // For acceleration, the ratios are: ms2=1, fts2=3.28084, g=9.80665
    // To convert FROM a unit, divide by its ratio to get m/s²
    // To convert TO a unit, multiply by its ratio
    const metersPerSecondSquared = value / this.conversions.acceleration[normalizedFrom];
    return metersPerSecondSquared * this.conversions.acceleration[normalizedTo];
  }

  /**
   * Convert flow rate units
   * @param {number} value - Flow rate value
   * @param {string} fromUnit - Source unit
   * @param {string} toUnit - Target unit
   * @returns {number|null} - Converted value or null
   */
  convertFlowRate(value, fromUnit, toUnit) {
    const normalizedFrom = this.normalizeUnit(fromUnit);
    const normalizedTo = this.normalizeUnit(toUnit);
    
    if (!this.conversions.flowRate[normalizedFrom] || !this.conversions.flowRate[normalizedTo]) {
      return null;
    }
    
    // Convert to L/min first (base unit), then to target unit
    const litersPerMinute = value / this.conversions.flowRate[normalizedFrom];
    return litersPerMinute * this.conversions.flowRate[normalizedTo];
  }

  /**
   * Convert torque units
   * @param {number} value - Torque value
   * @param {string} fromUnit - Source unit
   * @param {string} toUnit - Target unit
   * @returns {number|null} - Converted value or null
   */
  convertTorque(value, fromUnit, toUnit) {
    const normalizedFrom = this.normalizeUnit(fromUnit);
    const normalizedTo = this.normalizeUnit(toUnit);
    
    if (!this.conversions.torque[normalizedFrom] || !this.conversions.torque[normalizedTo]) {
      return null;
    }
    
    // Convert to Nm first, then to target unit
    const newtonMeters = value * this.conversions.torque[normalizedFrom];
    return newtonMeters / this.conversions.torque[normalizedTo];
  }

  /**
   * Convert pressure units
   * @param {number} value - Pressure value
   * @param {string} fromUnit - Source unit
   * @param {string} toUnit - Target unit
   * @returns {number|null} - Converted value or null
   */
  convertPressure(value, fromUnit, toUnit) {
    const normalizedFrom = this.normalizeUnit(fromUnit);
    const normalizedTo = this.normalizeUnit(toUnit);
    
    if (!this.conversions.pressure[normalizedFrom] || !this.conversions.pressure[normalizedTo]) {
      return null;
    }
    
    // Convert to Pa first, then to target unit
    const pascals = value * this.conversions.pressure[normalizedFrom];
    return pascals / this.conversions.pressure[normalizedTo];
  }

  /**
   * Convert timezone (time conversion)
   * @param {string} timeString - Time string (e.g., "3:30 PM")
   * @param {string} fromZone - Source timezone
   * @param {string} toZone - Target timezone
   * @param {boolean} useOffsetFormat - Whether to return GMT offset format for display
   * @returns {Object|null} - Converted time object or null
   */
  convertTimezone(timeString, fromZone, toZone, useOffsetFormat = false) {
    try {
      // Parse time string
      const timeMatch = timeString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (!timeMatch) return null;
      
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const period = timeMatch[3]?.toUpperCase();
      
      // Convert to 24-hour format
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      
      // Get timezone offsets
      const fromOffset = this.getTimezoneOffset(fromZone);
      const toOffset = this.getTimezoneOffset(toZone);
      
      if (fromOffset === null || toOffset === null) return null;
      
      // Create date object for calculation
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      
      // Convert timezone
      const offsetDiff = (toOffset - fromOffset) * 60 * 60 * 1000;
      const convertedDate = new Date(date.getTime() + offsetDiff);
      
      // Determine display timezone - use GMT offset format if requested (auto-detected)
      let displayTimezone = toZone;
      if (useOffsetFormat) {
        displayTimezone = `GMT${toOffset >= 0 ? '+' : ''}${toOffset}`;
      } else if (toZone.startsWith('GMT') || toZone.startsWith('UTC')) {
        displayTimezone = `GMT${toOffset >= 0 ? '+' : ''}${toOffset}`;
      }
      
      return {
        hours: convertedDate.getHours(),
        minutes: convertedDate.getMinutes(),
        formatted: this.formatTime(convertedDate.getHours(), convertedDate.getMinutes()),
        timezone: displayTimezone
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get timezone offset in hours
   * @param {string} timezone - Timezone string
   * @returns {number|null} - Offset in hours or null
   */
  getTimezoneOffset(timezone) {
    const tz = timezone.toUpperCase();
    
    // Check timezone mappings
    if (window.UnitConverterData.TIMEZONE_MAPPINGS[tz] !== undefined) {
      return window.UnitConverterData.TIMEZONE_MAPPINGS[tz];
    }
    
    // Parse GMT/UTC format (including GMT+0, GMT-0)
    const gmtMatch = timezone.match(/(?:GMT|UTC)([+-]?\d{1,2})/i);
    if (gmtMatch) {
      return parseInt(gmtMatch[1]);
    }
    
    // Parse offset format
    const offsetMatch = timezone.match(/([+-]\d{1,2}):?(\d{2})?/);
    if (offsetMatch) {
      const hours = parseInt(offsetMatch[1]);
      const minutes = offsetMatch[2] ? parseInt(offsetMatch[2]) : 0;
      return hours + (hours >= 0 ? minutes/60 : -minutes/60);
    }
    
    // Auto-detect user timezone
    if (tz === 'AUTO') {
      return window.UnitConverterData.getUserTimezone();
    }
    
    return null;
  }

  /**
   * Format time for display
   * @param {number} hours - Hours (24-hour format)
   * @param {number} minutes - Minutes
   * @returns {string} - Formatted time string
   */
  formatTime(hours, minutes) {
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${period}`;
  }
  
  /**
   * Format the conversion result for display
   * @param {number} value - The numeric value
   * @param {string} unit - The unit string
   * @returns {string} - Formatted result string
   */  formatResult(value, unit) {
    const formatted = Math.round(value * 100) / 100;
    const displayUnit = this.getDisplayUnit(unit);
    return `${formatted} ${displayUnit}`;
  }
    /**
   * Calculate area equivalent for linear measurements
   * @param {number} areaValue - The area value (in target units)
   * @param {string} targetUnit - Target area unit
   * @returns {string|null} - Linear equivalent or null
   */
  getLinearEquivalent(areaValue, targetUnit) {
    const targetLinearUnit = this.areaToLinearMap[targetUnit];
    
    if (targetLinearUnit) {
      const linearSideLength = Math.sqrt(areaValue);
      return this.formatResult(linearSideLength, targetLinearUnit);
    }
    return null;
  }
    /**
   * Get the best unit for displaying a value (auto-size detection)
   * @param {number} value - The converted value
   * @param {string} unitType - The unit type (length, weight, etc.)
   * @param {string} defaultUnit - The default target unit
   * @returns {Object} - {value, unit} with the best unit choice
   */
  getBestUnit(value, unitType, defaultUnit) {
    if (unitType === 'length') {
      const units = this.conversions.length;
      
      // If less than 1 and default is meters, use smaller units
      if (value < 1 && defaultUnit === 'm') {
        const cmValue = value * units.cm;
        if (cmValue >= 1) return { value: cmValue, unit: 'cm' };
        const mmValue = value * units.mm;
        return { value: mmValue, unit: 'mm' };
      }
      
      // If less than 1 and default is feet, use inches
      if (value < 1 && defaultUnit === 'ft') {
        const inValue = value * units.in;
        return { value: inValue, unit: 'in' };
      }
      
      // If less than 1 and default is yards, use feet or inches
      if (value < 1 && defaultUnit === 'yd') {
        const ftValue = value * units.ft;
        if (ftValue >= 1) return { value: ftValue, unit: 'ft' };
        const inValue = value * units.in;
        return { value: inValue, unit: 'in' };
      }
      
      // If too large, use larger unit
      if (value > 1000 && defaultUnit === 'm') {
        return { value: value * units.km, unit: 'km' };
      }
      if (value > 5280 && defaultUnit === 'ft') {
        return { value: value * units.mi, unit: 'mi' };
      }
      
    } else if (unitType === 'weight') {
      const units = this.conversions.weight;
      
      // If less than 1 and default is kg, use grams
      if (value < 1 && defaultUnit === 'kg') {
        return { value: value * units.g, unit: 'g' };
      }
      
      // If less than 1 and default is pounds, use ounces
      if (value < 1 && defaultUnit === 'lb') {
        return { value: value * units.oz, unit: 'oz' };
      }
      
      // If too large, use larger unit
      if (value > 1000 && defaultUnit === 'kg') {
        return { value: value * units.t, unit: 't' };
      }
      
    } else if (unitType === 'volume') {
      const units = this.conversions.volume;
      
      // If less than 1 and default is liters, use ml
      if (value < 1 && defaultUnit === 'l') {
        return { value: value * units.ml, unit: 'ml' };
      }
      
      // If less than 1 and default is gallons, use smaller units
      if (value < 1 && defaultUnit === 'gal') {
        const qtValue = value * units.qt;
        if (qtValue >= 1) return { value: qtValue, unit: 'qt' };
        const ptValue = value * units.pt;
        if (ptValue >= 1) return { value: ptValue, unit: 'pt' };
        const cupValue = value * units.cup;
        if (cupValue >= 1) return { value: cupValue, unit: 'cup' };
        const flozValue = value * units.floz;
        return { value: flozValue, unit: 'floz' };
      }
      
    } else if (unitType === 'area') {
      const units = this.conversions.area;
      
      // If less than 1 and default is m², use smaller units
      if (value < 1 && defaultUnit === 'm2') {
        const cm2Value = value * units.cm2;
        if (cm2Value >= 1) return { value: cm2Value, unit: 'cm2' };
        const mm2Value = value * units.mm2;
        return { value: mm2Value, unit: 'mm2' };
      }
      
      // If less than 1 and default is ft², use in²
      if (value < 1 && defaultUnit === 'ft2') {
        const in2Value = value * units.in2;
        return { value: in2Value, unit: 'in2' };
      }
      
      // If too large, use larger unit
      if (value > 1000000 && defaultUnit === 'm2') {
        return { value: value * units.km2, unit: 'km2' };
      }
      if (value > 43560 && defaultUnit === 'ft2') {
        return { value: value * units.acre, unit: 'acre' };
      }
      
    } else if (unitType === 'speed') {
      const units = this.conversions.speed;
      
      // Auto-size speed based on magnitude
      if (defaultUnit === 'ms') {
        if (value > 50) {
          return { value: value / units.kmh, unit: 'kmh' };
        }
      } else if (defaultUnit === 'kmh') {
        if (value < 1) {
          return { value: value * units.kmh, unit: 'ms' };
        }
      } else if (defaultUnit === 'mph') {
        if (value < 1) {
          return { value: value * units.mph / units.fps, unit: 'fps' };
        }
      }
      
    } else if (unitType === 'pressure') {
      const units = this.conversions.pressure;
      
      // Auto-size pressure based on magnitude
      if (defaultUnit === 'pa') {
        if (value >= 100000) {
          return { value: value / units.bar, unit: 'bar' };
        } else if (value >= 1000) {
          return { value: value / units.kpa, unit: 'kpa' };
        }
      } else if (defaultUnit === 'kpa') {
        if (value < 1) {
          return { value: value * units.kpa / units.pa, unit: 'pa' };
        } else if (value >= 100) {
          return { value: value / (units.bar / units.kpa), unit: 'bar' };
        }
      } else if (defaultUnit === 'bar') {
        if (value < 0.01) {
          return { value: value * units.bar / units.kpa, unit: 'kpa' };
        }
      }
    }
    
    return { value, unit: defaultUnit };
  }
  
  /**
   * Get display-friendly unit name
   * @param {string} unit - The unit to format
   * @returns {string} - Formatted unit name
   */
  getDisplayUnit(unit) {
    const displayMap = {
      // Speed units
      'kmh': 'km/h',
      'mph': 'mph',
      'fps': 'ft/s',
      'ms': 'm/s',
      'kn': 'knots',
      'mach': 'Mach',
      
      // Acceleration units
      'ms2': 'm/s²',
      'fts2': 'ft/s²',
      'gforce': 'g',
      
      // Flow rate units
      'lmin': 'L/min',
      'lpm': 'L/min',
      'galmin': 'gal/min',
      'gpm': 'gal/min',
      'm3s': 'm³/s',
      'm3h': 'm³/h',
      'cfm': 'CFM',
      'cfs': 'CFS',
      
      // Torque units
      'nm': 'N⋅m',
      'lbft': 'lb⋅ft',
      'lbin': 'lb⋅in',
      'kgm': 'kg⋅m',
      'kgfm': 'kgf⋅m',
      'ozin': 'oz⋅in',
      
      // Pressure units
      'pa': 'Pa',
      'kpa': 'kPa',
      'mpa': 'MPa',
      'bar': 'bar',
      'psi': 'psi',
      'atm': 'atm',
      'mmhg': 'mmHg',
      'inhg': 'inHg',
      'torr': 'Torr',
      'psf': 'psf',
      
      // length
      'm': 'm', 'cm': 'cm', 'mm': 'mm', 'km': 'km',
      'in': 'in', 'ft': 'ft', 'yd': 'yd', 'mi': 'mi',
      // weight
      'kg': 'kg', 'g': 'g', 'mg': 'mg', 'lb': 'lb', 'oz': 'oz', 't': 't',
      //temperature
      'c': '°C', 'f': '°F', 'k': 'K',
      // volume
      'l': 'L', 'ml': 'mL', 'gal': 'gal', 'qt': 'qt', 'pt': 'pt', 'cup': 'cup', 'fl_oz': 'fl oz',
      // area
      'm2': 'm²', 'cm2': 'cm²', 'mm2': 'mm²', 'km2': 'km²',
      'ft2': 'ft²', 'in2': 'in²', 'acre': 'acre'
    };
    
    return displayMap[unit] || unit;
  }
};
