/**
 * Music Player for Doom MUS files
 * Converts MUS format to MIDI and plays it
 */

import MidiPlayer from 'midi-player-js';
import Soundfont from 'soundfont-player';

export class MusicPlayer {
    constructor() {
        this.player = new MidiPlayer.Player();
        this.audioContext = null;
        this.instrument = null;
        this.currentSong = null;
        this.isPlaying = false;
    }

    async init() {
        // Initialize audio context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Load multiple instruments for different MIDI channels
        console.log('Loading soundfonts...');
        this.instruments = {};
        
        // Load a variety of instruments
        const instrumentList = [
            'acoustic_guitar_steel',  // Lead/melody
            'distortion_guitar',       // Rock sounds
            'electric_bass_pick',      // Bass
            'synth_drum'              // Percussion
        ];
        
        try {
            // Load first instrument as default
            this.instruments[0] = await Soundfont.instrument(this.audioContext, 'electric_guitar_clean');
            console.log('Primary instrument loaded');
        } catch (error) {
            console.warn('Error loading soundfont:', error);
        }
        
        // Set up MIDI player event handling with multiple channels
        this.activeNotes = new Map();
        
        this.player.on('midiEvent', (event) => {
            const instrument = this.instruments[event.channel] || this.instruments[0];
            
            if (event.name === 'Note on' && instrument && event.velocity > 0) {
                const note = instrument.play(event.noteName, this.audioContext.currentTime, {
                    gain: event.velocity / 127,
                    duration: 0.5
                });
                this.activeNotes.set(`${event.channel}-${event.noteNumber}`, note);
            } else if (event.name === 'Note off' || (event.name === 'Note on' && event.velocity === 0)) {
                const noteKey = `${event.channel}-${event.noteNumber}`;
                const note = this.activeNotes.get(noteKey);
                if (note && note.stop) {
                    note.stop();
                    this.activeNotes.delete(noteKey);
                }
            }
        });
        
        console.log('Music player initialized');
    }

