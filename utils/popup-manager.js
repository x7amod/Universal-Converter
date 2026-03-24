// Global namespace for popup manager
window.UnitConverter = window.UnitConverter || {};

window.UnitConverter.PopupManager = class {
  constructor() {
    this.activePopup = null;
    this.suppressNextOutsideClick = false;
    
    // Bind to this instance for the event listener
    this.handleGlobalClick = this.handleGlobalClick.bind(this);
    
    // Add one global event listener to dismiss the popup when clicking outside it
    document.addEventListener('click', this.handleGlobalClick);
  }

  handleGlobalClick(event) {
    if (this.suppressNextOutsideClick) {
      this.suppressNextOutsideClick = false;
      return;
    }

    if (this.activePopup && !this.activePopup.contains(event.target)) {
      this.removePopup();
    }
  }

  suppressGestureClickOnce() {
    this.suppressNextOutsideClick = true;
  }

  buildPopupNode(conversions) {
    const content = document.createElement('div');
    content.className = 'unit-converter-content';

    const results = document.createElement('div');
    results.className = 'unit-converter-results';

    conversions.forEach(conv => {
      const item = document.createElement('div');
      item.className = 'unit-converter-item';

      const original = document.createElement('div');
      original.className = 'original';
      original.textContent = conv.original;
      item.appendChild(original);

      const arrow = document.createElement('div');
      arrow.className = 'arrow';
      arrow.textContent = '➜';
      item.appendChild(arrow);

      const converted = document.createElement('div');
      converted.className = 'converted';
      converted.textContent = conv.converted;

      if (conv.usedFallback) {
        const fallbackWarning = document.createElement('span');
        fallbackWarning.className = 'fallback-warning';

        const warningIcon = document.createElement('span');
        warningIcon.className = 'warning-icon';
        warningIcon.textContent = '⚠';
        fallbackWarning.appendChild(warningIcon);

        const warningTooltip = document.createElement('span');
        warningTooltip.className = 'warning-tooltip';
        warningTooltip.textContent = 'Currency rate may be up to 24 hours old';
        fallbackWarning.appendChild(warningTooltip);

        converted.appendChild(document.createTextNode(' '));
        converted.appendChild(fallbackWarning);
      }

      item.appendChild(converted);
      results.appendChild(item);
    });

    content.appendChild(results);
    return content;
  }

  showPopup(contentNode, x, y) {
    // Remove any existing popup first
    this.removePopup();

    // Create a DOM element for the popup
    const popup = document.createElement('div');
    popup.className = 'unit-converter-popup';
    popup.style.position = 'absolute';
    popup.style.left = x + 'px';
    popup.style.top = y === undefined ? x + 'px' : y + 'px';
    
    // Prevent clicks inside the popup from bubbling up and closing it
    popup.addEventListener('click', (e) => e.stopPropagation());

    // Append the provided content
    if (contentNode instanceof HTMLElement || contentNode instanceof DocumentFragment) {
      popup.appendChild(contentNode);
    } else {
      popup.textContent = contentNode;
    }

    // Append to document.body
    document.body.appendChild(popup);

    // Store direct reference
    this.activePopup = popup;
  }

  removePopup() {
    if (this.activePopup) {
      this.activePopup.remove();
      this.activePopup = null;
    }
  }
  
  destroy() {
    this.removePopup();
    document.removeEventListener('click', this.handleGlobalClick);
  }
};

