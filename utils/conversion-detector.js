// Text pattern matching and conversion detection

// Global namespace for conversion detector
window.UnitConverter = window.UnitConverter || {};

window.UnitConverter.ConversionDetector = class {
  constructor(unitConverter) {
    this.unitConverter = unitConverter;
    this.patterns = window.UnitConverterData.UNIT_PATTERNS;
    
    // Pre-compile regex patterns for performance
    // Note: Some patterns (like currency) may be added after construction
    this.compiledPatterns = {};
    this.compilePatterns();
  }
  
  /**
   * Compile or recompile all available patterns
   */
  compilePatterns() {
    for (const [type, pattern] of Object.entries(this.patterns)) {
      if (pattern && pattern.source && !this.compiledPatterns[type]) {
        this.compiledPatterns[type] = new RegExp(pattern.source, 'i');
      }
    }
  }
  
  /**
   * Get compiled pattern, compiling on-demand if not yet available
   */
  getCompiledPattern(type) {
    if (!this.compiledPatterns[type] && this.patterns[type]) {
      this.compiledPatterns[type] = new RegExp(this.patterns[type].source, 'i');
    }
    return this.compiledPatterns[type];
  }
  
  /**
   * Find conversion for the selected text (single-line approach)
   * @param {string} selectedText - The selected text to convert
   * @param {Object} userSettings - User preference settings
   * @returns {Array} - Array with single conversion object or empty array
   */
  findConversions(selectedText, userSettings) {
    // Clean the selected text
    const text = selectedText.trim();
    
    if (!text) return [];
    
    // Try to detect and convert in order of priority
    
    // 1. Check for dimensions first (most specific pattern)
    const dimensionResult = this.detectDimension(text, userSettings);
    if (dimensionResult) return [dimensionResult];
    
    // 2. Check for currency
    const currencyResult = this.detectCurrency(text, userSettings);
    if (currencyResult) return [currencyResult];
    
    // 3. Check for regular units
    const unitResult = this.detectUnit(text, userSettings);
    if (unitResult) return [unitResult];
    
    // No conversion found
    return [];
  }
  
  /**
   * Detect and convert dimensions in selected text
   * @param {string} text - Selected text
   * @param {Object} userSettings - User settings
   * @returns {Object|null} - Conversion result or null
   */
  detectDimension(text, userSettings) {
    let match = null;
    let length, width, height, unit;
    
    // Try pattern with units on each number first (e.g., "6m × 4m × 2.5m")
    const dimensionsWithUnitsPattern = this.getCompiledPattern('dimensionsWithUnits');
    if (dimensionsWithUnitsPattern) {
      match = text.match(dimensionsWithUnitsPattern);
      if (match && match.length >= 5) {
        // [fullMatch, length, unit, width, height] - pattern: (\d+(?:\.\d+)?)\s*(unit)\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)\s*\2\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)\s*\2
        [, length, unit, width, height] = match;
      }
    }
    
    const dimensionsPattern = this.getCompiledPattern('dimensions');
    if (!match && dimensionsPattern) {
      match = text.match(dimensionsPattern);
      if (match && match.length >= 5) {
        // [fullMatch, length, width, height, unit]
        [, length, width, height, unit] = match;
      }
    }
    
    if (!match || !length || !width || !height || !unit) return null;
    
    const fullMatch = match[0];
    
    // Make sure the match covers most of the selected text (avoid partial matches)
    if (fullMatch.length < text.length * 0.8) return null;
    
    const normalizedUnit = this.unitConverter.normalizeUnit(unit);
    if (!normalizedUnit) return null;
    
    const targetUnit = this.unitConverter.getDefaultTargetUnit(normalizedUnit, userSettings);
    
    if (!targetUnit) return null;
    
    // Convert all dimensions to the target unit
    const convertedLength = this.unitConverter.convert(parseFloat(length), normalizedUnit, targetUnit);
    const convertedWidth = this.unitConverter.convert(parseFloat(width), normalizedUnit, targetUnit);
    const convertedHeight = this.unitConverter.convert(parseFloat(height), normalizedUnit, targetUnit);
    
    if (convertedLength === null || convertedWidth === null || convertedHeight === null) {
      return null;
    }
    
    // Use getBestUnit for smart unit sizing
    const bestLength = this.unitConverter.getBestUnit(convertedLength, 'length', targetUnit);
    const bestWidth = this.unitConverter.getBestUnit(convertedWidth, 'length', targetUnit);
    const bestHeight = this.unitConverter.getBestUnit(convertedHeight, 'length', targetUnit);
    
    // Choose the unit that works best for the largest dimension
    // But prioritize the target unit if it's reasonable for most dimensions
    const maxValue = Math.max(bestLength.value, bestWidth.value, bestHeight.value);
    let chosenUnit = targetUnit;
    
    // Only override the target unit if ALL dimensions would be much better in a different unit
    // This prevents the algorithm from reverting to the original unit when user wants a specific target
    const allDimensionsPreferSameUnit = (bestLength.unit === bestWidth.unit && 
                                        bestWidth.unit === bestHeight.unit &&
                                        bestLength.unit !== targetUnit);
    
    if (allDimensionsPreferSameUnit) {
      // Only use the alternate unit if it's significantly better for ALL dimensions
      chosenUnit = bestLength.unit;
    }
    // Otherwise, stick with the user's preferred target unit
    
    // Convert all dimensions to the chosen unit
    const finalLength = this.unitConverter.convert(parseFloat(length), normalizedUnit, chosenUnit);
    const finalWidth = this.unitConverter.convert(parseFloat(width), normalizedUnit, chosenUnit);
    const finalHeight = this.unitConverter.convert(parseFloat(height), normalizedUnit, chosenUnit);
    
    // Skip if the chosen unit is the same as the original unit AND the values are essentially the same
    if (chosenUnit === normalizedUnit && 
        Math.abs(finalLength - parseFloat(length)) < 0.01 &&
        Math.abs(finalWidth - parseFloat(width)) < 0.01 &&
        Math.abs(finalHeight - parseFloat(height)) < 0.01) {
      return null;
    }
    
    return {
      original: fullMatch,
      converted: `${Math.round(finalLength * 100) / 100} × ${Math.round(finalWidth * 100) / 100} × ${Math.round(finalHeight * 100) / 100} ${chosenUnit}`,
      type: 'dimensions'
    };
  }
  
  /**
   * Detect and convert currency in selected text
   * @param {string} text - Selected text
   * @param {Object} userSettings - User settings
   * @returns {Object|null} - Conversion result or null
   */
  detectCurrency(text, userSettings) {
    if (!window.UnitConverter.currencyConverter) {
      return null;
    }
    
    try {
      const targetCurrency = userSettings.currencyUnit || 'USD';
      const currencyConverter = window.UnitConverter.currencyConverter;
      
      // Get compiled pattern (compiles on-demand if not yet available)
      const currencyPattern = this.getCompiledPattern('currency');
      const match = currencyPattern ? text.match(currencyPattern) : null;
      if (!match) return null;
      
      let amount, symbol;
      
      // Handle both symbol-first and symbol-last patterns
      if (match[1] && match[2]) {
        // Symbol first: $100
        symbol = match[1];
        amount = match[2];
      } else if (match[3] && match[4]) {
        // Symbol last: 100$
        amount = match[3];
        symbol = match[4];
      } else {
        return null;
      }
      
      const detectedCurrency = currencyConverter.detectCurrency(symbol);
      
      if (detectedCurrency === 'Unknown currency') return null;
      
      const numericAmount = currencyConverter.extractNumber(match[0]);
      
      if (!numericAmount || detectedCurrency.toUpperCase() === targetCurrency.toUpperCase()) {
        return null;
      }
      
      return {
        match: match[0],
        originalValue: numericAmount,
        originalUnit: detectedCurrency,
        targetUnit: targetCurrency.toUpperCase(),
        type: 'currency',
        needsAsyncProcessing: true,
        fromCurrency: detectedCurrency,
        toCurrency: targetCurrency.toUpperCase(),
        convertedValue: '...', // Will be updated with actual conversion
        original: `${numericAmount} ${detectedCurrency}`,
        converted: '...' // Will be updated after API call
      };
    } catch (error) {
      console.error('Currency detection error:', error);
      return null;
    }
  }

  /**
   * Detect and convert regular units in selected text
   * @param {string} text - Selected text
   * @param {Object} userSettings - User settings
   * @returns {Object|null} - Conversion result or null
   */
  detectUnit(text, userSettings) {
    // Try unit types in priority order
    // Length before torque to prioritize nm (nanometer) over nm (Newton-meter, which should be N·m)
    // Torque before weight to avoid lb conflicts
    const priorityOrder = ['length', 'torque', 'timezone', 'time', 'area', 'speed', 'acceleration', 'flowRate', 'pressure', 'temperature', 'volume', 'weight'];
    
    for (const unitType of priorityOrder) {
      const pattern = this.getCompiledPattern(unitType);
      if (!pattern) continue;
      
      // Special handling for timezone conversion
      if (unitType === 'timezone') {
        const timezoneResult = this.detectTimezone(text, userSettings);
        if (timezoneResult) return timezoneResult;
        continue;
      }
      
      // Use pre-compiled pattern
      const match = text.match(pattern);
      if (!match || match.length < 3) continue; // Need at least [fullMatch, value, unit]
      
      const [fullMatch, value, unit] = match;
      
      // Validate that we have all required parts
      if (!value || !unit) continue;
      
      const normalizedUnit = this.unitConverter.normalizeUnit(unit);
      if (!normalizedUnit) continue;
      
      const targetUnit = this.unitConverter.getDefaultTargetUnit(normalizedUnit, userSettings);
      
      if (!targetUnit || normalizedUnit === targetUnit) continue;
      
      const convertedValue = this.unitConverter.convert(parseFloat(value), normalizedUnit, targetUnit);
      if (convertedValue === null) continue;
      
      // Auto-detect best unit size (pass source unit to avoid returning to it)
      const bestResult = this.unitConverter.getBestUnit(convertedValue, unitType, targetUnit, normalizedUnit);
      
      // Skip if the best unit is the same as the original unit AND the values are essentially the same
      if (bestResult.unit === normalizedUnit && Math.abs(bestResult.value - parseFloat(value)) < 0.01) {
        continue;
      }
      
      const convertedText = this.unitConverter.formatResult(bestResult.value, bestResult.unit);
      
      return {
        original: fullMatch,
        converted: convertedText,
        type: unitType
      };
    }
    
    return null;
  }

  /**
   * Detect and convert timezone in selected text
   * @param {string} text - Selected text
   * @param {Object} userSettings - User settings
   * @returns {Object|nulgetCompiledPattern('timezone') null
   */
  detectTimezone(text, userSettings) {
    const pattern = this.compiledPatterns.timezone;
    if (!pattern) return null;
    
    // Use pre-compiled pattern
    const match = text.match(pattern);
    if (!match) return null;
    
    // Extract time and timezone information
    const timeString = match[0];
    let targetTimezone = userSettings.timezoneUnit || 'auto';
    let isAutoDetected = false;
    
    // If target is auto, use user's current timezone
    if (targetTimezone === 'auto') {
      isAutoDetected = true;
      const userOffset = window.UnitConverterData.getUserTimezone();
      targetTimezone = window.UnitConverterData.getTimezoneFromOffset(userOffset);
    }
    
    // Parse timezone from the match
    let sourceTimezone = 'auto';
    
    // Pattern structure: [fullMatch, hour, minute, ampm, timezoneGroup, baseTimezone, offset, offsetHour, offsetMin]
    if (match[5]) {
      // Base timezone like EST, PST, GMT, etc.
      sourceTimezone = match[5];
      if (match[6]) {
        // Has offset like GMT+2, UTC-5
        sourceTimezone = `${match[5]}${match[6]}`;
      }
    } else if (match[7] && match[8]) {
      // Direct offset format like +02:30
      sourceTimezone = `${match[7]}:${match[8]}`;
    } else if (match[7]) {
      // Direct offset format like +2
      sourceTimezone = `GMT${match[7]}`;
    }
    
    // If source is auto, can't convert
    if (sourceTimezone === 'auto') return null;
    
    // Don't convert if source and target are the same
    if (sourceTimezone === targetTimezone) return null;
    
    // Use GMT offset format for display when auto-detected
    const converted = this.unitConverter.convertTimezone(timeString, sourceTimezone, targetTimezone, isAutoDetected);
    if (!converted) return null;
    
    return {
      original: timeString,
      converted: `${converted.formatted} ${converted.timezone}`,
      type: 'timezone'
    };
  }
};
