// DOM manipulation and popup management

// Global namespace for popup manager
window.UnitConverter = window.UnitConverter || {};

window.UnitConverter.PopupManager = class {
  constructor() {
    this.conversionPopup = null;
  }
  
  /**
   * Show conversion popup with results
   * @param {Array} conversions - Array of conversion objects
   * @param {Selection} selection - Text selection object
   */
  async showConversionPopup(conversions, selection) {
    this.hidePopup();
    
    // Validate conversions is an array
    if (!Array.isArray(conversions) || conversions.length === 0) {
      console.warn('Invalid conversions data provided to showConversionPopup');
      return;
    }
    
    // Get user settings for time format preference
    let userSettings = {};
    try {
      // Check if chrome.storage is available and extension context is valid
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync && chrome.runtime?.id) {
        const result = await chrome.storage.sync.get(['unitSettings']);
        userSettings = result.unitSettings || {};
      } else {
        userSettings = { is12hr: true };
      }
    } catch (error) {
      // If storage is not available (e.g., extension context invalidated or in tests), use defaults
      userSettings = { is12hr: true };
    }
    
    // Apply time format conversion to timezone results
    const processedConversions = conversions.map(conv => {
      if (conv.type === 'timezone') {
        const converted = this.convertTimeFormat(conv.converted, userSettings.is12hr !== false);
        return { ...conv, converted };
      }
      return conv;
    });
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    this.conversionPopup = this.createPopupElement(processedConversions);
    document.body.appendChild(this.conversionPopup);
    
    this.positionPopup(rect);
    this.attachEventListeners();
  }
  
  /**
   * Create the popup DOM element
   * @param {Array} conversions - Array of conversion objects
   * @returns {HTMLElement} - The popup element
   */
  createPopupElement(conversions) {
    // Ensure conversions is an array
    if (!Array.isArray(conversions)) {
      console.error('createPopupElement received non-array conversions:', conversions);
      conversions = [];
    }
    const popup = document.createElement('div');
    popup.className = 'unit-converter-popup';
    popup.innerHTML = `
      <div class="unit-converter-content">
        <div class="unit-converter-results">
          ${conversions.map(conv => `
            <div class="unit-converter-item">
              <div class="original">${conv.original}</div>
              <div class="arrow">➜</div>
              <div class="converted">
                ${conv.converted}
                ${!(conv.usedFallback) ?  `
                  <span class="fallback-warning">
                    <span class="warning-icon">⚠</span>
                    <span class="warning-tooltip">Currency rate may be up to 24 hours old</span>
                  </span>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    return popup;
  }
  
  /**
   * Position the popup relative to the selected text
   * @param {DOMRect} selectionRect - Bounding rectangle of the selection
   */
  positionPopup(selectionRect) {
    if (!this.conversionPopup) return;
    
    const popupRect = this.conversionPopup.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    let top = selectionRect.bottom + window.scrollY + 10;
    let left = selectionRect.left + window.scrollX;
    
    // Adjust if popup would go below viewport
    if (selectionRect.bottom + popupRect.height + 10 > viewportHeight) {
      top = selectionRect.top + window.scrollY - popupRect.height - 10;
    }
    
    
    if (left + popupRect.width > viewportWidth) {
      left = viewportWidth - popupRect.width - 10;
    }
    
    
    if (left < 10) {
      left = 10;
    }
    
    this.conversionPopup.style.top = `${top}px`;
    this.conversionPopup.style.left = `${left}px`;
  }
  
  /**
   * Attach event listeners to the popup
   */
  attachEventListeners() {
    if (!this.conversionPopup) return;
    
    this.conversionPopup.addEventListener('click', (e) => e.stopPropagation());
  }
    /**
   * Hide and remove the popup
   */
  hidePopup() {
    if (this.conversionPopup) {
      this.conversionPopup.remove();
      this.conversionPopup = null;
    }
    
    // Also clean up any orphaned popups that might be stuck
    const orphanedPopups = document.querySelectorAll('.unit-converter-popup');
    orphanedPopups.forEach(popup => popup.remove());
  }
  
  /**
   * Convert time format in a string from 12hr to 24hr or vice versa
   * @param {string} timeString - String containing time (e.g., "3:30 PM GMT+5")
   * @param {boolean} to12hr - true to convert to 12hr, false to convert to 24hr
   * @returns {string} - String with converted time format
   */
  convertTimeFormat(timeString, to12hr = true) {
    // Match time patterns: 3:30 PM, 15:30, etc.
    const time12hrPattern = /(\d{1,2}):(\d{2})\s*(AM|PM)/gi;
    const time24hrPattern = /(\d{1,2}):(\d{2})(?!\s*(AM|PM))/gi;
    
    if (to12hr) {
      // Convert 24hr to 12hr
      return timeString.replace(time24hrPattern, (match, hours, minutes) => {
        const h = parseInt(hours);
        const period = h >= 12 ? 'PM' : 'AM';
        const displayHours = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${displayHours}:${minutes} ${period}`;
      });
    } else {
      // Convert 12hr to 24hr
      return timeString.replace(time12hrPattern, (match, hours, minutes, period) => {
        let h = parseInt(hours);
        if (period.toUpperCase() === 'PM' && h !== 12) h += 12;
        if (period.toUpperCase() === 'AM' && h === 12) h = 0;
        const displayHours = h.toString().padStart(2, '0');
        return `${displayHours}:${minutes}`;
      });
    }
  }
};
