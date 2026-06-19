import { authenticateAndLoadData, savePlayerData } from './firebase-setup.js';
import { UIManager } from './ui-mechanics.js';

// --- 3D SCENE CONFIGURATION ---
let scene, camera, renderer;
let myUid = null, myId = null, lobbyCode = null, socket;
let localData = { money: 0, animals: [], isAdmin: false }, uiManager;

let entities = new Map(); 
let centralAnimals = new Map(); 
let localPlayerMesh = null;

// Camera System
let camAngleX = 0, camAngleY = 0.5; 
let isDragging = false;

const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, space: false };

// --- INITIALIZE 3D WORLD ---
function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a); 
    scene.fog = new THREE.Fog(0x1a1a1a, 20, 200); // Weather fog

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    scene.add(dirLight);

    // The Grass Floor
    const floorGeo = new THREE.PlaneGeometry(300, 300);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2; 
    scene.add(floor);

    // The Central Spawner Platform
    const spawnGeo = new THREE.CylinderGeometry(15, 15, 1, 32);
    const spawnMat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x2ecc71, emissiveIntensity: 0.2 });
    const spawnPlatform = new THREE.Mesh(spawnGeo, spawnMat);
    spawnPlatform.position.set(0, 0.5, 0); 
    scene.add(spawnPlatform);

    // The Center Beacon Light
    const beaconGeo = new THREE.CylinderGeometry(2, 2, 200, 16, 1, true);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 100, 0);
    scene.add(beacon);

    // THE RED CARPET
    const carpetGeo = new THREE.PlaneGeometry(10, 140);
    const carpetMat = new THREE.MeshStandardMaterial({ color: 0xc0392b });
    const mainCarpet = new THREE.Mesh(carpetGeo, carpetMat);
    mainCarpet.rotation.x = -Math.PI / 2; 
    mainCarpet.position.set(0, 0.05, 70); 
    scene.add(mainCarpet);

    // --- "STEAL A BRAINROT" STYLE BASE ---
    const baseGroup = new THREE.Group();
    
    // Base Floor / Vault Pad
    const startPadGeo = new THREE.BoxGeometry(20, 1, 20);
    const startPadMat = new THREE.MeshStandardMaterial({ color: 0x3498db });
    const startPad = new THREE.Mesh(startPadGeo, startPadMat);
    startPad.position.set(0, 0.05, 140);
    baseGroup.add(startPad);

    // Base Walls (Left, Right, Back)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, transparent: true, opacity: 0.9 });
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 20), wallMat);
    leftWall.position.set(-10, 4, 140);
    baseGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 20), wallMat);
    rightWall.position.set(10, 4, 140);
    baseGroup.add(rightWall);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 1), wallMat);
    backWall.position.set(0, 4, 150);
    baseGroup.add(backWall);

    scene.add(baseGroup);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Camera Drag Controls
    window.addEventListener('mousedown', (e) => { if(e.button === 2 || e.button === 0) isDragging = true; });
    window.addEventListener('mouseup', () => isDragging = false);
    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            camAngleX -= e.movementX * 0.005;
            camAngleY -= e.movementY * 0.005;
            camAngleY = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, camAngleY)); 
        }
    });
    window.addEventListener('contextmenu', e => e.preventDefault());
}

// --- CORE GAME ENGINE ---
async function initGame() {
    init3D();
    try {
        let authData;
        try { 
            authData = await authenticateAndLoadData(); 
        } catch (e) { 
            authData = { uid: "GUEST_" + Math.random(), savedData: { money: 0, lockLevel: 1, animals: [], isAdmin: false } }; 
        }
        
        myUid = authData.uid;
        localData = authData.savedData;
        document.getElementById('money-display').innerText = localData.money;

        const adminMenu = document.getElementById('admin-menu');
        if (localData.isAdmin === true && adminMenu) {
            adminMenu.style.display = 'block';
        }

        // CONNECT TO MULTIPLAYER SERVER
        socket = io("https://stealtheanimal.onrender.com/"); 
        uiManager = new UIManager(localData, socket, myUid);
        
        socket.emit('joinLobby', { savedData: localData });
        setupSocketListeners();
        setupInputListeners();
        
        requestAnimationFrame(gameLoop);
    } catch (error) { 
        console.error("Game Loader Crash:", error); 
    }
}

