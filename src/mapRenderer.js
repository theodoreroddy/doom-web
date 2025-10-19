/**
 * Map Renderer for Doom maps
 * Builds 3D geometry from map data
 */

import * as THREE from 'three';
import earcut from 'earcut';

export class MapRenderer {
    constructor(map, palette, wadParser) {
        this.map = map;
        this.palette = palette;
        this.wadParser = wadParser;
        this.geometry = new THREE.Group();
        this.collisionLines = [];
        this.floorSectors = []; // Store floor collision data
        this.animatedSprites = []; // Store animated sprites for updating
        
        // Cache for Three.js textures
        this.textureCache = new Map();
        this.flatCache = new Map();
        
        // Load texture definitions
        this.textureDefs = wadParser.getTextures();
        
        this.buildGeometry();
    }

    buildGeometry() {
        if (!this.map) return;

        console.log(`Building geometry for map with ${this.map.sectors.length} sectors, ${this.map.things.length} things`);
        
        // Build walls from linedefs
        this.buildWalls();
        
        // Build floors and ceilings
        this.buildFloorsAndCeilings();
        
        // Build things (enemies, items, decorations)
        this.buildThings();
        
        console.log('Map geometry built successfully');
    }

    buildWalls() {
        const { linedefs, sidedefs, vertexes, sectors } = this.map;
        
        // Track unique textures for debugging
        this.texturesUsed = new Set();

        for (let i = 0; i < linedefs.length; i++) {
            const linedef = linedefs[i];
            
            const v1 = vertexes[linedef.startVertex];
            const v2 = vertexes[linedef.endVertex];
            
            if (!v1 || !v2) continue;

            // Check if this is a two-sided line (has back sidedef)
            const isTwoSided = linedef.backSidedef !== -1;
            
            // Front side
            if (linedef.frontSidedef !== -1) {
                const sidedef = sidedefs[linedef.frontSidedef];
                const sector = sectors[sidedef.sector];
                
                if (sector) {
                    if (isTwoSided && linedef.backSidedef !== -1) {
                        // Portal (two-sided) - draw upper and lower walls
                        const backSidedef = sidedefs[linedef.backSidedef];
                        const backSector = sectors[backSidedef.sector];
                        
                        if (backSector) {
                            // Upper wall
                            if (backSector.ceilingHeight < sector.ceilingHeight && sidedef.upperTexture !== '-') {
                                this.texturesUsed.add(sidedef.upperTexture);
                                this.createWall(v1, v2, backSector.ceilingHeight, sector.ceilingHeight, 
                                              sidedef.upperTexture);
                            }
                            
                            // Lower wall
                            if (backSector.floorHeight > sector.floorHeight && sidedef.lowerTexture !== '-') {
                                this.texturesUsed.add(sidedef.lowerTexture);
                                this.createWall(v1, v2, sector.floorHeight, backSector.floorHeight,
                                              sidedef.lowerTexture);
                            }
                            
                            // Add collision for doors (special types 1, 26-34, 46, 117-119)
                            const doorTypes = [1, 26, 27, 28, 29, 31, 32, 33, 34, 46, 117, 118, 119];
                            if (doorTypes.includes(linedef.special)) {
                                this.collisionLines.push({
                                    x1: v1.x,
                                    y1: v1.y,
                                    x2: v2.x,
                                    y2: v2.y,
                                    isDoor: true,
                                    special: linedef.special,
                                    linedefIndex: i
                                });
                            }
                        }
                    } else {
                        // Solid wall
                        this.texturesUsed.add(sidedef.middleTexture);
                        this.createWall(v1, v2, sector.floorHeight, sector.ceilingHeight,
                                      sidedef.middleTexture);
                        
                        // Add to collision lines (only solid walls)
                        this.collisionLines.push({
                            x1: v1.x,
                            y1: v1.y,
                            x2: v2.x,
                            y2: v2.y
                        });
                    }
                }
            }
        }
        
        // Count doors
        const doorCount = this.collisionLines.filter(line => line.isDoor).length;
        console.log(`Total collision lines: ${this.collisionLines.length}, Doors: ${doorCount}`);
    }

    createWall(v1, v2, bottomHeight, topHeight, textureName, lightLevel = 255) {
        const height = topHeight - bottomHeight;
        if (height <= 0) return;

        // Calculate wall length for UV mapping
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        // Get texture to know its dimensions
        const texture = this.getWallTexture(textureName);
        const textureDef = this.textureDefs.get(textureName);
        
        // Use actual texture dimensions if available, otherwise use defaults
        const textureWidth = textureDef ? textureDef.width : 64;
        const textureHeight = textureDef ? textureDef.height : 128;

        // Create wall geometry
        const wallGeometry = new THREE.BufferGeometry();
        
        const vertices = new Float32Array([
            // Triangle 1
            v1.x, bottomHeight, -v1.y,
            v2.x, bottomHeight, -v2.y,
            v2.x, topHeight, -v2.y,
            
            // Triangle 2
            v1.x, bottomHeight, -v1.y,
            v2.x, topHeight, -v2.y,
            v1.x, topHeight, -v1.y
        ]);

        // UV coordinates for texture mapping with proper texture dimensions
        const uRepeat = length / textureWidth;
        const vRepeat = height / textureHeight;
        
        const uvs = new Float32Array([
            // Triangle 1
            0, 1,
            uRepeat, 1,
            uRepeat, 1 - vRepeat,
            
            // Triangle 2
            0, 1,
            uRepeat, 1 - vRepeat,
            0, 1 - vRepeat
        ]);

        wallGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        wallGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        wallGeometry.computeVertexNormals();
        
        // Apply sector lighting - convert Doom light level (0-255) to brightness (0-1)
        const brightness = lightLevel / 255;
        
        const material = new THREE.MeshLambertMaterial({
            map: texture,
            side: THREE.DoubleSide,
            color: new THREE.Color(brightness, brightness, brightness)
        });

        const mesh = new THREE.Mesh(wallGeometry, material);
        this.geometry.add(mesh);
    }

