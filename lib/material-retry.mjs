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
  // Compare with the controls saved for the last run, not the internally chosen
  // strategy. Selecting auto again or adjusting strength is an explicit choice.
  const manuallyChanged =
    requestedMode !== (previous.mode || 'auto') ||
    (Number.isFinite(Number(previous.tolerance)) &&
      safeTolerance !== Number(previous.tolerance));
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