// --- SOCKET LOGIC ---
function setupSocketListeners() {
    socket.on('lobbyJoined', (data) => {
        myId = socket.id;
        lobbyCode = data.friendCode;
        const codeDisp = document.getElementById('friend-code-display');
        if(codeDisp) codeDisp.innerText = lobbyCode;
        
        data.players.forEach(p => spawnPlayerMesh(p, false));
        data.bots.forEach(b => spawnPlayerMesh(b, true));
        data.animals.forEach(a => spawnAnimalMesh(a));
    });

    socket.on('animalSpawned', (animal) => spawnAnimalMesh(animal));

    socket.on('playerMoved', (d) => {
        if (entities.has(d.id)) {
            const mesh = entities.get(d.id);
            mesh.position.x = (d.x - 1000) * 0.1;
            mesh.position.z = (d.y - 1000) * 0.1;
        }
    });

    socket.on('botPositions', (bots) => {
        bots.forEach(b => {
            if (entities.has(b.id)) {
                entities.get(b.id).position.set((b.x - 1000) * 0.1, 1.5, (b.y - 1000) * 0.1);
            } else spawnPlayerMesh(b, true);
        });
    });

    socket.on('entityAdded', (entity) => { 
        if (!entities.has(entity.id)) spawnPlayerMesh(entity, entity.isBot); 
    });

    socket.on('entityRemoved', (id) => {
        if (entities.has(id)) { 
            scene.remove(entities.get(id)); 
            entities.delete(id); 
        }
    });

    socket.on('animalGrabbed', (data) => {
        const animalId = data.animalId || (data.animal && data.animal.id);
        if (centralAnimals.has(animalId)) {
            scene.remove(centralAnimals.get(animalId));
            centralAnimals.delete(animalId);
        }
    });

    socket.on('weatherChanged', (weather) => {
        if(weather === "Radioactive") {
            scene.background = new THREE.Color(0x2c3e50);
            scene.fog.color.setHex(0x27ae60);
        } else {
            scene.background = new THREE.Color(0x1a1a1a);
            scene.fog.color.setHex(0x1a1a1a);
        }
    });
}

// --- 3D SPAWNERS ---
function spawnPlayerMesh(data, isBot) {
    const bodyGeo = new THREE.CylinderGeometry(1, 1, 3, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: data.id === socket.id ? 0x3498db : (isBot ? 0xe67e22 : 0xe74c3c) });
    const mesh = new THREE.Mesh(bodyGeo, bodyMat);
    mesh.position.set((data.x - 1000) * 0.1, 1.5, (data.y - 1000) * 0.1);
    scene.add(mesh);
    entities.set(data.id, mesh);
    if (data.id === socket.id) localPlayerMesh = mesh;
}

function spawnAnimalMesh(animal) {
    const x3d = (animal.x - 1000) * 0.1;
    const z3d = (animal.y - 1000) * 0.1;
    
    const size = animal.isMutated ? 3 : 1.5; 
    const animalGeo = new THREE.BoxGeometry(size, size, size);
    
    let hex = 0xf1c40f; 
    if(animal.rarity === "Azure") hex = 0x00a8ff;
    if(animal.rarity === "Diamond") hex = 0x74b9ff;
    if(animal.rarity === "Illegal") hex = 0x000000;
    
    const animalMat = new THREE.MeshStandardMaterial({ 
        color: hex, 
        roughness: 0.2,
        emissive: animal.isMutated ? 0x9b59b6 : (animal.rarity === "Illegal" ? 0xff0000 : 0x000000), 
        emissiveIntensity: animal.isMutated || animal.rarity === "Illegal" ? 0.8 : 0 
    });

    const animalMesh = new THREE.Mesh(animalGeo, animalMat);
    animalMesh.position.set(x3d, size/2, z3d);
    
    scene.add(animalMesh);
    centralAnimals.set(animal.id, animalMesh);
}

