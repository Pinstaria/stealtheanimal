// public/game.js

// Replace your top import line in public/game.js with this:
import { authenticateAndLoadData, savePlayerData } from './firebase-setup.js';
import { UIManager } from './ui-mechanics.js';
import { BaseRenderer } from './base-rendering.js';
// Paste this directly near the top of public/game.js:
class AssetManager {
    constructor() {
        this.images = {};
        this.sounds = {};
    }

    loadImage(key, src) {
        const img = new Image();
        img.src = src;
        this.images[key] = img;
    }

    loadSound(key, src) {
        const audio = new Audio(src);
        this.sounds[key] = audio;
    }

    playSound(key) {
        if (this.sounds[key]) {
            this.sounds[key].cloneNode(true).play(); 
        }
    }
}

const assets = new AssetManager();
assets.loadImage('player', '/sprites/player.png');
assets.loadImage('bot', '/sprites/bot.png');
assets.loadImage('animal', '/sprites/animal_base.png');
assets.loadSound('grab', '/sounds/grab.mp3');
assets.loadSound('sell', '/sounds/cha-ching.mp3');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let socket;

// Game State
let myUid = null;
let myId = null; 
let lobbyCode = null;
let entities = new Map(); // Stores both players and bots
let centralAnimals = [];
let localData = { money: 0 };

// Controlsconst keys = { 
    w: false, a: false, s: false, d: false, 
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, 
    space: false 
};
// Add these variables right under your existing 'let localData = { money: 0 };'
let uiManager;
let baseRenderer;

// Replace your current initGame() function with this fixed version:
async function initGame() {
    try {
        // 1. Authenticate & Load Firebase Data
        let authData;
        try {
            authData = await authenticateAndLoadData();
        } catch (e) {
            console.warn("Firebase not set up yet! Using temporary local data to test.");
            authData = { uid: "GUEST_123", savedData: { money: 0, lockLevel: 1, animals: [] } };
        }
        
        myUid = authData.uid;
        localData = authData.savedData;
        document.getElementById('money-display').innerText = localData.money;

        // 2. Connect to Multiplayer Server
        // Make sure this points to your Render URL if hosting online!
        socket = io(); 

        // 3. Initialize the UI Buttons and Base Drawer
        uiManager = new UIManager(localData, socket, myUid);
        
        socket.emit('joinLobby', { savedData: localData });

        setupSocketListeners();
        setupInputListeners();
        
        // Start Render Loop
        requestAnimationFrame(gameLoop);

    } catch (error) {
        console.error("Failed to initialize game:", error);
    }
}
// Resize Canvas
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Initialize Game
async function initGame() {
    try {
        // 1. Authenticate & Load Firebase Data
        const authData = await authenticateAndLoadData();
        myUid = authData.uid;
        localData.money = authData.savedData.money;
        document.getElementById('money-display').innerText = localData.money;

        // 2. Connect to Multiplayer Server
        socket = io();

        // Join default lobby (or generate new if no code provided)
        socket.emit('joinLobby', { savedData: authData.savedData });

        setupSocketListeners();
        setupInputListeners();
        
        // Start Render Loop
        requestAnimationFrame(gameLoop);

    } catch (error) {
        console.error("Failed to initialize game:", error);
    }
}

function setupSocketListeners() {
    socket.on('lobbyJoined', (data) => {
        myId = socket.id;
        lobbyCode = data.friendCode;
        document.getElementById('friend-code-display').innerText = lobbyCode;
        
        data.players.forEach(p => entities.set(p.id, p));
        data.bots.forEach(b => entities.set(b.id, b));
        centralAnimals = data.animals;
    });

    socket.on('entityAdded', (entity) => {
        entities.set(entity.id, entity);
    });

    socket.on('entityRemoved', (id) => {
        entities.delete(id);
    });

    socket.on('playerMoved', (data) => {
        if (entities.has(data.id)) {
            const entity = entities.get(data.id);
            entity.x = data.x;
            entity.y = data.y;
        }
    });

    socket.on('botPositions', (bots) => {
        bots.forEach(botData => {
            if (entities.has(botData.id)) {
                const bot = entities.get(botData.id);
                bot.x = botData.x;
                bot.y = botData.y;
            } else {
                entities.set(botData.id, botData); // Failsafe
            }
        });
    });

    socket.on('animalSpawned', (animal) => {
        centralAnimals.push(animal);
    });

    socket.on('animalGrabbed', (data) => {
        // Remove from center
        centralAnimals = centralAnimals.filter(a => a.id !== data.animal.id);
        // Attach to entity
        if (entities.has(data.entityId)) {
            entities.get(data.entityId).carryingAnimal = data.animal;
        }
    });

    socket.on('moneyUpdated', (newAmount) => {
        localData.money = newAmount;
        document.getElementById('money-display').innerText = localData.money;
        // Save to Firebase immediately on change
        savePlayerData(myUid, { money: localData.money });
    });
}

