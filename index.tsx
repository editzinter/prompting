
/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlaybackState, Prompt } from './types';
import { GoogleGenAI, LiveMusicFilteredPrompt } from '@google/genai';
import { PromptDjMidi } from './components/PromptDjMidi';
import { ToastMessage } from './components/ToastMessage';
import { LiveMusicHelper } from './utils/LiveMusicHelper';
import { AudioAnalyser } from './utils/AudioAnalyser';

const initialModel = 'lyria-realtime-exp';

function main() {
  // Use the API key from the environment directly
  initApp();
}

function initApp() {
  const initialPrompts = buildInitialPrompts();
  const liveMusicHelper = new LiveMusicHelper(initialModel);
  // Correctly initialize GoogleGenAI with a named parameter
  const dummyAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const pdjMidi = new PromptDjMidi(initialPrompts, dummyAi, PROMPT_DEFINITIONS, liveMusicHelper);
  // Cast to any to resolve Node compatibility issues in this environment
  document.body.appendChild(pdjMidi as any);

  const toastMessage = new ToastMessage();
  // Cast to any to resolve Node compatibility issues in this environment
  document.body.appendChild(toastMessage as any);

  liveMusicHelper.setWeightedPrompts(new Map());

  const audioAnalyser = new AudioAnalyser(liveMusicHelper.audioContext);
  liveMusicHelper.extraDestination = audioAnalyser.node;
  
  // Bloom effect state
  let bloomActive = false;
  let activeBloomColors = ['#3498db', '#2ecc71'];

  // Cast to any to resolve EventTarget compatibility issues
  (pdjMidi as any).addEventListener('prompts-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<Map<string, Prompt>>;
    const prompts = customEvent.detail;
    liveMusicHelper.setWeightedPrompts(prompts);
    const newColors = pdjMidi.getActivePromptColors();
    if (newColors && newColors.length > 0) {
      activeBloomColors = newColors;
    }
  }));

  // Recording listeners
  // Cast to any to resolve EventTarget compatibility issues
  (pdjMidi as any).addEventListener('toggle-recording', () => {
    if (liveMusicHelper.isRecording) {
      liveMusicHelper.stopRecording();
    } else {
      liveMusicHelper.startRecording();
    }
  });

  liveMusicHelper.addEventListener('recording-state-changed', (e) => {
    const { isRecording } = (e as CustomEvent<{isRecording: boolean}>).detail;
    pdjMidi.isRecording = isRecording;
  });

  liveMusicHelper.addEventListener('recording-finished', (e) => {
    const { blob, prompts } = (e as CustomEvent<{blob: Blob, prompts: string[]}>).detail;
    pdjMidi.setDownload(blob, prompts);
  });

  liveMusicHelper.addEventListener('playback-state-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<PlaybackState>;
    const playbackState = customEvent.detail;
    pdjMidi.playbackState = playbackState;
    if (playbackState === 'playing') {
        audioAnalyser.start();
        bloomActive = true;
    } else {
        audioAnalyser.stop();
        bloomActive = false;
        document.body.style.setProperty('--bloom-opacity', '0');
    }
  }));

  liveMusicHelper.addEventListener('filtered-prompt', ((e: Event) => {
    const customEvent = e as CustomEvent<LiveMusicFilteredPrompt>;
    const filteredPrompt = customEvent.detail;
    toastMessage.show(filteredPrompt.filteredReason!)
    pdjMidi.addFilteredPrompt(filteredPrompt.text!);
  }));

  const errorToast = ((e: Event) => {
    const customEvent = e as CustomEvent<string>;
    const error = customEvent.detail;
    toastMessage.show(error);
  });

  liveMusicHelper.addEventListener('error', errorToast);
  // Cast to any to resolve EventTarget compatibility issues
  (pdjMidi as any).addEventListener('error', errorToast);

  audioAnalyser.addEventListener('audio-level-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<number>;
    const level = customEvent.detail;
    pdjMidi.audioLevel = level;

    if (bloomActive) {
      const opacity = Math.min(0.1 + level * 2.5, 0.7);
      const intensity1 = 1 + level * 25;
      const spread1 = 0.5 + level * 10;
      const intensity2 = 2 + level * 40;
      const spread2 = 1 + level * 20;
      
      const color1 = activeBloomColors[0] || PALETTE[0];
      let color2;
      if (activeBloomColors.length > 1) {
          color2 = activeBloomColors[1];
      } else if (activeBloomColors.length === 1) {
          const idx = PALETTE.indexOf(color1);
          color2 = PALETTE[(idx + 5) % PALETTE.length]; 
      } else {
          color2 = PALETTE[2];
      }

      document.body.style.setProperty('--bloom-opacity', `${opacity}`);
      document.body.style.setProperty('--bloom-color-1', color1);
      document.body.style.setProperty('--bloom-color-2', color2);
      document.body.style.setProperty('--bloom-shadow', `
        inset 0 0 ${intensity1}vw ${spread1}vw var(--bloom-color-1), 
        inset 0 0 ${intensity2}vw ${spread2}vw var(--bloom-color-2)
      `);
    }
  }));
}

