import { EVENTS } from '../mediator/events.js';
import { h, iconButton, setIcon } from './dom.js';
import { icon } from './icons.js';
import { formatTime } from './format.js';

const REPEAT_LABELS = { off: 'Repetir: no', all: 'Repetir: todo', one: 'Repetir: una' };

/**
 * Controles aleatorio · anterior · play/pausa · siguiente · repetir.
 * Componente de UI compartido por la player bar y Reproduciendo:
 * `notify(evento)` lo conecta con el colega que lo usa.
 */
export function createTransport(notify, { size = 'md' } = {}) {
  const buttons = {
    shuffle: iconButton('shuffle', 'Aleatorio', { className: 'mode-button', 'aria-pressed': 'false' }),
    previous: iconButton('previous', 'Anterior'),
    play: h('button', { type: 'button', class: `play-button play-button--${size}`, 'aria-label': 'Reproducir', title: 'Reproducir' }, icon('play')),
    next: iconButton('next', 'Siguiente'),
    repeat: iconButton('repeat', REPEAT_LABELS.off, { className: 'mode-button', 'aria-pressed': 'false' }),
  };
  const events = {
    shuffle: EVENTS.TOGGLE_SHUFFLE,
    previous: EVENTS.PREVIOUS,
    play: EVENTS.PLAY_TOGGLE,
    next: EVENTS.NEXT,
    repeat: EVENTS.CYCLE_REPEAT,
  };
  for (const [name, button] of Object.entries(buttons)) button.addEventListener('click', () => notify(events[name]));

  return {
    element: h('div', { class: `transport transport--${size}` }, Object.values(buttons)),

    setPlaying(playing) {
      const label = playing ? 'Pausar' : 'Reproducir';
      setIcon(buttons.play, playing ? 'pause' : 'play');
      buttons.play.setAttribute('aria-label', label);
      buttons.play.title = label;
    },

    setModes({ shuffle, repeat }) {
      buttons.shuffle.classList.toggle('is-active', shuffle);
      buttons.shuffle.setAttribute('aria-pressed', String(shuffle));
      buttons.repeat.classList.toggle('is-active', repeat !== 'off');
      buttons.repeat.setAttribute('aria-pressed', String(repeat !== 'off'));
      buttons.repeat.setAttribute('aria-label', REPEAT_LABELS[repeat]);
      buttons.repeat.title = REPEAT_LABELS[repeat];
      setIcon(buttons.repeat, repeat === 'one' ? 'repeat-one' : 'repeat');
    },
  };
}

/**
 * Barra de progreso con tiempos. Mientras se arrastra no se actualiza desde el
 * audio; al soltar llama a `onSeek(segundos)`.
 */
export function createSeekBar(onSeek, { size = 'md' } = {}) {
  const input = h('input', {
    type: 'range',
    class: 'range seek-bar__range',
    min: '0',
    max: '0',
    step: 'any',
    value: '0',
    disabled: true,
    'aria-label': 'Posición de la canción',
  });
  const current = h('span', { class: 'seek-bar__time' }, '0:00');
  const total = h('span', { class: 'seek-bar__time seek-bar__time--total' }, '0:00');
  let dragging = false;

  const paint = () => {
    const max = Number(input.max);
    input.style.setProperty('--progress', `${max > 0 ? (input.valueAsNumber / max) * 100 : 0}%`);
  };
  input.addEventListener('input', () => {
    dragging = true;
    current.textContent = formatTime(input.valueAsNumber);
    paint();
  });
  input.addEventListener('change', () => {
    dragging = false;
    onSeek(input.valueAsNumber);
  });
  for (const type of ['pointerup', 'blur']) input.addEventListener(type, () => (dragging = false));

  return {
    element: h('div', { class: `seek-bar seek-bar--${size}` }, current, input, total),

    setProgress(seconds, duration) {
      if (dragging) return;
      input.max = String(duration || 0);
      input.value = String(Math.min(seconds, duration || 0));
      input.disabled = !(duration > 0);
      current.textContent = formatTime(seconds);
      total.textContent = formatTime(duration);
      paint();
    },
  };
}

/** Control de volumen: botón de silencio + deslizador. */
export function createVolumeControl(notify) {
  const mute = iconButton('volume', 'Silenciar', { className: 'volume__mute' });
  const input = h('input', { type: 'range', class: 'range volume__range', min: '0', max: '1', step: '0.01', value: '0.8', 'aria-label': 'Volumen' });
  mute.addEventListener('click', () => notify(EVENTS.TOGGLE_MUTE));
  input.addEventListener('input', () => notify(EVENTS.VOLUME_CHANGE, input.valueAsNumber));

  return {
    element: h('div', { class: 'volume' }, mute, input),

    setVolume(volume, muted) {
      const silent = muted || volume === 0;
      input.value = String(muted ? 0 : volume);
      input.style.setProperty('--progress', `${(muted ? 0 : volume) * 100}%`);
      setIcon(mute, silent ? 'volume-muted' : 'volume');
      mute.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar');
      mute.title = muted ? 'Activar sonido' : 'Silenciar';
    },
  };
}
