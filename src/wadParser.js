/**
 * WAD File Parser for Doom WAD files
 * Supports both IWAD and PWAD formats
 */

export class WADParser {
    constructor(arrayBuffer) {
        this.buffer = arrayBuffer;
        this.view = new DataView(arrayBuffer);
        this.lumps = [];
        this.lumpMap = new Map();
        this.parse();
    }

    parse() {
        // Read header
        const header = this.readString(0, 4);
        if (header !== 'IWAD' && header !== 'PWAD') {
            throw new Error('Invalid WAD file: must be IWAD or PWAD');
        }

        const numLumps = this.view.getInt32(4, true);
        const directoryOffset = this.view.getInt32(8, true);

        console.log(`WAD Type: ${header}, Lumps: ${numLumps}, Directory Offset: ${directoryOffset}`);

        // Read directory
        let offset = directoryOffset;
        for (let i = 0; i < numLumps; i++) {
            const lumpOffset = this.view.getInt32(offset, true);
            const lumpSize = this.view.getInt32(offset + 4, true);
            const lumpName = this.readString(offset + 8, 8).trim();

            const lump = {
                name: lumpName,
                offset: lumpOffset,
                size: lumpSize
            };

            this.lumps.push(lump);
            this.lumpMap.set(lumpName, lump);

            offset += 16;
        }

        console.log(`Parsed ${this.lumps.length} lumps`);
    }

    readString(offset, length) {
        let str = '';
        for (let i = 0; i < length; i++) {
            const char = this.view.getUint8(offset + i);
            if (char === 0) break;
            str += String.fromCharCode(char);
        }
        return str;
    }

    getMusic(musicName) {
        // Music lumps start with D_ (e.g., D_E1M1, D_RUNNIN)
        const lump = this.lumpMap.get(musicName);
        if (!lump || lump.size === 0) {
            console.warn(`Music ${musicName} not found`);
            return null;
        }

        // Return raw music data (MUS format)
        const musicData = new Uint8Array(this.buffer, lump.offset, lump.size);
        console.log(`Found music: ${musicName}, size: ${lump.size} bytes`);
        return musicData;
    }

    getMusicForMap(mapName) {
        // Map music names for Doom 1 (Episode-Map format)
        const musicMap = {
            'E1M1': 'D_E1M1',
            'E1M2': 'D_E1M2',
            'E1M3': 'D_E1M3',
            'E1M4': 'D_E1M4',
            'E1M5': 'D_E1M5',
            'E1M6': 'D_E1M6',
            'E1M7': 'D_E1M7',
            'E1M8': 'D_E1M8',
            'E1M9': 'D_E1M9',
            // Add more as needed...
        };

        const musicName = musicMap[mapName];
        if (!musicName) {
            console.warn(`No music mapping for map ${mapName}`);
            return null;
        }

        return this.getMusic(musicName);
    }

    getLump(name) {
        return this.lumpMap.get(name);
    }

    getLumpData(name) {
        const lump = this.getLump(name);
        if (!lump) return null;
        return new Uint8Array(this.buffer, lump.offset, lump.size);
    }

    getLumpDataView(name) {
        const lump = this.getLump(name);
        if (!lump) return null;
        return new DataView(this.buffer, lump.offset, lump.size);
    }

    findLumpsBetween(startName, endName) {
        const startIndex = this.lumps.findIndex(l => l.name === startName);
        const endIndex = this.lumps.findIndex(l => l.name === endName);
        
        if (startIndex === -1 || endIndex === -1) return [];
        
        return this.lumps.slice(startIndex + 1, endIndex);
    }

    getMapNames() {
        const mapNames = [];
        for (const lump of this.lumps) {
            // Doom 1 maps: E#M#
            if (/^E\dM\d$/.test(lump.name)) {
                mapNames.push(lump.name);
            }
            // Doom 2 maps: MAP##
            else if (/^MAP\d{2}$/.test(lump.name)) {
                mapNames.push(lump.name);
            }
        }
        return mapNames;
    }

    getMap(mapName) {
        const mapIndex = this.lumps.findIndex(l => l.name === mapName);
        if (mapIndex === -1) {
            console.error(`Map ${mapName} not found`);
            return null;
        }

        // Find the next map or end of lumps
        let endIndex = this.lumps.length;
        for (let i = mapIndex + 1; i < this.lumps.length; i++) {
            if (/^(E\dM\d|MAP\d{2})$/.test(this.lumps[i].name)) {
                endIndex = i;
                break;
            }
        }

        const mapLumps = this.lumps.slice(mapIndex, endIndex);
        
        return {
            name: mapName,
            things: this.parseThings(mapLumps),
            linedefs: this.parseLinedefs(mapLumps),
            sidedefs: this.parseSidedefs(mapLumps),
            vertexes: this.parseVertexes(mapLumps),
            sectors: this.parseSectors(mapLumps),
            segs: this.parseSegs(mapLumps),
            ssectors: this.parseSSectors(mapLumps),
            nodes: this.parseNodes(mapLumps)
        };
    }