// --- CONTROLS ---
function setupInputListeners() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'w' || e.key === 'ArrowUp') keys.w = keys.ArrowUp = true;
        if (e.key === 'a' || e.key === 'ArrowLeft') keys.a = keys.ArrowLeft = true;
        if (e.key === 's' || e.key === 'ArrowDown') keys.s = keys.ArrowDown = true;
        if (e.key === 'd' || e.key === 'ArrowRight') keys.d = keys.ArrowRight = true;
        if (e.key === ' ') { 
            keys.space = true; 
            attemptGrab(); 
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'w' || e.key === 'ArrowUp') keys.w = keys.ArrowUp = false;
        if (e.key === 'a' || e.key === 'ArrowLeft') keys.a = keys.ArrowLeft = false;
        if (e.key === 's' || e.key === 'ArrowDown') keys.s = keys.ArrowDown = false;
        if (e.key === 'd' || e.key === 'ArrowRight') keys.d = keys.ArrowRight = false;
        if (e.key === ' ') keys.space = false;
    });

    const joinBtn = document.getElementById('join-btn');
    if (joinBtn) {
        joinBtn.addEventListener('click', () => {
            const codeInput = document.getElementById('join-code-input');
            if (codeInput && codeInput.value.length === 6) { window.location.reload(); }
        });
    }

    const adminSpawnBtn = document.getElementById('admin-spawn-btn');
    if (adminSpawnBtn) {
        adminSpawnBtn.addEventListener('click', () => {
            const raritySelect = document.getElementById('admin-rarity-select');
            if (raritySelect) { socket.emit('adminSpawnRequest', raritySelect.value); }
        });
    }

    const btnWeather = document.getElementById('admin-weather-btn');
    if(btnWeather) btnWeather.addEventListener('click', () => socket.emit('adminToggleWeather'));

    const btnIllegal = document.getElementById('admin-illegal-btn');
    if(btnIllegal) btnIllegal.addEventListener('click', () => socket.emit('adminGiveIllegal', null));
}

// --- GAMEPLAY MECHANICS ---
function attemptGrab() {
    if (!localPlayerMesh) return;
    for (let [id, mesh] of centralAnimals) {
        const dist = Math.hypot(localPlayerMesh.position.x - mesh.position.x, localPlayerMesh.position.z - mesh.position.z);
        if (dist < 5) { 
            socket.emit('grabAnimal', id);
            break;
        }
    }
}

function updateMovement() {
    if (!localPlayerMesh) return;
    const speed = 0.6;
    let moved = false;

    // Relative movement based on Camera Angle
    const forwardX = Math.sin(camAngleX);
    const forwardZ = Math.cos(camAngleX);
    const rightX = Math.sin(camAngleX - Math.PI/2);
    const rightZ = Math.cos(camAngleX - Math.PI/2);

    if (keys.w || keys.ArrowUp) { 
        localPlayerMesh.position.x -= forwardX * speed; 
        localPlayerMesh.position.z -= forwardZ * speed; 
        moved = true; 
    }
    if (keys.s || keys.ArrowDown) { 
        localPlayerMesh.position.x += forwardX * speed; 
        localPlayerMesh.position.z += forwardZ * speed; 
        moved = true; 
    }
    if (keys.a || keys.ArrowLeft) { 
        localPlayerMesh.position.x -= rightX * speed; 
        localPlayerMesh.position.z -= rightZ * speed; 
        moved = true; 
    }
    if (keys.d || keys.ArrowRight) { 
        localPlayerMesh.position.x += rightX * speed; 
        localPlayerMesh.position.z += rightZ * speed; 
        moved = true; 
    }

    if (moved) {
        // 3D Wall Boundaries (Don't run off the map)
        const dist = Math.hypot(localPlayerMesh.position.x, localPlayerMesh.position.z);
        if(dist > 145) {
            const angle = Math.atan2(localPlayerMesh.position.z, localPlayerMesh.position.x);
            localPlayerMesh.position.x = Math.cos(angle) * 144;
            localPlayerMesh.position.z = Math.sin(angle) * 144;
        }

        const serverX = (localPlayerMesh.position.x * 10) + 1000;
        const serverY = (localPlayerMesh.position.z * 10) + 1000;
        socket.emit('playerMove', { x: serverX, y: serverY });
    }
}

// --- LOOP RENDERING ---
function gameLoop() {
    updateMovement();
    
    if (localPlayerMesh) {
        const dist = 30;
        // Orbit camera around player using trigonometry and mouse angles
        camera.position.x = localPlayerMesh.position.x + dist * Math.sin(camAngleX) * Math.cos(camAngleY);
        camera.position.y = localPlayerMesh.position.y + dist * Math.sin(camAngleY);
        camera.position.z = localPlayerMesh.position.z + dist * Math.cos(camAngleX) * Math.cos(camAngleY);
        camera.lookAt(localPlayerMesh.position);
    }
    
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
}

// Start Engine
initGame();
