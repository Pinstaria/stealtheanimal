import { authenticateAndLoadData, savePlayerData } from './firebase-setup.js';
import { UIManager } from './ui-mechanics.js';

let scene, camera, renderer, socket, localPlayerMesh = null;
let myUid = null, lobbyCode = null, uiManager;
let localData = { money: 0, animals: [], isAdmin: false };

let entities = new Map(), centralAnimals = new Map(), baseMeshes = new Map();
let floatingLabels = {}; 

// FEATURE: All movement and interaction keys (WASD + Arrows + Space + E)
const keys = { w: false, a: false, s: false, d: false, e: false };
let camAngleX = 0, camAngleY = 0.5, isDragging = false;

// FEATURE: Dynamic Floating Text Labels
const labelContainer = document.createElement('div');
labelContainer.style.position = 'absolute';
labelContainer.style.top = '0';
labelContainer.style.left = '0';
labelContainer.style.width = '100%';
labelContainer.style.height = '100%';
labelContainer.style.pointerEvents = 'none';
document.body.appendChild(labelContainer);

// FEATURE: [E] To Buy Capacity Prompt
const promptContainer = document.createElement('div');
promptContainer.style.position = 'absolute';
promptContainer.style.bottom = '20%';
promptContainer.style.left = '50%';
promptContainer.style.transform = 'translateX(-50%)';
promptContainer.style.color = '#fff';
promptContainer.style.fontSize = '24px';
promptContainer.style.fontWeight = 'bold';
promptContainer.style.textShadow = '2px 2px 4px #000';
promptContainer.style.display = 'none';
document.body.appendChild(promptContainer);

function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.Fog(0x1a1a1a, 20, 200);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    scene.add(dirLight);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: 0x27ae60 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // FEATURE: The Red Runway Carpet
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(15, 400), new THREE.MeshStandardMaterial({ color: 0xc0392b }));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.1, 0);
    scene.add(carpet);

    // FEATURE: The Black Despawn Portal
    const portal = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.5, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    portal.position.set(0, 0.2, 200);
    scene.add(portal);

    // FEATURE: 360 Degree Mouse Drag Camera
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

// FEATURE: "Steal a Brainrot" 3D Base Architecture
function rebuildBases(baseDataArray) {
    baseMeshes.forEach(group => scene.remove(group));
    baseMeshes.clear();

    baseDataArray.forEach(base => {
        const bx = (base.x - 1000) * 0.1;
        const bz = (base.y - 1000) * 0.1;
        const color = base.ownerId === socket.id ? 0x3498db : 0xe74c3c;
        
        const group = new THREE.Group();
        group.position.set(bx, 0, bz);

        // Main Vault Floor
        const pad = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 30), new THREE.MeshStandardMaterial({ color: color }));
        pad.position.set(0, 0.25, 0);
        group.add(pad);

        // 3 Walls
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, transparent: true, opacity: 0.9 });
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 1), wallMat);
        backWall.position.set(0, 4, -15);
        group.add(backWall);
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 30), wallMat);
        leftWall.position.set(-15, 4, 0);
        group.add(leftWall);
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 30), wallMat);
        rightWall.position.set(15, 4, 0);
        group.add(rightWall);

        // FEATURE: Green Lock Pad
        const lockPad = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 4), new THREE.MeshStandardMaterial({ color: 0x2ecc71 }));
        lockPad.position.set(-4, 0.3, 4); 
        group.add(lockPad);

        // FEATURE: Blue Capacity Upgrade Pad
        const upgPad = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 4), new THREE.MeshStandardMaterial({ color: 0x3498db }));
        upgPad.position.set(4, 0.3, 4); 
        group.add(upgPad);

        // FEATURE: Red Laser Lock Gate
        if (base.isLocked) {
            const laserMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 });
            const laserWall = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 1), laserMat);
            laserWall.position.set(0, 4, 15);
            group.add(laserWall);
        }

        // FEATURE: Visual Item Storage (Nicely Spaced Out)
        base.animals.forEach((anim, idx) => {
            const itemMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: 0xf1c40f }));
            const row = Math.floor(idx / 5);
            const col = idx % 5;
            itemMesh.position.set(-8 + (col * 4), 1, -8 + (row * 4));
            group.add(itemMesh);
        });

        group.userData = { capacity: base.capacity };
        scene.add(group);
        baseMeshes.set(base.ownerId, group);
    });
}