    parseThings(mapLumps) {
        const lump = mapLumps.find(l => l.name === 'THINGS');
        if (!lump || lump.size === 0) return [];

        const view = new DataView(this.buffer, lump.offset, lump.size);
        const things = [];
        const count = lump.size / 10;

        for (let i = 0; i < count; i++) {
            const offset = i * 10;
            things.push({
                x: view.getInt16(offset, true),
                y: view.getInt16(offset + 2, true),
                angle: view.getInt16(offset + 4, true),
                type: view.getInt16(offset + 6, true),
                flags: view.getInt16(offset + 8, true)
            });
        }

        return things;
    }

    parseLinedefs(mapLumps) {
        const lump = mapLumps.find(l => l.name === 'LINEDEFS');
        if (!lump || lump.size === 0) return [];

        const view = new DataView(this.buffer, lump.offset, lump.size);
        const linedefs = [];
        const count = lump.size / 14;

        for (let i = 0; i < count; i++) {
            const offset = i * 14;
            linedefs.push({
                startVertex: view.getInt16(offset, true),
                endVertex: view.getInt16(offset + 2, true),
                flags: view.getInt16(offset + 4, true),
                lineType: view.getInt16(offset + 6, true),
                sectorTag: view.getInt16(offset + 8, true),
                frontSidedef: view.getInt16(offset + 10, true),
                backSidedef: view.getInt16(offset + 12, true)
            });
        }

        return linedefs;
    }

    parseSidedefs(mapLumps) {
        const lump = mapLumps.find(l => l.name === 'SIDEDEFS');
        if (!lump || lump.size === 0) return [];

        const view = new DataView(this.buffer, lump.offset, lump.size);
        const sidedefs = [];
        const count = lump.size / 30;

        for (let i = 0; i < count; i++) {
            const offset = i * 30;
            sidedefs.push({
                xOffset: view.getInt16(offset, true),
                yOffset: view.getInt16(offset + 2, true),
                upperTexture: this.readString(lump.offset + offset + 4, 8).trim(),
                lowerTexture: this.readString(lump.offset + offset + 12, 8).trim(),
                middleTexture: this.readString(lump.offset + offset + 20, 8).trim(),
                sector: view.getInt16(offset + 28, true)
            });
        }

        return sidedefs;
    }

    parseVertexes(mapLumps) {
        const lump = mapLumps.find(l => l.name === 'VERTEXES');
        if (!lump || lump.size === 0) return [];

        const view = new DataView(this.buffer, lump.offset, lump.size);
        const vertexes = [];
        const count = lump.size / 4;

        for (let i = 0; i < count; i++) {
            const offset = i * 4;
            vertexes.push({
                x: view.getInt16(offset, true),
                y: view.getInt16(offset + 2, true)
            });
        }

        return vertexes;
    }

    parseSectors(mapLumps) {
        const lump = mapLumps.find(l => l.name === 'SECTORS');
        if (!lump || lump.size === 0) return [];

        const view = new DataView(this.buffer, lump.offset, lump.size);
        const sectors = [];
        const count = lump.size / 26;

        for (let i = 0; i < count; i++) {
            const offset = i * 26;
            sectors.push({
                floorHeight: view.getInt16(offset, true),
                ceilingHeight: view.getInt16(offset + 2, true),
                floorTexture: this.readString(lump.offset + offset + 4, 8).trim(),
                ceilingTexture: this.readString(lump.offset + offset + 12, 8).trim(),
                lightLevel: view.getInt16(offset + 20, true),
                special: view.getInt16(offset + 22, true),
                tag: view.getInt16(offset + 24, true)
            });
        }

        return sectors;
    }

    parseSegs(mapLumps) {
        const lump = mapLumps.find(l => l.name === 'SEGS');
        if (!lump || lump.size === 0) return [];

        const view = new DataView(this.buffer, lump.offset, lump.size);
        const segs = [];
        const count = lump.size / 12;

        for (let i = 0; i < count; i++) {
            const offset = i * 12;
            segs.push({
                startVertex: view.getInt16(offset, true),
                endVertex: view.getInt16(offset + 2, true),
                angle: view.getInt16(offset + 4, true),
                linedef: view.getInt16(offset + 6, true),
                direction: view.getInt16(offset + 8, true),
                offset: view.getInt16(offset + 10, true)
            });
        }

        return segs;
    }

