export function nextMaterialStrategy({
  requestedMode = 'auto',
  tolerance = 28,
  previous = null,
  continuing = false,
} = {}) {
  const safeTolerance = Math.max(5, Math.min(100, Number(tolerance) || 28));
  const currentAttempt = previous ? Math.max(1, Number(previous.attempt || 1)) : 1;
  if (!continuing || !previous) {
    return { mode: requestedMode, tolerance: safeTolerance, attempt: currentAttempt };
  }

  const attempt = currentAttempt + 1;
  const manuallyChanged =
    requestedMode !== 'auto' &&
    requestedMode !== previous.mode &&
    requestedMode !== previous.strategy;
  if (manuallyChanged) {
    return { mode: requestedMode, tolerance: safeTolerance, attempt };
  }

  const previousWasAI =
    /AI|主体/.test(String(previous.engine || '')) || previous.strategy === 'ai';
  if (attempt === 2) {
    return {
      mode: previousWasAI ? 'paper' : 'ai',
      tolerance: safeTolerance,
      attempt,
    };
  }

  return {
    mode: 'paper',
    tolerance: Math.min(100, safeTolerance + 12 * (attempt - 2)),
    attempt,
  };
}
