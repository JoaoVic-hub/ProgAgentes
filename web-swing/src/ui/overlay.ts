/**
 * Overlay "Clique para jogar" / "Pausado". O pointer lock só pode ser pedido
 * dentro de um gesto do usuário, então o clique no overlay é esse gesto.
 * (As telas completas de abertura e game over chegam na Etapa 3.)
 */

export interface Overlay {
  show(mode: 'start' | 'paused', levelName: string): void;
  /** Mensagem curta abaixo do botão (ex.: o navegador recusou o pointer lock). */
  setHint(text: string): void;
  hide(): void;
  onActivate(listener: () => void): void;
  dispose(): void;
}

export function createOverlay(root: HTMLElement): Overlay {
  const el = document.createElement('div');
  el.className = 'overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'overlay-title');
  el.innerHTML = `
    <div class="overlay-card">
      <h1 class="overlay-title" id="overlay-title">Web Swing</h1>
      <p class="overlay-level" aria-live="polite"></p>
      <button class="overlay-button" type="button"></button>
      <p class="overlay-hint" aria-live="assertive"></p>
      <ul class="overlay-controls">
        <li><kbd>Mouse</kbd> olhar e mirar</li>
        <li><kbd>Clique</kbd> segurar = teia, soltar = largar</li>
        <li><kbd>W A S D</kbd> mover / direcionar o balanço</li>
        <li><kbd>Espaço</kbd> pular · impulso na teia · flip logo após soltar</li>
        <li><kbd>Esc</kbd> pausar</li>
      </ul>
    </div>`;
  root.appendChild(el);
  const level = el.querySelector('.overlay-level') as HTMLElement;
  const button = el.querySelector('.overlay-button') as HTMLButtonElement;
  const hint = el.querySelector('.overlay-hint') as HTMLElement;
  const listeners: (() => void)[] = [];
  const activate = () => listeners.forEach((l) => l());
  button.addEventListener('click', activate);

  return {
    show(mode, levelName) {
      level.textContent = levelName;
      button.textContent = mode === 'start' ? 'Clique para jogar' : 'Pausado — clique para continuar';
      hint.textContent = '';
      el.classList.add('visible');
      // Enter/Espaço já ativam o botão, sem precisar de Tab
      button.focus({ preventScroll: true });
    },
    setHint(text) {
      hint.textContent = text;
    },
    hide() {
      el.classList.remove('visible');
    },
    onActivate(listener) {
      listeners.push(listener);
    },
    dispose() {
      button.removeEventListener('click', activate);
      el.remove();
    },
  };
}