// FEATURE: Firebase Authentication & Money Initialization
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

        // FEATURE: Admin Panel Check
        const adminMenu = document.getElementById('admin-menu');
        if (localData.isAdmin === true && adminMenu) adminMenu.style.display = 'block';
        
        socket = io("https://stealtheanimal.onrender.com/"); 
        uiManager = new UIManager(localData, socket, myUid);
        
        socket.emit('joinLobby', { savedData: localData });
        setupSocketListeners();
        setupInputListeners();
        
        requestAnimationFrame(gameLoop);
    } catch (error) { console.error("Crash:", error); }
}

function setupSocketListeners() {
    socket.on('lobbyJoined', (d) => {
        lobbyCode = d.friendCode;
        const codeDisp = document.getElementById('friend-code-display');
        if (codeDisp) codeDisp.innerText = lobbyCode;

        d.players.forEach(p => spawnEntity(p, false));
        d.bots.forEach(b => spawnEntity(b, true));
        d.animals.forEach(a => spawnAnimal(a));
        
        rebuildBases(d.bases);
        updateWeatherVisuals(d.currentWeather);
    });

    socket.on('animalSpawned', spawnAnimal);
    socket.on('animalMoved', (data) => { if(centralAnimals.has(data.id)) centralAnimals.get(data.id).position.z = (data.y - 1000) * 0.1; });
    socket.on('botPositions', (bots) => { bots.forEach(b => { if (entities.has(b.id)) entities.get(b.id).position.set((b.x - 1000) * 0.1, 1.5, (b.y - 1000) * 0.1); else spawnEntity(b, true); }); });
    socket.on('playerMoved', (d) => { if (entities.has(d.id)) entities.get(d.id).position.set((d.x - 1000)*0.1, 1.5, (d.y - 1000)*0.1); else spawnEntity(d, false); });
    socket.on('entityRemoved', (id) => { if (entities.has(id)) { scene.remove(entities.get(id)); entities.delete(id); } });
    
    socket.on('animalRemoved', (id) => {
        if (centralAnimals.has(id)) {
            scene.remove(centralAnimals.get(id));
            centralAnimals.delete(id);
            if(floatingLabels[id]) { labelContainer.removeChild(floatingLabels[id]); delete floatingLabels[id]; }
        }
    });

    // FEATURE: Visual Stealing Cue (Box on head if carrying animal)
    socket.on('entityCarrying', (data) => {
        const entityMesh = entities.get(data.id);
        if (entityMesh) {
            if (data.carrying && !entityMesh.children.length) {
                const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardMaterial({color: 0xf1c40f}));
                box.position.y = 2.5; 
                entityMesh.add(box);
            } else if (!data.carrying && entityMesh.children.length) {
                entityMesh.remove(entityMesh.children[0]);
            }
        }
    });

    socket.on('basesUpdated', (baseDataArray) => rebuildBases(baseDataArray));
    socket.on('weatherChanged', (weather) => updateWeatherVisuals(weather));
    
    // FEATURE: Real-time UI updating and Firebase Auto-Saving
    socket.on('moneyUpdated', (newMoney) => {
        localData.money = newMoney;
        const disp = document.getElementById('money-display');
        if(disp) disp.innerText = newMoney;
        savePlayerData(myUid, localData);
    });
}

