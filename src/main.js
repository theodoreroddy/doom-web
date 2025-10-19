/**
 * Main application entry point
 */

import { WADParser } from './wadParser.js';
import { MapRenderer } from './mapRenderer.js';
import { Game } from './game.js';
import { MusicPlayer } from './musicPlayer.js';

class App {
    constructor() {
        this.wadParser = null;
        this.game = null;
        this.currentMap = null;
        this.musicPlayer = new MusicPlayer();
        
        this.init();
    }

    init() {
        // Get UI elements
        this.elements = {
            mapSelect: document.getElementById('mapSelect'),
            startBtn: document.getElementById('startBtn'),
            gameCanvas: document.getElementById('gameCanvas'),
            status: document.getElementById('status')
        };

        // Set up event listeners
        this.setupEventListeners();

        // Auto-load WAD from public folder
        this.autoLoadWAD();
    }

    setupEventListeners() {
        this.elements.mapSelect.addEventListener('change', (e) => {
            const mapName = e.target.value;
            if (mapName) {
                this.loadMap(mapName);
            }
        });

        this.elements.startBtn.addEventListener('click', () => {
            this.startGame();
        });
    }

    async autoLoadWAD() {
        // Load DOOM.WAD from the public folder
        // In Vite, public folder files are served from root
        const wadPath = '/DOOM.WAD';

        try {
            this.updateStatus('Loading DOOM.WAD...');
            const response = await fetch(wadPath);
            
            if (!response.ok) {
                throw new Error(`Failed to load WAD: ${response.status} ${response.statusText}`);
            }
            
            console.log('Loading DOOM.WAD from public folder...');
            const arrayBuffer = await response.arrayBuffer();
            await this.loadWADFromBuffer(arrayBuffer, 'DOOM.WAD');
        } catch (error) {
            console.error('Failed to load DOOM.WAD:', error);
            this.updateStatus('Error: DOOM.WAD not found in public folder');
            alert('DOOM.WAD not found!\n\nPlease place your DOOM.WAD file in the public/ directory and refresh the page.');
        }
    }

    async loadWADFromBuffer(arrayBuffer, filename) {
        try {
            this.wadParser = new WADParser(arrayBuffer);
            
            // Get available maps
            const mapNames = this.wadParser.getMapNames();
            
            if (mapNames.length === 0) {
                throw new Error('No maps found in WAD file');
            }

            console.log(`Found ${mapNames.length} maps:`, mapNames);

            // Populate map select
            this.elements.mapSelect.innerHTML = '';
            mapNames.forEach(mapName => {
                const option = document.createElement('option');
                option.value = mapName;
                option.textContent = mapName;
                this.elements.mapSelect.appendChild(option);
            });

            this.elements.mapSelect.disabled = false;
            
            // Auto-load first map (E1M1 if available, otherwise first map)
            const defaultMap = mapNames.includes('E1M1') ? 'E1M1' : mapNames[0];
            this.elements.mapSelect.value = defaultMap;
            this.loadMap(defaultMap);
            
            this.updateStatus(`${filename}: ${mapNames.length} maps loaded`);
        } catch (error) {
            console.error('Error parsing WAD:', error);
            this.updateStatus(`Error: ${error.message}`);
            throw error;
        }
    }

    loadMap(mapName) {
        try {
            this.updateStatus(`Loading map ${mapName}...`);
            
            // Parse map data
            const mapData = this.wadParser.getMap(mapName);
            
            if (!mapData) {
                throw new Error(`Failed to load map ${mapName}`);
            }

            console.log(`Map ${mapName} loaded:`, {
                things: mapData.things.length,
                linedefs: mapData.linedefs.length,
                sidedefs: mapData.sidedefs.length,
                vertexes: mapData.vertexes.length,
                sectors: mapData.sectors.length
            });

            // Get palette
            const palette = this.wadParser.getPalette();

            // Create map renderer (pass wadParser for texture extraction)
            const mapRenderer = new MapRenderer(mapData, palette, this.wadParser);
            
            // Initialize or update game
            if (!this.game) {
                this.game = new Game(this.elements.gameCanvas);
            }

            this.game.loadMap(mapRenderer, this.wadParser, palette);
            this.currentMap = mapName;

            // Initialize and play music
            this.initMusic(mapName);

            // Enable start button
            this.elements.startBtn.disabled = false;
            
            this.updateStatus(`Map ${mapName} loaded - Click Start Game to begin`);
        } catch (error) {
            console.error('Error loading map:', error);
            this.updateStatus(`Error: ${error.message}`);
            alert(`Failed to load map: ${error.message}`);
        }
    }

    async initMusic(mapName) {
        // Music temporarily disabled
        console.log('Music disabled (needs fixing)');
        return;
        
        /*
        try {
            // Initialize music player if not already done
            if (!this.musicPlayer.audioContext) {
                await this.musicPlayer.init();
            }

            // Get music for the current map
            const musicData = this.wadParser.getMusicForMap(mapName);
            
            if (musicData) {
                console.log(`Loading music for ${mapName}...`);
                this.musicPlayer.playMusic(musicData);
            } else {
                console.log(`No music found for ${mapName}`);
            }
        } catch (error) {
            console.error('Error loading music:', error);
            // Don't fail the map load if music fails
        }
        */
    }

    startGame() {
        if (!this.game || !this.currentMap) {
            alert('Please load a map first');
            return;
        }

        try {
            this.game.start();
            this.updateStatus(`Playing ${this.currentMap}`);
            
            // Show instructions if user hasn't interacted yet
            setTimeout(() => {
                if (!this.game.isPointerLocked) {
                    this.showInstructions();
                }
            }, 500);
        } catch (error) {
            console.error('Error starting game:', error);
            this.updateStatus(`Error: ${error.message}`);
            alert(`Failed to start game: ${error.message}`);
        }
    }

    updateStatus(message) {
        this.elements.status.textContent = message;
        console.log('Status:', message);
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new App();
    });
} else {
    new App();
}

