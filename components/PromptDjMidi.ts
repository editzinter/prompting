
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { classMap } from 'lit/directives/class-map.js';
import { GoogleGenAI, Type } from '@google/genai';

import { throttle } from '../utils/throttle';

import './PromptController';
import './PlayPauseButton';
import './FxPad';
import type { PlaybackState, Prompt } from '../types';
import { MidiDispatcher } from '../utils/MidiDispatcher';
import { LiveMusicHelper } from '../utils/LiveMusicHelper';

const helpIcon = html`<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8-3.59 8-8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/></svg>`;

/** The main UI component, inspired by DAW layouts. */
@customElement('prompt-dj-midi')
export class PromptDjMidi extends LitElement {
  // Removed override as static properties don't require it
  static styles = css`
    :host {
      height: 100%;
      width: 100%;
      display: block; /* Changed to block for the inner container to control flex */
      box-sizing: border-box;
      background: transparent; /* Changed for visualizer */
      color: #f0f0f0;
      font-family: 'Inter', sans-serif;
    }
    .responsive-container {
      display: flex;
      width: 100%;
      height: 100%;
      position: relative;
      overflow-x: hidden;
      background: transparent;
    }
    #sidebar {
      width: 320px;
      min-width: 320px;
      height: 100%;
      background: rgba(17, 17, 17, 0.9);
      backdrop-filter: blur(10px);
      display: flex;
      flex-direction: column;
      overflow-y: hidden;
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      transition: transform 0.3s ease-in-out;
      z-index: 50;
    }
    #sidebar-header {
      padding: 20px 20px 15px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
    }
    #sidebar-header h2 {
      color: white;
      margin: 0 0 15px 0;
      font-size: 20px;
      font-weight: 500;
    }
    #search-input {
      width: 100%;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: #1C1C1C;
      color: white;
      font-family: inherit;
      font-size: 14px;
      box-sizing: border-box;
      transition: border-color 0.2s ease;
    }
    #search-input:focus {
      outline: none;
      border-color: #F9B200;
    }
    #asset-list {
      flex-grow: 1;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow-y: auto;
    }
    .asset-item {
      display: flex;
      align-items: center;
      gap: 5px;
      background: #1C1C1C;
      border-radius: 6px;
      border: 1px solid transparent;
      padding: 0 8px 0 15px;
      transition: all 0.2s ease;
    }
    .asset-item:hover {
      border-color: rgba(255, 255, 255, 0.2);
      background: #282828;
    }
    .asset-info {
      flex-grow: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: inherit;
      font-size: 14px;
      color: #f0f0f0;
      user-select: none;
      overflow: hidden;
      white-space: nowrap;
    }
    .asset-info span {
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .asset-actions {
        display: flex;
        flex-shrink: 0;
    }
    .preview-btn, .add-btn {
      width: 36px;
      height: 36px;
      flex-shrink: 0;
      background: transparent;
      border: none;
      color: #999;
      cursor: pointer;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    .preview-btn:hover, .add-btn:hover {
      background: #3c3c3c;
      color: white;
    }
    .preview-btn.previewing {
      color: #F9B200;
    }
    .preview-btn svg {
      width: 20px;
      height: 20px;
    }
    .add-btn {
        font-size: 24px;
        font-weight: 300;
    }
    .asset-color-swatch {
      width: 14px;
      height: 14px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    #main-content {
      flex-grow: 1;
      height: 100%;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
      background: transparent;
    }
    #toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 20px;
      background: rgba(17, 17, 17, 0.8);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      position: relative;
      z-index: 2;
      gap: 15px;
      flex-shrink: 0;
      height: 80px;
      box-sizing: border-box;
    }
    #transport-controls {
      display: flex;
      align-items: center;
      gap: 20px;
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    }
    #midi-controls, #record-controls {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    #sidebar-toggle {
      display: none;
      background: transparent;
      border: none;
      color: #f0f0f0;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
    }
    #sidebar-toggle svg {
      width: 100%;
      height: 100%;
    }
    #main-actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    #track-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 20px;
      overflow-y: auto;
      position: relative;
      z-index: 1;
    }
    .empty-state {
      color: #aaa;
      background: rgba(0,0,0,0.4);
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      margin: auto;
      font-size: 1.1em;
      line-height: 1.6;
    }
    play-pause-button {
      width: 60px;
      height: 60px;
    }
    button {
      font: inherit;
      font-weight: 500;
      cursor: pointer;
      color: #f0f0f0;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 6px;
      user-select: none;
      padding: 6px 12px;
      transition: all 0.2s ease;
    }
    button:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.5);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: transparent;
    }

    button.active {
      background-color: #F9B200;
      color: #0A0A0A;
      border-color: #F9B200;
    }
    button.active:hover {
      background-color: #fbc13a;
    }

    button.record-active {
      background-color: #e74c3c;
      color: white;
      border-color: #e74c3c;
      animation: pulse 1.5s infinite;
    }
    #download-btn {
      background: #F9B200;
      color: #0A0A0A;
      border-color: #F9B200;
      font-weight: bold;
      text-decoration: none;
      display: inline-block;
    }
    #download-btn:hover {
      background: #fbc13a;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(231, 76, 60, 0); }
      100% { box-shadow: 0 0 0 0 rgba(231, 76, 60, 0); }
    }
    select {
      font: inherit;
      padding: 5px 8px;
      background: #1C1C1C;
      color: #f0f0f0;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      outline: none;
      cursor: pointer;
    }
    .slider-control {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      color: #ccc;
    }
    .slider-control label {
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 1px;
      user-select: none;
    }
    .slider-control input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 150px;
      height: 5px;
      background: #0A0A0A;
      outline: none;
      border-radius: 3px;
      cursor: pointer;
    }
    .slider-control input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 15px;
      height: 15px;
      background: #f0f0f0;
      cursor: pointer;
      border-radius: 50%;
      border: none;
    }
    .slider-control input[type="range"]::-moz-range-thumb {
      width: 15px;
      height: 15px;
      background: #f0f0f0;
      cursor: pointer;
      border-radius: 50%;
      border: none;
    }

    #volume-control {
        width: 120px;
    }
    
    /* Floating Window Styles */
    .floating-window {
      position: absolute;
      bottom: 20px;
      background: rgba(28, 28, 28, 0.75);
      backdrop-filter: blur(12px) saturate(1.2);
      -webkit-backdrop-filter: blur(12px) saturate(1.2);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      z-index: 10;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      animation: subtleGlow 4s ease-in-out infinite alternate;
    }

    @keyframes subtleGlow {
      from {
        box-shadow: 0 10px 40px rgba(0,0,0,0.5), 0 0 5px rgba(255, 255, 255, 0.05);
      }
      to {
        box-shadow: 0 10px 45px rgba(0,0,0,0.6), 0 0 15px rgba(255, 255, 255, 0.1);
      }
    }

    #ai-tool-window {
      right: 20px;
      width: 380px;
    }
    #ai-tool-window.help-open {
        height: auto;
    }
    #audio-fx-window {
      left: 20px;
      width: 300px;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1), width 0.3s ease, height 0.3s ease;
    }
    #audio-fx-window.pad-view-active {
      width: 280px;
      height: 360px;
    }
    .floating-window.minimized {
      height: 44px !important;
      width: 220px !important;
      animation: none;
    }
    #audio-fx-window.minimized {
        width: 180px !important;
    }
    .window-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 6px 0 16px;
      height: 44px;
      background: rgba(0, 0, 0, 0.2);
      flex-shrink: 0;
      user-select: none;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .window-header h3 {
      color: white;
      font-size: 14px;
      font-weight: 500;
      margin: 0;
    }
    .header-buttons {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .header-buttons button {
      background: transparent;
      border: none;
      color: #aaa;
      cursor: pointer;
      font-size: 20px;
      padding: 0;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    .header-buttons button:hover {
      color: white;
      background: rgba(255, 255, 255, 0.15);
    }
    .window-body {
      padding: 15px;
      display: flex;
      flex-direction: column;
      gap: 15px;
      flex-grow: 1;
      overflow: hidden;
    }
    .ai-setting {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }
    .ai-setting label {
        font-size: 13px;
        color: #aaa;
        font-weight: 500;
    }
    .ai-textarea {
      width: 100%;
      box-sizing: border-box;
      background: #0A0A0A;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 4px;
      padding: 10px;
      resize: none;
      font-family: inherit;
    }
    #beat-maker-prompt-input {
      height: 120px;
    }
    .ai-button {
      border: none;
      color: white;
      padding: 12px;
      border-radius: 6px;
      font-size: 15px;
      font-weight: 600;
      margin-top: 5px;
      background: #8e44ad;
    }
    .ai-button:hover:not(:disabled) {
      filter: brightness(1.1);
    }
    .ai-button:disabled {
      background: #444 !important;
      cursor: wait;
      color: #888;
    }
    #beat-maker-help {
        padding: 15px;
        background: #111;
        max-height: 400px;
        overflow-y: auto;
    }
    #beat-maker-help h4 {
        margin: 0 0 15px 0;
        font-size: 16px;
        color: #F9B200;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 10px;
    }
    #beat-maker-help ul {
        list-style: none;
        padding: 0;
        margin: 0 0 20px 0;
        display: flex;
        flex-direction: column;
        gap: 15px;
    }
    #beat-maker-help li {
        line-height: 1.5;
    }
    #beat-maker-help p {
        margin: 5px 0 0 0;
        color: #ccc;
        font-size: 13px;
    }
    #beat-maker-help strong {
        color: #f0f0f0;
        font-weight: 500;
    }
    #beat-maker-help .example {
        background: rgba(0,0,0,0.3);
        padding: 8px;
        border-radius: 4px;
        border-left: 3px solid #F9B200;
        margin-top: 8px;
        font-size: 12px;
    }
    #beat-maker-help .example em {
        color: #aaa;
        font-style: normal;
    }
    #beat-maker-help .ai-button {
      width: 100%;
      text-align: center;
      background: #444;
      margin-top: 0;
    }


    #sidebar-backdrop {
        display: none;
    }

    /* FX Window Styles */
    .fx-content {
        padding: 15px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        flex-grow: 1;
        overflow-y: auto;
    }
    .fx-setting {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .fx-setting label {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: #aaa;
      font-weight: 500;
    }
    .fx-setting label span:last-child {
      font-family: monospace;
      color: #f0f0f0;
      background: rgba(0,0,0,0.2);
      padding: 1px 4px;
      border-radius: 3px;
    }
    .fx-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 6px;
      background: #0A0A0A;
      outline: none;
      border-radius: 3px;
      cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.2);
      margin: 0;
    }
    .fx-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      background: #f0f0f0;
      cursor: pointer;
      border-radius: 50%;
      border: none;
      transition: transform 0.1s ease;
    }
    .fx-slider:active::-webkit-slider-thumb {
      transform: scale(1.2);
    }
    .fx-slider::-moz-range-thumb {
      width: 16px;
      height: 16px;
      background: #f0f0f0;
      cursor: pointer;
      border-radius: 50%;
      border: none;
    }
    .fx-buttons {
      display: flex;
      gap: 10px;
      margin-top: 5px;
    }
    .fx-buttons button {
      flex: 1;
    }

    .fx-pad-wrapper {
        flex-grow: 1;
        display: flex;
        padding: 15px;
    }

    .fx-pad-wrapper fx-pad {
        flex-grow: 1;
    }
    
    .window-body .ai-tabs {
      display: flex;
      flex-shrink: 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding: 0 15px;
      margin: -15px -15px 0 -15px;
    }
    .window-body .ai-tab-btn {
      flex: 1;
      padding: 12px;
      background: transparent;
      border: none;
      color: #aaa;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }
    .window-body .ai-tab-btn:hover {
      background: rgba(255,255,255,0.05);
      color: white;
    }
    .window-body .ai-tab-btn.active {
      color: white;
      border-bottom-color: #F9B200;
    }


    /* Responsive Design */
    @media (max-width: 900px) {
        #complexity-control, #stability-control {
          display: none;
        }
    }
    @media (max-width: 768px) {
      #sidebar-toggle {
        display: block;
      }
      
      #sidebar {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 280px;
        min-width: 280px;
        z-index: 100;
        transform: translateX(-100%);
        box-shadow: 4px 0px 15px rgba(0,0,0,0.4);
      }
      
      .sidebar-open #sidebar {
        transform: translateX(0);
      }
      
      .sidebar-open #sidebar-backdrop {
        display: block;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 99;
      }
      
      #main-content {
        width: 100%;
      }
      
      #toolbar {
        flex-wrap: wrap;
        height: auto;
        justify-content: space-between;
        gap: 15px;
      }
      
      #transport-controls {
        position: static;
        transform: none;
        order: -1;
        width: 100%;
        justify-content: center;
        padding-bottom: 15px;
        margin-bottom: 15px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }

      play-pause-button {
          width: 50px;
          height: 50px;
      }
      
      #midi-controls { order: 0; }
      #main-actions { order: 1; }

      #track-area {
        padding: 15px;
        gap: 15px;
      }

      /* Floating Window Mobile Layout */
      .floating-window {
        /* Default state is maximized on mobile */
        width: calc(100% - 20px);
        left: 10px;
        right: 10px;
        bottom: 10px;
      }

      /* Both windows are visible now */
      #audio-fx-window {
          display: flex;
      }

      #ai-tool-window.minimized {
        width: 180px !important;
        left: auto;
        right: 10px;
      }
      #audio-fx-window.minimized {
        width: 160px !important;
        left: 10px;
        right: auto;
      }
    }
    @media (max-width: 480px) {
        #midi-controls {
            flex-grow: 1;
        }
        #midi-controls select {
            width: 100%;
            max-width: 150px;
        }
        #main-actions {
            flex-grow: 1;
            justify-content: flex-end;
        }
        .asset-item {
            padding: 0 4px 0 12px;
        }
        .preview-btn, .add-btn {
            width: 32px;
            height: 32px;
        }
        #volume-control {
            display: none;
        }
    }
  `;

