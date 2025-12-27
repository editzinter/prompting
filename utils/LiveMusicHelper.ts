
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import type { PlaybackState, Prompt } from '../types';
import { GoogleGenAI, AudioChunk, LiveMusicFilteredPrompt, LiveMusicServerMessage, LiveMusicSession } from '@google/genai';
import { decode, decodeAudioData } from './audio';
import { throttle } from './throttle';
import { AudioEffects } from './AudioEffects';

export class LiveMusicHelper extends EventTarget {

  private model: string;
  private session: LiveMusicSession | null = null;
  private sessionPromise: Promise<LiveMusicSession> | null = null;

  private filteredPrompts = new Set<string>();
  private nextStartTime = 0;
  private bufferTime = 2.5; // Slightly increased for stability

  public readonly audioContext: AudioContext;
  public extraDestination: AudioNode | null = null;

  private outputNode: GainNode;
  private masterVolumeNode: GainNode;
  private playbackState: PlaybackState = 'stopped';

  private prompts: Map<string, Prompt>;

  // Recording properties
  public isRecording = false;
  private mediaRecorder: MediaRecorder | null = null;
  private streamDestination: MediaStreamAudioDestinationNode | null = null;
  private recordedChunks: Blob[] = [];

  // Effects properties
  private audioEffects: AudioEffects;
  public playbackRate = 1.0;

  // Reconnection properties
  private isTryingToConnectOrPlay = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(model: string) {
    super();
    this.model = model;
    this.prompts = new Map();
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    this.outputNode = this.audioContext.createGain();
    this.masterVolumeNode = this.audioContext.createGain();
    this.masterVolumeNode.gain.value = 0.8;

    this.audioEffects = new AudioEffects(this.audioContext);
    this.outputNode.connect(this.audioEffects.input);
    this.audioEffects.output.connect(this.masterVolumeNode);
  }

  private async connect(): Promise<LiveMusicSession> {
    // Create a fresh instance of GoogleGenAI to ensure current API Key is used
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    this.sessionPromise = ai.live.music.connect({
      model: this.model,
      callbacks: {
        // Removed onopen as it's not supported by LiveMusicCallbacks type
        onmessage: async (e: LiveMusicServerMessage) => {
          if (e.setupComplete) {
            this.reconnectAttempts = 0;
          }
          if (e.filteredPrompt) {
            this.filteredPrompts = new Set([...this.filteredPrompts, e.filteredPrompt.text!])
            this.dispatchEvent(new CustomEvent<LiveMusicFilteredPrompt>('filtered-prompt', { detail: e.filteredPrompt }));
          }
          if (e.serverContent?.audioChunks) {
            // Process ALL chunks in the message to prevent audio stuttering/skipping
            for (const chunk of e.serverContent.audioChunks) {
              await this.processAudioChunk(chunk);
            }
          }
        },
        onerror: (err) => {
          console.error("Live music connection error:", err);
          this.handleDisconnection();
        },
        onclose: () => {
          console.debug('Live music connection closed');
          this.handleDisconnection();
        },
      },
    });

    return this.sessionPromise;
  }

