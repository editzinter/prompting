/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Manages a chain of Web Audio API effects like Pan, Reverb, and Mono/Stereo switching.
 */
export class AudioEffects {
  public readonly input: GainNode;
  public readonly output: GainNode;

  private readonly audioContext: AudioContext;
  
  // Core components
  private panner: StereoPannerNode;
  private monoMerger: ChannelMergerNode;
  
  // Performance FX components
  private filter: BiquadFilterNode;

  // Delay Send
  private delay: DelayNode;
  private delayWetGain: GainNode;
  private delayFeedback: GainNode;

  // Reverb Send
  private reverbConvolver: ConvolverNode;
  private reverbWetGain: GainNode;

  // 8D Effect components
  private eightDConvolver: ConvolverNode;
  private eightDImpulseReverb: AudioBuffer;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode;
  private eightDWetGain: GainNode; // For cross-fading
  private eightDDryGain: GainNode; // For cross-fading

  // State
  private is8DEnabled = false;
  private isMono = false;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;

    this.input = audioContext.createGain();
    this.output = audioContext.createGain();

    // Core components
    this.panner = audioContext.createStereoPanner();
    this.monoMerger = audioContext.createChannelMerger(1);
    
    // Performance FX
    this.filter = audioContext.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = audioContext.sampleRate / 2;
    this.filter.Q.value = 1;

    // Delay Send Path
    this.delay = audioContext.createDelay(1.0); // Max 1 second delay
    this.delay.delayTime.value = 0.5;
    this.delayWetGain = audioContext.createGain();
    this.delayWetGain.gain.value = 0; // Starts dry
    this.delayFeedback = audioContext.createGain();
    this.delayFeedback.gain.value = 0.4;

    // Reverb Send Path
    this.reverbConvolver = audioContext.createConvolver();
    this.reverbConvolver.buffer = this.createReverbImpulse(2.0, 2.0); // duration, decay
    this.reverbWetGain = audioContext.createGain();
    this.reverbWetGain.gain.value = 0; // Starts dry

    // 8D Effect components
    this.eightDConvolver = audioContext.createConvolver();
    this.eightDImpulseReverb = this.createReverbImpulse(1.5, 2.0);
    this.eightDConvolver.buffer = this.eightDImpulseReverb;
    this.lfoGain = audioContext.createGain();
    this.lfoGain.gain.value = 1.0; // Pan range: -1 to 1

    this.eightDWetGain = this.audioContext.createGain();
    this.eightDWetGain.gain.value = 0; // Starts silent
    this.eightDDryGain = this.audioContext.createGain();
    this.eightDDryGain.gain.value = 1; // Starts at full volume

    // --- Build Connection Graph ---
    
    // 1. Input path (Mono switch -> Filter -> Panner)
    this.input.connect(this.filter);
    this.filter.connect(this.panner);
    
    // 2. From the Panner, we have the main "dry" path which allows for 8D crossfading
    this.panner.connect(this.eightDDryGain);
    this.eightDDryGain.connect(this.output);
    
    // 3. The panner also feeds the 8D "wet" path
    this.panner.connect(this.eightDConvolver);
    this.eightDConvolver.connect(this.eightDWetGain);
    this.eightDWetGain.connect(this.output);
    
    // 4. The panner also feeds the send effects (Delay and Reverb) which connect directly to the final output
    // Delay Send
    this.panner.connect(this.delayWetGain);
    this.delayWetGain.connect(this.delay);
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay); // Feedback loop
    this.delay.connect(this.output);

    // Reverb Send
    this.panner.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.output);
  }

  public setPan(value: number) {
    if (this.is8DEnabled) return; // Don't allow manual pan when 8D is on
    this.panner.pan.setTargetAtTime(value, this.audioContext.currentTime, 0.05);
  }

  public setMono(isMono: boolean) {
    if (isMono === this.isMono) return;
    this.isMono = isMono;

    this.input.disconnect();
    if (this.isMono) {
      this.input.connect(this.monoMerger);
      this.monoMerger.connect(this.filter);
    } else {
      if (this.monoMerger.numberOfInputs > 0) {
        this.monoMerger.disconnect(this.filter);
      }
      this.input.connect(this.filter);
    }
  }

  public toggle8D(enabled: boolean) {
    if (this.is8DEnabled === enabled) return;
    this.is8DEnabled = enabled;
    
    const FADE_TIME = 0.2; // 200ms fade to prevent clicks
    const now = this.audioContext.currentTime;

    if (enabled) {
      // Fade out dry signal, fade in wet signal
      this.eightDDryGain.gain.linearRampToValueAtTime(0, now + FADE_TIME);
      this.eightDWetGain.gain.linearRampToValueAtTime(1, now + FADE_TIME);

      if (!this.lfo) {
        this.lfo = this.audioContext.createOscillator();
        this.lfo.type = 'sine';
        this.lfo.frequency.value = 0.1; // Slow rotation
        this.lfo.connect(this.lfoGain);
        this.lfoGain.connect(this.panner.pan);
        this.lfo.start();
      }
    } else {
      // Fade in dry signal, fade out wet signal
      this.eightDDryGain.gain.linearRampToValueAtTime(1, now + FADE_TIME);
      this.eightDWetGain.gain.linearRampToValueAtTime(0, now + FADE_TIME);
      
      if (this.lfo) {
        this.lfo.stop(now + FADE_TIME);
        this.lfo.disconnect();
        this.lfo = null;
      }
      // Restore pan to center after fade
      this.panner.pan.cancelScheduledValues(now);
      this.panner.pan.setTargetAtTime(0, now + FADE_TIME, 0.1);
    }
  }
  
  public setFilterCutoff(value: number) { // value is 0-1
    const minFreq = 40;
    const maxFreq = this.audioContext.sampleRate / 2;
    // Logarithmic scale is more musical
    const freq = minFreq * Math.pow(maxFreq / minFreq, value);
    this.filter.frequency.setTargetAtTime(freq, this.audioContext.currentTime, 0.05);
  }

  public setFilterResonance(value: number) { // value is 0-1
    const minQ = 0.1;
    const maxQ = 20;
    // Linear mapping is fine for Q
    const qValue = minQ + value * (maxQ - minQ);
    this.filter.Q.setTargetAtTime(qValue, this.audioContext.currentTime, 0.05);
  }

  // Set delay wet/dry mix (for performance pad)
  public setDelay(value: number) { // value is 0-1
    this.delayWetGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.05);
  }

  // Set reverb wet/dry mix
  public setReverb(value: number) { // value is 0-1
    this.reverbWetGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.05);
  }

  public setDelayTime(value: number) { // value is in seconds
    this.delay.delayTime.setTargetAtTime(value, this.audioContext.currentTime, 0.05);
  }

  public setDelayFeedback(value: number) { // value is 0-1
    this.delayFeedback.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.05);
  }

  private createReverbImpulse(duration: number, decay: number): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const numSamples = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(2, numSamples, sampleRate);

    for (let c = 0; c < 2; c++) {
      const channelData = buffer.getChannelData(c);
      for (let i = 0; i < numSamples; i++) {
        channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / numSamples, decay);
      }
    }
    return buffer;
  }
}