  private allPrompts: Map<string, Prompt>;
  private midiDispatcher: MidiDispatcher;
  private ai: GoogleGenAI;
  private availablePromptsForAI: { text: string, category: string }[];
  private liveMusicHelper: LiveMusicHelper;
  private textToIdMap = new Map<string, string>();


  @state() private activePromptIds = new Set<string>();
  @property({ type: Boolean }) private showMidi = false;
  @property({ type: String }) public playbackState: PlaybackState = 'stopped';
  @state() public audioLevel = 0;
  @state() private midiInputIds: string[] = [];
  @state() private activeMidiInputId: string | null = null;
  @state() private masterVolume = 0.8;
  @state() private searchQuery = '';
  @state() public isRecording = false;
  @state() private downloadUrl: string | null = null;
  @state() private downloadFilename = 'prompt-dj-beat.webm';
  
  @state() private previewingPromptId: string | null = null;
  @state() private wasPlayingBeforePreview = false;
  
  // AI Tools Window State
  @state() private isAiToolWindowMinimized = true;
  @state() private showBeatMakerHelp = false;

  // Audio Effects Window State
  @state() private audioFxState = { 
    pitch: 1.0, 
    pan: 0,
    reverb: 0.2,
    delayTime: 0.5,
    delayFeedback: 0.4,
    filterCutoff: 1.0,
    filterResonance: 0.1,
    isMono: false, 
    is8D: false, 
    isWindowMinimized: true 
  };
  @state() private activeFxTab: 'controls' | 'pad' = 'controls';
  
