/** Sustituto mínimo de HTMLAudioElement para probar AudioEngine en Node. */
export class FakeAudio extends EventTarget {
  paused = true;
  currentTime = 0;
  duration = Number.NaN;
  volume = 1;
  muted = false;
  src = '';
  preload = '';
  error = null;
  sinkId = '';
  playCalls = 0;

  play() {
    this.playCalls += 1;
    this.paused = false;
    this.emit('play');
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.emit('pause');
  }

  async setSinkId(id) {
    this.sinkId = id;
  }

  emit(type) {
    this.dispatchEvent(new Event(type));
  }
}

/** Mediator falso que registra [evento, payload]. */
export function recordingMediator() {
  const events = [];
  return { events, notify: async (_sender, event, payload) => events.push([event, payload]) };
}