// FEATURE: Advanced Weather Fog/Skybox Effects
function updateWeatherVisuals(weather) {
    if(weather === "Radioactive") { scene.background.setHex(0x2c3e50); scene.fog.color.setHex(0x27ae60); } 
    else if(weather === "Blood Moon") { scene.background.setHex(0x200000); scene.fog.color.setHex(0x8a0303); } 
    else if(weather === "Blizzard") { scene.background.setHex(0xdbe9f4); scene.fog.color.setHex(0xffffff); } 
    else if(weather === "Golden Hour") { scene.background.setHex(0x8a6a1c); scene.fog.color.setHex(0xf1c40f); } 
    else { scene.background.setHex(0x1a1a1a); scene.fog.color.setHex(0x1a1a1a); }
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

// FEATURE: Spawning Custom Rarity Colors and Label Rendering
function spawnAnimal(animal) {
    let size = 1.5; let color = 0xf1c40f; let emissive = 0x000000; 
    let emissiveInt = 0; let opacity = 1; let transparent = false;

    // Generates a unique color based on the Rarity's name!
    const hash = animal.rarity.length * 12345;
    color = hash % 0xffffff;

    if(animal.rarity === "Illegal") { color = 0x000000; emissive = 0xff0000; emissiveInt = 0.8; }
    if(animal.mutation === "Mutated") { size = 3; emissive = 0x9b59b6; emissiveInt = 0.8; }
    if(animal.mutation === "Vampiric") { color = 0x8a0303; emissive = 0xff0000; emissiveInt = 0.6; }
    if(animal.mutation === "Frozen") { color = 0xa4ebf3; transparent = true; opacity = 0.7; }
    if(animal.mutation === "Midas") { color = 0xffd700; emissive = 0xffaa00; emissiveInt = 0.8; }

    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshStandardMaterial({ color: color, emissive: emissive, emissiveIntensity: emissiveInt, transparent: transparent, opacity: opacity, roughness: 0.1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((animal.x - 1000)*0.1, size/2, (animal.y - 1000)*0.1);
    scene.add(mesh);
    centralAnimals.set(animal.id, mesh);

    const label = document.createElement('div');
    
    // FEATURE: The Massive Price / MPS / Rarity HTML Display
    label.innerHTML = `<span style="font-size:18px">${animal.name}</span><br>
                       <span style="font-size:12px; color:#2ecc71">Buy: $${animal.buyPrice} | Sell: $${animal.sellPrice}</span><br>
                       <span style="font-size:12px; color:#f1c40f">+${animal.mps}/sec</span>`;
    label.style.position = 'absolute';
    label.style.color = animal.rarity === "Illegal" ? '#ff0000' : '#fff';
    label.style.fontWeight = 'bold';
    label.style.textAlign = 'center';
    label.style.textShadow = '1px 1px 2px #000';
    label.style.transform = 'translate(-50%, -50%)';
    labelContainer.appendChild(label);
    floatingLabels[animal.id] = label;
}

// FEATURE: The Stealing Physics Hook
function attemptGrab() {
    if (!localPlayerMesh) return;
    
    // Priority 1: Check if grabbing an item off the floor/belt
    for (let [id, mesh] of centralAnimals) {
        const dist = Math.hypot(localPlayerMesh.position.x - mesh.position.x, localPlayerMesh.position.z - mesh.position.z);
        if (dist < 8) { socket.emit('grabAnimal', id); return; }
    }

    // Priority 2: If nothing on floor, check if you can STEAL from nearby player/bot
    for (let [id, mesh] of entities) {
        if (id === socket.id) continue;
        const dist = Math.hypot(localPlayerMesh.position.x - mesh.position.x, localPlayerMesh.position.z - mesh.position.z);
        if (dist < 5) { 
            socket.emit('stealAnimal', id);
            return;
        }
    }
}

// FEATURE: Unified Button Inputs (WASD, Arrows, Admin, Eggs)
function setupInputListeners() {
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if(key === 'w' || key === 'arrowup') keys.w = true;
        if(key === 's' || key === 'arrowdown') keys.s = true;
        if(key === 'a' || key === 'arrowleft') keys.a = true;
        if(key === 'd' || key === 'arrowright') keys.d = true;
        if(key === ' ') attemptGrab(); // Spacebar Snatch
        if(key === 'e') { keys.e = true; if (promptContainer.style.display === 'block') socket.emit('buyCapacity'); }
    });
    
    window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if(key === 'w' || key === 'arrowup') keys.w = false;
        if(key === 's' || key === 'arrowdown') keys.s = false;
        if(key === 'a' || key === 'arrowleft') keys.a = false;
        if(key === 'd' || key === 'arrowright') keys.d = false;
        if(key === 'e') keys.e = false;
    });

    const joinBtn = document.getElementById('join-btn');
    if (joinBtn) joinBtn.addEventListener('click', () => { const codeInput = document.getElementById('join-code-input'); if (codeInput && codeInput.value.length === 6) { window.location.reload(); } });
    const btnSpawn = document.getElementById('admin-spawn-btn');
    if(btnSpawn) btnSpawn.addEventListener('click', () => socket.emit('adminSpawnRequest', document.getElementById('admin-rarity-select').value));
    const btnWeather = document.getElementById('admin-weather-btn');
    if(btnWeather) btnWeather.addEventListener('click', () => socket.emit('adminToggleWeather'));
    const btnIllegal = document.getElementById('admin-illegal-btn');
    if(btnIllegal) btnIllegal.addEventListener('click', () => socket.emit('adminGiveIllegal', null));
    
    // FEATURE: UI Button injected for Weekly Egg Claim
    const btnEgg = document.createElement('button');
    btnEgg.innerText = "Claim Weekly Egg";
    btnEgg.style.position = 'absolute'; btnEgg.style.bottom = '20px'; btnEgg.style.left = '20px'; btnEgg.style.zIndex = 9999;
    btnEgg.className = "btn-blue";
    btnEgg.onclick = () => socket.emit('claimWeeklyEgg');
    document.body.appendChild(btnEgg);
}