    parseSSectors(mapLumps) {
        const lump = mapLumps.find(l => l.name === 'SSECTORS');
        if (!lump || lump.size === 0) return [];

        const view = new DataView(this.buffer, lump.offset, lump.size);
        const ssectors = [];
        const count = lump.size / 4;

        for (let i = 0; i < count; i++) {
            const offset = i * 4;
            ssectors.push({
                segCount: view.getInt16(offset, true),
                firstSeg: view.getInt16(offset + 2, true)
            });
        }

        return ssectors;
    }

    parseNodes(mapLumps) {
        const lump = mapLumps.find(l => l.name === 'NODES');
        if (!lump || lump.size === 0) return [];

        const view = new DataView(this.buffer, lump.offset, lump.size);
        const nodes = [];
        const count = lump.size / 28;

        for (let i = 0; i < count; i++) {
            const offset = i * 28;
            nodes.push({
                x: view.getInt16(offset, true),
                y: view.getInt16(offset + 2, true),
                dx: view.getInt16(offset + 4, true),
                dy: view.getInt16(offset + 6, true),
                rightBox: {
                    top: view.getInt16(offset + 8, true),
                    bottom: view.getInt16(offset + 10, true),
                    left: view.getInt16(offset + 12, true),
                    right: view.getInt16(offset + 14, true)
                },
                leftBox: {
                    top: view.getInt16(offset + 16, true),
                    bottom: view.getInt16(offset + 18, true),
                    left: view.getInt16(offset + 20, true),
                    right: view.getInt16(offset + 22, true)
                },
                rightChild: view.getInt16(offset + 24, true),
                leftChild: view.getInt16(offset + 26, true)
            });
        }

        return nodes;
    }

    // Get the default palette (PLAYPAL lump, first palette)
    getPalette() {
        const playpal = this.getLumpData('PLAYPAL');
        if (!playpal || playpal.length < 768) {
            console.warn('No PLAYPAL found, using default palette');
            return this.getDefaultPalette();
        }

        // Return first palette (768 bytes = 256 colors * 3 bytes RGB)
        const palette = [];
        for (let i = 0; i < 256; i++) {
            palette.push([
                playpal[i * 3],
                playpal[i * 3 + 1],
                playpal[i * 3 + 2]
            ]);
        }
        return palette;
    }

    getDefaultPalette() {
        // Simple grayscale palette as fallback
        const palette = [];
        for (let i = 0; i < 256; i++) {
            palette.push([i, i, i]);
        }
        return palette;
    }

    // Get colormap for lighting
    getColormap() {
        const colormap = this.getLumpData('COLORMAP');
        if (!colormap) {
            console.warn('No COLORMAP found');
            return null;
        }
        return colormap;
    }

    // Get patch names
    getPNames() {
        const pnames = this.getLumpData('PNAMES');
        if (!pnames) return [];

        const view = new DataView(pnames.buffer, pnames.byteOffset, pnames.byteLength);
        const count = view.getInt32(0, true);
        const names = [];

        for (let i = 0; i < count; i++) {
            const offset = 4 + i * 8;
            const name = this.readStringFromBuffer(pnames, offset, 8).trim();
            names.push(name);
        }

        return names;
    }

    readStringFromBuffer(buffer, offset, length) {
        let str = '';
        for (let i = 0; i < length; i++) {
            const char = buffer[offset + i];
            if (char === 0) break;
            str += String.fromCharCode(char);
        }
        return str;
    }

    // Get texture definitions
    getTextures() {
        const textures = new Map();
        const pnames = this.getPNames();

        // Parse TEXTURE1
        const texture1Data = this.getLumpData('TEXTURE1');
        if (texture1Data) {
            this.parseTextureData(texture1Data, pnames, textures);
        }

        // Parse TEXTURE2 (if it exists, mainly for Doom 2)
        const texture2Data = this.getLumpData('TEXTURE2');
        if (texture2Data) {
            this.parseTextureData(texture2Data, pnames, textures);
        }

        console.log(`Loaded ${textures.size} texture definitions`);
        return textures;
    }

    parseTextureData(data, pnames, textures) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const numTextures = view.getInt32(0, true);

