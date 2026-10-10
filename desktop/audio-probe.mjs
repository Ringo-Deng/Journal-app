// Runs inside the packaged renderer, with its real HTTP/audio stack.
// Playback completion proves the media pipeline, not the host speaker volume.
export async function probePageTurnAudio() {
  const files = ['mixkit-page-turn-single-1104.wav',
    'mixkit-single-book-paging-1101-first.wav', 'mixkit-single-book-paging-1101-second.wav'];
  const results = [];
  for (const file of files) {
    const source = '/sounds/' + file + '?audio=2';
    const response = await fetch(source);
    if (!response.ok) throw Error(file + ': HTTP ' + response.status);
    const contentType = response.headers.get('content-type');
    if (contentType !== 'audio/wav') throw Error(file + ': MIME ' + contentType);
    const decoder = new OfflineAudioContext(2, 1, 44100);
    const decoded = await decoder.decodeAudioData(await response.arrayBuffer());
    let peak = 0;
    for (let channel = 0; channel < decoded.numberOfChannels; channel++)
      for (const sample of decoded.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
    if (!(decoded.duration > 0 && peak > 0.01)) throw Error(file + ': silent/empty decoded audio');
    const audio = new Audio(source);
    audio.volume = 0.22;
    try {
      await new Promise((ok, fail) => {
        const timer = setTimeout(() => finish(Error(file + ': playback timed out')), 10000);
        const finish = error => {
          clearTimeout(timer); audio.onended = null; audio.onerror = null;
          if (error) fail(error); else ok();
        };
        audio.onended = () => finish();
        audio.onerror = () => finish(Error(file + ': media error ' + audio.error?.code + ' ' + audio.error?.message));
        audio.play().catch(finish);
      });
      if (!(audio.currentTime > 0)) throw Error(file + ': playback did not advance');
      results.push({ file, contentType, duration: decoded.duration, peak, played: audio.currentTime });
    } finally { audio.pause(); audio.removeAttribute('src'); audio.load(); }
  }
  return results;
}
