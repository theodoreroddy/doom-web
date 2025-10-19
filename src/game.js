/**
 * Game Engine - Main game logic and rendering
 */

import * as THREE from 'three';

export class Game {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.mapGeometry = null;
        this.collisionLines = [];
        this.floorSectors = [];
        this.animatedSprites = [];
        this.skyBox = null;
        this.wadParser = null;
        this.spacePressed = false;
        
        // Player state
        this.player = {
            position: new THREE.Vector3(0, 41, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            verticalVelocity: 0,
            rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
            height: 41,
            radius: 16,
            speed: 200,
            sprintSpeed: 400,
            gravity: 800,
            onGround: true
        };

        // Input state
        this.keys = {};
        this.mouse = {
            movementX: 0,
            movementY: 0,
            sensitivity: 0.002
        };

        // Game state
        this.isRunning = false;
        this.isPaused = false;
        this.isPointerLocked = false;
        
        // Performance
        this.clock = new THREE.Clock();
        this.fps = 0;
        this.frameCount = 0;
        this.lastFpsUpdate = 0;

        this.init();
    }

    init() {
        // Create scene
        this.scene = new THREE.Scene();
        // Background will be set when sky is loaded
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = new THREE.Fog(0x666666, 2000, 6000);

        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            this.container.clientWidth / this.container.clientHeight,
            1,
            10000
        );

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // Add lights - much brighter for better visibility
        const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(0, 1, 0);
        this.scene.add(directionalLight);

        // Add a player light that will follow the camera
        this.playerLight = new THREE.PointLight(0xffffff, 1.5, 1000);
        this.scene.add(this.playerLight);

