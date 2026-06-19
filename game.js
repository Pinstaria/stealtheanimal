import { authenticateAndLoadData, savePlayerData } from './firebase-setup.js';
import { UIManager } from './ui-mechanics.js';

let scene, camera, renderer, socket, localPlayerMesh = null;
let myUid = null, lobbyCode = null, uiManager;
let localData = { money: 0, animals: [], isAdmin: false };

let entities = new Map(), centralAnimals = new Map();
let floatingLabels = {}; 

// ALL keys restored
const keys = { w: false, a: false, s: false, d: false };

let camAngleX = 0, camAngleY = 0.5; 
let isDragging = false;

// Create UI container for animal labels
const labelContainer = document.createElement('div');
labelContainer.style.position = 'absolute';
labelContainer.style.top = '0';
labelContainer.style.left = '0';
labelContainer.style.width = '100%';
labelContainer.style.height = '100%';
labelContainer.style.pointerEvents = 'none';
document.body.appendChild(labelContainer);

function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.Fog(0x1a1a1a, 20, 200); // Weather fog support

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    scene.add(dirLight);

    // Green Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: 0x27ae60 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Runway Carpet (From Z: -200 to Z: 200)
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(15, 400), new THREE.MeshStandardMaterial({ color: 0xc0392b }));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.1, 0);
    scene.add(carpet);

    // The Despawn Portal
    const portal = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.5, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    portal.position.set(0, 0.2, 200);
    scene.add(portal);

    // Camera Listeners
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

function buildBase(x, z, color) {
    const group = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 20), new THREE.MeshStandardMaterial({ color: color }));
    pad.position.set(0, 0.5, 0);
    group.add(pad);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, transparent: true, opacity: 0.8 });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 1), wallMat);
    backWall.position.set(0, 4, -10);
    group.add(backWall);
    group.position.set(x, 0, z);
    scene.add(group);
}

// RESTORED: All Auth, UI bindings, and Firebase logic
async function initGame() {
    init3D();
    try {
        let authData;
        try { authData = await authenticateAndLoadData(); } 
        catch (e) { authData = { uid: "GUEST_" + Math.random(), savedData: { money: 0, animals: [], isAdmin: false } }; }
        
        myUid = authData.uid;
        localData = authData.savedData;
        
        const moneyDisp = document.getElementById('money-display');
        if (moneyDisp) moneyDisp.innerText = localData.money;

        const adminMenu = document.getElementById('admin-menu');
        if (localData.isAdmin === true && adminMenu) adminMenu.style.display = 'block';
        
        socket = io("https://stealtheanimal.onrender.com"); 
        uiManager = new UIManager(localData, socket, myUid);
        
        socket.emit('joinLobby', { savedData: localData });
        setupSocketListeners();
        setupInputListeners();
        
        requestAnimationFrame(gameLoop);
    } catch (error) { console.error("Crash:", error); }
}

function setupSocketListeners() {
    socket.on('lobbyJoined', (d) => {
        // RESTORED: Lobby Code UI Update
        lobbyCode = d.friendCode;
        const codeDisp = document.getElementById('friend-code-display');
        if (codeDisp) codeDisp.innerText = lobbyCode;

        d.players.forEach(p => spawnEntity(p, false));
        d.bots.forEach(b => spawnEntity(b, true));
        d.animals.forEach(a => spawnAnimal(a));
        
        d.bases.forEach(base => {
            const bx = (base.x - 1000) * 0.1;
            const bz = (base.y - 1000) * 0.1;
            const color = base.ownerId === socket.id ? 0x3498db : 0xe74c3c;
            buildBase(bx, bz, color);
        });
        updateWeatherVisuals(d.currentWeather);
    });

    socket.on('animalSpawned', spawnAnimal);
    
    socket.on('animalMoved', (data) => {
        if(centralAnimals.has(data.id)) centralAnimals.get(data.id).position.z = (data.y - 1000) * 0.1;
    });

    socket.on('botPositions', (bots) => {
        bots.forEach(b => {
            if (entities.has(b.id)) entities.get(b.id).position.set((b.x - 1000) * 0.1, 1.5, (b.y - 1000) * 0.1);
            else spawnEntity(b, true);
        });
    });

    socket.on('playerMoved', (d) => {
        if (entities.has(d.id)) entities.get(d.id).position.set((d.x - 1000)*0.1, 1.5, (d.y - 1000)*0.1);
        else spawnEntity(d, false);
    });

    // RESTORED: Other players disconnecting / removed from map
    socket.on('entityRemoved', (id) => {
        if (entities.has(id)) { 
            scene.remove(entities.get(id)); 
            entities.delete(id); 
        }
    });

    socket.on('animalRemoved', (id) => {
        if (centralAnimals.has(id)) {
            scene.remove(centralAnimals.get(id));
            centralAnimals.delete(id);
            if(floatingLabels[id]) {
                labelContainer.removeChild(floatingLabels[id]);
                delete floatingLabels[id];
            }
        }
    });

    socket.on('weatherChanged', (weather) => updateWeatherVisuals(weather));

    socket.on('moneyUpdated', (newMoney) => {
        localData.money = newMoney;
        const disp = document.getElementById('money-display');
        if(disp) disp.innerText = newMoney;
        savePlayerData(myUid, localData);
    });
}

