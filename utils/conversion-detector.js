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
    let values = [];
    let units = [];
    
    // Try patterns with units on each value first (e.g., "24in × 2ft").
    const dimensionsWithUnitsPattern = this.getCompiledPattern('dimensionsWithUnits');
    if (dimensionsWithUnitsPattern) {
      match = text.match(dimensionsWithUnitsPattern);
      if (match && match.length >= 5) {
        const [, first, firstUnit, second, secondUnit, third, thirdUnit] = match;
        values = [first, second, ...(third ? [third] : [])];
        units = [firstUnit, secondUnit, ...(third ? [thirdUnit] : [])];
      }
    }
    
    const dimensionsPattern = this.getCompiledPattern('dimensions');
    if (!match && dimensionsPattern) {
      match = text.match(dimensionsPattern);
      if (match && match.length >= 5) {
        const [, first, second, third, unit] = match;
        values = [first, second, ...(third ? [third] : [])];
        units = values.map(() => unit);
      }
    }
    
    if (!match || values.length < 2 || values.some(value => !value) || units.some(unit => !unit)) return null;
    
    const fullMatch = match[0];
    
    // Make sure the match covers most of the selected text (avoid partial matches)
    if (fullMatch.length < text.length * 0.8) return null;
    
    const normalizedUnits = units.map(unit => this.unitConverter.normalizeUnit(unit));
    if (normalizedUnits.some(unit => this.unitConverter.getUnitType(unit) !== 'length')) return null;
    
    const targetUnit = this.unitConverter.getDefaultTargetUnit(normalizedUnits[0], userSettings);
    
    if (!targetUnit) return null;
    
    // Convert all dimensions to the target unit
    const numericValues = values.map(Number.parseFloat);
    const convertedDimensions = numericValues.map((value, index) =>
      this.unitConverter.convert(value, normalizedUnits[index], targetUnit)
    );
    
    if (convertedDimensions.some(value => value === null)) {
      return null;
    }
    
    // Use getBestUnit for smart unit sizing
    const bestDimensions = convertedDimensions.map(value => this.unitConverter.getBestUnit(value, 'length', targetUnit));
    
    // Choose the unit that works best for the largest dimension
    // But prioritize the target unit if it's reasonable for most dimensions
    let chosenUnit = targetUnit;
    
    // Only override the target unit if ALL dimensions would be much better in a different unit
    // This prevents the algorithm from reverting to the original unit when user wants a specific target
    const allDimensionsPreferSameUnit = bestDimensions.every(dimension => dimension.unit === bestDimensions[0].unit) &&
      bestDimensions[0].unit !== targetUnit;
    
    if (allDimensionsPreferSameUnit) {
      // Only use the alternate unit if it's significantly better for ALL dimensions
      chosenUnit = bestDimensions[0].unit;
    }
    // Otherwise, stick with the user's preferred target unit
    
    // Convert all dimensions to the chosen unit
    const finalDimensions = numericValues.map((value, index) =>
      this.unitConverter.convert(value, normalizedUnits[index], chosenUnit)
    );
    
    // Skip if the chosen unit is the same as the original unit AND the values are essentially the same
    if (normalizedUnits.every((unit, index) =>
      chosenUnit === unit && Math.abs(finalDimensions[index] - numericValues[index]) < 0.01
    )) {
      return null;
    }
    
    return {
      original: fullMatch,
      converted: `${finalDimensions.map(value => Math.round(value * 100) / 100).join(' × ')} ${chosenUnit}`,
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

      // Prefer explicit context from the full selection (e.g., "AUD", "AU $", "CAD $")
      // before symbol-only disambiguation for generic symbols like "$".
      const explicitCurrencyToken = currencyConverter.extractCurrencySymbol(text);
      const explicitDetectedCurrency = explicitCurrencyToken
        ? currencyConverter.detectCurrency(explicitCurrencyToken)
        : 'Unknown currency';
      
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
      
      let detectedCurrency = explicitDetectedCurrency;
      if (detectedCurrency === 'Unknown currency') {
        detectedCurrency = currencyConverter.detectCurrency(symbol);
      }
      
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
    * @returns {Object|null} - Conversion result or null
   */
  detectTimezone(text, userSettings) {
    const pattern = this.compiledPatterns.timezone;
    if (!pattern) return null;
    
    // Use pre-compiled pattern
    const match = text.match(pattern);
    if (!match) return null;
    
    // Extract time and timezone information
    const settings = userSettings || {};
    const timeString = match[0];
    let targetTimezone = settings.timezoneUnit || 'auto';
    let isAutoDetected = false;
    const is12hr = settings.is12hr !== false;
    
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
    const converted = this.unitConverter.convertTimezone(
      timeString,
      sourceTimezone,
      targetTimezone,
      isAutoDetected,
      is12hr
    );
    if (!converted) return null;
    
    return {
      original: timeString,
      converted: `${converted.formatted} ${converted.timezone}`,
      type: 'timezone'
    };
  }
};
