(function (global) {
  function safeImagePath(pathValue) {
    if (typeof pathValue !== 'string') return '';
    const trimmed = pathValue.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/images/')) return trimmed;
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('//')) return '';
    if (trimmed.startsWith('uploads/')) return '/' + trimmed;
    if (trimmed.startsWith('images/')) return '/' + trimmed;
    return '';
  }
  global.safeImagePath = safeImagePath;
})(typeof window !== 'undefined' ? window : globalThis);
