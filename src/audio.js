// The same synthesis graph is used for interactive playback and WAV previews.
export function cue(context, destination, name, at = context.currentTime, volume = .25) {
  const output=context.createGain(); output.gain.value=volume; output.connect(destination);
  const sources=[];
  function tone(freq,delay,duration,gain=.3,end=freq){
    const oscillator=context.createOscillator(), envelope=context.createGain();
    oscillator.type='sine'; oscillator.frequency.setValueAtTime(freq,at+delay);
    oscillator.frequency.exponentialRampToValueAtTime(end,at+delay+duration);
    envelope.gain.setValueAtTime(0,at+delay);envelope.gain.linearRampToValueAtTime(gain,at+delay+.008);
    envelope.gain.exponentialRampToValueAtTime(.0001,at+delay+duration);
    oscillator.connect(envelope);envelope.connect(output);oscillator.start(at+delay);oscillator.stop(at+delay+duration+.02);sources.push(oscillator);
  }
  function air(delay,duration,frequency,gain=.18){
    const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate), data=buffer.getChannelData(0);
    let seed=973;for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;data[i]=seed/1073741823.5-1;}
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),envelope=context.createGain();
    source.buffer=buffer;filter.type='lowpass';filter.frequency.value=frequency;filter.Q.value=.4;
    envelope.gain.setValueAtTime(0,at+delay);envelope.gain.linearRampToValueAtTime(gain,at+delay+Math.min(.055,duration/4));envelope.gain.exponentialRampToValueAtTime(.0001,at+delay+duration);
    source.connect(filter);filter.connect(envelope);envelope.connect(output);source.start(at+delay);sources.push(source);
  }
  switch(name){
    case 'stone':tone(540,0,.10,.33,230);air(0,.06,1700,.18);break;
    case 'step':air(0,.18,1400,.18);break;
    case 'fire':air(0,.22,1500,.30);tone(420,0,.13,.13,180);air(.055,.07,2200,.12);break;
    case 'water':tone(650,0,.17,.22,380);tone(820,.10,.22,.15,510);air(0,.25,850,.07);break;
    case 'earth':tone(180,0,.24,.40,95);tone(320,.025,.14,.13,200);air(0,.12,550,.28);break;
    case 'wind':air(0,.58,1300,.24);tone(680,.08,.38,.07,900);break;
    case 'turn':tone(523.25,0,.42,.21);tone(783.99,.18,.65,.18);break;
    case 'end':tone(523.25,0,.27,.18);tone(392,.12,.40,.16);break;
  }
  return {stop(){for(const s of sources){try{s.stop();}catch{}}output.disconnect();}};
}

let context, master, active = [];
export let preferences = { sound: false, volume: .25, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
try {
  const saved = JSON.parse(localStorage.getItem('element-feedback-v1'));
  if (saved) preferences = { sound: saved.sound === true, volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(.6, saved.volume)) : .25, reduced: typeof saved.reduced === 'boolean' ? saved.reduced : preferences.reduced };
} catch { /* Defaults work without storage. */ }
export function updatePreferences(change) {
  Object.assign(preferences, change);
  try { localStorage.setItem('element-feedback-v1', JSON.stringify(preferences)); } catch { /* Preferences are optional. */ }
  document.documentElement.classList.toggle('reduced-motion', preferences.reduced);
  if (!preferences.sound || change.volume !== undefined) hush();
}
export function unlockAudio() {
  if (!preferences.sound) return;
  try {
    context ??= new (window.AudioContext || window.webkitAudioContext)();
    if (!master) { master = context.createDynamicsCompressor(); master.threshold.value = -14; master.ratio.value = 4; master.connect(context.destination); }
    return context.resume().catch(() => {});
  } catch { /* Visual feedback remains available. */ }
}
export function playSound(name) {
  if (!preferences.sound || !context || context.state !== 'running' || document.hidden) return;
  active = active.filter(entry => entry.until > context.currentTime);
  active.push({ ...cue(context, master, name, context.currentTime, preferences.volume), until: context.currentTime + 1 });
}
export function hush() { active.forEach(source => source.stop()); active = []; }
updatePreferences({});
