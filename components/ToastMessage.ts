
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

@customElement('toast-message')
export class ToastMessage extends LitElement {
  // Removed override as static properties don't require it
  static styles = css`
    .toast {
      line-height: 1.6;
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: #1C1C1C;
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 15px;
      width: min(450px, 80vw);
      transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 5px 25px 0 rgba(0, 0, 0, 0.5);
      text-wrap: pretty;
      z-index: 1000;
    }
    button {
      background: transparent;
      border: none;
      color: #999;
      cursor: pointer;
      font-size: 1.2em;
      padding: 5px;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    button:hover {
      color: white;
      background-color: rgba(255, 255, 255, 0.1);
    }
    .toast:not(.showing) {
      transition-duration: 1s;
      transform: translate(-50%, -200%);
    }
    a {
      color: #F9B200;
      text-decoration: underline;
    }
    a:hover {
      color: #fbc13a;
    }
  `;

  @property({ type: String }) message = '';
  @property({ type: Boolean }) showing = false;

  private renderMessageWithLinks() {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = this.message.split( urlRegex );
    return parts.map( ( part, i ) => {
      if ( i % 2 === 0 ) return part;
      return html`<a href=${part} target="_blank" rel="noopener">${part}</a>`;
    } );
  }

  // Removed override modifier to fix TS compiler confusion
  render() {
    return html`<div class=${classMap({ showing: this.showing, toast: true })}>
      <div class="message">${this.renderMessageWithLinks()}</div>
      <button @click=${this.hide}>✕</button>
    </div>`;
  }

  show(message: string) {
    this.showing = true;
    this.message = message;
  }

  hide() {
    this.showing = false;
  }

}

declare global {
  interface HTMLElementTagNameMap {
    'toast-message': ToastMessage
  }
}