  // AI Beat Maker State
  @state() private beatMakerPromptText = '';
  @state() private isGeneratingBeat = false;
  @state() private activeAiTab: 'freestyle' | 'structured' = 'freestyle';
  @state() private beatMakerGenre = '';
  @state() private beatMakerMood = '';
  @state() private beatMakerInstruments = '';
  @state() private beatMakerTempo = '';
  
  @state() private isSidebarOpen = false;

  @property({ type: Object })
  private filteredPrompts = new Set<string>();

  constructor(
    initialPrompts: Map<string, Prompt>,
    ai: GoogleGenAI,
    availablePromptsForAI: { text: string, category: string }[],
    liveMusicHelper: LiveMusicHelper
  ) {
    super();
    this.allPrompts = initialPrompts;
    this.midiDispatcher = new MidiDispatcher();
    this.ai = ai;
    this.availablePromptsForAI = availablePromptsForAI;
    this.liveMusicHelper = liveMusicHelper;

    for (const prompt of this.allPrompts.values()) {
      this.textToIdMap.set(prompt.text, prompt.promptId);
    }
  }
  
  public getActivePromptColors(): string[] {
    const activePrompts = [...this.allPrompts.values()].filter(p => this.activePromptIds.has(p.promptId) && p.weight > 0);
    return activePrompts.map(p => p.color);
  }
  
  protected updated(changedProperties: Map<string, unknown>) {
    // On small screens, auto-close the sidebar when user starts interaction
    if (window.innerWidth <= 768 && this.isSidebarOpen) {
      if ((changedProperties.has('playbackState') && this.playbackState === 'playing') ||
          (changedProperties.has('isGeneratingBeat') && this.isGeneratingBeat)) {
        this.isSidebarOpen = false;
      }
    }
  }

  private dispatchPromptsChanged() {
    const promptsToSend = new Map<string, Prompt>();
    
    // If in preview mode, send only the preview prompt
    if (this.previewingPromptId) {
      const prompt = this.allPrompts.get(this.previewingPromptId);
      if (prompt) {
        const previewPromptClone = { ...prompt, weight: 1.0 };
        promptsToSend.set(this.previewingPromptId, previewPromptClone);
      }
    } else {
       // Add only active prompts
      for (const promptId of this.activePromptIds) {
        const prompt = this.allPrompts.get(promptId);
        if (prompt && prompt.weight > 0) {
          promptsToSend.set(promptId, prompt);
        }
      }
    }
    
    // Cast to any for dispatchEvent to resolve compiler detection issues
    (this as any).dispatchEvent(
      new CustomEvent('prompts-changed', { detail: promptsToSend }),
    );
  }
  
  private handleMasterVolumeChange(e: Event) {
    this.masterVolume = (e.target as HTMLInputElement).valueAsNumber;
    this.liveMusicHelper.setMasterVolume(this.masterVolume);
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const { promptId, text, weight, cc, color, category } = e.detail;
    const prompt = this.allPrompts.get(promptId);
    if (!prompt) return;

    prompt.text = text;
    prompt.weight = weight;
    prompt.cc = cc;
    prompt.color = color;
    prompt.category = category;
    
    this.allPrompts.set(promptId, prompt);
    this.dispatchPromptsChanged();
    // Cast to any for requestUpdate to resolve compiler detection issues
    (this as any).requestUpdate('allPrompts');
  }