        // Event listeners
        this.setupEventListeners();

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());
    }

    setupEventListeners() {
        // Keyboard
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            if (e.code === 'Escape') {
                this.releasePointerLock();
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mouse
        this.renderer.domElement.addEventListener('click', () => {
            if (!this.isPointerLocked) {
                this.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isPointerLocked) {
                this.mouse.movementX = e.movementX || 0;
                this.mouse.movementY = e.movementY || 0;
            }
        });
    }

    requestPointerLock() {
        this.renderer.domElement.requestPointerLock();
    }

    releasePointerLock() {
        document.exitPointerLock();
    }

    loadMap(mapRenderer, wadParser, palette) {
        // Clear existing geometry
        if (this.mapGeometry) {
            this.scene.remove(this.mapGeometry);
        }
        
        // Clear existing sky
        if (this.skyBox) {
            this.scene.remove(this.skyBox);
            this.skyBox = null;
        }

        // Store WAD parser for texture access
        this.wadParser = wadParser;
        this.palette = palette;

        // Add new geometry
        this.mapGeometry = mapRenderer.getGeometry();
        this.scene.add(this.mapGeometry);

        // Get collision data
        this.collisionLines = mapRenderer.getCollisionLines();
        this.floorSectors = mapRenderer.getFloorSectors();
        this.animatedSprites = mapRenderer.getAnimatedSprites();

        // Store map data for floor height detection
        this.mapData = mapRenderer.map;
        
        // Create sky
        this.createSky();
        
        console.log(`Loaded ${this.floorSectors.length} floor collision sectors`);

        // Set player start position
        const playerStart = mapRenderer.getPlayerStart();
        if (playerStart) {
            const floorHeight = this.getFloorHeightAt(playerStart.x, playerStart.y);
            const spawnY = floorHeight + this.player.height;
            
            this.player.position.set(playerStart.x, spawnY, -playerStart.y);
            this.player.rotation.y = playerStart.angle;
            
            // Reset physics state to ensure player starts grounded
            this.player.verticalVelocity = 0;
            this.player.onGround = true;
            
            console.log(`Player spawn: position (${playerStart.x}, ${spawnY}, ${-playerStart.y}), floor: ${floorHeight}, player height: ${this.player.height}`);
            
            // Verify sector collision
            const sector = this.getCurrentSector();
            if (sector) {
                console.log(`Spawn sector found: floor ${sector.floorHeight}, ceiling ${sector.ceilingHeight}`);
            } else {
                console.warn(`WARNING: No sector found at spawn location! Using nearest sector.`);
            }
        } else {
            console.warn('No player start found, using default position');
            // Find a floor sector to spawn on
            if (this.floorSectors.length > 0) {
                const firstSector = this.floorSectors[0];
                const spawnY = firstSector.floorHeight + this.player.height;
                this.player.position.set(0, spawnY, 0);
                console.log(`Spawning on first sector at height ${spawnY}`);
            } else {
                this.player.position.set(0, 41, 0);
            }
            this.player.verticalVelocity = 0;
            this.player.onGround = true;
        }

        // Update camera
        this.updateCamera();
    }

    start() {
        this.isRunning = true;
        this.clock.start();
        
        // Ensure player starts at correct height before first frame
        const sector = this.getCurrentSector();
        if (sector) {
            const correctY = sector.floorHeight + this.player.height;
            if (this.player.position.y < correctY) {
                console.log(`Correcting spawn height: ${this.player.position.y} -> ${correctY}`);
                this.player.position.y = correctY;
            }
        }
        
        this.animate();
    }

    stop() {
        this.isRunning = false;
        this.releasePointerLock();
    }

    animate() {
        if (!this.isRunning) return;

        requestAnimationFrame(() => this.animate());

        const delta = Math.min(this.clock.getDelta(), 0.1); // Cap delta to prevent large jumps
        
        this.update(delta);
        this.render();
        
        // Update FPS counter
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsUpdate > 1000) {
            this.fps = Math.round(this.frameCount * 1000 / (now - this.lastFpsUpdate));
            this.frameCount = 0;
            this.lastFpsUpdate = now;
            
            const fpsElement = document.getElementById('fps');
            if (fpsElement) {
                fpsElement.textContent = this.fps;
            }
        }
    }

    update(delta) {
        if (this.isPaused) return;

        // Update player rotation from mouse (horizontal only - classic Doom style)
        if (this.isPointerLocked) {
            this.player.rotation.y -= this.mouse.movementX * this.mouse.sensitivity;
            
            this.mouse.movementX = 0;
            this.mouse.movementY = 0;
        }
        
        // Lock vertical rotation to horizon (classic Doom)
        this.player.rotation.x = 0;

        // Handle door opening with space bar
        if (this.keys['Space'] && !this.spacePressed) {
            this.spacePressed = true;
            this.tryOpenDoor();
        }
        
        if (!this.keys['Space']) {
            this.spacePressed = false;
        }

        // Apply gravity
        this.player.verticalVelocity -= this.player.gravity * delta;

        // Update player movement
        const moveSpeed = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) ? 
                          this.player.sprintSpeed : this.player.speed;
        
        const moveVector = new THREE.Vector3(0, 0, 0);

        if (this.keys['KeyW']) moveVector.z -= 1;
        if (this.keys['KeyS']) moveVector.z += 1;
        if (this.keys['KeyA']) moveVector.x -= 1;
        if (this.keys['KeyD']) moveVector.x += 1;

        if (moveVector.length() > 0) {
            moveVector.normalize();
            
            // Apply rotation
            moveVector.applyEuler(new THREE.Euler(0, this.player.rotation.y, 0));
            
            // Apply speed and delta time
            moveVector.multiplyScalar(moveSpeed * delta);
            
            // Try to move with collision detection
            this.movePlayer(moveVector);
        }

        // Apply vertical movement from jump/gravity
        this.applyVerticalMovement(delta);

        // Update camera
        this.updateCamera();
        
        // Update animated sprites
        this.updateAnimatedSprites(delta);
        
        // Update position display
        this.updatePositionDisplay();
    }

    movePlayer(moveVector) {
        const newPosition = this.player.position.clone().add(moveVector);
        
        // Check wall collision
        if (!this.checkCollision(newPosition)) {
            this.player.position.copy(newPosition);
        } else {
            // Try sliding along walls
            // Try X movement only
            const xOnly = this.player.position.clone();
            xOnly.x += moveVector.x;
            if (!this.checkCollision(xOnly)) {
                this.player.position.copy(xOnly);
            }
            
            // Try Z movement only
            const zOnly = this.player.position.clone();
            zOnly.z += moveVector.z;
            if (!this.checkCollision(zOnly)) {
                this.player.position.copy(zOnly);
            }
        }

        // Update vertical position based on floor height
        this.updatePlayerHeight();
    }

    applyVerticalMovement(delta) {
        // ABSOLUTE MINIMUM HEIGHT - Never fall below this under any circumstances
        const ABSOLUTE_MIN_HEIGHT = 0;
        
        if (!this.mapData && this.floorSectors.length === 0) {
            // No map data, keep player at safe height
            const minY = this.player.height;
            if (this.player.position.y < minY) {
                this.player.position.y = minY;
                this.player.verticalVelocity = 0;
                this.player.onGround = true;
            }
            return;
        }

        // Get floor and ceiling heights at player's current position
        const sector = this.getCurrentSector();
        
        // Default floor/ceiling if sector not found (uses nearest sector)
        let floorHeight = ABSOLUTE_MIN_HEIGHT;
        let ceilingHeight = 512;
        
        if (sector) {
            floorHeight = sector.floorHeight;
            ceilingHeight = sector.ceilingHeight;
        } else {
            console.warn(`Player outside all sectors at (${Math.round(this.player.position.x)}, ${Math.round(-this.player.position.z)})`);
        }

        // Apply vertical velocity
        this.player.position.y += this.player.verticalVelocity * delta;

        // Check floor collision - ALWAYS enforce floor
        const minY = floorHeight + this.player.height;
        if (this.player.position.y <= minY) {
            this.player.position.y = minY;
            this.player.verticalVelocity = 0;
            this.player.onGround = true;
        } else {
            this.player.onGround = false;
        }

        // Check ceiling collision
        const maxY = ceilingHeight - 4; // Small buffer from ceiling
        if (this.player.position.y >= maxY) {
            this.player.position.y = maxY;
            this.player.verticalVelocity = 0; // Stop upward movement when hitting ceiling
        }

        // CRITICAL: Triple safety check system - NEVER let player fall through floor
        if (this.player.position.y < minY) {
            this.player.position.y = minY;
            this.player.verticalVelocity = 0;
            this.player.onGround = true;
        }
        
        // ULTIMATE safety net - absolute minimum height
        if (this.player.position.y < ABSOLUTE_MIN_HEIGHT + this.player.height) {
            console.error('EMERGENCY: Player fell through floor! Resetting to minimum height.');
            this.player.position.y = Math.max(minY, ABSOLUTE_MIN_HEIGHT + this.player.height);
            this.player.verticalVelocity = 0;
            this.player.onGround = true;
        }
    }

    updatePlayerHeight() {
        if (!this.mapData) return;

        // Get floor and ceiling heights at player's current position
        const sector = this.getCurrentSector();
        if (!sector) {
            // No sector found - use fallback
            const nearestSector = this.findNearestSector();
            if (!nearestSector) return;
            
            const floorHeight = nearestSector.floorHeight;
            const minY = floorHeight + this.player.height;
            
            // Keep player above floor at minimum
            if (this.player.position.y < minY) {
                this.player.position.y = minY;
                this.player.onGround = true;
            }
            return;
        }

        const floorHeight = sector.floorHeight;
        const ceilingHeight = sector.ceilingHeight;

        // Smooth vertical movement for stairs (max step height in Doom is 24 units)
        const maxStepHeight = 24;
        const currentFloorHeight = this.player.position.y - this.player.height;
        const heightDiff = floorHeight - currentFloorHeight;

        // Check ceiling clearance (player head room)
        const minHeadRoom = 56; // Standard Doom player height
        if (ceilingHeight - floorHeight < minHeadRoom) {
            // Not enough room - can't enter this sector
            return;
        }

        // Handle height changes based on current state
        if (Math.abs(heightDiff) <= maxStepHeight) {
            // Small step up/down - move immediately
            const targetY = floorHeight + this.player.height;
            if (targetY <= ceilingHeight) {
                this.player.position.y = targetY;
                this.player.onGround = true;
                this.player.verticalVelocity = 0;
            }
        } else if (heightDiff < 0) {
            // Need to fall down (floor is lower)
            // Allow falling by not forcing player up, just let gravity handle it
            this.player.onGround = false;
            // Don't snap to higher position, let the player fall naturally
        } else if (heightDiff > maxStepHeight) {
            // Floor is too high to step up - treat as wall (handled by collision)
            // Player stays at current height
        }
        
        // SAFETY: Always ensure player doesn't go below floor
        // But allow them to be ABOVE the floor when falling
        const minY = floorHeight + this.player.height;
        if (this.player.position.y < minY) {
            this.player.position.y = minY;
            this.player.verticalVelocity = 0;
            this.player.onGround = true;
        }
    }

    getCurrentSector() {
        // Use the floor sector collision data (matches rendered geometry exactly!)
        const x = this.player.position.x;
        const y = -this.player.position.z;

        // Search through floor sectors for point collision
        for (const floorSector of this.floorSectors) {
            if (this.pointInPolygon(x, y, floorSector.polygon)) {
                return {
                    floorHeight: floorSector.floorHeight,
                    ceilingHeight: floorSector.ceilingHeight,
                    sectorIndex: floorSector.sectorIndex
                };
            }
        }

        // Fallback - find nearest floor sector
        let nearestSector = null;
        let minDist = Infinity;
        
        for (const floorSector of this.floorSectors) {
            // Calculate distance to center of polygon
            let cx = 0, cy = 0;
            for (const p of floorSector.polygon) {
                cx += p.x;
                cy += p.y;
            }
            cx /= floorSector.polygon.length;
            cy /= floorSector.polygon.length;
            
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist < minDist) {
                minDist = dist;
                nearestSector = {
                    floorHeight: floorSector.floorHeight,
                    ceilingHeight: floorSector.ceilingHeight,
                    sectorIndex: floorSector.sectorIndex
                };
            }
        }

        return nearestSector;
    }
    
    findNearestSector() {
        // Use getCurrentSector which now has built-in fallback
        return this.getCurrentSector();
    }

    getFloorHeightAt(x, y) {
        // Use floor sectors for accurate collision matching rendered geometry
        for (const floorSector of this.floorSectors) {
            if (this.pointInPolygon(x, y, floorSector.polygon)) {
                return floorSector.floorHeight;
            }
        }

        // Fallback - find nearest floor sector
        let nearestFloor = 0;
        let minDist = Infinity;
        
        for (const floorSector of this.floorSectors) {
            // Calculate distance to center of polygon
            let cx = 0, cy = 0;
            for (const p of floorSector.polygon) {
                cx += p.x;
                cy += p.y;
            }
            cx /= floorSector.polygon.length;
            cy /= floorSector.polygon.length;
            
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist < minDist) {
                minDist = dist;
                nearestFloor = floorSector.floorHeight;
            }
        }

        return nearestFloor;
    }

    isPointInSector(x, y, sectorIndex) {
        if (!this.mapData) return false;
        
        const { linedefs, sidedefs, vertexes, ssectors, segs } = this.mapData;

        // Use subsectors for more accurate point-in-sector testing
        if (ssectors && segs) {
            for (const ssector of ssectors) {
                // Get sector from first seg of this subsector
                if (ssector.segCount === 0) continue;
                
                const firstSeg = segs[ssector.firstSeg];
                if (!firstSeg) continue;
                
                const linedef = linedefs[firstSeg.linedef];
                if (!linedef) continue;
                
                let segSector = null;
                if (firstSeg.direction === 0 && linedef.frontSidedef !== -1) {
                    segSector = sidedefs[linedef.frontSidedef].sector;
                } else if (firstSeg.direction === 1 && linedef.backSidedef !== -1) {
                    segSector = sidedefs[linedef.backSidedef].sector;
                }
                
                if (segSector !== sectorIndex) continue;
                
                // Build polygon from segs
                const polygon = [];
                for (let i = 0; i < ssector.segCount; i++) {
                    const seg = segs[ssector.firstSeg + i];
                    if (seg) {
                        const v = vertexes[seg.startVertex];
                        if (v) polygon.push({ x: v.x, y: v.y });
                    }
                }
                
                if (polygon.length >= 3 && this.pointInPolygon(x, y, polygon)) {
                    return true;
                }
            }
        }

        // Fallback to linedef-based method
        const vertices = [];
        const seen = new Set();
        
        for (const linedef of linedefs) {
            let belongsToSector = false;

            if (linedef.frontSidedef !== -1) {
                const sidedef = sidedefs[linedef.frontSidedef];
                if (sidedef && sidedef.sector === sectorIndex) {
                    belongsToSector = true;
                }
            }
            if (linedef.backSidedef !== -1) {
                const sidedef = sidedefs[linedef.backSidedef];
                if (sidedef && sidedef.sector === sectorIndex) {
                    belongsToSector = true;
                }
            }

            if (belongsToSector) {
                const v1 = vertexes[linedef.startVertex];
                const v2 = vertexes[linedef.endVertex];
                const key1 = v1 ? `${v1.x},${v1.y}` : null;
                const key2 = v2 ? `${v2.x},${v2.y}` : null;
                
                if (v1 && !seen.has(key1)) {
                    vertices.push({ x: v1.x, y: v1.y });
                    seen.add(key1);
                }
                if (v2 && !seen.has(key2)) {
                    vertices.push({ x: v2.x, y: v2.y });
                    seen.add(key2);
                }
            }
        }

        if (vertices.length < 3) return false;

        return this.pointInPolygon(x, y, vertices);
    }

    pointInPolygon(x, y, polygon) {
        // Point-in-polygon test (ray casting)
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

    checkCollision(position) {
        // Check against all collision lines
        for (const line of this.collisionLines) {
            if (this.circleLineCollision(
                position.x, 
                -position.z, 
                this.player.radius,
                line.x1, 
                line.y1, 
                line.x2, 
                line.y2
            )) {
                return true;
            }
        }
        return false;
    }

    circleLineCollision(cx, cy, radius, x1, y1, x2, y2) {
        // Find closest point on line segment to circle center
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length2 = dx * dx + dy * dy;
        
        if (length2 === 0) {
            // Line is a point
            const dist2 = (cx - x1) * (cx - x1) + (cy - y1) * (cy - y1);
            return dist2 < radius * radius;
        }
        
        // Calculate projection
        let t = ((cx - x1) * dx + (cy - y1) * dy) / length2;
        t = Math.max(0, Math.min(1, t));
        
        // Find closest point
        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;
        
        // Check distance
        const dist2 = (cx - closestX) * (cx - closestX) + (cy - closestY) * (cy - closestY);
        return dist2 < radius * radius;
    }

    tryOpenDoor() {
        if (!this.mapData) return;

        // Check for doors in front of player (within 64 units - Doom's "use" range)
        const useRange = 64;
        const playerX = this.player.position.x;
        const playerY = -this.player.position.z;
        
        // Get player facing direction
        const angle = this.player.rotation.y;
        const dirX = Math.sin(angle);
        const dirY = -Math.cos(angle);
        
        // Check collision lines for doors
        let closestDoor = null;
        let closestDist = Infinity;
        
        for (const line of this.collisionLines) {
            if (!line.isDoor) continue; // Only check door lines
            
            // Calculate distance from player to line center
            const lineCenterX = (line.x1 + line.x2) / 2;
            const lineCenterY = (line.y1 + line.y2) / 2;
            const distToLine = Math.sqrt(
                (playerX - lineCenterX) ** 2 + 
                (playerY - lineCenterY) ** 2
            );
            
            if (distToLine > useRange) continue;
            
            // Check if player is facing the line
            const toLineX = lineCenterX - playerX;
            const toLineY = lineCenterY - playerY;
            const dot = dirX * toLineX + dirY * toLineY;
            
            if (dot < 0) continue; // Not facing this line
            
            // Track closest door
            if (distToLine < closestDist) {
                closestDist = distToLine;
                closestDoor = line;
            }
        }
        
        if (closestDoor) {
            console.log(`Opening door: special type ${closestDoor.special}, distance ${Math.round(closestDist)}`);
            // TODO: Implement actual door opening animation
            // For now, remove collision so player can walk through
            const index = this.collisionLines.indexOf(closestDoor);
            if (index > -1) {
                this.collisionLines.splice(index, 1);
                console.log('Door collision removed - you can walk through now!');
            }
        } else {
            console.log('No door in range or facing wrong direction');
        }
    }

    updateCamera() {
        this.camera.position.copy(this.player.position);
        this.camera.rotation.copy(this.player.rotation);
        
        // Update player light to follow camera
        if (this.playerLight) {
            this.playerLight.position.copy(this.player.position);
        }
        
        // Move skybox with player (keeps sky centered on player)
        if (this.skyBox) {
            this.skyBox.position.x = this.player.position.x;
            this.skyBox.position.z = this.player.position.z;
            // Keep sky at a fixed height relative to player
            this.skyBox.position.y = this.player.position.y + 2000;
        }
    }
    
    updateAnimatedSprites(delta) {
        // Update all animated sprites
        for (const sprite of this.animatedSprites) {
            if (!sprite.userData.animation) continue;
            
            const anim = sprite.userData.animation;
            
            // Update frame timer
            anim.frameTime += delta;
            
            // Check if it's time to advance to next frame
            if (anim.frameTime >= anim.frameDelay) {
                anim.frameTime -= anim.frameDelay;
                
                // Advance to next frame
                anim.currentFrame++;
                
                // Loop or stop at end
                if (anim.currentFrame >= anim.frames.length) {
                    if (anim.loop) {
                        anim.currentFrame = 0;
                    } else {
                        anim.currentFrame = anim.frames.length - 1;
                    }
                }
                
                // Update sprite texture to current frame
                sprite.material.map = anim.frames[anim.currentFrame];
                sprite.material.needsUpdate = true;
            }
        }
    }

    updatePositionDisplay() {
        const posElement = document.getElementById('position');
        if (posElement) {
            const sector = this.getCurrentSector();
            const floorHeight = sector ? sector.floorHeight : 0;
            posElement.textContent = 
                `(${Math.round(this.player.position.x)}, ${Math.round(-this.player.position.z)}, ${Math.round(floorHeight)})`;
        }
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    createSky() {
        if (!this.wadParser || !this.palette) {
            console.warn('No WAD parser available for sky texture');
            return;
        }

        // Try to load SKY1 texture (standard Doom sky texture)
        const skyPatch = this.wadParser.getPatch('SKY1');
        
        if (!skyPatch) {
            console.warn('Sky texture SKY1 not found in WAD');
            // Set a default sky-like background color
            this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
            return;
        }

        // Render the sky patch
        const pixelData = this.wadParser.renderPatch(skyPatch, this.palette);
        if (!pixelData) {
            console.warn('Failed to render sky texture');
            this.scene.background = new THREE.Color(0x87CEEB);
            return;
        }

        // Create texture from pixel data
        const skyTexture = new THREE.DataTexture(
            pixelData.pixels,
            pixelData.width,
            pixelData.height,
            THREE.RGBAFormat
        );
        skyTexture.needsUpdate = true;
        skyTexture.wrapS = THREE.RepeatWrapping;
        skyTexture.wrapT = THREE.ClampToEdgeWrapping;
        skyTexture.magFilter = THREE.NearestFilter;
        skyTexture.minFilter = THREE.NearestFilter;

        // Create a large cylinder for the sky (Doom-style)
        // In Doom, the sky wraps horizontally but not vertically
        // Make it much taller to cover the full view
        const skyGeometry = new THREE.CylinderGeometry(8000, 8000, 10000, 32, 1, true);
        const skyMaterial = new THREE.MeshBasicMaterial({
            map: skyTexture,
            side: THREE.BackSide, // Render inside of cylinder
            depthWrite: false // Sky is always behind everything
        });

        this.skyBox = new THREE.Mesh(skyGeometry, skyMaterial);
        this.skyBox.rotation.y = Math.PI; // Rotate to face correctly
        
        // Position sky relative to player - centered vertically
        this.skyBox.position.copy(this.player.position);
        this.skyBox.position.y = this.player.position.y + 2000; // Raise it up so player is in lower portion
        
        this.scene.add(this.skyBox);
        
        // Update fog to match sky
        this.scene.fog = new THREE.Fog(0x666666, 3000, 8000);
        
        console.log(`Sky texture loaded: ${pixelData.width}x${pixelData.height}`);
    }


    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    dispose() {
        this.stop();
        
        // Dispose of Three.js resources
        if (this.mapGeometry) {
            this.mapGeometry.traverse((object) => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
        }

        this.renderer.dispose();
        this.container.removeChild(this.renderer.domElement);
    }
}