function updateWeatherVisuals(weather) {
    if(weather === "Radioactive") {
        scene.background.setHex(0x2c3e50); scene.fog.color.setHex(0x27ae60);
    } else if(weather === "Blood Moon") {
        scene.background.setHex(0x200000); scene.fog.color.setHex(0x8a0303);
    } else if(weather === "Blizzard") {
        scene.background.setHex(0xdbe9f4); scene.fog.color.setHex(0xffffff);
    } else if(weather === "Golden Hour") {
        scene.background.setHex(0x8a6a1c); scene.fog.color.setHex(0xf1c40f);
    } else {
        scene.background.setHex(0x1a1a1a); scene.fog.color.setHex(0x1a1a1a);
    }
}

function spawnEntity(data, isBot) {
    const geo = new THREE.CylinderGeometry(1, 1, 3, 16);
    const mat = new THREE.MeshStandardMaterial({ color: data.id === socket.id ? 0x3498db : (isBot ? 0xe67e22 : 0xe74c3c) });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((data.x - 1000)*0.1, 1.5, (data.y - 1000)*0.1);
    scene.add(mesh);
    entities.set(data.id, mesh);
    if (data.id === socket.id) localPlayerMesh = mesh;
}

function spawnAnimal(animal) {
    let size = 1.5; let color = 0xf1c40f; let emissive = 0x000000; 
    let emissiveInt = 0; let opacity = 1; let transparent = false;

    if(animal.rarity === "Diamond") color = 0x74b9ff;
    if(animal.rarity === "Azure") color = 0x00a8ff;
    if(animal.rarity === "Illegal") { color = 0x000000; emissive = 0xff0000; emissiveInt = 0.8; }

    if(animal.mutation === "Mutated") { size = 3; emissive = 0x9b59b6; emissiveInt = 0.8; }
    if(animal.mutation === "Vampiric") { color = 0x8a0303; emissive = 0xff0000; emissiveInt = 0.6; }
    if(animal.mutation === "Frozen") { color = 0xa4ebf3; transparent = true; opacity = 0.7; }
    if(animal.mutation === "Midas") { color = 0xffd700; emissive = 0xffaa00; emissiveInt = 0.8; }

    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshStandardMaterial({ 
        color: color, emissive: emissive, emissiveIntensity: emissiveInt, 
        transparent: transparent, opacity: opacity, roughness: 0.1 
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((animal.x - 1000)*0.1, size/2, (animal.y - 1000)*0.1);
    scene.add(mesh);
    centralAnimals.set(animal.id, mesh);

    const label = document.createElement('div');
    label.innerText = animal.rarity + (animal.mutation !== "None" ? ` (${animal.mutation})` : "");
    label.style.position = 'absolute';
    label.style.color = animal.rarity === "Illegal" ? '#ff0000' : '#fff';
    label.style.fontWeight = 'bold';
    label.style.textShadow = '1px 1px 2px #000';
    label.style.transform = 'translate(-50%, -50%)';
    labelContainer.appendChild(label);
    floatingLabels[animal.id] = label;
}

function attemptGrab() {
    if (!localPlayerMesh) return;
    for (let [id, mesh] of centralAnimals) {
        const dist = Math.hypot(localPlayerMesh.position.x - mesh.position.x, localPlayerMesh.position.z - mesh.position.z);
        if (dist < 8) { 
            socket.emit('grabAnimal', id);
            break;
        }
    }
}

// RESTORED: Full WASD + Arrow Keys + Spacebar + Friend Joining UI listeners
function setupInputListeners() {
    window.addEventListener('keydown', (e) => {
        const key = e.key;
        if(key === 'w' || key === 'ArrowUp') keys.w = true;
        if(key === 's' || key === 'ArrowDown') keys.s = true;
        if(key === 'a' || key === 'ArrowLeft') keys.a = true;
        if(key === 'd' || key === 'ArrowRight') keys.d = true;
        if(key === ' ' || key === 'Spacebar') attemptGrab();
    });
    
    window.addEventListener('keyup', (e) => {
        const key = e.key;
        if(key === 'w' || key === 'ArrowUp') keys.w = false;
        if(key === 's' || key === 'ArrowDown') keys.s = false;
        if(key === 'a' || key === 'ArrowLeft') keys.a = false;
        if(key === 'd' || key === 'ArrowRight') keys.d = false;
    });

    // RESTORED: Join Friend UI Logic
    const joinBtn = document.getElementById('join-btn');
    if (joinBtn) {
        joinBtn.addEventListener('click', () => {
            const codeInput = document.getElementById('join-code-input');
            if (codeInput && codeInput.value.length === 6) { 
                // In a future update we can emit a lobby change, but for now it reloads to clear state
                window.location.reload(); 
            }
        });
    }

    const btnSpawn = document.getElementById('admin-spawn-btn');
    if(btnSpawn) btnSpawn.addEventListener('click', () => socket.emit('adminSpawnRequest', document.getElementById('admin-rarity-select').value));
    
    const btnWeather = document.getElementById('admin-weather-btn');
    if(btnWeather) btnWeather.addEventListener('click', () => socket.emit('adminToggleWeather'));

    const btnIllegal = document.getElementById('admin-illegal-btn');
    if(btnIllegal) btnIllegal.addEventListener('click', () => socket.emit('adminGiveIllegal', null));
}

// EXTRACTED: Movement logic restored for clean map bounds checking
function updateMovement() {
    if (!localPlayerMesh) return;
    const speed = 0.8;
    let moved = false;

    const forwardX = -Math.sin(camAngleX);
    const forwardZ = -Math.cos(camAngleX);
    const rightX = Math.cos(camAngleX);
    const rightZ = -Math.sin(camAngleX);

    if (keys.w) { localPlayerMesh.position.x += forwardX * speed; localPlayerMesh.position.z += forwardZ * speed; moved = true; }
    if (keys.s) { localPlayerMesh.position.x -= forwardX * speed; localPlayerMesh.position.z -= forwardZ * speed; moved = true; }
    if (keys.a) { localPlayerMesh.position.x -= rightX * speed; localPlayerMesh.position.z -= rightZ * speed; moved = true; }
    if (keys.d) { localPlayerMesh.position.x += rightX * speed; localPlayerMesh.position.z += rightZ * speed; moved = true; }

    if (moved) {
        // Keeps player from falling off the physical map entirely
        const dist = Math.hypot(localPlayerMesh.position.x, localPlayerMesh.position.z);
        if(dist > 145) {
            const angle = Math.atan2(localPlayerMesh.position.z, localPlayerMesh.position.x);
            localPlayerMesh.position.x = Math.cos(angle) * 144;
            localPlayerMesh.position.z = Math.sin(angle) * 144;
        }

        socket.emit('playerMove', { x: (localPlayerMesh.position.x * 10) + 1000, y: (localPlayerMesh.position.z * 10) + 1000 });
    }
}

function gameLoop() {
    updateMovement();

    if (localPlayerMesh) {
        const dist = 30;
        camera.position.x = localPlayerMesh.position.x + dist * Math.sin(camAngleX) * Math.cos(camAngleY);
        camera.position.y = localPlayerMesh.position.y + dist * Math.sin(camAngleY);
        camera.position.z = localPlayerMesh.position.z + dist * Math.cos(camAngleX) * Math.cos(camAngleY);
        camera.lookAt(localPlayerMesh.position);
    }
    
    // Smooth HTML Label tracking logic
    centralAnimals.forEach((mesh, id) => {
        const label = floatingLabels[id];
        if(label) {
            const pos = mesh.position.clone();
            pos.y += 2.5; 
            pos.project(camera);
            
            if (pos.z < 1) {
                const x = (pos.x * .5 + .5) * window.innerWidth;
                const y = (pos.y * -.5 + .5) * window.innerHeight;
                label.style.left = `${x}px`;
                label.style.top = `${y}px`;
                label.style.display = 'block';
            } else {
                label.style.display = 'none';
            }
        }
    });

    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
}

initGame();
