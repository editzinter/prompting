
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

@customElement('fx-pad')
export class FxPad extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
      position: relative;
      cursor: crosshair;
      background: #0a0a0a;
      border-radius: 6px;
      box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
    }
    #pad-area {
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      border-radius: 6px;
    }
    #grid {
      position: absolute;
      width: 100%;
      height: 100%;
      background-image:
        linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
      background-size: 25% 25%;
    }
    #puck {
      position: absolute;
      width: 24px;
      height: 24px;
      background: #F9B200;
      border-radius: 50%;
      border: 2px solid white;
      transform: translate(-50%, -50%);
      pointer-events: none;
      box-shadow: 0 0 15px #F9B200, 0 0 25px #f1c40f;
      will-change: top, left;
      transition: box-shadow 0.2s ease;
    }
    #pad-area:active #puck {
       box-shadow: 0 0 20px #F9B200, 0 0 35px #f1c40f;
    }
    .labels {
        font-family: monospace;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
        position: absolute;
        user-select: none;
        pointer-events: none;
        text-shadow: 0 0 2px black;
    }
    #label-x {
        bottom: 5px;
        left: 50%;
        transform: translateX(-50%);
    }
    #label-y {
        top: calc(50% - 5px);
        left: 12px;
        transform: translateY(-50%) rotate(-90deg);
        transform-origin: center;
    }
  `;

  @state() private x = 1.0;
  @state() private y = 0.0;

  private boundRect: DOMRect | null = null;

  constructor() {
    super();
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  private handlePointerDown(e: PointerEvent) {
    // Cast to any to resolve compiler issues regarding inheritance
    (this as any).shadowRoot?.host.setPointerCapture(e.pointerId);
    
    // Cast to any to resolve compiler issues regarding inheritance
    this.boundRect = (this as any).getBoundingClientRect();
    if (!this.boundRect) return;

    const x = Math.max(0, Math.min(1, (e.clientX - this.boundRect.left) / this.boundRect.width));
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - this.boundRect.top) / this.boundRect.height));
    this.updatePosition(x, y);

    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
  }

  private handlePointerMove(e: PointerEvent) {
    if (!this.boundRect) return;
    
    const x = Math.max(0, Math.min(1, (e.clientX - this.boundRect.left) / this.boundRect.width));
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - this.boundRect.top) / this.boundRect.height));

    this.updatePosition(x, y);
  }

  private handlePointerUp(e: PointerEvent) {
    // Cast to any to resolve compiler issues regarding inheritance
    (this as any).shadowRoot?.host.releasePointerCapture(e.pointerId);

    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
  }
  
  private updatePosition(x: number, y: number, dispatch = true) {
    this.x = x;
    this.y = y;
    if (dispatch) {
      // Cast to any to resolve compiler issues regarding inheritance
      (this as any).dispatchEvent(new CustomEvent('fx-changed', {
        detail: { x: this.x, y: this.y },
        bubbles: true,
        composed: true,
      }));
    }
  }

  private resetPad() {
    this.updatePosition(1, 0);
  }

  render() {
    const puckStyle = styleMap({
      left: `${this.x * 100}%`,
      top: `${(1 - this.y) * 100}%`,
    });

    return html`
      <div id="pad-area" 
           @pointerdown=${this.handlePointerDown}
           @dblclick=${this.resetPad}
           title="X: Filter | Y: Delay | Double-click to reset"
      >
        <div id="grid"></div>
        <div id="puck" style=${puckStyle}></div>
        <div id="label-x" class="labels">FILTER</div>
        <div id="label-y" class="labels">DELAY</div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'fx-pad': FxPad;
  }
}
