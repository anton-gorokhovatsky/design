// Bundled with the accepted SVG and CSS by ../build.mjs. No runtime imports.
export const VERSION = "1.0.1";
const STYLE = __SIGNATURE_CSS__;
const MARK = __SIGNATURE_SVG__;
const template = document.createElement('template');
template.innerHTML = `<style>${STYLE}</style>
  <div class="signature">
    <a class="credit" href="https://gorokhovatsky.tech/" rel="author">
      ${MARK}
      <span class="text">
        <span class="name">Антон <span class="surname">Гороховатск<span class="name-end">ий<span class="arrow" aria-hidden="true"></span></span></span></span>
        <span class="role"></span>
      </span>
    </a>
    <button class="motion" type="button" hidden>Остановить движение</button>
  </div>`;

export class AGSignature extends HTMLElement {
  static observedAttributes = ['role-label', 'paused', 'controls'];
  #mark;
  #role;
  #button;
  #abort;
  #intersection;
  #rootObserver;
  #reduced;
  #contrast;
  #visible = true;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.append(template.content.cloneNode(true));
    this.#mark = shadow.querySelector('.mark');
    this.#role = shadow.querySelector('.role');
    this.#button = shadow.querySelector('.motion');
  }

  get paused() { return this.hasAttribute('paused'); }
  set paused(value) { this.toggleAttribute('paused', Boolean(value)); }

  connectedCallback() {
    this.#disconnect();
    const doc = this.ownerDocument;
    const view = doc.defaultView;
    this.#abort = new view.AbortController();
    const options = { signal: this.#abort.signal };
    this.#reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
    this.#contrast = view.matchMedia('(forced-colors: active)');
    this.dataset.signatureVersion = VERSION;
    this.#visible = true;

    this.#button.addEventListener('click', () => { this.paused = !this.paused; }, options);
    this.#reduced.addEventListener('change', this.#sync, options);
    this.#contrast.addEventListener('change', this.#sync, options);
    doc.addEventListener('visibilitychange', this.#sync, options);
    view.addEventListener('pageshow', this.#sync, options);
    view.addEventListener('pagehide', this.#stop, options);

    if (view.IntersectionObserver) {
      this.#intersection = new view.IntersectionObserver(entries => {
        this.#visible = entries[entries.length - 1].isIntersecting;
        this.#sync();
      });
      this.#intersection.observe(this);
    }
    // Optional bridge to the existing site-wide motion preference.
    this.#rootObserver = new view.MutationObserver(this.#sync);
    this.#rootObserver.observe(doc.documentElement, {
      attributes: true, attributeFilter: ['data-reduce-motion'],
    });
    this.#sync();
  }

  disconnectedCallback() { this.#disconnect(); }
  attributeChangedCallback() { if (this.isConnected) this.#sync(); }

  #stop = () => { this.#mark.dataset.arcRunning = 'false'; };
  #sync = () => {
    const doc = this.ownerDocument;
    const systemPaused = Boolean(this.#reduced?.matches || this.#contrast?.matches);
    const sitePaused = doc.documentElement.dataset.reduceMotion === 'true';
    const enabled = this.isConnected && !doc.hidden && this.#visible
      && !this.paused && !systemPaused && !sitePaused;
    this.#mark.dataset.arcRunning = String(enabled);
    this.#role.textContent = this.getAttribute('role-label') ?? 'Дизайн и\u00a0разработка';
    this.#role.hidden = this.#role.textContent === '';
    this.#button.hidden = this.getAttribute('controls') === 'external' || systemPaused || sitePaused;
    this.#button.textContent = this.paused ? 'Включить движение' : 'Остановить движение';
  };

  #disconnect() {
    this.#stop();
    this.#abort?.abort();
    this.#intersection?.disconnect();
    this.#rootObserver?.disconnect();
  }
}

if (!customElements.get('ag-signature')) customElements.define('ag-signature', AGSignature);
