const native = new Set(['local/segment', 'local/cutout', 'local/clean-paper', 'local/material-palette']);
export function distributableSource(path) {
  if (path.split('/').some(part => part.startsWith('.') || ['data', 'node_modules'].includes(part))) return false;
  return native.has(path) || /^(local|lib)\/[^/]+\.mjs$/.test(path) ||
    /^desktop\/(main|runtime)\.mjs$/.test(path) || path === 'desktop/preload.cjs' || path.startsWith('public/');
}