  private addPrompt(promptId: string) {
    // Cannot add prompts while one is being previewed.
    if (this.previewingPromptId) return;
    const prompt = this.allPrompts.get(promptId);
    if(prompt) {
      prompt.weight = 0.5; // Set a default weight
      this.allPrompts.set(promptId, prompt);
    }
    this.activePromptIds.add(promptId);
    this.dispatchPromptsChanged();
    // Cast to any for requestUpdate to resolve compiler detection issues
    (this as any).requestUpdate('activePromptIds');

    if (window.innerWidth <= 768) {
      this.isSidebarOpen = false;
    }
  }

  private handlePromptRemoved(e: CustomEvent<{promptId: string}>) {
    const {promptId} = e.detail;
    const prompt = this.allPrompts.get(promptId);
    if (prompt) {
      prompt.weight = 0; // Reset weight
      this.allPrompts.set(promptId, prompt);
    }
    this.activePromptIds.delete(promptId);
    this.dispatchPromptsChanged();
    // Cast to any for requestUpdate to resolve compiler detection issues
    (this as any).requestUpdate('activePromptIds');
  }

  private toggleShowMidi() {
    return this.setShowMidi(!this.showMidi);
  }

  public async setShowMidi(show: boolean) {
    this.showMidi = show;
    if (!this.showMidi) return;
    try {
      const inputIds = await this.midiDispatcher.getMidiAccess();
      this.midiInputIds = inputIds;
      this.activeMidiInputId = this.midiDispatcher.activeMidiInputId;
    } catch (e: any) {
      // Cast to any for dispatchEvent to resolve compiler detection issues
      (this as any).dispatchEvent(new CustomEvent('error', {detail: e.message}));
    }
  }