    buildFloorsAndCeilings() {
        // Build floors and ceilings from sectors directly
        const { sectors } = this.map;
        let floorsCreated = 0;
        let ceilingsCreated = 0;

        console.log(`Building floors and ceilings for ${sectors.length} sectors`);

        for (let i = 0; i < sectors.length; i++) {
            const sector = sectors[i];
            
            // Get the polygon for this sector
            const polygon = this.getSectorPolygon(i);
            
            if (polygon.length < 3) {
                console.warn(`Sector ${i} has only ${polygon.length} vertices, skipping`);
                continue;
            }

            // Store floor collision data for EVERY sector with a polygon
            this.floorSectors.push({
                sectorIndex: i,
                polygon: polygon.map(p => ({ x: p.x, y: p.y })), // Convert Vector2 to plain objects
                floorHeight: sector.floorHeight,
                ceilingHeight: sector.ceilingHeight
            });

            // Create floor
            if (sector.floorTexture !== 'F_SKY1') {
                this.texturesUsed.add(sector.floorTexture);
                this.createSectorFloorCeiling(polygon, sector.floorHeight, 
                    sector.floorTexture, false, i);
                floorsCreated++;
            }

            // Create ceiling
            if (sector.ceilingTexture !== 'F_SKY1') {
                this.texturesUsed.add(sector.ceilingTexture);
                this.createSectorFloorCeiling(polygon, sector.ceilingHeight,
                    sector.ceilingTexture, true, i);
                ceilingsCreated++;
            }
        }
        
        console.log(`Created ${floorsCreated} floors and ${ceilingsCreated} ceilings from ${sectors.length} sectors`);
        console.log(`Stored ${this.floorSectors.length} floor collision sectors`);
        console.log(`Textures used in map (${this.texturesUsed.size} unique):`, Array.from(this.texturesUsed).sort());
    }

