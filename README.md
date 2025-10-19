# 🎮 Doom Web Game

Walk around Doom maps in your web browser.

![Doom Web Game](https://img.shields.io/badge/Doom-WebGL-green)
![Three.js](https://img.shields.io/badge/Three.js-0.158-blue)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## ✨ Features

- **Full WAD Parser**: Reads IWAD and PWAD files
- **Map Loading**: Parses all map data (THINGS, LINEDEFS, SIDEDEFS, SECTORS, VERTEXES, etc.)
- **3D Rendering**: Real-time 3D rendering using Three.js
- **First-Person Controls**: WASD movement and mouse look
- **Collision Detection**: Wall collision with sliding
- **Multiple Maps**: Support for both Doom 1 (E#M#) and Doom 2 (MAP##) formats
- **Lighting System**: Dynamic lighting based on sector data
- **Texture Mapping**: Color-coded walls based on Doom texture names

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- A Doom WAD file (see "Getting WAD Files" section)

### Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. **(Optional but recommended)** Copy your WAD file to the `public/` directory:
```bash
cp /path/to/your/doom1.wad public/doom1.wad
```
The app will automatically load it on startup!

4. Start the development server:
```bash
npm run dev
```

5. Open your browser to the URL shown (typically `http://localhost:5173`)

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## 🎮 How to Play

1. **Load a WAD File**
   - Click "Load WAD File" button
   - Select your Doom WAD file (DOOM.WAD, DOOM2.WAD, etc.)
   - The game will automatically parse the file and show available maps

2. **Select a Map**
   - Choose a map from the dropdown menu
   - Maps will be named E#M# (Doom 1) or MAP## (Doom 2)

3. **Start the Game**
   - Click "Start Game"
   - Click on the game canvas to lock the pointer and begin playing

### Controls

- **W/A/S/D** - Move forward/left/backward/right
- **Mouse** - Look around
- **Shift** - Sprint
- **ESC** - Release pointer lock

## 📁 Getting WAD Files

You'll need a Doom WAD file to use this application. There are several options:

### Option 1: Commercial WAD Files
If you own Doom, you can use the WAD files from your installation:
- **DOOM.WAD** - Doom 1 (shareware version may work with limited levels)
- **DOOM2.WAD** - Doom 2
- **PLUTONIA.WAD** - Final Doom - The Plutonia Experiment
- **TNT.WAD** - Final Doom - TNT: Evilution

These can be purchased from:
- [Steam](https://store.steampowered.com/app/2280/Ultimate_Doom/)
- [GOG](https://www.gog.com/game/the_ultimate_doom)

### Option 2: Shareware WAD
The Doom 1 shareware WAD (DOOM1.WAD) is freely available and legal to download:
- [Doom Shareware on Archive.org](https://archive.org/details/DoomsharewareEpisode)

### Option 3: FreeDoom
FreeDoom is a completely free and open-source WAD file:
- [FreeDoom.org](https://freedoom.github.io/)
- Download `freedoom1.wad` or `freedoom2.wad`

## 🏗️ Project Structure

```
doom-web-game/
├── src/
│   ├── main.js          # Application entry point and UI logic
│   ├── wadParser.js     # WAD file format parser
│   ├── mapRenderer.js   # Map geometry builder
│   └── game.js          # Game engine and Three.js renderer
├── index.html           # Main HTML file
├── package.json         # Dependencies
└── README.md           # This file
```

## 🔧 Technical Details

### WAD File Format

The project includes a complete WAD parser that understands:
- **Header**: IWAD/PWAD identification
- **Directory**: Lump table with offsets
- **Lumps**: Individual data chunks (maps, textures, sounds, etc.)

### Map Data Structures

Each map contains:
- **THINGS**: Object placement (monsters, items, player starts)
- **LINEDEFS**: Wall definitions
- **SIDEDEFS**: Wall texture references
- **VERTEXES**: Map vertices
- **SECTORS**: Floor/ceiling definitions
- **SEGS**: BSP segments
- **SSECTORS**: Sub-sectors
- **NODES**: BSP tree nodes

### Rendering Pipeline

1. Parse WAD file structure
2. Extract map data for selected level
3. Build 3D geometry from 2D map data
4. Create Three.js meshes with materials
5. Set up camera at player start position
6. Render scene with collision detection

### Coordinate System

Doom uses a 2D coordinate system that we convert to 3D:
- Doom X → Three.js X
- Doom Y → Three.js -Z (flipped)
- Height → Three.js Y

## 🎨 Customization

### Adding Real Textures

Currently, the game uses color-coded walls. To add real texture support:

1. Extract textures from WAD files using the PNAMES and TEXTURE1/TEXTURE2 lumps
2. Convert to canvas/image format using the PLAYPAL color palette
3. Create THREE.Texture objects and apply to materials

### Performance Tuning

Adjust these values in `game.js`:
```javascript
// Camera far plane (render distance)
camera.far = 10000;

// Fog distance
scene.fog = new THREE.Fog(0x000000, 1000, 5000);

// Movement speed
player.speed = 200;
```

## 🐛 Known Limitations

- Textures are rendered as solid colors (texture extraction not yet implemented)
- Sky rendering not implemented
- No monsters or AI
- No weapons or shooting
- No doors/lifts (static map only)
- Simplified lighting model

## 🔮 Future Enhancements

- [ ] Full texture extraction and rendering
- [ ] Animated textures
- [ ] Door and lift mechanisms
- [ ] Monster rendering (decorative)
- [ ] Audio support (music and sound effects)
- [ ] Save/load position
- [ ] Multiple WAD support
- [ ] WebGL2 optimizations

## 📝 License

This project is licensed under the MIT License. See below:

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Note**: This software requires Doom WAD files to function. The WAD files themselves are copyrighted by id Software. This project does not include any WAD files. Users must provide their own legally obtained WAD files.

## 🙏 Acknowledgments

- id Software for creating Doom and the WAD format
- The Doom Wiki for comprehensive format documentation
- Three.js team for the excellent 3D library
- The Doom community for decades of modding and documentation

## 📚 Resources

- [Doom Wiki - WAD Format](https://doomwiki.org/wiki/WAD)
- [Unofficial Doom Specs](https://www.gamers.org/dhs/helpdocs/dmsp1666.html)
- [Three.js Documentation](https://threejs.org/docs/)

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

---

**Happy Dooming! 🔫👾**

