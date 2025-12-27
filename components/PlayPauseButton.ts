
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { svg, css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { PlaybackState } from '../types';

@customElement('play-pause-button')
export class PlayPauseButton extends LitElement {

  @property({ type: String }) playbackState: PlaybackState = 'stopped';

  // Removed override as static properties don't require it and it was causing compiler errors
  static styles = css`
    :host {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      width: 100%;
      height: 100%;
    }
    :host(:hover) svg .bg {
      transform: scale(1.05);
    }
    svg {
      width: 100%;
      height: 100%;
    }
    .bg {
      transition: transform 0.2s ease-out;
      transform-origin: center;
    }
    .icon {
      transition: opacity 0.2s ease;
    }
    .loader-path {
      stroke: #F9B200;
      stroke-width: 4;
      stroke-linecap: round;
      fill: none;
      transform-origin: center;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;

  private renderSvg() {
    return html` <svg
      viewBox="0 0 60 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <circle class="bg" cx="30" cy="30" r="30" fill="rgba(255, 255, 255, 0.05)"/>
      <circle class="bg" cx="30" cy="30" r="29" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1"/>
      ${this.renderIcon()}
    </svg>`;
  }

  private renderPause() {
    return svg`
      <g class="icon">
        <rect x="22" y="19" width="6" height="22" rx="2" fill="#FEFEFE" />
        <rect x="32" y="19" width="6" height="22" rx="2" fill="#FEFEFE" />
      </g>
    `;
  }

  private renderPlay() {
    return svg`<path class="icon" d="M25 20.5359C25 19.4223 26.2415 18.7846 27.2185 19.4434L42.9231 28.9075C43.8328 29.5218 43.8328 30.8268 42.9231 31.4411L27.2185 40.9052C26.2415 41.564 25 40.9263 25 39.8127V20.5359Z" fill="#FEFEFE"/>`;
  }

  private renderLoading() {
    return svg`<path class="loader-path" d="M 30,5 A 25,25 0 0 1 55,30" />`;
  }

  private renderIcon() {
    if (this.playbackState === 'loading') {
      return this.renderLoading();
    }
    
    const isPlaying = this.playbackState === 'playing';

    // Use conditional rendering for robustness. The parent component's state
    // change will trigger a re-render anyway.
    if (isPlaying) {
      return this.renderPause();
    } else {
      return this.renderPlay();
    }
  }

  // Removed override modifier to fix TS compiler confusion regarding base class
  render() {
    return html`${this.renderSvg()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'play-pause-button': PlayPauseButton
  }
}
