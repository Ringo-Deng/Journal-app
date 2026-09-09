import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {promisify} from 'node:util';
import {basename, resolve} from 'node:path';
import {unlink} from 'node:fs/promises';
import {chooseMaterialCandidate, materialFallbackModes, summarizeMaterialCandidate} from '../lib/material-candidate-score.mjs';

const marker = Symbol.for('shiguang.materialSegmentRouter');
const customPromisify = promisify.custom;

function parseResult(output) {
  try {
    const value = JSON.parse(String(output?.stdout || ''));
    return value && Array.isArray(value.items) ? value : null;
  } catch {
    return null;
  }
}

function isAutoSegment(file, args) {
  return basename(String(file || '')) === 'segment' && Array.isArray(args) && args.length === 4 && args[2] === 'auto';
}

async function discardResultFiles(result, outputDir, keep = new Set()) {
  if (!result || !Array.isArray(result.items) || !outputDir) return;
  await Promise.all(result.items.map(async (item) => {
    const file = String(item?.file || '');
    if (!/^[a-f0-9-]+\.png$/i.test(file) || keep.has(file)) return;
    try { await unlink(resolve(outputDir, file)); } catch {}
  }));
}

function withSelectedEngine(output, candidate) {
  if (!candidate?.result || candidate.mode === 'auto') return output;
  const engine = String(candidate.result.engine || '素材识别');
  return {
    ...output,
    stdout: JSON.stringify({...candidate.result, engine: `${engine} · 自动选优`}),
  };
}

export function installMaterialSegmentRouter() {
  if (childProcess[marker]) return;
  const originalExecFile = childProcess.execFile;
  const originalRun = promisify(originalExecFile);

  const routedRun = async (file, args = [], options = {}) => {
    if (!isAutoSegment(file, args)) return originalRun(file, args, options);

    const candidates = [];
    let primaryError = null;
    try {
      const output = await originalRun(file, args, options);
      const result = parseResult(output);
      if (result) candidates.push({mode: 'auto', primary: true, result, output});
      else primaryError = new Error('自动识别返回了无效结果');
    } catch (error) {
      primaryError = error;
    }

    const primaryResult = candidates[0]?.result || null;
    const fallbackModes = materialFallbackModes(primaryResult).slice(0, 2);
    for (const mode of fallbackModes) {
      try {
        const fallbackArgs = [...args];
        fallbackArgs[2] = mode;
        const fallbackOptions = {...options};
        if (Number(fallbackOptions.timeout || 0) > 45000 || !fallbackOptions.timeout) fallbackOptions.timeout = 45000;
        const output = await originalRun(file, fallbackArgs, fallbackOptions);
        const result = parseResult(output);
        if (!result) continue;
        candidates.push({mode, result, output});
        const provisional = chooseMaterialCandidate(candidates);
        if (provisional?.mode === mode && summarizeMaterialCandidate(result).partitionQuality >= 0.82) break;
      } catch {
        // The first usable candidate remains authoritative when an optional fallback fails.
      }
    }

    const selected = chooseMaterialCandidate(candidates);
    if (!selected) throw primaryError || new Error('素材识别没有返回可用结果');

    const keepFiles = new Set((selected.result.items || []).map((item) => String(item.file || '')));
    await Promise.all(candidates
      .filter((candidate) => candidate !== selected && candidate.result !== selected.result)
      .map((candidate) => discardResultFiles(candidate.result, args[1], keepFiles)));
    return withSelectedEngine(selected.output, selected);
  };

  // Keep callback-style execFile byte-for-byte compatible. The routing layer is
  // attached only through Node's custom promisify hook, which is the path used by
  // server.mjs. This avoids changing unrelated child-process callers.
  function routedExecFile(...args) {
    return originalExecFile(...args);
  }
  routedExecFile[customPromisify] = routedRun;
  childProcess.execFile = routedExecFile;
  childProcess[marker] = true;
  syncBuiltinESMExports();
}