// Input Handling
function setupInputListeners() {
  window.addEventListener('keydown', (e) => {
        if (e.key === 'w') keys.w = true;
        if (e.key === 'a') keys.a = true;
        if (e.key === 's') keys.s = true;
        if (e.key === 'd') keys.d = true;
        if (e.key === 'ArrowUp') keys.ArrowUp = true;
        if (e.key === 'ArrowLeft') keys.ArrowLeft = true;
        if (e.key === 'ArrowDown') keys.ArrowDown = true;
        if (e.key === 'ArrowRight') keys.ArrowRight = true;
        if (e.key === ' ') {
            keys.space = true;
            attemptGrab();
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'w') keys.w = false;
        if (e.key === 'a') keys.a = false;
        if (e.key === 's') keys.s = false;
        if (e.key === 'd') keys.d = false;
        if (e.key === 'ArrowUp') keys.ArrowUp = false;
        if (e.key === 'ArrowLeft') keys.ArrowLeft = false;
        if (e.key === 'ArrowDown') keys.ArrowDown = false;
        if (e.key === 'ArrowRight') keys.ArrowRight = false;
        if (e.key === ' ') keys.space = false;
    });

    // UI Buttons
    document.getElementById('join-btn').addEventListener('click', () => {
        const code = document.getElementById('join-code-input').value.toUpperCase();
        if (code.length > 0) {
            entities.clear();
            centralAnimals = [];
            socket.emit('joinLobby', { friendCode: code, savedData: localData });
        }
    });
}

function attemptGrab() {
    // Only works if we aren't already carrying an animal
    const me = entities.get(myId);
    if (!me || me.carryingAnimal) return;

    // Check collision with central animals (Radius of 30px)
    for (let animal of centralAnimals) {
        const dist = Math.hypot(me.x - animal.x, me.y - animal.y);
        if (dist < 40) {
            socket.emit('grabAnimal', animal.id);
            break; 
        }
    }
}

// --- RENDERING & UPDATE LOOP ---

// Helper function to pick color based on rarity (Simplification for Canvas)
function getRarityColor(rarity) {
    const colors = {
        "Regular": "#95a5a6", "White": "#ffffff", "Red": "#e74c3c",
        "Gold": "#f1c40f", "Azure": "#00a8ff", "Chartreuse": "#7fff00"
    };
    return colors[rarity] || "#9b59b6"; // Default purple if not explicitly defined above
}

function updateMovement() {
        if (!myId || !entities.has(myId)) return;
        
        const me = entities.get(myId);
        const speed = 5 + (localData.speedBoostLevel || 0);
        let moved = false;
        
        let newX = me.x;
        let newY = me.y;

        // Check for WASD OR Arrow Keys
        if (keys.w || keys.ArrowUp) { newY -= speed; moved = true; }
        if (keys.s || keys.ArrowDown) { newY += speed; moved = true; }
        if (keys.a || keys.ArrowLeft) { newX -= speed; moved = true; }
        if (keys.d || keys.ArrowRight) { newX += speed; moved = true; }

        const distFromCenter = Math.hypot(newX - 1000, newY - 1000);
        
        if (distFromCenter < 2000) {
            me.x = newX;
            me.y = newY;
        } else {
            const angle = Math.atan2(newY - 1000, newX - 1000);
            me.x = 1000 + Math.cos(angle) * 1999;
            me.y = 1000 + Math.sin(angle) * 1999;
            moved = true; 
        }

        if (moved) {
            socket.emit('playerMove', { x: me.x, y: me.y });
        }
    }

