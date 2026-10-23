(function (root) {
  function normalizeHostname(value) {
    if (typeof value !== 'string' || !value.trim()) return null;

    try {
      const input = value.trim();
      const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      if (url.username || url.password) return null;
      return url.hostname.toLowerCase().replace(/\.$/, '') || null;
    } catch (error) {
      return null;
    }
  }

  function normalizeList(sites) {
    if (!Array.isArray(sites)) return [];
    return [...new Set(sites.map(normalizeHostname).filter(Boolean))];
  }

  function isBlocked(hostname, blockedSites) {
    const host = normalizeHostname(hostname);
    return Boolean(host && normalizeList(blockedSites).some(site =>
      host === site || host.endsWith(`.${site}`)
    ));
  }

  const api = { normalizeHostname, normalizeList, isBlocked };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SiteBlocklist = api;
})(globalThis);