const PALETTE = ['#3498db', '#2ecc71', '#9b59b6', '#f1c40f', '#e67e22', '#e74c3c', '#1abc9c', '#34495e', '#ecf0f1', '#7f8c8d', '#f39c12', '#d35400', '#c0392b', '#16a085', '#27ae60', '#2980b9', '#8e44ad', '#bdc3c7', '#5dade2', '#58d68d', '#af7ac5', '#f4d03f', '#eb984e', '#edbb99', '#a3e4d7', '#d2b4de', '#f5b7b1'];

const PROMPT_DEFINITIONS: { text: string, category: string }[] = [
  { text: 'A wistful neo-soul ballad at 75 BPM with a warm Rhodes piano, a deep pocket bassline, and crisp, laid-back drums, featuring sparse, shimmering string pads.', category: 'R&B / Soul Genre' },
  { text: 'An aggressive cyberpunk track at 150 BPM with a distorted synthesizer bass, glitched-out drum machine, and pulsing, neon-drenched synth arpeggios.', category: 'Electronic Genre' },
  { text: 'A melancholic and introspective acoustic folk piece at 90 BPM, featuring a fingerpicked acoustic guitar, a mournful cello melody, and the gentle sound of falling rain.', category: 'Folk Genre' },
  { text: 'A tense and epic cinematic chase scene at 160 BPM, with driving staccato strings, thunderous taiko drums, and heroic brass stabs, building in intensity.', category: 'Cinematic Genre' },
  { text: 'A hypnotic and meditative drone piece featuring deep, resonant Mongolian throat singing, layered with slow, evolving atmospheric synth pads and no percussion.', category: 'Mood' },
  { text: 'Classic 90s boom bap hip hop beat with a dusty sample and hard-hitting drums', category: 'Hip Hop Genre' },
  { text: 'Modern trap beat at 140 BPM with deep 808s, fast hi-hat rolls, and a dark synth melody', category: 'Hip Hop Genre' },
  { text: 'Chill, introspective lo-fi hip hop for studying, with a gentle piano, vinyl crackle, and soft rainfall', category: 'Hip Hop Genre' },
  { text: 'Ethereal and dreamy cloud rap beat with washed-out synth pads and spaced-out vocal chops', category: 'Hip Hop Genre' },
  { text: 'Aggressive and distorted rage trap beat with heavy 808s and chaotic synth leads', category: 'Hip Hop Genre' },
  { text: 'Minimalist and bouncy Plugg music with simple, catchy synth melodies and a clean 808', category: 'Hip Hop Genre' },
  { text: 'Classic West Coast G-Funk with a whiny Moog synth lead and a funky bassline', category: 'Hip Hop Genre' },
  { text: 'Dark and menacing UK Drill beat with sliding 808s and complex, syncopated percussion', category: 'Hip Hop Genre' },
  { text: 'High-energy Jersey Club beat with a signature kick pattern and vocal chops', category: 'Hip Hop Genre' },
  { text: 'Distorted and aggressive Phonk drift house with a heavy cowbell melody and a saturated bass', category: 'Hip Hop Genre' },
  { text: 'Jazzy and conscious hip hop with an upright bass, smooth electric piano, and a laid-back beat, 90s style', category: 'Hip Hop Genre' },
  { text: 'Dark and gritty UK Grime beat at 140 BPM with square wave bass sounds and aggressive energy', category: 'Hip Hop Genre' },
  { text: 'Upbeat and bouncy New Orleans Bounce music with a "Triggerman" beat and call-and-response chants', category: 'Hip Hop Genre' },
  { text: 'Boom Bap drum loop with a crisp snare and a kick drum with punch', category: 'Hip Hop Drums' },
  { text: 'Hard-hitting trap drum pattern with rapid-fire hi-hat rolls and a snappy clap', category: 'Hip Hop Drums' },
  { text: 'Punchy 808 snare', category: 'Hip Hop Drums' },
  { text: 'Crisp 808 hi-hat pattern', category: 'Hip Hop Drums' },
  { text: 'Reverb-heavy 808 clap', category: 'Hip Hop Drums' },
  { text: 'Deep sub-rattling 808 bass pattern with a long decay, suitable for trap', category: 'Hip Hop Bass' },
  { text: 'Clean and punchy 808 bass, tuned to C', category: 'Hip Hop Bass' },
  { text: 'Gliding and sliding 808 bassline, characteristic of UK Drill music', category: 'Hip Hop Bass' },
  { text: 'A catchy, memorable cowbell melody loop in a Memphis rap style', category: 'Hip Hop Melodic' },
  { text: 'A chopped and rearranged soul vocal sample, creating a new, soulful melody', category: 'Hip Hop Melodic' },
  { text: 'Mellow and warm Rhodes electric piano chords, perfect for a chill hip hop track', category: 'Hip Hop Keys' },
  { text: 'A dark, melancholic piano melody with sparse notes, suitable for a trap beat', category: 'Hip Hop Keys' },
  { text: 'Atmospheric vinyl crackle and hiss from an old record player', category: 'Hip Hop FX' },
  { text: 'Classic turntable scratches and baby scratches performed by a DJ', category: 'Hip Hop FX' },
  { text: 'A reversed x-cymbal swell, used as a transition effect', category: 'Hip Hop FX' },
  { text: 'A set of modern rap ad-libs like "yeah", "uh", "let\'s go"', category: 'Vocal Textures' },
  { text: 'Smoky late-night jazz trio with a walking upright bass, gentle brush drums, and a melancholic piano solo', category: 'Jazz Genre' },
  { text: 'Upbeat and energetic Bebop jazz ensemble featuring a rapid trumpet solo and complex rhythms', category: 'Jazz Genre' },
  { text: 'Funky 70s jazz fusion with a groovy electric piano, slap bass, and a tight drum break', category: 'Jazz Genre' },
  { text: 'Cool and relaxed jazz with a mellow tenor saxophone lead and soft piano comping', category: 'Jazz Genre' },
  { text: 'A classic walking bassline on an upright bass, providing a steady harmonic foundation', category: 'Jazz Bass' },
  { text: 'A virtuosic and melodic fretless electric bass solo in the style of Jaco Pastorius', category: 'Jazz Bass' },
  { text: 'A smooth and soulful saxophone solo with long, expressive notes', category: 'Jazz Melodic' },
  { text: 'A muted trumpet solo, creating a cool and intimate atmosphere in the style of Miles Davis', category: 'Jazz Brass' },
  { text: 'A lively, syncopated ragtime piano solo', category: 'Jazz Keys' },
  { text: 'Improvised scat vocal melody with nonsensical syllables', category: 'Vocal Textures' },
  { text: 'The sound of a drummer playing with brushes on a snare, creating a soft, shuffling rhythm', category: 'Jazz Drums' },
  { text: 'A swinging big band brass section with tight, powerful horn stabs', category: 'Jazz Brass' },
  { text: 'A warm and clean electric guitar melody in the style of Wes Montgomery, played with octaves', category: 'Jazz Melodic' },
  { text: 'Upbeat 70s funk band with a tight pocket groove, prominent slap bass, and a powerful horn section', category: 'Funk Genre' },
  { text: 'A percussive and groovy slap bass riff that drives the song', category: 'Funk Bass' },
  { text: 'A rhythmic, "wacka-wacka" wah-wah guitar riff, quintessential for funk', category: 'Funk Guitar' },
  { text: 'The iconic "Funky Drummer" breakbeat by Clyde Stubblefield', category: 'Funk Drums' },
  { text: 'Short, powerful brass section stabs that add excitement', category: 'Funk Brass' },
  { text: 'A percussive and rhythmic Clavinet melody in the style of Stevie Wonder', category: 'Funk Keys' },
  { text: 'A group of conga drums playing a syncopated, groovy rhythm', category: 'Funk Percussion' },
  { text: 'A squelchy and futuristic P-Funk synthesizer lead, in the style of Bernie Worrell', category: 'Funk Synth' },
  { text: 'A vocal melody processed through a talk box effect, making the voice sound like an instrument', category: 'Vocal Textures' },
  { text: 'A vocal grunt in the style of James Brown', category: 'Vocal Textures' },
  { text: 'A rainy day lo-fi beat with a gentle, muffled piano melody, soft tape hiss, and a dusty drum loop', category: 'Lo-fi Genre' },
  { text: 'Cozy and nostalgic lo-fi with a warbling electric piano, kalimba melody, and sounds of turning pages', category: 'Lo-fi Genre' },
  { text: 'The sound of gentle rain falling, perfect for creating a relaxing atmosphere', category: 'Lo-fi FX' },
  { text: 'The warm hiss and noise from an old x-cassette tape', category: 'Lo-fi FX' },
  { text: 'A synthesizer pad with a gentle, wavering pitch, creating a wobbly, nostalgic feel', category: 'Lo-fi Synth' },
  { text: 'A simple, relaxed electric guitar melody with a clean tone and a hint of reverb', category: 'Lo-fi Melodic' },
  { text: 'A sentimental upright piano melody with a soft, felted sound', category: 'Lo-fi Keys' },
  { text: 'The sound effect of a vinyl record stopping abruptly', category: 'Lo-fi FX' },
  { text: 'A gentle and charming kalimba melody', category: 'Lo-fi Melodic' },
  { text: 'Driving, hypnotic Berlin techno groove at 135 BPM with a rumbling kick and atmospheric pads', category: 'Electronic Genre' },
  { text: 'Classic Chicago house track with a soulful vocal sample, upright piano chords, and a 909 drum machine beat', category: 'Electronic Genre' },
  { text: 'Euphoric, uplifting trance anthem at 140 BPM with soaring supersaw chords, a driving bassline, and a gated vocal pad', category: 'Trance Genre' },
  { text: 'High-energy drum and bass with a complex, chopped amen break, a deep reese bassline, and atmospheric jungle pads', category: 'Electronic Genre' },
  { text: 'Smooth, soulful liquid drum and bass with a rolling sub-bass, jazzy piano chords, and a clean breakbeat', category: 'Electronic Genre' },
  { text: 'Aggressive, heavy dubstep with a robotic wobble bass, syncopated drums, and jarring sound effects', category: 'Electronic Genre' },
  { text: 'Nostalgic 80s synthwave with retro gated reverb drums, a soaring synth lead, and a pulsating arpeggiated bassline', category: 'Electronic Genre' },
  { text: 'Ethereal, atmospheric ambient soundscape with evolving pads, no percussion, designed for deep listening', category: 'Electronic Genre' },
  { text: 'Glitchy and chaotic hyperpop with distorted 808s, x-sped-up vocal chops, and bright, bubbly synth melodies', category: 'Pop Genre' },
  { text: 'Hypnotic and rolling psytrance at 145 BPM with a galloping bassline and trippy, psychedelic synth effects', category: 'Electronic Genre' },
  { text: 'Minimal and groovy tech house with a punchy kick, a catchy bassline, and quirky percussion elements', category: 'Electronic Genre' },
  { text: 'Dark and brooding industrial techno with distorted textures, metallic percussion, and an EBM bassline', category: 'Electronic Genre' },
  { text: 'Relaxed and soulful trip-hop with a x-slow breakbeat, a moody bassline, and a sampled jazz piano', category: 'Electronic Genre' },
  { text: 'Old-school 8-bit chiptune video game music with simple square wave melodies and arpeggios', category: 'Electronic Genre' },
  { text: 'High-energy hardstyle with a distorted, pitched kick drum and a euphoric, anthemic synthesizer melody', category: 'Electronic Genre' },
  { text: 'Dreamy and introspective future garage with shuffled hi-hats, deep sub-bass, and pitched vocal samples', category: 'Electronic Genre' },
  { text: 'Futuristic and bass-heavy neurofunk with intricate drum patterns and complex, technical bass sound design', category: 'Electronic Genre' },
  { text: 'Sample-heavy French House with a filtered bassline and a four-on-the-floor beat, 90s style', category: 'Electronic Genre' },
  { text: 'Uplifting future bass with wide supersaw chords, pitch-bent vocal chops, and a complex rhythm', category: 'Electronic Genre' },
  { text: 'Aggressive Dutch Hardcore Gabber at 180 BPM with a heavily distorted 909 kick drum', category: 'Electronic Genre' },
  { text: 'Aesthetic and melancholic Vaporwave with x-slowed-down 80s samples, lush pads, and a feeling of nostalgia', category: 'Electronic Genre' },
  { text: 'Chaotic and frenetic Breakcore with rapidly spliced Amen breaks and distorted synth stabs', category: 'Electronic Genre' },
  { text: 'Dark and occult-themed Witch House with slow, heavy beats, droning synths, and pitched-down vocal samples', category: 'Electronic Genre' },
  { text: 'Deep and hypnotic ambient techno with spacious reverb, subtle textures, and a soft, continuous kick', category: 'Electronic Genre' },
  { text: 'A powerful, rumbling techno kick drum, hitting on every beat', category: 'Electronic Drums' },
  { text: 'The classic Amen Break, chopped and rearranged at a high tempo', category: 'Electronic Drums' },
  { text: 'A heavy, growling dubstep bass synth with complex modulation (FM, wavetable)', category: 'Electronic Bass' },
  { text: 'A deep and evolving Reese bassline, created by two detuned sawtooth waves, for Drum & Bass', category: 'Electronic Bass' },
  { text: 'Liquid drum and bass reese bass', category: 'Electronic Bass' },
  { text: 'An iconic, squelchy, and resonant acid bassline from a TB-303 synthesizer', category: 'Electronic Bass' },
  { text: 'Classic TB-303 acid bassline with high resonance', category: 'Electronic Bass' },
  { text: 'Bright, layered supersaw chords, a staple of trance and future bass music', category: 'Electronic Melodic' },
  { text: 'A classic "hoover" synth sound, aggressive and detuned, from an Alpha Juno synthesizer', category: 'Electronic Synth' },
  { text: 'A gated synthesizer pad, creating a rhythmic, pulsating texture, classic 80s and trance sound', category: 'Electronic Synth' },
  { text: 'A rolling, off-beat psytrance bassline pattern', category: 'Electronic Bass' },
  { text: 'A distorted and punchy gabber kick drum at a very high tempo', category: 'Electronic Drums' },
  { text: 'Spacey and delayed dub techno with echoing chord stabs and a deep, subby kick drum', category: 'Electronic Melodic' },
  { text: 'IDM (Intelligent Dance Music) with complex, glitchy, and unpredictable rhythmic patterns', category: 'Electronic Drums' },
  { text: 'A bleeping and blooping modular synthesizer sequence with a random, generative feel', category: 'Electronic Synth' },
  { text: 'A hard-hitting neurofunk bass growl with intricate filter modulation', category: 'Electronic Bass' },
  { text: 'A single, sustained, evolving ambient drone pad for texture', category: 'Electronic Synth' },
  { text: 'Ambient drone texture', category: 'Electronic Synth' },
  { text: 'High-energy 90s alternative rock with fuzzy, distorted guitars, a driving x-bassline, and powerful drums', category: 'Rock Genre' },
  { text: 'Jangly and upbeat indie rock with clean, x-chorus-effected guitars and a simple, catchy melody', category: 'Rock Genre' },
  { text: 'Dark and atmospheric post-punk with a prominent, melodic bassline, angular guitars, and a robotic drum machine', category: 'Rock Genre' },
  { text: 'Swirling and ethereal shoegaze with layers of distorted, x-reverb-drenched guitars creating a wall of sound', category: 'Rock Genre' },
  { text: 'Fast, aggressive, and palm-muted thrash metal riff with double-bass drumming', category: 'Metal Genre' },
  { text: 'Brutal and guttural death metal with lightning-fast blast beat drums and x-low-tuned, heavily distorted guitars', category: 'Metal Genre' },
  { text: 'A polyrhythmic and rhythmically complex "djent" guitar riff with a heavily distorted, tight sound', category: 'Metal Guitar' },
  { text: 'A slow, heavy, and down-tuned sludge metal riff with a fuzzy, distorted x-bass guitar', category: 'Metal Genre' },
  { text: 'Fast and energetic pop-punk with simple power chords and an upbeat drum feel', category: 'Rock Genre' },
  { text: 'Classic 70s rock with a bluesy guitar riff, a Hammond organ, and a cowbell', category: 'Rock Genre' },
  { text: 'Slow, heavy, and fuzzy stoner rock with a hypnotic, repetitive guitar riff', category: 'Rock Genre' },
  { text: 'Raw, atmospheric black metal with high-pitched shrieking vocals and fast x-tremolo-picked guitars', category: 'Metal Genre' },
  { text: 'Progressive metal with complex time signatures, technical guitar solos, and intricate song structures', category: 'Metal Genre' },
  { text: 'A wall of sound effect created by multiple layers of fuzzy, distorted, and sustained guitars', category: 'Rock Guitar' },
  { text: 'A death metal blast beat with rapid-fire kick and snare drums', category: 'Metal Drums' },
  { text: 'Twangy surf rock guitar with heavy spring reverb', category: 'Rock Guitar' },
  { text: 'Gritty and raw Delta blues with a lone acoustic slide guitar and a soulful vocal', category: 'Blues Genre' },
  { text: 'Electrified Chicago blues band with a harmonica solo, driving rhythm section, and an electric guitar lead', category: 'Blues Genre' },
  { text: 'Modern country rock anthem with twangy telecaster guitars, a powerful female vocal, and a hard-hitting backbeat', category: 'Country Genre' },
  { text: 'Upbeat and x-fast-paced bluegrass with rapid banjo picking, fiddle melodies, and acoustic guitar strumming', category: 'Folk Genre' },
  { text: 'Traditional Appalachian folk music featuring a clawhammer banjo and a mournful fiddle', category: 'Folk Genre' },
  { text: 'Classic roots reggae with a one-drop drum beat, a deep bassline, and a rhythmic guitar skank', category: 'World Genre' },
  { text: 'Driving and energetic Afrobeat with a complex rhythm section, a horn section, and a funky guitar line', category: 'World Genre' },
  { text: 'A modern, percussive Amapiano track with a signature log drum bassline, shakers, and jazzy piano chords', category: 'World Genre' },
  { text: 'A romantic and smooth Bossa Nova with a gentle nylon string guitar, soft percussion, and a whispered vocal melody', category: 'World Genre' },
  { text: 'Energetic and festive salsa music with a syncopated piano montuno, powerful brass stabs, and a full Latin percussion section', category: 'World Genre' },
  { text: 'A passionate and rhythmic flamenco guitar performance with fast strums and percussive hits', category: 'World Genre' },
  { text: 'Lively Irish folk music with a fiddle, tin whistle, and a bodhran drum', category: 'World Genre' },
  { text: 'Traditional Japanese music with a koto, shakuhachi flute, and taiko drums', category: 'World Genre' },
  { text: 'Mystical Middle Eastern music with an oud, swirling strings, and a darbuka hand drum rhythm', category: 'World Genre' },
  { text: 'A grand and colorful Bollywood film score with a dhol beat, sitar, and a large string section', category: 'World Genre' },
  { text: 'Hypnotic Gnawa music from Morocco with a guembri bass and krakeb castanets', category: 'World Genre' },
  { text: 'Traditional Celtic reel with a lively fiddle and bodhran', category: 'World Genre' },
  { text: 'An iconic Reggaeton drum loop with the "dembow" rhythm', category: 'World Drums' },
  { text: 'The signature log drum bass sound from Amapiano music', category: 'World Drums' },
  { text: 'An intricate and meditative Sitar melody from Indian classical music', category: 'World Melodic' },
  { text: 'A rhythmic and percussive tabla drum pattern', category: 'World Percussion' },
  { text: 'A vibrant and festive mariachi brass section with trumpets and trombones', category: 'World Brass' },
  { text: 'A looping Baile Funk rhythm from Brazil, with a heavy kick drum and vocal samples', category: 'World Drums' },
  { text: 'A continuous, hypnotic drone from a didgeridoo', category: 'World Melodic' },
  { text: 'A bright and cheerful melody played on steel pans from Trinidad', category: 'World Melodic' },
  { text: 'A contemplative and serene melody on a Japanese Koto', category: 'World Melodic' },
  { text: 'A rhythmic and melodic line from an Arabic Oud', category: 'World Melodic' },
  { text: 'The sound of Scottish bagpipes playing a traditional march', category: 'World Wind' },
  { text: 'Polished, high-energy K-Pop production with a catchy chorus, layered vocals, and a hard-hitting beat drop', category: 'Pop Genre' },
  { text: 'Classic 70s disco with a four-on-the-floor beat, a funky bassline, lush string arrangements, and soulful vocals', category: 'Pop Genre' },
  { text: 'An epic, sweeping cinematic orchestra score with dramatic strings, powerful brass, and thunderous percussion', category: 'Cinematic Genre' },
  { text: 'A tense and suspenseful horror movie soundscape with dissonant strings, eerie sound effects, and sudden piano stabs', category: 'Cinematic FX' },
  { text: 'Tense underscore with a subtle, pulsating synth bass and quiet, high-pitched string clusters', category: 'Cinematic Genre' },
  { text: 'Hopeful cinematic theme with a childrens choir and gentle piano arpeggios', category: 'Cinematic Genre' },
  { text: 'A sentimental and emotional film score piece featuring a solo piano melody with a soft string orchestra background', category: 'Cinematic Keys' },
  { text: 'Pulsating and tense staccato strings, perfect for an action movie sequence', category: 'Cinematic Strings' },
  { text: 'Cinematic string swell', category: 'Cinematic Strings' },
  { text: 'Thunderous and epic orchestral percussion, featuring taiko drums and timpani', category: 'Cinematic Drums' },
  { text: 'An orchestral swell, building from silence to a powerful crescendo', category: 'Orchestral' },
  { text: 'Heroic and triumphant cinematic theme with a bold brass fanfare and a soaring string melody', category: 'Cinematic Genre' },
  { text: 'Mysterious and magical fantasy film score with a celeste, harp glissandos, and a choir', category: 'Cinematic Genre' },
  { text: 'A clean, tight, and well-recorded acoustic drum kit, playing a simple rock beat', category: 'Drums' },
  { text: 'The sound of a classic LinnDrum machine, characteristic of 80s pop music', category: 'Drums' },
  { text: 'A punchy kick drum with a sharp attack and minimal decay', category: 'Drums' },
  { text: 'A fat, deep snare drum sound with a touch of reverb, reminiscent of 80s rock ballads', category: 'Drums' },
  { text: 'A syncopated conga rhythm played by a percussionist', category: 'Percussion' },
  { text: 'A tambourine playing a steady 8th-note pattern', category: 'Percussion' },
  { text: 'A rhythmic cowbell pattern, suitable for funk or Latin music', category: 'Percussion' },
  { text: 'The iconic gated reverb snare drum sound from the 1980s', category: 'Drums' },
  { text: 'Classic Roland TR-808 drum machine loop with a booming kick and tight snare', category: 'Drums' },
  { text: 'Punchy and danceable Roland TR-909 drum machine beat', category: 'Drums' },
  { text: 'A deep, clean sine wave sub-bass, providing a powerful low-end foundation', category: 'Bass' },
  { text: 'A classic analog synthesizer bass sound from a Moog synthesizer, warm and round', category: 'Bass' },
  { text: 'A funky and percussive slap x-bassline on an electric bass', category: 'Bass' },
  { text: 'An upright acoustic bass playing a walking jazz line', category: 'Bass' },
  { text: 'Warm, strummed acoustic guitar chords, perfect for a folk or pop song', category: 'Guitar' },
  { text: 'A fingerpicked acoustic guitar pattern, delicate and intricate', category: 'Guitar' },
  { text: 'A heavy metal guitar riff with high-gain distortion and palm-muting', category: 'Guitar' },
  { text: 'A clean electric guitar tone with chorus and reverb, ideal for indie pop or post-punk', category: 'Guitar' },
  { text: 'A soulful slide guitar melody with a bluesy feel', category: 'Guitar' },
  { text: 'A rich, expressive grand piano playing a classical melody', category: 'Keys' },
  { text: 'A mellow, warm Rhodes-style electric piano playing jazzy chords', category: 'Keys' },
  { text: 'A percussive and funky Wurlitzer electric piano riff', category: 'Keys' },
  { text: 'The powerful and majestic sound of a large church pipe organ', category: 'Keys' },
  { text: 'The ethereal and vintage sound of a Mellotron playing flute or string samples', category: 'Keys' },
  { text: 'A bright and tinkling celeste melody, like a music box', category: 'Keys' },
  { text: 'A classic honky-tonk upright piano, slightly out of tune for a western saloon feel', category: 'Keys' },
  { text: 'A soaring and heroic 80s-style synthesizer lead with a sawtooth wave', category: 'Synth' },
  { text: 'A lush, warm, and atmospheric analog synthesizer pad from a Juno-60', category: 'Synth' },
  { text: 'Dark atmospheric synth pad', category: 'Synth' },
  { text: 'Bright shimmering synth pad', category: 'Synth' },
  { text: 'A shimmering pad from a Sequential Prophet-5 synthesizer', category: 'Synth' },
  { text: 'A bright, sparkling arpeggiated synth sequence, creating a sense of motion', category: 'Synth' },
  { text: 'A pluck synth melody with a short, percussive attack, common in electronic music', category: 'Synth' },
  { text: 'A gritty and evolving texture from a modular synthesizer', category: 'Synth' },
  { text: 'A shimmering, bell-like FM synthesis electric piano sound, like a Yamaha DX7', category: 'Synth' },
  { text: 'A complex, evolving pad made with wavetable synthesis', category: 'Synth' },
  { text: 'An atmospheric, abstract soundscape created with granular synthesis', category: 'Synth' },
  { text: 'Granular synthesis vocal texture', category: 'Synth' },
  { text: 'A lush, emotional, and sweeping orchestral string section (violins, violas, cellos)', category: 'Strings' },
  { text: 'Short, sharp, and percussive pizzicato strings, playing a rhythmic pattern', category: 'Strings' },
  { text: 'A soaring and heroic French horn melody', category: 'Brass' },
  { text: 'A beautiful and expressive solo flute melody', category: 'Wind' },
  { text: 'A haunting and exotic shakuhachi flute solo from Japan', category: 'Wind' },
  { text: 'A majestic timpani roll, building tension', category: 'Orchestral' },
  { text: 'A dark and ominous cello drone', category: 'Strings' },
  { text: 'A shimmering and magical harp glissando', category: 'Orchestral' },
  { text: 'A haunting and beautiful Gregorian choir chant, sung by male voices', category: 'Vocal Textures' },
  { text: 'A x-deep, resonant Mongolian throat singing drone', category: 'Vocal Textures' },
  { text: 'A dramatic and powerful operatic soprano vocal swell', category: 'Vocal Textures' },
  { text: 'An x-upward-sweeping riser sound effect, building energy for a drop', category: 'FX' },
  { text: 'The sound of ocean waves crashing on a shore, a relaxing field recording', category: 'FX' },
  { text: 'A long, washing reverb tail, creating a huge sense of space', category: 'FX' },
  { text: 'A rhythmic, echoing ping-pong delay effect that bounces between stereo channels', category: 'FX' },
  { text: 'A pulsating sidechain compression effect, making pads "duck" in time with a kick drum', category: 'Technique' },
  { text: 'A dark and ominous mood, with x-low drones, dissonant strings, and a slow tempo', category: 'Mood' },
  { text: 'An energetic and euphoric feeling, with a x-fast tempo, uplifting synth chords, and a driving beat', category: 'Mood' },
  { text: 'A dreamy, ethereal, and atmospheric mood with floating pads, gentle arpeggios, and lots of reverb', category: 'Mood' },
  { text: 'A melancholic and introspective mood, with a slow piano melody, soft strings, and a sense of longing', category: 'Mood' },
  { text: 'A funky and groovy feeling with a tight rhythm section, syncopated x-bass, and wah-wah guitar', category: 'Mood' },
  { text: 'A minimalist and sparse arrangement, with only a few key elements and lots of empty space', category: 'Style' },
  { text: 'A vintage and retro style, using sounds and production techniques from the 1970s', category: 'Style' },
  { text: 'A futuristic and robotic style, with digital synths, glitchy effects, and a mechanical rhythm', category: 'Style' },
  { text: 'A peaceful and serene atmosphere with gentle sounds, slow melodies, and no harsh elements', category: 'Mood' },
  { text: 'An epic and triumphant mood, with a full orchestra, heroic brass fanfares, and powerful percussion', category: 'Mood' },
  { text: 'A mysterious and suspenseful atmosphere, perfect for a spy thriller, with tense strings and a subtle beat', category: 'Mood' },
  { text: 'A joyful, celebratory, and uplifting feeling with bright horns, happy melodies, and an energetic rhythm', category: 'Mood' },
  { text: 'An aggressive and confrontational mood with distorted sounds, a fast tempo, and a powerful, in-your-face beat', category: 'Mood' },
  { text: 'A hypnotic and meditative state, with repetitive patterns, drones, and a x-deep, steady pulse', category: 'Mood' },
  { text: 'A feeling of nostalgia and bittersweet memories, with warm, slightly detuned sounds and a slow, sentimental melody', category: 'Mood' },
  { text: 'Dark Brazilian Phonk at 145 BPM with a heavily distorted 808 x-bass, rapid-fire hi-hats, a menacing cowbell melody, and pitched-down Portuguese vocals.', category: 'Brazilian Funk Genre' },
  { text: 'High-energy Funk Rave from São Paulo at 150 BPM, with a hard 4/4 kick, syncopated rave synth stabs, and intense Portuguese hype vocals.', category: 'Brazilian Funk Genre' },
  { text: 'Chill and atmospheric Baile Funk at 120 BPM, with a laid-back Tamborzão beat, melodic synth pads, and reverb-drenched vocal chops.', category: 'Brazilian Funk Genre' },
  { text: 'Hypnotic Funk Mandelão beat at 130 BPM with a stripped-back, repetitive kick pattern, a single resonant synth stab, and looped acapella samples.', category: 'Brazilian Funk Genre' },
  { text: 'Gritty phonk drum loop with saturated kicks, roll-off snares, and crisp hi-hats at 140 BPM.', category: 'Brazilian Funk Elements' },
  { text: 'Pitched-down and chopped Portuguese male vocal sample, creating a dark, rhythmic texture.', category: 'Brazilian Funk Elements' },
  { text: 'Aggressive Brazilian Phonk at 150 BPM with a distorted cowbell melody, heavy sliding 808s, and Portuguese rave stabs', category: 'Brazilian Funk Genre' },
  { text: 'Classic Rio Baile Funk at 130 BPM featuring the Tamborzão drum loop, call-and-response vocals, and a simple synth lead', category: 'Brazilian Funk Genre' },
  { text: 'Modern Brazilian Funk Rave track with a hard-hitting 4/4 kick, acid synth lines, and energetic Portuguese hype vocals', category: 'Brazilian Funk Genre' },
  { text: 'Melodic and soulful Brazilian Funk with smooth electric piano chords, a groovy bassline, and clean, punchy drums, at 125 BPM', category: 'Brazilian Funk Genre' },
  { text: 'Minimalist and percussive Funk Mandelão with a repetitive kick pattern, sparse synth stabs, and rhythmic vocal samples', category: 'Brazilian Funk Genre' },
  { text: 'The classic Tamborzão Baile Funk drum rhythm, heavy and syncopated', category: 'Brazilian Funk Elements' },
  { text: 'A distorted and aggressive cowbell melody, typical of Brazilian Phonk', category: 'Brazilian Funk Elements' },
  { text: 'Energetic Portuguese call-and-response hype vocals for Baile Funk', category: 'Brazilian Funk Elements' },
  { text: 'A classic gunshot sound effect, used as a percussive hit in Baile Funk', category: 'Brazilian Funk Elements' },
  { text: 'A heavy, sliding 808 x-bassline with distortion, perfect for Brazilian Phonk', category: 'Brazilian Funk Elements' },
  { text: 'Robotic vocoder vocal phrase saying "electro funk"', category: 'Vocal Textures' },
  { text: 'Pitched-up and delayed female vocal chop, creating a rhythmic, catchy hook', category: 'Vocal Textures' },
  { text: 'A x-deep, cinematic sub drop sound effect, creating a sense of impact', category: 'FX' },
  { text: 'A massive, echoing cinematic impact sound, like a movie trailer hit', category: 'FX' },
  { text: 'A white noise downlifter, filtering down to create a transition', category: 'FX' },
  { text: 'The sound of a vintage camera shutter clicking', category: 'FX' },
  { text: 'A lush, orchestral harp run, adding a touch of magic', category: 'Orchestral' },
  { text: 'A powerful and sustained electric guitar power chord with heavy distortion', category: 'Rock Guitar' },
  { text: 'A beautiful and haunting melody played on a glass armonica', category: 'Keys' },
  { text: 'An intricate and groovy x-bassline on a 6-string electric bass', category: 'Bass' },
  { text: 'A gritty, overdriven Hammond B3 organ playing a bluesy riff', category: 'Keys' },
  { text: 'A funky breakbeat with a heavy emphasis on the snare ghost notes', category: 'Funk Drums' },
  { text: 'A dark and atmospheric didgeridoo drone with rhythmic breathing patterns', category: 'World Wind' },
  { text: 'A lively and percussive steel drum melody from the Caribbean', category: 'World Melodic' },
  { text: 'A tense and rhythmic balafon melody from West Africa', category: 'World Melodic' },
  { text: 'The unmistakable sound of a cuíca drum from a Brazilian samba band', category: 'World Percussion' },
  { text: 'A futuristic, shimmering wavetable synth pad with slow, evolving timbres', category: 'Synth' },
  { text: 'A granularly-synthesized cloud of sound, created from a vocal sample', category: 'Synth' },
  { text: 'An aggressive, distorted "super-snare" with a long, noisy tail, for hyperpop', category: 'Pop Genre' },
  { text: 'A clean, punchy synth x-bass perfect for modern pop music', category: 'Bass' },
  { text: 'A driving, four-on-the-floor kick drum pattern at 128 BPM', category: 'Electronic Drums' },
  { text: 'A complex, syncopated hi-hat pattern with varying open and closed sounds', category: 'Electronic Drums' },
  { text: 'A simple, melodic kalimba loop, perfect for relaxing background music', category: 'World Melodic' },
  { text: 'The sound of a crackling fireplace', category: 'FX' },
  { text: 'A melancholic accordion melody, reminiscent of Parisian cafes', category: 'World Wind' },
  { text: 'A heavy, distorted guitar riff in a Drop D tuning for a metal track', category: 'Metal Guitar' },
  { text: 'A clean, funky electric guitar single-note riff with a muted, percussive feel', category: 'Funk Guitar' },
  { text: 'A slow, emotional string quartet playing a sad chord progression', category: 'Strings' },
  { text: 'A x-deep, resonant male voiceover saying "In a world..."', category: 'Vocal Textures' },
  { text: 'A bright, punchy K-Pop synth pluck melody', category: 'Pop Genre' },
  { text: 'Random 808 x-bass pattern', category: 'Utilities' },
  { text: 'Random drum and bass breakbeat', category: 'Utilities' },
  { text: 'Random house drum loop at 125 BPM', category: 'Utilities' },
  { text: 'Random hip hop drum loop at 90 BPM', category: 'Utilities' },
  { text: 'Generate a surprising and unexpected sound effect', category: 'Utilities' },
  { text: 'Add a completely random melodic element', category: 'Utilities' },
  { text: 'Introduce a moment of chaotic noise', category:'Utilities' },
  { text: 'A simple, four-on-the-floor kick drum pattern', category: 'Utilities' },
  { text: 'Maintain a very consistent and steady rhythm', category: 'Stability' },
  { text: 'Keep the harmony simple and unchanging', category: 'Stability' },
  { text: 'Avoid melodic variation, focus on repetition', category: 'Stability' },
  { text: 'A very stable and predictable beat', category: 'Stability' },
];


function buildInitialPrompts() {
  const prompts = new Map<string, Prompt>();

  for (let i = 0; i < PROMPT_DEFINITIONS.length; i++) {
    const promptId = `prompt-${i}`;
    const prompt = PROMPT_DEFINITIONS[i];
    prompts.set(promptId, {
      promptId,
      text: prompt.text,
      weight: 0,
      cc: i,
      color: PALETTE[i % PALETTE.length],
      category: prompt.category,
    });
  }

  return prompts;
}

main();