    getSectorPolygon(sectorIndex) {
        const { linedefs, sidedefs, vertexes } = this.map;
        
        // Collect all linedefs for this sector with their direction
        const sectorLines = [];
        for (let i = 0; i < linedefs.length; i++) {
            const linedef = linedefs[i];
            
            // Check if this linedef's front side belongs to our sector
            if (linedef.frontSidedef !== -1) {
                const sidedef = sidedefs[linedef.frontSidedef];
                if (sidedef && sidedef.sector === sectorIndex) {
                    sectorLines.push({
                        linedef: linedef,
                        index: i,
                        forward: true // Use linedef direction
                    });
                }
            }
            
            // Check if this linedef's back side belongs to our sector
            if (linedef.backSidedef !== -1) {
                const sidedef = sidedefs[linedef.backSidedef];
                if (sidedef && sidedef.sector === sectorIndex) {
                    sectorLines.push({
                        linedef: linedef,
                        index: i,
                        forward: false // Use reverse direction
                    });
                }
            }
        }

        if (sectorLines.length === 0) {
            return [];
        }

        // Build ordered vertex chain by connecting lines
        const points = [];
        const used = new Set();
        
        // Start with first line
        let currentLine = sectorLines[0];
        used.add(0);
        
        // Add first vertex
        const startV = currentLine.forward 
            ? vertexes[currentLine.linedef.startVertex]
            : vertexes[currentLine.linedef.endVertex];
        
        if (!startV) return [];
        
        points.push(new THREE.Vector2(startV.x, startV.y));
        
        // Get the end vertex of current line
        let currentEndVertex = currentLine.forward 
            ? currentLine.linedef.endVertex
            : currentLine.linedef.startVertex;
        
        // Try to build a closed loop
        let iterations = 0;
        const maxIterations = sectorLines.length * 2;
        
        while (used.size < sectorLines.length && iterations < maxIterations) {
            iterations++;
            
            // Find next connected line
            let found = false;
            for (let i = 0; i < sectorLines.length; i++) {
                if (used.has(i)) continue;
                
                const line = sectorLines[i];
                const lineStartV = line.forward ? line.linedef.startVertex : line.linedef.endVertex;
                const lineEndV = line.forward ? line.linedef.endVertex : line.linedef.startVertex;
                
                if (lineStartV === currentEndVertex) {
                    // This line connects to our current end
                    const v = vertexes[lineStartV];
                    if (v) {
                        points.push(new THREE.Vector2(v.x, v.y));
                    }
                    currentEndVertex = lineEndV;
                    used.add(i);
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                // Can't find connecting line, break
                break;
            }
        }
        
        // If we couldn't trace a complete loop, fall back to simple approach
        if (points.length < 3) {
            console.warn(`Sector ${sectorIndex}: Failed to trace boundary, using centroid sort`);
            return this.getSectorPolygonFallback(sectorIndex, sectorLines);
        }
        
        return points;
    }
    
    getSectorPolygonFallback(sectorIndex, sectorLines) {
        const { vertexes } = this.map;
        
        // Extract unique vertices
        const uniqueVertices = new Map();
        
        for (const line of sectorLines) {
            const v1 = vertexes[line.linedef.startVertex];
            const v2 = vertexes[line.linedef.endVertex];
            
            if (v1) {
                const key = `${v1.x},${v1.y}`;
                if (!uniqueVertices.has(key)) {
                    uniqueVertices.set(key, new THREE.Vector2(v1.x, v1.y));
                }
            }
            if (v2) {
                const key = `${v2.x},${v2.y}`;
                if (!uniqueVertices.has(key)) {
                    uniqueVertices.set(key, new THREE.Vector2(v2.x, v2.y));
                }
            }
        }
        
        const points = Array.from(uniqueVertices.values());

        // Sort points by angle from centroid for proper ordering
        if (points.length > 2) {
            // Calculate centroid
            let cx = 0, cy = 0;
            for (const p of points) {
                cx += p.x;
                cy += p.y;
            }
            cx /= points.length;
            cy /= points.length;

            // Sort by angle
            points.sort((a, b) => {
                const angleA = Math.atan2(a.y - cy, a.x - cx);
                const angleB = Math.atan2(b.y - cy, b.x - cx);
                return angleA - angleB;
            });
        }

        return points;
    }

    createSectorFloorCeiling(points, height, textureName, isCeiling, sectorIndex) {
        if (points.length < 3) return;

        // Use earcut-style triangulation for better results
        const vertices = [];
        const uvs = [];

        // Add all vertices
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            vertices.push(p.x, height, -p.y);
            uvs.push(p.x / 64, -p.y / 64); // Fixed UV coordinate
        }

        // Create indices - use earcut algorithm for proper triangulation
        const flatPositions = [];
        for (let i = 0; i < points.length; i++) {
            flatPositions.push(points[i].x, points[i].y);
        }
        
        const indices = earcut(flatPositions);
        
        // Debug: Check if triangulation failed or produced invalid results
        if (!indices || indices.length === 0) {
            console.warn(`Sector ${sectorIndex}: Earcut triangulation failed for ${textureName} with ${points.length} vertices`);
            return;
        }
        
        if (indices.length < 3) {
            console.warn(`Sector ${sectorIndex}: Earcut produced insufficient indices (${indices.length}) for ${textureName}`);
            return;
        }
        
        // Reverse winding order for ceiling
        if (isCeiling) {
            indices.reverse();
        }

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        // Get or create texture
        const texture = this.getFlatTexture(textureName);
        
        const material = new THREE.MeshLambertMaterial({
            map: texture,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        this.geometry.add(mesh);
    }


    getWallTexture(textureName) {
        // Check cache first
        if (this.textureCache.has(textureName)) {
            return this.textureCache.get(textureName);
        }

        // Try to get texture definition
        const textureDef = this.textureDefs.get(textureName);
        if (!textureDef) {
            console.warn(`Wall texture not found in WAD: ${textureName}, using fallback`);
            const fallback = this.createFallbackTexture(textureName);
            this.textureCache.set(textureName, fallback);
            return fallback;
        }

        // Render texture from WAD
        const pixelData = this.wadParser.renderTexture(textureDef, this.palette);
        if (!pixelData) {
            console.warn(`Failed to render texture: ${textureName}`);
            const fallback = this.createFallbackTexture(textureName);
            this.textureCache.set(textureName, fallback);
            return fallback;
        }

        // Create Three.js texture
        const texture = new THREE.DataTexture(
            pixelData.pixels,
            pixelData.width,
            pixelData.height,
            THREE.RGBAFormat
        );
        texture.needsUpdate = true;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter; // Pixelated look
        texture.minFilter = THREE.NearestFilter;

        this.textureCache.set(textureName, texture);
        console.log(`Loaded wall texture: ${textureName} (${pixelData.width}x${pixelData.height})`);
        return texture;
    }

    getFlatTexture(textureName) {
        // Check cache first
        if (this.flatCache.has(textureName)) {
            return this.flatCache.get(textureName);
        }

        // Try to get flat from WAD
        const flat = this.wadParser.getFlat(textureName);
        if (!flat) {
            console.warn(`Flat texture not found in WAD: ${textureName}, using fallback`);
            const fallback = this.createFallbackTexture(textureName);
            this.flatCache.set(textureName, fallback);
            return fallback;
        }

        // Render flat
        const pixelData = this.wadParser.renderFlat(flat, this.palette);
        if (!pixelData) {
            console.warn(`Failed to render flat: ${textureName}`);
            const fallback = this.createFallbackTexture(textureName);
            this.flatCache.set(textureName, fallback);
            return fallback;
        }

        // Create Three.js texture
        const texture = new THREE.DataTexture(
            pixelData.pixels,
            pixelData.width,
            pixelData.height,
            THREE.RGBAFormat
        );
        texture.needsUpdate = true;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter; // Pixelated look
        texture.minFilter = THREE.NearestFilter;

        this.flatCache.set(textureName, texture);
        console.log(`Loaded flat texture: ${textureName} (${pixelData.width}x${pixelData.height})`);
        return texture;
    }

    createFallbackTexture(textureName) {
        // Create a simple fallback texture when real texture not found
        // Use magenta (classic "missing texture" color) or gray for neutrals
        let color = 0x888888; // Default gray
        
        if (textureName === '-') {
            color = 0xFF00FF; // Magenta for explicitly missing textures
        }
        
        // Create 16x16 colored texture
        const size = 16;
        const pixels = new Uint8Array(size * size * 4);
        const r = (color >> 16) & 0xFF;
        const g = (color >> 8) & 0xFF;
        const b = color & 0xFF;
        
        for (let i = 0; i < size * size; i++) {
            pixels[i * 4] = r;
            pixels[i * 4 + 1] = g;
            pixels[i * 4 + 2] = b;
            pixels[i * 4 + 3] = 255;
        }

        const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
        texture.needsUpdate = true;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        return texture;
    }

    getGeometry() {
        return this.geometry;
    }

    getCollisionLines() {
        return this.collisionLines;
    }
    
    getFloorSectors() {
        return this.floorSectors;
    }
    
    getAnimatedSprites() {
        return this.animatedSprites;
    }

    // Find player start position
    buildThings() {
        if (!this.map || !this.map.things) return;

        console.log(`Placing ${this.map.things.length} things in the map`);

        // Skill level flags (bit flags in thing.flags)
        // Bit 0 (1): Skill 1 & 2 (easy)
        // Bit 1 (2): Skill 3 (medium) 
        // Bit 2 (4): Skill 4 & 5 (hard/nightmare)
        // Bit 4 (16): Multiplayer only
        const SKILL_EASY = 1;
        const SKILL_MEDIUM = 2;
        const SKILL_HARD = 4;  // Ultra-Violence and Nightmare
        const MULTIPLAYER_ONLY = 16;

        let placed = 0;
        let skipped = 0;
        let filtered = 0;
        let unknown = 0;

        for (const thing of this.map.things) {
            // Skip player starts (1-4) and deathmatch starts (11)
            if (thing.type >= 1 && thing.type <= 4) {
                skipped++;
                continue;
            }
            if (thing.type === 11) {
                skipped++;
                continue;
            }

            // Filter by difficulty: Only show Ultra-Violence difficulty items (bit 2)
            if (!(thing.flags & SKILL_HARD)) {
                filtered++;
                continue;
            }

            // Filter out multiplayer-only items (bit 4)
            if (thing.flags & MULTIPLAYER_ONLY) {
                filtered++;
                continue;
            }

            const thingInfo = this.getThingInfo(thing.type);
            if (!thingInfo) {
                unknown++;
                console.warn(`Unknown thing type: ${thing.type} at (${thing.x}, ${thing.y}), flags: ${thing.flags}`);
                continue;
            }

            // Create visual representation based on thing type
            this.createThing(thing, thingInfo);
            placed++;
        }

        console.log(`Things summary: ${placed} placed, ${skipped} skipped (player starts), ${filtered} filtered (difficulty/multiplayer), ${unknown} unknown types`);
    }

    createThing(thing, info) {
        // Try to load sprite first, fall back to geometry if sprite not found
        const spriteFrames = info.sprite ? this.getSpriteFrames(info.sprite) : null;
        
        if (spriteFrames && spriteFrames.length > 0) {
            // Create billboard sprite with first frame
            const spriteMaterial = new THREE.SpriteMaterial({
                map: spriteFrames[0],
                transparent: true,
                alphaTest: 0.1,
                depthWrite: false,
                depthTest: true
            });
            
            const spriteObject = new THREE.Sprite(spriteMaterial);
            
            // Scale sprite based on actual sprite dimensions
            // Use a consistent world units per pixel ratio
            const worldUnitsPerPixel = 1.0; // 1 world unit = 1 pixel in sprite
            
            const spriteWidth = (spriteFrames[0].spriteWidth || 64) * worldUnitsPerPixel;
            const spriteHeight = (spriteFrames[0].spriteHeight || 64) * worldUnitsPerPixel;
            
            spriteObject.scale.set(spriteWidth, spriteHeight, 1);
            
            // Position the thing - place them ON the floor, not hovering
            const floorHeight = this.getFloorHeightAt(thing.x, thing.y);
            
            // Lift items slightly to prevent floor clipping
            let yOffset = 0;
            if (info.category === 'item' || info.category === 'weapon' || info.category === 'ammo') {
                yOffset = 8;
            }
            
            // Bottom of sprite should be at floor level
            spriteObject.position.set(thing.x, floorHeight + spriteHeight / 2 + yOffset, -thing.y);
            
            console.log(`Placed sprite ${info.sprite} (${info.name}) at (${thing.x}, ${Math.round(floorHeight + info.height / 2)}, ${-thing.y})`);
            
            // Add animation data if multiple frames exist
            if (spriteFrames.length > 1) {
                spriteObject.userData.animation = {
                    frames: spriteFrames,
                    currentFrame: 0,
                    frameTime: 0,
                    frameDelay: 0.2, // 200ms per frame
                    loop: true
                };
                this.animatedSprites.push(spriteObject);
                console.log(`  Added animation with ${spriteFrames.length} frames`);
            }
            
            this.geometry.add(spriteObject);
        } else {
            console.log(`Using fallback geometry for ${info.name} at (${thing.x}, ${thing.y})`);
        
            // Fallback to geometric shapes - use actual dimensions
            let geometry, material;

            if (info.category === 'enemy') {
                geometry = new THREE.CylinderGeometry(info.radius, info.radius, info.height, 8);
                material = new THREE.MeshLambertMaterial({
                    color: info.color,
                    emissive: info.color,
                    emissiveIntensity: 0.4
                });
            } else if (info.category === 'item' || info.category === 'weapon' || info.category === 'ammo') {
                if (info.shape === 'sphere') {
                    geometry = new THREE.SphereGeometry(info.radius, 8, 8);
                } else {
                    geometry = new THREE.BoxGeometry(info.radius * 2, info.height, info.radius * 2);
                }
                material = new THREE.MeshLambertMaterial({
                    color: info.color,
                    emissive: info.color,
                    emissiveIntensity: 0.5
                });
            } else if (info.category === 'decoration') {
                if (info.shape === 'cylinder') {
                    geometry = new THREE.CylinderGeometry(info.radius, info.radius, info.height, 8);
                } else {
                    geometry = new THREE.BoxGeometry(info.radius * 2, info.height, info.radius * 2);
                }
                material = new THREE.MeshLambertMaterial({
                    color: info.color,
                    emissive: info.color,
                    emissiveIntensity: 0.2
                });
            } else {
                return;
            }

            const mesh = new THREE.Mesh(geometry, material);
            const floorHeight = this.getFloorHeightAt(thing.x, thing.y);
            
            // Lift items slightly to prevent floor clipping
            let yOffset = 0;
            if (info.category === 'item' || info.category === 'weapon' || info.category === 'ammo') {
                yOffset = 8;
            }
            
            // Place geometry on floor level - bottom at floor
            mesh.position.set(thing.x, floorHeight + info.height / 2 + yOffset, -thing.y);
            
            const angleRad = (thing.angle) * Math.PI / 180;
            mesh.rotation.y = -angleRad;

            console.log(`Placed fallback geometry for ${info.name} at (${thing.x}, ${Math.round(floorHeight + info.height / 2)}, ${-thing.y})`);

            this.geometry.add(mesh);
        }
    }

    getSpriteFrames(spriteName) {
        // Load multiple frames for animation
        // Doom sprites: ####X# where #### is name, X is rotation (A-H), # is frame (0-9, A-Z)
        const frames = [];
        
        // Try loading multiple frames: A0, B0, C0, D0, etc. (rotation frames)
        // Also try numbered frames: A0, A1, A2, A3, etc. (animation frames)
        
        // First, try rotation frames (common for enemies and items that spin)
        const rotations = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        for (const rotation of rotations) {
            const frameName = spriteName + rotation + '0';
            const patch = this.wadParser.getPatch(frameName);
            if (patch) {
                const texture = this.createSpriteTexture(patch, `sprite_${frameName}`);
                if (texture) {
                    frames.push(texture);
                }
            }
        }
        
        // If we got rotation frames, return those
        if (frames.length > 1) {
            console.log(`Loaded ${frames.length} rotation frames for ${spriteName}`);
            return frames;
        }
        
        // Otherwise, try numbered animation frames
        frames.length = 0; // Clear any single frame we might have
        for (let i = 0; i < 8; i++) {
            const frameName = spriteName + 'A' + i;
            const patch = this.wadParser.getPatch(frameName);
            if (patch) {
                const texture = this.createSpriteTexture(patch, `sprite_${frameName}`);
                if (texture) {
                    frames.push(texture);
                }
            } else {
                break; // Stop when we don't find the next frame
            }
        }
        
        // If we found animation frames, return those
        if (frames.length > 0) {
            if (frames.length > 1) {
                console.log(`Loaded ${frames.length} animation frames for ${spriteName}`);
            }
            return frames;
        }
        
        // Try alternative single frame names
        const altNames = [
            spriteName + 'A0',
            spriteName + 'A1',
            spriteName + 'A2A8',
            spriteName + 'AB',
            spriteName + 'A'
        ];
        
        for (const altName of altNames) {
            const patch = this.wadParser.getPatch(altName);
            if (patch) {
                const texture = this.createSpriteTexture(patch, `sprite_${altName}`);
                if (texture) {
                    return [texture]; // Return single frame as array
                }
            }
        }
        
        console.warn(`Sprite not found: ${spriteName}`);
        return null;
    }
    
    getSprite(spriteName) {
        // Backward compatibility - get first frame
        const frames = this.getSpriteFrames(spriteName);
        return frames ? frames[0] : null;
    }

    createSpriteTexture(patch, cacheName) {
        const pixelData = this.wadParser.renderPatch(patch, this.palette);
        if (!pixelData) return null;

        const texture = new THREE.DataTexture(
            pixelData.pixels,
            pixelData.width,
            pixelData.height,
            THREE.RGBAFormat
        );
        texture.needsUpdate = true;
        texture.flipY = true; // Flip vertically to correct orientation
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        
        // Store dimensions for easy access
        texture.spriteWidth = pixelData.width;
        texture.spriteHeight = pixelData.height;

        this.textureCache.set(cacheName, texture);
        return texture;
    }

    getFloorHeightAt(x, y) {
        // Find which sector this point is in
        // For simplicity, we'll just use the first sector's floor height
        // A proper implementation would do point-in-polygon testing
        if (this.map.sectors.length > 0) {
            // Try to find the sector by checking all sectors
            for (let i = 0; i < this.map.sectors.length; i++) {
                const polygon = this.getSectorPolygon(i);
                if (polygon.length >= 3 && this.pointInPolygon(x, y, polygon)) {
                    return this.map.sectors[i].floorHeight;
                }
            }
            // Default to first sector if not found
            return this.map.sectors[0].floorHeight;
        }
        return 0;
    }

    pointInPolygon(x, y, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    getThingInfo(type) {
        // Comprehensive Doom thing type database with sprite names
        const thingTypes = {
            // Enemies - Monsters (sprite names are 4 chars)
            3004: { category: 'enemy', name: 'Former Human', sprite: 'POSS', color: 0x8B4513, radius: 20, height: 56 },
            9: { category: 'enemy', name: 'Former Sergeant', sprite: 'SPOS', color: 0x654321, radius: 20, height: 56 },
            3001: { category: 'enemy', name: 'Imp', sprite: 'TROO', color: 0x8B4513, radius: 20, height: 56 },
            3002: { category: 'enemy', name: 'Demon', sprite: 'SARG', color: 0xFF69B4, radius: 30, height: 56 },
            58: { category: 'enemy', name: 'Spectre', sprite: 'SARG', color: 0xE0E0E0, radius: 30, height: 56 },
            3006: { category: 'enemy', name: 'Lost Soul', sprite: 'SKUL', color: 0xFF4500, radius: 16, height: 56 },
            3005: { category: 'enemy', name: 'Cacodemon', sprite: 'HEAD', color: 0xDC143C, radius: 31, height: 56 },
            69: { category: 'enemy', name: 'Hell Knight', sprite: 'BOS2', color: 0x8B4513, radius: 24, height: 64 },
            3003: { category: 'enemy', name: 'Baron of Hell', sprite: 'BOSS', color: 0xFF1493, radius: 24, height: 64 },
            68: { category: 'enemy', name: 'Arachnotron', sprite: 'BSPI', color: 0xFFD700, radius: 64, height: 64 },
            71: { category: 'enemy', name: 'Mancubus', sprite: 'FATT', color: 0x8B4513, radius: 48, height: 64 },
            66: { category: 'enemy', name: 'Revenant', sprite: 'SKEL', color: 0xD2691E, radius: 20, height: 64 },
            67: { category: 'enemy', name: 'Arch-vile', sprite: 'VILE', color: 0xFF4500, radius: 20, height: 56 },
            64: { category: 'enemy', name: 'Arch-vile', sprite: 'VILE', color: 0xFF6347, radius: 20, height: 56 },
            65: { category: 'enemy', name: 'Pain Elemental', sprite: 'PAIN', color: 0x8B4513, radius: 31, height: 56 },
            7: { category: 'enemy', name: 'Spider Mastermind', sprite: 'SPID', color: 0x696969, radius: 128, height: 100 },
            16: { category: 'enemy', name: 'Cyberdemon', sprite: 'CYBR', color: 0x8B0000, radius: 40, height: 110 },
            88: { category: 'enemy', name: 'Boss Brain', sprite: 'BBRN', color: 0xFF69B4, radius: 16, height: 32 },

            // Weapons
            2001: { category: 'weapon', name: 'Shotgun', sprite: 'SHOT', color: 0xA9A9A9, radius: 10, height: 16, shape: 'box' },
            82: { category: 'weapon', name: 'Super Shotgun', sprite: 'SGN2', color: 0x696969, radius: 10, height: 16, shape: 'box' },
            2002: { category: 'weapon', name: 'Chaingun', sprite: 'MGUN', color: 0xFFD700, radius: 10, height: 16, shape: 'box' },
            2003: { category: 'weapon', name: 'Rocket Launcher', sprite: 'LAUN', color: 0xFF4500, radius: 10, height: 16, shape: 'box' },
            2004: { category: 'weapon', name: 'Plasma Gun', sprite: 'PLAS', color: 0x4169E1, radius: 10, height: 16, shape: 'box' },
            2005: { category: 'weapon', name: 'Chainsaw', sprite: 'CSAW', color: 0xDC143C, radius: 10, height: 16, shape: 'box' },
            2006: { category: 'weapon', name: 'BFG9000', sprite: 'BFUG', color: 0x00FF00, radius: 10, height: 16, shape: 'box' },

            // Ammo
            2007: { category: 'ammo', name: 'Ammo Clip', sprite: 'CLIP', color: 0xFFD700, radius: 8, height: 8, shape: 'box' },
            2048: { category: 'ammo', name: 'Box of Ammo', sprite: 'AMMO', color: 0xDAA520, radius: 10, height: 12, shape: 'box' },
            2008: { category: 'ammo', name: 'Shells', sprite: 'SHEL', color: 0xFF8C00, radius: 8, height: 8, shape: 'box' },
            2049: { category: 'ammo', name: 'Box of Shells', sprite: 'SBOX', color: 0xFF6347, radius: 10, height: 12, shape: 'box' },
            2010: { category: 'ammo', name: 'Rocket', sprite: 'ROCK', color: 0xFF4500, radius: 8, height: 8, shape: 'box' },
            2046: { category: 'ammo', name: 'Box of Rockets', sprite: 'BROK', color: 0xDC143C, radius: 10, height: 12, shape: 'box' },
            2047: { category: 'ammo', name: 'Cell Charge', sprite: 'CELL', color: 0x4169E1, radius: 8, height: 8, shape: 'box' },
            17: { category: 'ammo', name: 'Cell Pack', sprite: 'CELP', color: 0x1E90FF, radius: 10, height: 12, shape: 'box' },
            8: { category: 'ammo', name: 'Backpack', sprite: 'BPAK', color: 0x8B4513, radius: 12, height: 16, shape: 'box' },

            // Health
            2011: { category: 'item', name: 'Stimpack', sprite: 'STIM', color: 0x32CD32, radius: 8, height: 8, shape: 'sphere' },
            2012: { category: 'item', name: 'Medikit', sprite: 'MEDI', color: 0x00FF00, radius: 10, height: 12, shape: 'box' },
            2014: { category: 'item', name: 'Health Bonus', sprite: 'BON1', color: 0x87CEEB, radius: 6, height: 6, shape: 'sphere' },
            2013: { category: 'item', name: 'Soulsphere', sprite: 'SOUL', color: 0x4169E1, radius: 12, height: 24, shape: 'sphere' },
            2015: { category: 'item', name: 'Armor Bonus', sprite: 'BON2', color: 0xC0C0C0, radius: 6, height: 6, shape: 'sphere' },
            2018: { category: 'item', name: 'Green Armor', sprite: 'ARM1', color: 0x32CD32, radius: 12, height: 16, shape: 'box' },
            2019: { category: 'item', name: 'Blue Armor', sprite: 'ARM2', color: 0x4169E1, radius: 12, height: 16, shape: 'box' },
            83: { category: 'item', name: 'Megasphere', sprite: 'MEGA', color: 0xFF00FF, radius: 12, height: 24, shape: 'sphere' },

            // Powerups
            2022: { category: 'item', name: 'Invulnerability', sprite: 'PINV', color: 0x32CD32, radius: 12, height: 24, shape: 'sphere' },
            2023: { category: 'item', name: 'Berserk', sprite: 'PSTR', color: 0xFF0000, radius: 12, height: 24, shape: 'sphere' },
            2024: { category: 'item', name: 'Invisibility', sprite: 'PINS', color: 0xE0E0E0, radius: 12, height: 24, shape: 'sphere' },
            2025: { category: 'item', name: 'Radiation Suit', sprite: 'SUIT', color: 0x00FF00, radius: 12, height: 24, shape: 'sphere' },
            2026: { category: 'item', name: 'Computer Map', sprite: 'PMAP', color: 0xFFD700, radius: 12, height: 16, shape: 'box' },
            2045: { category: 'item', name: 'Light Amp Goggles', sprite: 'PVIS', color: 0x7CFC00, radius: 12, height: 16, shape: 'box' },

            // Keys
            5: { category: 'item', name: 'Blue Keycard', sprite: 'BKEY', color: 0x0000FF, radius: 8, height: 16, shape: 'box' },
            40: { category: 'item', name: 'Blue Skull Key', sprite: 'BSKU', color: 0x4169E1, radius: 8, height: 16, shape: 'box' },
            13: { category: 'item', name: 'Red Keycard', sprite: 'RKEY', color: 0xFF0000, radius: 8, height: 16, shape: 'box' },
            38: { category: 'item', name: 'Red Skull Key', sprite: 'RSKU', color: 0xDC143C, radius: 8, height: 16, shape: 'box' },
            6: { category: 'item', name: 'Yellow Keycard', sprite: 'YKEY', color: 0xFFFF00, radius: 8, height: 16, shape: 'box' },
            39: { category: 'item', name: 'Yellow Skull Key', sprite: 'YSKU', color: 0xFFD700, radius: 8, height: 16, shape: 'box' },

            // Decorations
            2035: { category: 'decoration', name: 'Barrel', sprite: 'BAR1', color: 0x8B4513, radius: 10, height: 32, shape: 'cylinder' },
            72: { category: 'decoration', name: 'Burning Barrel', sprite: 'FCAN', color: 0xFF4500, radius: 10, height: 32, shape: 'cylinder' },
            48: { category: 'decoration', name: 'Tall Techno Pillar', sprite: 'ELEC', color: 0x696969, radius: 16, height: 128, shape: 'cylinder' },
            30: { category: 'decoration', name: 'Tall Green Pillar', sprite: 'COL1', color: 0x32CD32, radius: 16, height: 128, shape: 'cylinder' },
            32: { category: 'decoration', name: 'Tall Red Pillar', sprite: 'COL3', color: 0xDC143C, radius: 16, height: 128, shape: 'cylinder' },
            31: { category: 'decoration', name: 'Short Green Pillar', sprite: 'COL2', color: 0x3CB371, radius: 16, height: 52, shape: 'cylinder' },
            33: { category: 'decoration', name: 'Short Red Pillar', sprite: 'COL4', color: 0xFF6347, radius: 16, height: 52, shape: 'cylinder' },
            36: { category: 'decoration', name: 'Short Green Column', sprite: 'COL5', color: 0x2E8B57, radius: 16, height: 40, shape: 'cylinder' },
            37: { category: 'decoration', name: 'Short Red Column', sprite: 'COL6', color: 0xCD5C5C, radius: 16, height: 40, shape: 'cylinder' },
            41: { category: 'decoration', name: 'Evil Eye', sprite: 'CEYE', color: 0xFF0000, radius: 16, height: 54, shape: 'sphere' },
            42: { category: 'decoration', name: 'Floating Skull', sprite: 'FSKU', color: 0xD3D3D3, radius: 16, height: 52, shape: 'sphere' },
            47: { category: 'decoration', name: 'Stalagmite', sprite: 'SMIT', color: 0x696969, radius: 16, height: 40, shape: 'cylinder' },
            54: { category: 'decoration', name: 'Large Brown Tree', sprite: 'TRE2', color: 0x8B4513, radius: 32, height: 108, shape: 'cylinder' },
            2028: { category: 'decoration', name: 'Lamp', sprite: 'COLU', color: 0xFFFFE0, radius: 16, height: 48, shape: 'cylinder' },
            85: { category: 'decoration', name: 'Tall Mercury Lamp', sprite: 'TLMP', color: 0xC0C0C0, radius: 16, height: 80, shape: 'cylinder' },
            86: { category: 'decoration', name: 'Short Mercury Lamp', sprite: 'TLP2', color: 0xC0C0C0, radius: 16, height: 60, shape: 'cylinder' },
            34: { category: 'decoration', name: 'Candle', sprite: 'CAND', color: 0xFFD700, radius: 8, height: 16, shape: 'cylinder' },
            35: { category: 'decoration', name: 'Candelabra', sprite: 'CBRA', color: 0xDAA520, radius: 16, height: 60, shape: 'cylinder' },
            44: { category: 'decoration', name: 'Blue Torch', sprite: 'TBLU', color: 0x4169E1, radius: 16, height: 96, shape: 'cylinder' },
            45: { category: 'decoration', name: 'Green Torch', sprite: 'TGRN', color: 0x32CD32, radius: 16, height: 96, shape: 'cylinder' },
            46: { category: 'decoration', name: 'Red Torch', sprite: 'TRED', color: 0xDC143C, radius: 16, height: 96, shape: 'cylinder' },
            55: { category: 'decoration', name: 'Short Blue Torch', sprite: 'SMBT', color: 0x6495ED, radius: 16, height: 68, shape: 'cylinder' },
            56: { category: 'decoration', name: 'Short Green Torch', sprite: 'SMGT', color: 0x3CB371, radius: 16, height: 68, shape: 'cylinder' },
            57: { category: 'decoration', name: 'Short Red Torch', sprite: 'SMRT', color: 0xFF6347, radius: 16, height: 68, shape: 'cylinder' },
            70: { category: 'decoration', name: 'Burning Barrel', sprite: 'FCAN', color: 0xFF8C00, radius: 10, height: 32, shape: 'cylinder' },
        };

        return thingTypes[type] || null;
    }

    getPlayerStart() {
        if (!this.map || !this.map.things) return null;
        
        // Thing type 1 = Player 1 start
        const playerStart = this.map.things.find(t => t.type === 1);
        
        if (playerStart) {
            // Convert angle to radians (Doom uses degrees, 0 = east)
            const angleRad = (playerStart.angle - 90) * Math.PI / 180;
            
            return {
                x: playerStart.x,
                y: playerStart.y,
                z: 41, // Player height (eye level)
                angle: angleRad
            };
        }
        
        return null;
    }
}