function drawCamera() {
    if (!myId || !entities.has(myId)) return { x: 0, y: 0 };
    const me = entities.get(myId);
    
    // Calculate camera offset so player stays in center of screen
    const offsetX = canvas.width / 2 - me.x;
    const offsetY = canvas.height / 2 - me.y;
    return { offsetX, offsetY };
}
// Paste this helper function right above your gameLoop() function
function drawMapBackground() {
    // Draw Grass Floor
    ctx.fillStyle = "#27ae60"; 
    ctx.fillRect(-1000, -1000, 4000, 4000); // Massive grass background
    
    // Draw Grid Lines so you can feel the movement
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = 2;
    for(let i = -1000; i < 3000; i += 100) {
        ctx.beginPath(); ctx.moveTo(i, -1000); ctx.lineTo(i, 3000); ctx.stroke(); // Vertical
        ctx.beginPath(); ctx.moveTo(-1000, i); ctx.lineTo(3000, i); ctx.stroke(); // Horizontal
    }
    
    // Draw Dark Boundary Wall (Radius 2000 from center 1000,1000)
    ctx.strokeStyle = "#2c3e50";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(1000, 1000, 2000, 0, Math.PI * 2);
    ctx.stroke();
}

// Now replace your entire gameLoop() function with this:
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    updateMovement();
    const { offsetX, offsetY } = drawCamera();

    ctx.save();
    ctx.translate(offsetX, offsetY); // Move context based on camera

    // 1. Draw the actual Map Background
    drawMapBackground();

    // 2. Draw Map Center Zone (Spawn Area)
    ctx.fillStyle = "rgba(46, 204, 113, 0.5)";
    ctx.beginPath();
    ctx.arc(1000, 1000, 500, 0, Math.PI * 2);
    ctx.fill();

    // 3. Draw Player Base
    if (!baseRenderer && myId) {
        baseRenderer = new BaseRenderer(ctx, myId);
    }
    if (baseRenderer) {
        baseRenderer.drawBase(localData.animals);
    }

    // 4. Draw Animals on Ground
    centralAnimals.forEach(animal => {
        ctx.fillStyle = "#f1c40f"; // Fallback color if you don't have getRarityColor here
        ctx.beginPath();
        ctx.arc(animal.x, animal.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.stroke();
    });

    // 5. Draw Entities (Players and Bots)
    entities.forEach(entity => {
        ctx.fillStyle = entity.id === myId ? "#3498db" : (entity.isBot ? "#e67e22" : "#e74c3c");
        ctx.fillRect(entity.x - 20, entity.y - 20, 40, 40);
        
        if (entity.isBot) {
            ctx.fillStyle = "#fff";
            ctx.font = "bold 14px Arial";
            ctx.fillText("B", entity.x, entity.y + 5);
        }

        if (entity.carryingAnimal) {
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(entity.x, entity.y - 30, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    });

    ctx.restore(); // Restore camera offset
    requestAnimationFrame(gameLoop);
}
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    updateMovement();
    const { offsetX, offsetY } = drawCamera();

    ctx.save();
    ctx.translate(offsetX, offsetY); // Move context based on camera

    // 1. Draw Map Center Zone (Spawn Area)
    ctx.fillStyle = "rgba(46, 204, 113, 0.2)";
    ctx.beginPath();
    ctx.arc(1000, 1000, 500, 0, Math.PI * 2);
    ctx.fill();

    // 2. Draw Animals on Ground
    centralAnimals.forEach(animal => {
        ctx.fillStyle = getRarityColor(animal.rarity);
        ctx.beginPath();
        ctx.arc(animal.x, animal.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.stroke();
        
        // Draw Name text above animal
        ctx.fillStyle = "#fff";
        ctx.font = "10px Arial";
        ctx.textAlign = "center";
        ctx.fillText(animal.name, animal.x, animal.y - 15);
    });

    // 3. Draw Entities (Players and Bots)
    entities.forEach(entity => {
        // Draw Body
        ctx.fillStyle = entity.id === myId ? "#3498db" : (entity.isBot ? "#e67e22" : "#e74c3c");
        ctx.fillRect(entity.x - 20, entity.y - 20, 40, 40);
        
        // Draw Bot Label
        if (entity.isBot) {
            ctx.fillStyle = "#fff";
            ctx.font = "bold 14px Arial";
            ctx.fillText("B", entity.x, entity.y + 5);
        }

        // Draw Carried Animal
        if (entity.carryingAnimal) {
            ctx.fillStyle = getRarityColor(entity.carryingAnimal.rarity);
            ctx.beginPath();
            ctx.arc(entity.x, entity.y - 30, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    });

    ctx.restore(); // Restore camera offset

    requestAnimationFrame(gameLoop);
}

// Boot up
initGame();