    // Convert Doom MUS format to MIDI
    convertMusToMidi(musData) {
        try {
            // MUS header check: "MUS" + 0x1A
            if (musData[0] !== 0x4D || musData[1] !== 0x55 || musData[2] !== 0x53 || musData[3] !== 0x1A) {
                console.warn('Invalid MUS header');
                return null;
            }

            console.log('Converting MUS to MIDI...');

            // Read MUS header
            const scoreLen = musData[4] | (musData[5] << 8);
            const scoreStart = musData[6] | (musData[7] << 8);
            const numChannels = musData[8] | (musData[9] << 8);
            
            console.log(`MUS: scoreLen=${scoreLen}, scoreStart=${scoreStart}, channels=${numChannels}`);

            // Create MIDI file structure
            const midi = [];
            
            // MIDI header chunk
            midi.push(0x4D, 0x54, 0x68, 0x64); // "MThd"
            midi.push(0x00, 0x00, 0x00, 0x06); // Header length (6 bytes)
            midi.push(0x00, 0x00); // Format 0
            midi.push(0x00, 0x01); // 1 track
            midi.push(0x00, 0x46); // 70 ticks per quarter note

            // Track chunk header
            const trackStartPos = midi.length;
            midi.push(0x4D, 0x54, 0x72, 0x6B); // "MTrk"
            midi.push(0x00, 0x00, 0x00, 0x00); // Track length (placeholder)

            const trackDataStart = midi.length;

            // MUS channel to MIDI channel mapping
            const channelMap = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
            
            let pos = scoreStart;
            let lastStatus = 0;
            let deltaTime = 0;

            // Parse MUS events
            while (pos < musData.length) {
                const eventDesc = musData[pos++];
                if (eventDesc === undefined) break;

                const eventType = (eventDesc >> 4) & 0x7;
                const channel = eventDesc & 0x0F;
                const last = (eventDesc & 0x80) !== 0;

                // Write delta time
                this.writeVarLen(midi, deltaTime);
                deltaTime = 0;

                const midiChannel = channelMap[channel] || 0;

                switch (eventType) {
                    case 0: // Release note
                        if (pos < musData.length) {
                            const note = musData[pos++];
                            midi.push(0x80 | midiChannel, note, 0x40);
                        }
                        break;
                    case 1: // Play note
                        if (pos < musData.length) {
                            const note = musData[pos++];
                            const volume = (note & 0x80) ? musData[pos++] : 0x7F;
                            midi.push(0x90 | midiChannel, note & 0x7F, volume & 0x7F);
                        }
                        break;
                    case 2: // Pitch bend
                        if (pos < musData.length) {
                            const bend = musData[pos++];
                            midi.push(0xE0 | midiChannel, 0, bend);
                        }
                        break;
                    case 3: // System event
                        if (pos < musData.length) {
                            const sysEvent = musData[pos++];
                            // Skip system events for now
                        }
                        break;
                    case 4: // Controller change
                        if (pos + 1 < musData.length) {
                            const controller = musData[pos++];
                            const value = musData[pos++];
                            midi.push(0xB0 | midiChannel, controller, value);
                        }
                        break;
                    case 6: // End of music
                        this.writeVarLen(midi, 0);
                        midi.push(0xFF, 0x2F, 0x00); // End of track
                        pos = musData.length; // Exit loop
                        break;
                    default:
                        console.warn('Unknown MUS event type:', eventType);
                        break;
                }

                // Read delay if present (last flag means delay follows)
                if (last && pos < musData.length) {
                    let delay = 0;
                    let byte;
                    do {
                        byte = musData[pos++];
                        delay = (delay * 128) + (byte & 0x7F);
                    } while (pos < musData.length && (byte & 0x80));
                    deltaTime = delay;
                }
            }

            // Update track length
            const trackLength = midi.length - trackDataStart;
            midi[trackStartPos + 4] = (trackLength >> 24) & 0xFF;
            midi[trackStartPos + 5] = (trackLength >> 16) & 0xFF;
            midi[trackStartPos + 6] = (trackLength >> 8) & 0xFF;
            midi[trackStartPos + 7] = trackLength & 0xFF;

            console.log('MUS to MIDI conversion complete, MIDI size:', midi.length);
            return new Uint8Array(midi);
        } catch (error) {
            console.error('Error converting MUS to MIDI:', error);
            return null;
        }
    }

    // Write variable-length value to MIDI
    writeVarLen(buffer, value) {
        if (value < 128) {
            buffer.push(value);
        } else {
            const bytes = [];
            bytes.push(value & 0x7F);
            value >>= 7;
            while (value > 0) {
                bytes.push((value & 0x7F) | 0x80);
                value >>= 7;
            }
            for (let i = bytes.length - 1; i >= 0; i--) {
                buffer.push(bytes[i]);
            }
        }
    }

    playMusic(musData) {
        if (!musData) {
            console.warn('No music data provided');
            return;
        }

        // Stop current music
        this.stop();

        try {
            const midiData = this.convertMusToMidi(musData);
            
            if (!midiData) {
                console.log('Failed to convert MUS to MIDI');
                return;
            }

            // Convert to base64
            let binary = '';
            for (let i = 0; i < midiData.length; i++) {
                binary += String.fromCharCode(midiData[i]);
            }
            const base64 = btoa(binary);
            
            // Configure player settings for better playback
            this.player.sampleRate = 22; // Events per second (adjust for tempo)
            
            // Load and play MIDI
            this.player.loadDataUri('data:audio/midi;base64,' + base64);
            
            // Set up looping before playing
            this.player.on('endOfFile', () => {
                console.log('Music ended, looping...');
                setTimeout(() => {
                    if (this.isPlaying) {
                        this.player.skipToTick(0);
                        this.player.play();
                    }
                }, 100);
            });
            
            this.player.play();
            this.isPlaying = true;
            
            console.log('Music started playing');
        } catch (error) {
            console.error('Error playing music:', error);
        }
    }

    stop() {
        if (this.player && this.isPlaying) {
            this.player.stop();
            this.isPlaying = false;
        }
    }

    setVolume(volume) {
        // Volume control would go here
        console.log('Volume set to:', volume);
    }
}