        for (let i = 0; i < numTextures; i++) {
            const offset = view.getInt32(4 + i * 4, true);
            
            const name = this.readStringFromBuffer(data, offset, 8).trim();
            const width = view.getInt16(offset + 12, true);
            const height = view.getInt16(offset + 14, true);
            const patchCount = view.getInt16(offset + 20, true);

            const patches = [];
            for (let p = 0; p < patchCount; p++) {
                const patchOffset = offset + 22 + p * 10;
                patches.push({
                    originX: view.getInt16(patchOffset, true),
                    originY: view.getInt16(patchOffset + 2, true),
                    patch: pnames[view.getInt16(patchOffset + 4, true)]
                });
            }

            textures.set(name, { name, width, height, patches });
        }
    }

    // Get a patch (graphic) by name
    getPatch(name) {
        const lump = this.getLump(name);
        if (!lump) return null;

        const view = new DataView(this.buffer, lump.offset, lump.size);
        
        const width = view.getInt16(0, true);
        const height = view.getInt16(2, true);
        const leftOffset = view.getInt16(4, true);
        const topOffset = view.getInt16(6, true);

        // Column offsets
        const columnOffsets = [];
        for (let i = 0; i < width; i++) {
            columnOffsets.push(view.getInt32(8 + i * 4, true));
        }

        return {
            width,
            height,
            leftOffset,
            topOffset,
            columnOffsets,
            data: new Uint8Array(this.buffer, lump.offset, lump.size)
        };
    }

    // Get a flat texture by name
    getFlat(name) {
        const lump = this.getLump(name);
        if (!lump || lump.size !== 4096) return null; // Flats are always 64x64 = 4096 bytes

        return {
            width: 64,
            height: 64,
            data: new Uint8Array(this.buffer, lump.offset, lump.size)
        };
    }

    // Render a patch to pixel data
    renderPatch(patch, palette) {
        if (!patch) return null;

        const pixels = new Uint8Array(patch.width * patch.height * 4); // RGBA
        pixels.fill(0); // Transparent by default

        const view = new DataView(patch.data.buffer, patch.data.byteOffset, patch.data.byteLength);

        // Draw each column
        for (let x = 0; x < patch.width; x++) {
            const columnOffset = patch.columnOffsets[x];
            let offset = columnOffset;

            while (true) {
                const rowStart = view.getUint8(offset);
                if (rowStart === 255) break; // End of column

                const pixelCount = view.getUint8(offset + 1);
                offset += 3; // Skip rowStart, pixelCount, and dummy byte

                for (let i = 0; i < pixelCount; i++) {
                    const paletteIndex = view.getUint8(offset + i);
                    const y = rowStart + i;

                    if (y >= 0 && y < patch.height) {
                        const pixelOffset = (y * patch.width + x) * 4;
                        const color = palette[paletteIndex];
                        pixels[pixelOffset] = color[0];     // R
                        pixels[pixelOffset + 1] = color[1]; // G
                        pixels[pixelOffset + 2] = color[2]; // B
                        pixels[pixelOffset + 3] = 255;      // A
                    }
                }

                offset += pixelCount + 1; // Skip pixels and dummy byte
            }
        }

        return { width: patch.width, height: patch.height, pixels };
    }

    // Render a texture (composed of multiple patches)
    renderTexture(textureDef, palette) {
        if (!textureDef) return null;

        const pixels = new Uint8Array(textureDef.width * textureDef.height * 4);
        pixels.fill(0); // Transparent

        // Draw each patch
        for (const patchRef of textureDef.patches) {
            const patch = this.getPatch(patchRef.patch);
            if (!patch) continue;

            const patchPixels = this.renderPatch(patch, palette);
            if (!patchPixels) continue;

            // Composite patch onto texture
            for (let y = 0; y < patchPixels.height; y++) {
                for (let x = 0; x < patchPixels.width; x++) {
                    const destX = patchRef.originX + x;
                    const destY = patchRef.originY + y;

                    if (destX >= 0 && destX < textureDef.width && 
                        destY >= 0 && destY < textureDef.height) {
                        
                        const srcOffset = (y * patchPixels.width + x) * 4;
                        const destOffset = (destY * textureDef.width + destX) * 4;

                        // Only copy if source pixel is not transparent
                        if (patchPixels.pixels[srcOffset + 3] > 0) {
                            pixels[destOffset] = patchPixels.pixels[srcOffset];
                            pixels[destOffset + 1] = patchPixels.pixels[srcOffset + 1];
                            pixels[destOffset + 2] = patchPixels.pixels[srcOffset + 2];
                            pixels[destOffset + 3] = patchPixels.pixels[srcOffset + 3];
                        }
                    }
                }
            }
        }

        return { width: textureDef.width, height: textureDef.height, pixels };
    }

    // Render a flat texture
    renderFlat(flat, palette) {
        if (!flat) return null;

        const pixels = new Uint8Array(flat.width * flat.height * 4);

        for (let i = 0; i < flat.data.length; i++) {
            const paletteIndex = flat.data[i];
            const color = palette[paletteIndex];
            const offset = i * 4;
            pixels[offset] = color[0];
            pixels[offset + 1] = color[1];
            pixels[offset + 2] = color[2];
            pixels[offset + 3] = 255;
        }

        return { width: flat.width, height: flat.height, pixels };
    }
}

