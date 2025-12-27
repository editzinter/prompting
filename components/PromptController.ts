
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { MidiDispatcher } from '../utils/MidiDispatcher';
import type { Prompt, ControlChange } from '../types';

/** A single prompt track with a horizontal slider. */
@customElement('prompt-controller')
export class PromptController extends LitElement {
  // Removed override as static properties don't require it
  static styles = css`
    :host {
      display: block; /* The host is a block, the root div will be the flex container */
      background: #1C1C1C;
      border-radius: 8px;
      padding: 12px 15px;
      height: 70px;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
      transition: all 0.2s ease-in-out;
      flex-shrink: 0;
      animation: fadeInSlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes fadeInSlideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    #root {
      display: flex;
      align-items: center;
      gap: 15px;
      width: 100%;
      height: 100%;
    }
    :host([filtered]) {
      opacity: 0.6;
    }
    .info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 160px;
      flex-shrink: 0;
      user-select: none;
      justify-content: center;
    }
    #text-container {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .color-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    #text {
      color: #f0f0f0;
      font-size: 16px; /* Made slightly larger to be more prominent */
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
      text-align: left;
    }
    #midi {
      font-family: monospace;
      text-align: left;
      font-size: 12px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      padding: 2px 5px;
      color: rgba(255, 255, 255, 0.5);
      background: rgba(0, 0, 0, 0.2);
      cursor: pointer;
      user-select: none;
      width: fit-content;
      visibility: hidden;
      transition: all 0.2s ease;
    }
    .learn-mode #midi {
      color: #0A0A0A;
      background: #F9B200;
      border-color: #F9B200;
    }
    .show-cc #midi {
      visibility: visible;
    }

    .slider-area {
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      gap: 5px;
      height: 100%;
      justify-content: center;
    }
    .weight-readout {
      color: #aaa;
      font-size: 11px;
      font-family: monospace;
      user-select: none;
    }
    .slider-container {
      position: relative;
      width: 100%;
      height: 20px;
      display: flex;
      align-items: center;
    }
    .slider-track, .slider-fill {
      position: absolute;
      height: 6px;
      width: 100%;
      border-radius: 3px;
      top: 50%;
      transform: translateY(-50%);
    }
    .slider-track {
      background-color: #0A0A0A;
    }
    .slider-fill {
      background-color: var(--color);
      width: var(--fill-percent);
      transition: box-shadow 0.1s;
    }

    #weight-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      background: transparent;
      cursor: pointer;
      position: relative;
      z-index: 2;
      margin: 0;
    }
    #weight-slider:focus {
      outline: none;
    }

    /* Thumb */
    #weight-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #f0f0f0;
      border: none;
    }
    #weight-slider::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #f0f0f0;
      border: none;
    }

    .remove-btn {
      background: transparent;
      color: #888;
      border: none;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      cursor: pointer;
      font-size: 16px;
      line-height: 24px;
      text-align: center;
      padding: 0;
      margin-left: 10px;
      flex-shrink: 0; /* Prevent button from shrinking */
      transition: all 0.2s;
    }
    .remove-btn:hover {
      color: white;
      background: #444;
    }

    /* Responsive adjustments */
    @media (max-width: 480px) {
      :host {
        height: auto;
        padding: 12px;
      }
      #root {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
      }
      .info {
        width: 100%;
      }
      .slider-area {
        width: 100%;
      }
      .remove-btn {
        position: absolute;
        top: 6px;
        right: 6px;
        margin-left: 0;
        background: rgba(0,0,0,0.2);
      }
    }
  `;

  @property({ type: String }) promptId = '';
  @property({ type: String }) text = '';
  @property({ type: Number }) weight = 0;
  @property({ type: String }) color = '';
  @property({ type: String }) category = '';
  @property({ type: Boolean, reflect: true }) filtered = false;

  @property({ type: Number }) cc = 0;
  @property({ type: Number }) channel = 0; // Not currently used

  @property({ type: Boolean }) learnMode = false;
  @property({ type: Boolean }) showCC = false;

  @query('#weight-slider') private weightInput!: HTMLInputElement;

  @property({ type: Object })
  midiDispatcher: MidiDispatcher | null = null;

  @property({ type: Number }) audioLevel = 0;

  // Removed override to fix inheritance issues
  connectedCallback() {
    super.connectedCallback();
    this.midiDispatcher?.addEventListener('cc-message', (e: Event) => {
      const customEvent = e as CustomEvent<ControlChange>;
      const { channel, cc, value } = customEvent.detail;
      if (this.learnMode) {
        this.cc = cc;
        this.channel = channel;
        this.learnMode = false;
        this.dispatchPromptChange();
      } else if (cc === this.cc) {
        this.weight = (value / 127) * 2;
        this.dispatchPromptChange();
      }
    });
  }

  update(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('showCC') && !this.showCC) {
      this.learnMode = false;
    }
    super.update(changedProperties);
  }

  private dispatchPromptChange() {
    // Cast to any to access dispatchEvent if inheritance isn't detected
    (this as any).dispatchEvent(
      new CustomEvent<Prompt>('prompt-changed', {
        detail: {
          promptId: this.promptId,
          text: this.text,
          weight: this.weight,
          cc: this.cc,
          color: this.color,
          category: this.category,
        },
      }),
    );
  }

  private updateWeight() {
    this.weight = this.weightInput.valueAsNumber;
    this.dispatchPromptChange();
  }

  private toggleLearnMode() {
    this.learnMode = !this.learnMode;
  }

  private removeThisPrompt() {
    // Cast to any to access dispatchEvent if inheritance isn't detected
    (this as any).dispatchEvent(
      new CustomEvent('prompt-removed', {
        bubbles: true,
        composed: true,
        detail: { promptId: this.promptId },
      })
    );
  }

  // Removed override modifier to fix TS compiler confusion
  render() {
    const classes = classMap({
      'learn-mode': this.learnMode,
      'show-cc': this.showCC,
    });
    const fillPercent = (this.weight / 2) * 100;
    
    // Scale audio level for a subtle but noticeable glow
    const glowIntensity = this.filtered ? 0 : Math.min(this.audioLevel * 15, 12);
    const glowSpread = this.filtered ? 0 : Math.min(this.audioLevel * 8, 6);
    
    const styles = {
      '--color': this.filtered ? '#666' : this.color,
      '--fill-percent': `${fillPercent}%`,
    };

    const fillStyles = {
        boxShadow: this.weight > 0 ? `0 0 ${glowIntensity}px ${glowSpread}px ${this.filtered ? '#666' : this.color}` : 'none'
    };

    return html`
      <div id="root" class=${classes} style=${styleMap(styles)}>
        <div class="info">
          <div id="text-container">
            <div class="color-dot" style="background-color: ${this.filtered ? '#666' : this.color}"></div>
            <div id="text" title=${this.text}>
              ${this.text}
            </div>
          </div>
          <div id="midi" @click=${this.toggleLearnMode}>
            ${this.learnMode ? 'Learn...' : `CC:${this.cc}`}
          </div>
        </div>
        <div class="slider-area">
           <div class="slider-container">
              <div class="slider-track"></div>
              <div class="slider-fill" style=${styleMap(fillStyles)}></div>
              <input
                id="weight-slider"
                type="range"
                min="0"
                max="2"
                step="0.01"
                .value=${this.weight}
                @input=${this.updateWeight}>
            </div>
          <div class="weight-readout">Weight: ${this.weight.toFixed(2)}</div>
        </div>
        <button class="remove-btn" @click=${this.removeThisPrompt} title="Remove track">✕</button>
      </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'prompt-controller': PromptController;
  }
}