// FEATURE: Camera-Relative Movement and Pad Interactions
function updateMovement() {
    if (!localPlayerMesh) return;
    const speed = 0.8;
    let moved = false;

    // Movement math tied directly to where the camera is facing
    const forwardX = -Math.sin(camAngleX); const forwardZ = -Math.cos(camAngleX);
    const rightX = Math.cos(camAngleX); const rightZ = -Math.sin(camAngleX);

    if (keys.w) { localPlayerMesh.position.x += forwardX * speed; localPlayerMesh.position.z += forwardZ * speed; moved = true; }
    if (keys.s) { localPlayerMesh.position.x -= forwardX * speed; localPlayerMesh.position.z -= forwardZ * speed; moved = true; }
    if (keys.a) { localPlayerMesh.position.x -= rightX * speed; localPlayerMesh.position.z -= rightZ * speed; moved = true; }
    if (keys.d) { localPlayerMesh.position.x += rightX * speed; localPlayerMesh.position.z += rightZ * speed; moved = true; }

    if (moved) {
        // Keeps player from falling off map
        const dist = Math.hypot(localPlayerMesh.position.x, localPlayerMesh.position.z);
        if(dist > 145) {
            const angle = Math.atan2(localPlayerMesh.position.z, localPlayerMesh.position.x);
            localPlayerMesh.position.x = Math.cos(angle) * 144; localPlayerMesh.position.z = Math.sin(angle) * 144;
        }
        socket.emit('playerMove', { x: (localPlayerMesh.position.x * 10) + 1000, y: (localPlayerMesh.position.z * 10) + 1000 });
    }

    // FEATURE: Distance check to trigger the [E] Buy Prompt
    const myBaseGroup = baseMeshes.get(socket.id);
    if (myBaseGroup) {
        const padWorldX = myBaseGroup.position.x + 4;
        const padWorldZ = myBaseGroup.position.z + 4;
        const distToPad = Math.hypot(localPlayerMesh.position.x - padWorldX, localPlayerMesh.position.z - padWorldZ);
        
        if (distToPad < 4) {
            const currentCapacity = myBaseGroup.userData.capacity || 5;
            promptContainer.innerText = `[E] Buy +5 Capacity ($${currentCapacity * 200})`;
            promptContainer.style.display = 'block';
        } else {
            promptContainer.style.display = 'none';
        }
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
    
    // Keep labels locked onto the moving 3D boxes
    centralAnimals.forEach((mesh, id) => {
        const label = floatingLabels[id];
        if(label) {
            const pos = mesh.position.clone(); pos.y += 2.5; pos.project(camera);
            if (pos.z < 1) {
                const x = (pos.x * .5 + .5) * window.innerWidth;
                const y = (pos.y * -.5 + .5) * window.innerHeight;
                label.style.left = `${x}px`; label.style.top = `${y}px`; label.style.display = 'block';
            } else { label.style.display = 'none'; }
        }
    });

    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
}

initGame();