  private handleDisconnection() {
    const wasTrying = this.isTryingToConnectOrPlay;
    this.session = null;
    this.sessionPromise = null;
    
    if (wasTrying && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.setPlaybackState('loading');
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 8000);
      
      this.dispatchEvent(new CustomEvent('error', { detail: `Connection interrupted. Retrying... (${this.reconnectAttempts}/${this.maxReconnectAttempts})` }));
      
      setTimeout(() => {
        if (this.isTryingToConnectOrPlay) {
          this.play();
        }
      }, delay);
    } else if (wasTrying) {
      this.dispatchEvent(new CustomEvent('error', { detail: 'Unable to maintain connection. Please check your network and try again.' }));
      this.stop();
    }
  }

  private setPlaybackState(state: PlaybackState) {
    this.playbackState = state;
    this.dispatchEvent(new CustomEvent('playback-state-changed', { detail: state }));
  }

  private async processAudioChunk(chunk: AudioChunk) {
    if (this.playbackState === 'paused' || this.playbackState === 'stopped' || !chunk.data) return;
    
    const audioBuffer = await decodeAudioData(
      decode(chunk.data),
      this.audioContext,
      48000,
      2,
    );
    
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = this.playbackRate;
    source.connect(this.outputNode);
    
    const now = this.audioContext.currentTime;
    
    if (this.nextStartTime < now - 0.5) {
      // Re-synchronize if we've fallen significantly behind
      this.nextStartTime = now + 0.1;
    }

    if (this.playbackState === 'loading') {
      this.nextStartTime = now + this.bufferTime;
      setTimeout(() => {
        if (this.playbackState === 'loading') {
          this.setPlaybackState('playing');
        }
      }, this.bufferTime * 1000);
    }

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  public get activePrompts() {
    return Array.from(this.prompts.values())
      .filter((p) => {
        return !this.filteredPrompts.has(p.text) && p.weight > 0;
      })
  }

  public readonly setWeightedPrompts = throttle(async (prompts: Map<string, Prompt>) => {
    this.prompts = prompts;
    if (!this.session) return;

    try {
      await this.session.setWeightedPrompts({
        weightedPrompts: this.activePrompts,
      });
    } catch (e: any) {
      console.warn("Error setting prompts:", e);
    }
  }, 150);

  public async play() {
    this.isTryingToConnectOrPlay = true;
    if (this.activePrompts.length === 0) {
      this.dispatchEvent(new CustomEvent('error', { detail: 'Add an active prompt to start music.' }));
      this.isTryingToConnectOrPlay = false;
      return;
    }
    
    try {
        this.setPlaybackState('loading');
        this.session = await this.connect();
        
        if (!this.isTryingToConnectOrPlay) {
          this.stop();
          return;
        }
        
        await this.setWeightedPrompts(this.prompts);
        this.audioContext.resume();
        this.session.play();
    
        this.masterVolumeNode.connect(this.audioContext.destination);
        if (this.extraDestination) this.masterVolumeNode.connect(this.extraDestination);
        
        this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.2);
    } catch(e) {
        console.error("Session start error:", e);
        this.handleDisconnection();
    }
  }

  public pause() {
    this.isTryingToConnectOrPlay = false;
    if (this.isRecording) this.stopRecording();
    if (this.session) this.session.pause();
    this.setPlaybackState('paused');
    this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
    this.nextStartTime = 0;
  }

  public stop() {
    this.isTryingToConnectOrPlay = false;
    if (this.isRecording) this.stopRecording();
    if (this.session) {
      try { this.session.stop(); } catch(e) {}
    }
    this.setPlaybackState('stopped');
    this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.nextStartTime = 0;
    this.session = null;
    this.sessionPromise = null;
  }

  public async playPause() {
    switch (this.playbackState) {
      case 'playing':
        this.pause();
        break;
      case 'paused':
      case 'stopped':
        this.play();
        break;
      case 'loading':
        this.stop();
        break;
    }
  }

  public startRecording() {
    if (this.isRecording || this.playbackState !== 'playing') {
      return;
    }
    this.streamDestination = this.audioContext.createMediaStreamDestination();
    this.masterVolumeNode.connect(this.streamDestination);
    const mimeType = 'audio/webm';
    this.mediaRecorder = new MediaRecorder(this.streamDestination.stream, { mimeType });
    this.recordedChunks = [];
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.recordedChunks.push(event.data);
    };
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      this.dispatchEvent(new CustomEvent('recording-finished', { detail: { blob, prompts: this.activePrompts.map(p => p.text) } }));
      this.isRecording = false;
      this.dispatchEvent(new CustomEvent('recording-state-changed', { detail: { isRecording: false } }));
    };
    this.mediaRecorder.start();
    this.isRecording = true;
    this.dispatchEvent(new CustomEvent('recording-state-changed', { detail: { isRecording: true } }));
  }
  
  public stopRecording() {
    if (this.mediaRecorder) this.mediaRecorder.stop();
  }

  public setMasterVolume(volume: number) {
    this.masterVolumeNode.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.05);
  }

  public setPlaybackRate(rate: number) { this.playbackRate = rate; }
  public setPan(pan: number) { this.audioEffects.setPan(pan); }
  public toggle8D(enabled: boolean) { this.audioEffects.toggle8D(enabled); }
  public setMono(isMono: boolean) { this.audioEffects.setMono(isMono); }
  public setFilterCutoff(value: number) { this.audioEffects.setFilterCutoff(value); }
  public setFilterResonance(value: number) { this.audioEffects.setFilterResonance(value); }
  public setDelay(value: number) { this.audioEffects.setDelay(value); }
  public setReverb(value: number) { this.audioEffects.setReverb(value); }
  public setDelayTime(value: number) { this.audioEffects.setDelayTime(value); }
  public setDelayFeedback(value: number) { this.audioEffects.setDelayFeedback(value); }
}
