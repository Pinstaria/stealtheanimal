import { authenticateAndLoadData, savePlayerData } from './firebase-setup.js';
import { UIManager } from './ui-mechanics.js';
import { BaseRenderer } from './base-rendering.js';

// --- ASSET MANAGER (Disabled to fix your 404 errors) ---
class AssetManager {
    constructor() {
        this.images = {};
        this.sounds = {};
    }
    loadImage(key, src) { /* Empty for now */ }
    loadSound(key, src) { /* Empty for now */ }
    playSound(key) { /* Empty for now */ }
}

const assets = new AssetManager();
// I have commented these out so the browser stops throwing 404 errors!
// assets.loadImage('player', '/sprites/player.png');
// assets.loadImage('bot', '/sprites/bot.png');
// assets.loadImage('animal', '/sprites/animal_base.png');
// assets.loadSound('grab', '/sounds/grab.mp3');
// assets.loadSound('sell', '/sounds/cha-ching.mp3');

// --- GAME STATE ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let socket;
let myUid = null;
let myId = null;
let lobbyCode = null;
let entities = new Map();
let centralAnimals = [];
let localData = { money: 0, animals: [] };
let uiManager;
let baseRenderer;

const keys = { 
    w: false, a: false, s: false, d: false, 
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, 
    space: false 
};

// --- INIT ---
async function initGame() {
    try {
        let authData;
        try {
            authData = await authenticateAndLoadData();
        } catch (e) {
            console.warn("Firebase not set up yet! Using temporary local data.");
            authData = { uid: "GUEST_" + Math.random(), savedData: { money: 0, lockLevel: 1, animals: [] } };
        }
        myUid = authData.uid;
        localData = authData.savedData;
        document.getElementById('money-display').innerText = localData.money;

        // Connect to Server
        socket = io(); 
        uiManager = new UIManager(localData, socket, myUid);
        
        socket.emit('joinLobby', { savedData: localData });
        setupSocketListeners();
        setupInputListeners();
        requestAnimationFrame(gameLoop);
    } catch (error) {
        console.error("Game Load Error:", error);
    }
}

// --- SOCKET LISTENERS ---
function setupSocketListeners() {
    socket.on('lobbyJoined', (data) => {
        myId = socket.id;
        lobbyCode = data.friendCode;
        document.getElementById('friend-code-display').innerText = lobbyCode;
        data.players.forEach(p => entities.set(p.id, p));
        data.bots.forEach(b => entities.set(b.id, b));
        centralAnimals = data.animals;
    });
    socket.on('animalSpawned', (a) => centralAnimals.push(a));
    socket.on('playerMoved', (d) => { if (entities.has(d.id)) { let e = entities.get(d.id); e.x = d.x; e.y = d.y; }});
    socket.on('animalGrabbed', (d) => {
        centralAnimals = centralAnimals.filter(a => a.id !== d.animal.id);
        if (entities.has(d.entityId)) entities.get(d.entityId).carryingAnimal = d.animal;
    });
    socket.on('moneyUpdated', (m) => {
        localData.money = m;
        document.getElementById('money-display').innerText = m;
    });
}

// --- CONTROLS & MOVEMENT ---
function setupInputListeners() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'w' || e.key === 'ArrowUp') keys.w = keys.ArrowUp = true;
        if (e.key === 'a' || e.key === 'ArrowLeft') keys.a = keys.ArrowLeft = true;
        if (e.key === 's' || e.key === 'ArrowDown') keys.s = keys.ArrowDown = true;
        if (e.key === 'd' || e.key === 'ArrowRight') keys.d = keys.ArrowRight = true;
        if (e.key === ' ') { keys.space = true; attemptGrab(); }
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'w' || e.key === 'ArrowUp') keys.w = keys.ArrowUp = false;
        if (e.key === 'a' || e.key === 'ArrowLeft') keys.a = keys.ArrowLeft = false;
        if (e.key === 's' || e.key === 'ArrowDown') keys.s = keys.ArrowDown = false;
        if (e.key === 'd' || e.key === 'ArrowRight') keys.d = keys.ArrowRight = false;
        if (e.key === ' ') keys.space = false;
    });
}

function updateMovement() {
    if (!myId || !entities.has(myId)) return;
    const me = entities.get(myId);
    const speed = 5;
    let newX = me.x, newY = me.y;
    if (keys.w || keys.ArrowUp) newY -= speed;
    if (keys.s || keys.ArrowDown) newY += speed;
    if (keys.a || keys.ArrowLeft) newX -= speed;
    if (keys.d || keys.ArrowRight) newX += speed;

    if (Math.hypot(newX - 1000, newY - 1000) < 2000) {
        me.x = newX; me.y = newY;
        socket.emit('playerMove', { x: me.x, y: me.y });
    }
}

function attemptGrab() {
    const me = entities.get(myId);
    if (!me || me.carryingAnimal) return;
    for (let a of centralAnimals) {
        if (Math.hypot(me.x - a.x, me.y - a.y) < 40) {
            socket.emit('grabAnimal', a.id);
            break;
        }
    }
}

// --- RENDER LOOP ---
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updateMovement();
    
    // Safety check so game doesn't crash before player loads
    if (!myId || !entities.has(myId)) {
        requestAnimationFrame(gameLoop);
        return;
    }

    const offsetX = canvas.width/2 - entities.get(myId).x;
    const offsetY = canvas.height/2 - entities.get(myId).y;
    ctx.save();
    ctx.translate(offsetX, offsetY);

    // Draw Map & Base
    ctx.fillStyle = "#27ae60"; 
    ctx.fillRect(-1000, -1000, 4000, 4000); // Grass
    
    // Gridlines
    ctx.strokeStyle = "rgba(0,0,0,0.1)"; ctx.lineWidth = 2;
    for(let i = -1000; i < 3000; i+=100) {
        ctx.beginPath(); ctx.moveTo(i, -1000); ctx.lineTo(i, 3000); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-1000, i); ctx.lineTo(3000, i); ctx.stroke();
    }

    if (!baseRenderer) baseRenderer = new BaseRenderer(ctx, myId);
    baseRenderer.drawBase(localData.animals);

    // Draw Animals
    centralAnimals.forEach(a => { 
        ctx.fillStyle = "#f1c40f"; 
        ctx.beginPath(); 
        ctx.arc(a.x, a.y, 10, 0, Math.PI*2); 
        ctx.fill(); 
        ctx.stroke();
    });

    // Draw Players/Bots
    entities.forEach(e => {
        ctx.fillStyle = e.id === myId ? "#3498db" : (e.isBot ? "#e67e22" : "#e74c3c");
        ctx.fillRect(e.x - 20, e.y - 20, 40, 40);
        
        if (e.isBot) {
            ctx.fillStyle = "#fff"; ctx.font = "bold 14px Arial"; ctx.fillText("B", e.x, e.y + 5);
        }
        if (e.carryingAnimal) {
            ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(e.x, e.y - 30, 8, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        }
    });

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

// Start everything up
initGame();