  private handleMidiInputChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newMidiId = selectElement.value;
    this.activeMidiInputId = newMidiId;
    this.midiDispatcher.activeMidiInputId = newMidiId;
  }
  
  private handleSearchInput(e: Event) {
    this.searchQuery = (e.target as HTMLInputElement).value;
  }

  private toggleRecording() {
    // Cast to any for dispatchEvent to resolve compiler detection issues
    (this as any).dispatchEvent(new CustomEvent('toggle-recording'));
    // If a download is available, this new action clears it
    if (this.downloadUrl) {
      this.clearDownload();
    }
  }

  public setDownload(blob: Blob, prompts: string[]) {
    if (this.downloadUrl) {
      URL.revokeObjectURL(this.downloadUrl);
    }
    this.downloadUrl = URL.createObjectURL(blob);
    const usedPrompts = prompts.join('-').replace(/[^a-z0-9-_]/gi, '_');
    this.downloadFilename = `${usedPrompts || 'prompt-dj-beat'}.webm`;
  }
  
  public clearDownload() {
    if (this.downloadUrl) {
      URL.revokeObjectURL(this.downloadUrl);
      this.downloadUrl = null;
    }
  }

  private async playPause() {
    if (this.previewingPromptId) {
      this.previewingPromptId = null;
      this.wasPlayingBeforePreview = false;
      await this.liveMusicHelper.stop();
    } else {
      await this.liveMusicHelper.playPause();
    }
    this.clearDownload();
  }

  public addFilteredPrompt(prompt: string) {
    this.filteredPrompts = new Set([...this.filteredPrompts, prompt]);
  }

  private async handlePreviewToggle(promptIdToPreview: string) {
    const isCurrentlyPreviewingThis = this.previewingPromptId === promptIdToPreview;
    
    // If stopping the current preview
    if (isCurrentlyPreviewingThis) {
      this.previewingPromptId = null;
      await this.liveMusicHelper.pause();
      if (this.wasPlayingBeforePreview) {
        this.dispatchPromptsChanged(); // Restore original prompts
        await this.liveMusicHelper.play();
      }
      this.wasPlayingBeforePreview = false;
      return;
    }
    
    // If starting a new preview
    if (this.previewingPromptId === null) {
      this.wasPlayingBeforePreview = this.playbackState === 'playing' || this.playbackState === 'loading';
      if (this.wasPlayingBeforePreview) {
        await this.liveMusicHelper.pause();
      }
    }
    
    this.previewingPromptId = promptIdToPreview;
    this.dispatchPromptsChanged();
    await this.liveMusicHelper.play();
  }

  private toggleAiWindow() {
    this.isAiToolWindowMinimized = !this.isAiToolWindowMinimized;
    if (window.innerWidth <= 768 && !this.isAiToolWindowMinimized) {
        // If we are maximizing the AI window on mobile, minimize the FX window
        this.audioFxState = { ...this.audioFxState, isWindowMinimized: true };
    }
    if (this.isAiToolWindowMinimized) {
        // Always close help when minimizing
        this.showBeatMakerHelp = false;
    }
  }

  private toggleFxWindow() {
    const currentMinimizedState = this.audioFxState.isWindowMinimized;
    this.audioFxState = { ...this.audioFxState, isWindowMinimized: !currentMinimizedState };
    if (window.innerWidth <= 768 && !this.audioFxState.isWindowMinimized) {
        // If we are maximizing the FX window on mobile, minimize the AI window
        this.isAiToolWindowMinimized = true;
    }
  }

  private handleFxChange(property: keyof typeof this.audioFxState, e: Event) {
    const value = (e.target as HTMLInputElement).valueAsNumber;
    this.audioFxState = { ...this.audioFxState, [property]: value };
    switch (property) {
        case 'pitch':
            this.liveMusicHelper.setPlaybackRate(value);
            break;
        case 'pan':
            this.liveMusicHelper.setPan(value);
            break;
        case 'reverb':
            this.liveMusicHelper.setReverb(value);
            break;
        case 'delayTime':
            this.liveMusicHelper.setDelayTime(value);
            break;
        case 'delayFeedback':
            this.liveMusicHelper.setDelayFeedback(value);
            break;
        case 'filterCutoff':
            this.liveMusicHelper.setFilterCutoff(value);
            break;
        case 'filterResonance':
            this.liveMusicHelper.setFilterResonance(value);
            break;
    }
  }

  private handleFxToggle(property: 'isMono' | 'is8D') {
      const newValue = !this.audioFxState[property];
      
      const pan = property === 'is8D' && newValue ? 0 : this.audioFxState.pan;
      this.audioFxState = { ...this.audioFxState, [property]: newValue, pan };

      if (property === 'isMono') {
          this.liveMusicHelper.setMono(newValue);
      } else if (property === 'is8D') {
          this.liveMusicHelper.toggle8D(newValue);
          // When 8D is turned on, pan is controlled automatically.
          // When turned off, it returns to the slider's value.
          this.liveMusicHelper.setPan(pan);
      }
  }
  
  private handlePerfFxChange(e: CustomEvent<{x: number, y: number}>) {
    const { x, y } = e.detail;
    this.liveMusicHelper.setFilterCutoff(x);
    this.liveMusicHelper.setDelay(y);
  }

  private buildCategorizedPromptList(): string {
    const categories = new Map<string, string[]>();
    for (const prompt of this.availablePromptsForAI) {
      if (!categories.has(prompt.category)) {
        categories.set(prompt.category, []);
      }
      categories.get(prompt.category)!.push(prompt.text);
    }

    let formattedList = "Here are the available instrumental prompts, grouped by category:\n\n";
    for (const [category, prompts] of categories.entries()) {
      formattedList += `**${category}**\n`;
      formattedList += prompts.map(p => `- ${p}`).join('\n');
      formattedList += '\n\n';
    }
    return formattedList;
  }
  
  private async generateBeat() {
    if (this.isGeneratingBeat) return;

    let userPrompt = '';
    if (this.activeAiTab === 'freestyle') {
        userPrompt = this.beatMakerPromptText.trim();
    } else {
        const parts = [];
        if (this.beatMakerGenre.trim()) parts.push(`Genre: ${this.beatMakerGenre.trim()}`);
        if (this.beatMakerMood.trim()) parts.push(`Mood: ${this.beatMakerMood.trim()}`);
        if (this.beatMakerInstruments.trim()) parts.push(`Key Instruments: ${this.beatMakerInstruments.trim()}`);
        if (this.beatMakerTempo.trim()) parts.push(`Tempo: ${this.beatMakerTempo.trim()}`);
        
        if (parts.length > 0) {
             userPrompt = `Create a beat with the following characteristics: ${parts.join('. ')}.`;
        }
    }
    
    if (!userPrompt) return;

    this.isGeneratingBeat = true;
    
    const schema = {
      type: Type.OBJECT,
      properties: {
        prompts: {
          type: Type.ARRAY,
          description: 'A list of musical prompts and their weights to create the beat.',
          items: {
            type: Type.OBJECT,
            properties: {
              promptName: { type: Type.STRING, description: 'The exact name of a prompt from the provided list.' },
              weight: { type: Type.NUMBER, description: 'The weight for this prompt (0.1 to 2.0).' }
            },
            required: ['promptName', 'weight']
          }
        }
      },
      required: ['prompts']
    };

    const systemInstruction = `You are a world-class AI Beat Maker and an expert music producer. Your primary function is to interpret a user's abstract musical idea and translate it into a concrete, well-mixed, and musically coherent set of instrumental prompts. Your output must be a professional-sounding piece of music, not just a collection of sounds.

**YOUR CORE DIRECTIVES (Non-Negotiable):**

1.  **ABSOLUTE PROMPT FIDELITY:** You are **strictly forbidden** from inventing, hallucinating, or modifying prompt names. Every single \`promptName\` in your JSON output **MUST** be an EXACT, character-for-character match from the provided list. Failure to adhere to this will result in an unusable beat. You are an intelligent selector, not a creator of prompts.

2.  **THE "CORE TRIO" IS MANDATORY:** Every single beat, without exception, **MUST** be built on this foundation to ensure clarity and avoid a muddy mix.
    *   **EXACTLY ONE Rhythmic Backbone:** Select the single best drum loop, beat, or primary percussion pattern that defines the genre and feel. **NEVER use two main drum loops.** A secondary, sparse percussion element is acceptable as a supporting layer.
    *   **EXACTLY ONE Bass Element:** Select the single best bassline or bass sound. **NEVER use multiple competing x-basslines.** This is the most common cause of a bad mix.
    *   **EXACTLY ONE Primary Melodic/Harmonic Element:** Select the single most important musical element—the main chords, the lead melody, or the defining sample.

3.  **BE AN INTELLIGENT FILTER (Negative Constraints):** Your most important job is to know what to **leave out**.
    *   **"Instrumental" means ZERO vocals:** If a user requests an "instrumental," you **MUST NOT** include any prompts from the "Vocal Textures" category or any other prompt that contains human voices (choir, ad-libs, etc.).
    *   **Respect the Mood:** If a beat is "dark," "sad," or "menacing," you **MUST AVOID** any elements that sound happy, bright, or euphoric (e.g., major-key melodies, uplifting pads).
    *   **Respect the Genre:** If a user requests "acoustic folk," you **MUST AVOID** all electronic elements like synthesizers, 808s, and drum machines.
    *   **"Minimal" means minimal:** A request for a "minimal," "sparse," or "simple" beat should result in the Core Trio plus only **1 or 2** supporting layers at most.

**WORKFLOW & BEST PRACTICES:**

*   **Step 1: Deconstruct the Request:** Mentally break down the user's prompt into Genre, Mood, Tempo/Energy, and Key Instruments.
*   **Step 2: Establish the Core Trio:** Based on your deconstruction, select the three foundational prompts first. This is your canvas.
*   **Step 3: Layer with Purpose (Supporting Elements):**
    *   Now, carefully select **2 to 10 additional prompts** to add texture, depth, and interest.
    *   **PRIORITIZE SPECIFICITY:** Always choose the most descriptive prompt available. "A classic 'hoover' synth sound..." is infinitely better than "Synth".
    *   **AVOID REDUNDANCY:** Do not add two elements that do the same job. One piano is enough. One lead synth is enough. Use FX, atmospheric pads, or subtle percussion to fill space instead.
*   **Step 4: Mix with Professional Weights:** Assign weights to create a clean, balanced mix.
    *   **Core Trio (The Stars):**
        *   Rhythmic Backbone: **1.0 - 1.5** (Must be loud and clear).
        *   Bass Element: **0.9 - 1.6** (Must be powerful and present).
        *   Primary Melodic/Harmonic: **0.7 - 1.4** (Prominent, but balanced with the rhythm).
    *   **Supporting Layers (The Background):**
        *   Pads, Textures, FX, Secondary Percussion: **MUST BE low weight (0.2 - 0.7)**. These elements create atmosphere and should sit *behind* the core trio. This is the secret to a professional sound.

**FINAL JSON OUTPUT:**
Your final response **MUST** be a single, valid JSON object conforming to the schema. Do not add any text, comments, or explanations before or after the JSON.
\`{ "prompts": [{ "promptName": "...", "weight": ... }] }\``;
    
    const categorizedList = this.buildCategorizedPromptList();

    try {
      const contents = [
        {text: systemInstruction},
        {text: `User's beat idea: "${userPrompt}"`},
        {text: categorizedList},
      ];

      // Use gemini-3-flash-preview as recommended for basic/complex text tasks
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
        }
      });
      
      const beatPlan = JSON.parse(response.text.trim());
      
      // Clear existing tracks
      this.activePromptIds.forEach(id => {
        const prompt = this.allPrompts.get(id);
        if (prompt) prompt.weight = 0;
      });
      this.activePromptIds.clear();
      
      const newActiveIds = new Set<string>();
      if (beatPlan.prompts && Array.isArray(beatPlan.prompts)) {
        for (const p of beatPlan.prompts) {
            const promptId = this.textToIdMap.get(p.promptName);
            if (promptId) {
                newActiveIds.add(promptId);
                const prompt = this.allPrompts.get(promptId);
                if (prompt) {
                  prompt.weight = Math.max(0, Math.min(2, p.weight || 0.5));
                }
            }
        }
      }
      this.activePromptIds = newActiveIds;
      this.dispatchPromptsChanged();
      // Cast to any for requestUpdate to resolve compiler detection issues
      (this as any).requestUpdate();

    } catch(err) {
      console.error(err);
      // Cast to any for dispatchEvent to resolve compiler detection issues
      (this as any).dispatchEvent(new CustomEvent('error', {detail: 'Failed to generate beat. The AI might be busy, or the request was too complex. Please try again.'}));
    } finally {
      this.isGeneratingBeat = false;
    }
  }

  // Removed override modifier to fix TS compiler confusion
  render() {
    const containerClasses = classMap({ 'sidebar-open': this.isSidebarOpen });
    const hamburgerIcon = html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18v2H3V6m0 5h18v2H3v-2m0 5h18v2H3v-2z"></path></svg>`;

    return html`
      <div class="responsive-container ${containerClasses}">
        <div id="sidebar">
          <div id="sidebar-header">
            <h2>Prompts</h2>
            <input 
              type="search" 
              id="search-input" 
              placeholder="Search assets..."
              .value=${this.searchQuery}
              @input=${this.handleSearchInput}
              ?disabled=${this.isGeneratingBeat}
            />
          </div>
          <div id="asset-list">
            ${this.renderSidebar()}
          </div>
        </div>
        <div id="main-content">
          ${this.isSidebarOpen ? html`<div id="sidebar-backdrop" @click=${() => this.isSidebarOpen = false}></div>` : ''}
          <div id="toolbar">
            <div id="midi-controls">
              <button id="sidebar-toggle" @click=${() => this.isSidebarOpen = !this.isSidebarOpen} title="Toggle Prompts">${hamburgerIcon}</button>
              <button
                @click=${this.toggleShowMidi}
                class=${this.showMidi ? 'active' : ''}
                >MIDI</button
              >
              <select
                @change=${this.handleMidiInputChange}
                .value=${this.activeMidiInputId || ''}
                style=${this.showMidi ? '' : 'visibility: hidden'}>
                ${this.midiInputIds.length > 0
              ? this.midiInputIds.map(
                (id) =>
                  html`<option value=${id}>
                          ${this.midiDispatcher.getDeviceName(id)}
                        </option>`,
              )
              : html`<option value="">No devices found</option>`}
              </select>
            </div>
            <div id="transport-controls">
              <play-pause-button .playbackState=${this.playbackState} @click=${this.playPause}></play-pause-button>
              <div id="volume-control" class="slider-control">
                <label for="volume-slider">MASTER VOL</label>
                <input
                  id="volume-slider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  .value=${this.masterVolume}
                  @input=${this.handleMasterVolumeChange}
                />
              </div>
            </div>
            <div id="main-actions">
              <div id="record-controls">
                  <button 
                    @click=${this.toggleRecording}
                    class=${this.isRecording ? 'record-active' : ''}
                    title=${this.isRecording ? 'Stop Recording' : 'Record Session'}
                    ?disabled=${this.isGeneratingBeat}
                    >${this.isRecording ? 'STOP' : 'REC'}
                  </button>
                  ${this.downloadUrl ? html`
                    <a id="download-btn" class="button" .href=${this.downloadUrl} .download=${this.downloadFilename}>DOWNLOAD</a>
                  ` : ''}
              </div>
            </div>
          </div>
          <div id="track-area">
            ${this.renderTrackArea()}
          </div>
          ${this.renderAudioFxWindow()}
          ${this.renderAiToolsWindow()}
        </div>
      </div>
    `;
  }
  
  private renderSidebar() {
    const lowerCaseQuery = this.searchQuery.toLowerCase();
    const availablePrompts = [...this.allPrompts.values()]
      .filter(p => !this.activePromptIds.has(p.promptId) && (p.text.toLowerCase().includes(lowerCaseQuery) || p.category.toLowerCase().includes(lowerCaseQuery)))
      .sort((a, b) => a.text.localeCompare(b.text));
      
    if (availablePrompts.length === 0 && this.searchQuery) {
      return html`<div class="empty-state">No prompts found.</div>`;
    }

    const playIcon = html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>`;
    const stopIcon = html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"></path></svg>`;

    return availablePrompts.map(prompt => html`
      <div class="asset-item">
        <div class="asset-info" title=${prompt.text}>
            <div class="asset-color-swatch" style="background-color: ${prompt.color}"></div>
            <span>${prompt.text}</span>
        </div>
        <div class="asset-actions">
            <button 
                class="preview-btn ${this.previewingPromptId === prompt.promptId ? 'previewing' : ''}" 
                @click=${() => this.handlePreviewToggle(prompt.promptId)} 
                title=${this.previewingPromptId === prompt.promptId ? 'Stop preview' : `Preview ${prompt.text}`}
                ?disabled=${this.isGeneratingBeat}>
                ${this.previewingPromptId === prompt.promptId ? stopIcon : playIcon}
            </button>
            <button class="add-btn" @click=${() => this.addPrompt(prompt.promptId)} title="Add ${prompt.text} to tracks" ?disabled=${this.isGeneratingBeat}>+</button>
        </div>
      </div>
    `);
  }
  
  private renderTrackArea() {
    const activePrompts = [...this.allPrompts.values()].filter(p => this.activePromptIds.has(p.promptId));
    
    if (activePrompts.length === 0) {
      return html`<div class="empty-state">Add prompts from the sidebar or use the AI Beat Maker<br>to create a beat from a description.</div>`;
    }

    return activePrompts.map((prompt) => {
      return html`<prompt-controller
        .promptId=${prompt.promptId}
        ?filtered=${this.filteredPrompts.has(prompt.text)}
        .cc=${prompt.cc}
        .text=${prompt.text}
        .weight=${prompt.weight}
        .color=${prompt.color}
        .category=${prompt.category}
        .midiDispatcher=${this.midiDispatcher}
        ?showCC=${this.showMidi}
        .audioLevel=${this.audioLevel}
        @prompt-changed=${this.handlePromptChanged}
        @prompt-removed=${this.handlePromptRemoved}>
      </prompt-controller>`;
    });
  }

  private renderAiToolsWindow() {
    const windowClasses = classMap({
      'floating-window': true,
      minimized: this.isAiToolWindowMinimized,
      'help-open': !this.isAiToolWindowMinimized && this.showBeatMakerHelp
    });

    const isGenerateButtonDisabled = this.isGeneratingBeat || (this.activeAiTab === 'freestyle' && !this.beatMakerPromptText.trim()) || (this.activeAiTab === 'structured' && !this.beatMakerGenre.trim() && !this.beatMakerMood.trim() && !this.beatMakerInstruments.trim() && !this.beatMakerTempo.trim());

    let aiContent;
    if (this.activeAiTab === 'freestyle') {
        aiContent = html`
            <div class="ai-setting">
              <label for="beat-maker-prompt-input">Beat Description</label>
              <textarea
                  id="beat-maker-prompt-input"
                  class="ai-textarea"
                  placeholder="e.g., 'A simple, melancholic lo-fi hip hop beat with a mellow rhodes piano and some vinyl crackle.'"
                  .value=${this.beatMakerPromptText}
                  @input=${(e: Event) => this.beatMakerPromptText = (e.target as HTMLTextAreaElement).value}
                  ?disabled=${this.isGeneratingBeat}
              ></textarea>
            </div>`;
    } else {
        aiContent = html`
            <div class="ai-setting">
                <label for="beat-maker-genre">Genre</label>
                <input type="text" id="beat-maker-genre" class="ai-textarea" placeholder="e.g., Lo-fi Hip Hop, 90s Boom Bap" .value=${this.beatMakerGenre} @input=${(e: Event) => this.beatMakerGenre = (e.target as HTMLInputElement).value} ?disabled=${this.isGeneratingBeat} />
            </div>
            <div class="ai-setting">
                <label for="beat-maker-mood">Mood</label>
                <input type="text" id="beat-maker-mood" class="ai-textarea" placeholder="e.g., Melancholic, energetic, dark" .value=${this.beatMakerMood} @input=${(e: Event) => this.beatMakerMood = (e.target as HTMLInputElement).value} ?disabled=${this.isGeneratingBeat} />
            </div>
            <div class="ai-setting">
                <label for="beat-maker-instruments">Key Instruments</label>
                <input type="text" id="beat-maker-instruments" class="ai-textarea" placeholder="e.g., Rhodes piano, 808 x-bass, vinyl crackle" .value=${this.beatMakerInstruments} @input=${(e: Event) => this.beatMakerInstruments = (e.target as HTMLInputElement).value} ?disabled=${this.isGeneratingBeat} />
            </div>
            <div class="ai-setting">
                <label for="beat-maker-tempo">Tempo</label>
                <input type="text" id="beat-maker-tempo" class="ai-textarea" placeholder="e.g., Slow, 90 BPM, fast" .value=${this.beatMakerTempo} @input=${(e: Event) => this.beatMakerTempo = (e.target as HTMLInputElement).value} ?disabled=${this.isGeneratingBeat} />
            </div>
        `;
    }
    
    const mainContent = html`
        <div class="window-body">
            <div class="ai-tabs">
                <button 
                    class=${classMap({ 'ai-tab-btn': true, active: this.activeAiTab === 'freestyle' })}
                    @click=${() => this.activeAiTab = 'freestyle'}
                >Freestyle</button>
                <button 
                    class=${classMap({ 'ai-tab-btn': true, active: this.activeAiTab === 'structured' })}
                    @click=${() => this.activeAiTab = 'structured'}
                >Structured</button>
            </div>
            ${aiContent}
            <button
              class="ai-button"
              @click=${this.generateBeat}
              ?disabled=${isGenerateButtonDisabled}
            >
              ${this.isGeneratingBeat ? 'Generating...' : 'Generate Beat'}
            </button>
        </div>
    `;

    return html`
      <div id="ai-tool-window" class=${windowClasses}>
        <div class="window-header">
          <h3 @click=${this.toggleAiWindow} style="cursor: pointer; flex-grow: 1;">AI Beat Maker</h3>
          <div class="header-buttons">
            <button title="Prompting Tips" @click=${(e:Event) => { e.stopPropagation(); this.showBeatMakerHelp = !this.showBeatMakerHelp; }}>
              ${helpIcon}
            </button>
            <button title="Toggle Window" @click=${(e:Event) => { e.stopPropagation(); this.toggleAiWindow(); }}>
              ${this.isAiToolWindowMinimized ? '□' : '—'}
            </button>
          </div>
        </div>
        ${!this.isAiToolWindowMinimized && this.showBeatMakerHelp
          ? this.renderBeatMakerHelp()
          : !this.isAiToolWindowMinimized ? mainContent : ''
        }
      </div>
    `;
  }

  private renderBeatMakerHelp() {
    return html`
      <div id="beat-maker-help">
        <h4>Pro-Tips for Crafting Better Beats</h4>
        <ul>
          <li>
            <strong>Be Specific & Descriptive</strong>
            <p>The more detail you give, the better. Name the genre, mood, key instruments, and tempo.</p>
            <p class="example"><em>Instead of:</em> "sad piano"<br><em>Try:</em> "A x-slow, melancholic piano ballad with soft strings and rain sounds."</p>
          </li>
          <li>
            <strong>Experiment and Refine</strong>
            <p>Small changes in wording can make a big difference. Try swapping "funky" for "groovy", or "fast" for "uptempo" and see what you get.</p>
          </li>
          <li>
            <strong>Tell It What to Avoid</strong>
            <p>You can guide the AI by telling it what <em>not</em> to include in the prompt. For example, add "no drums" or "instrumental only, no vocals".</p>
          </li>
           <li>
            <strong>Use the Controls</strong>
            <p>Your prompt is just the start! Use the <strong>Audio Effects</strong> to fine-tune your sound in real-time.</p>
          </li>
        </ul>
        <button class="ai-button" @click=${() => this.showBeatMakerHelp = false}>Got it</button>
      </div>
    `;
  }

  private renderAudioFxWindow() {
    const { pitch, pan, reverb, delayTime, delayFeedback, isMono, is8D, isWindowMinimized, filterCutoff, filterResonance } = this.audioFxState;
    const windowClasses = classMap({ 
        'floating-window': true,
        minimized: isWindowMinimized,
        'pad-view-active': !isWindowMinimized && this.activeFxTab === 'pad'
    });
    
    return html`
        <div id="audio-fx-window" class=${windowClasses}>
            <div class="window-header">
                <h3 @click=${this.toggleFxWindow} style="cursor: pointer; flex-grow: 1;">Audio Effects</h3>
                <div class="header-buttons">
                    <button title="Toggle Window" @click=${(e:Event) => { e.stopPropagation(); this.toggleFxWindow(); }}>${isWindowMinimized ? '□' : '—'}</button>
                </div>
            </div>
            <div class="window-body">
                <div class="ai-tabs">
                     <button 
                        class=${classMap({ 'ai-tab-btn': true, active: this.activeFxTab === 'controls' })}
                        @click=${() => this.activeFxTab = 'controls'}
                    >Controls</button>
                    <button 
                        class=${classMap({ 'ai-tab-btn': true, active: this.activeFxTab === 'pad' })}
                        @click=${() => this.activeFxTab = 'pad'}
                    >Performance Pad</button>
                </div>

                ${this.activeFxTab === 'controls' ? html`
                    <div class="fx-content">
                        <div class="fx-setting">
                            <label for="pitch-slider">Pitch <span>${pitch.toFixed(2)}x</span></label>
                            <input id="pitch-slider" class="fx-slider" type="range" min="0.5" max="2" step="0.01" .value=${pitch} @input=${(e:Event) => this.handleFxChange('pitch', e)} />
                        </div>

                        <div class="fx-setting">
                            <label for="pan-slider">Stereo Pan <span>${pan === 0 ? 'C' : (pan > 0 ? `R ${Math.round(pan*100)}` : `L ${Math.round(Math.abs(pan)*100)}`)}</span></label>
                            <input id="pan-slider" class="fx-slider" type="range" min="-1" max="1" step="0.01" .value=${pan} ?disabled=${is8D} @input=${(e:Event) => this.handleFxChange('pan', e)} />
                        </div>
                        
                        <div class="fx-setting">
                            <label for="reverb-slider">Reverb <span>${Math.round(reverb*100)}%</span></label>
                            <input id="reverb-slider" class="fx-slider" type="range" min="0" max="1" step="0.01" .value=${reverb} @input=${(e:Event) => this.handleFxChange('reverb', e)} />
                        </div>
                        
                        <div class="fx-setting">
                            <label for="filter-cutoff-slider">Filter Cutoff <span>${filterCutoff.toFixed(2)}</span></label>
                            <input id="filter-cutoff-slider" class="fx-slider" type="range" min="0" max="1" step="0.01" .value=${filterCutoff} @input=${(e:Event) => this.handleFxChange('filterCutoff', e)} />
                        </div>

                        <div class="fx-setting">
                            <label for="filter-resonance-slider">Filter Resonance <span>${filterResonance.toFixed(2)}</span></label>
                            <input id="filter-resonance-slider" class="fx-slider" type="range" min="0" max="1" step="0.01" .value=${filterResonance} @input=${(e:Event) => this.handleFxChange('filterResonance', e)} />
                        </div>

                        <div class="fx-setting">
                            <label for="delay-time-slider">Delay Time <span>${delayTime.toFixed(2)}s</span></label>
                            <input id="delay-time-slider" class="fx-slider" type="range" min="0.01" max="1" step="0.01" .value=${delayTime} @input=${(e:Event) => this.handleFxChange('delayTime', e)} />
                        </div>
                        
                        <div class="fx-setting">
                            <label for="delay-feedback-slider">Delay Feedback <span>${Math.round(delayFeedback*100)}%</span></label>
                            <input id="delay-feedback-slider" class="fx-slider" type="range" min="0" max="0.95" step="0.01" .value=${delayFeedback} @input=${(e:Event) => this.handleFxChange('delayFeedback', e)} />
                        </div>

                        <div class="fx-buttons">
                            <button @click=${() => this.handleFxToggle('isMono')} class=${isMono ? 'active' : ''}>Mono</button>
                            <button @click=${() => this.handleFxToggle('is8D')} class=${is8D ? 'active' : ''}>8D Audio</button>
                        </div>
                    </div>
                ` : html`
                    <div class="fx-pad-wrapper">
                        <fx-pad @fx-changed=${this.handlePerfFxChange}></fx-pad>
                    </div>
                `}
            </div>
        </div>
    `;
  }
}
