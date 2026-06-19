const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
app.use(express.static('.'));
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const RARITIES = ["Regular", "Regular", "Regular", "Diamond", "Azure"];
const BASE_PRICES = { "Regular": 10, "Diamond": 100, "Azure": 1000, "Illegal": 50000 };

const lobbies = new Map();
const playersToLobby = new Map();

class Animal {
    constructor(forcedRarity = null, forceMutate = false) {
        this.id = crypto.randomUUID();
        this.rarity = forcedRarity || RARITIES[Math.floor(Math.pow(Math.random(), 4) * RARITIES.length)];
        this.isMutated = forceMutate; 
        this.value = (BASE_PRICES[this.rarity] || 10) * (this.isMutated ? 3 : 1); 
        this.x = 1000 + (Math.random() * 60 - 30);
        this.y = 1000 + (Math.random() * 60 - 30);
    }
}

class Base {
    constructor(x, y) {
        this.animals = [];
        this.isLocked = false;
        this.ownerId = null;
        // Physical location of the base platform pad
        this.x = x;
        this.y = y;
    }
}

class Lobby {
    constructor(code) {
        this.friendCode = code;
        this.realPlayers = new Map();
        this.bots = new Map();
        this.bases = new Map();
        this.centralAnimals = [];
        this.weather = "Clear"; 

        this.startLoops();
    }

    startLoops() {
        // Core Spawner Loop
        this.spawnInterval = setInterval(() => {
            if (this.centralAnimals.length < 30) {
                const isMutated = this.weather === "Radioactive" && Math.random() > 0.5;
                const animal = new Animal(null, isMutated);
                this.centralAnimals.push(animal);
                io.to(this.friendCode).emit('animalSpawned', animal);
            }
        }, 2000);

        // Weather Engine
        this.weatherInterval = setInterval(() => {
            this.weather = Math.random() > 0.8 ? "Radioactive" : "Clear";
            io.to(this.friendCode).emit('weatherChanged', this.weather);
        }, 30000);

        // Advanced Human-Like Bot Loop
        this.botAIInterval = setInterval(() => {
            this.bots.forEach((bot, botId) => {
                const myBase = this.bases.get(botId);
                
                // Track dynamic lock boundaries based on the base platform position
                const distToPlatform = Math.hypot(bot.x - myBase.x, bot.y - myBase.y);
                if (distToPlatform < 20) {
                    if (!myBase.isLocked) {
                        myBase.isLocked = true;
                        io.to(this.friendCode).emit('baseLockState', { entityId: botId, locked: true });
                    }
                } else {
                    if (myBase.isLocked) {
                        myBase.isLocked = false; // Base unlocks if they walk away from the platform!
                        io.to(this.friendCode).emit('baseLockState', { entityId: botId, locked: false });
                    }
                }

                if (!bot.carryingAnimal) {
                    // Look for open bases to steal from
                    let targetBaseId = null;
                    for (let [id, base] of this.bases.entries()) {
                        if (id !== botId && !base.isLocked && base.animals.length > 0) {
                            targetBaseId = id; break;
                        }
                    }

                    if (targetBaseId) {
                        const targetBase = this.bases.get(targetBaseId);
                        bot.x += (targetBase.x - bot.x) * 0.08;
                        bot.y += (targetBase.y - bot.y) * 0.08;
                        
                        if(Math.hypot(bot.x - targetBase.x, bot.y - targetBase.y) < 15) {
                            bot.carryingAnimal = targetBase.animals.pop();
                            io.to(this.friendCode).emit('animalStolen', { from: targetBaseId, by: botId });
                            // Set a random reaction lag time before they decide to flee back home
                            bot.returnDelayCounter = Math.floor(Math.random() * 20) + 10; 
                        }
                    } else if (this.centralAnimals.length > 0) {
                        // Gather normal items
                        let target = this.centralAnimals[0];
                        bot.x += (target.x - bot.x) * 0.07;
                        bot.y += (target.y - bot.y) * 0.07;

                        if (Math.hypot(bot.x - target.x, bot.y - target.y) < 15) {
                            bot.carryingAnimal = this.centralAnimals.shift();
                            io.to(this.friendCode).emit('animalGrabbed', { entityId: botId, animalId: bot.carryingAnimal.id });
                            bot.returnDelayCounter = Math.floor(Math.random() * 30) + 5; // Human processing delay variation
                        }
                    }
                } else {
                    // Human delay processing: Linger around before making the run home
                    if (bot.returnDelayCounter > 0) {
                        bot.returnDelayCounter--;
                        // Linger/Wander slightly
                        bot.x += (Math.random() * 4 - 2);
                        bot.y += (Math.random() * 4 - 2);
                    } else {
                        // Dynamic travel speed variations to mimic varied urgency
                        const travelUrgency = bot.id.charCodeAt(5) % 2 === 0 ? 0.09 : 0.05;
                        bot.x += (myBase.x - bot.x) * travelUrgency;
                        bot.y += (myBase.y - bot.y) * travelUrgency;

                        if (distToPlatform < 10) {
                            myBase.animals.push(bot.carryingAnimal);
                            io.to(this.friendCode).emit('baseDeposited', { entityId: botId, animal: bot.carryingAnimal });
                            bot.carryingAnimal = null;
                        }
                    }
                }
            });
            io.to(this.friendCode).emit('botPositions', Array.from(this.bots.values()));
        }, 100);
    }
}

io.on('connection', (socket) => {
    socket.on('joinLobby', (data) => {
        const code = "GLOBAL";
        if (!lobbies.has(code)) lobbies.set(code, new Lobby(code));
        const lobby = lobbies.get(code);

        lobby.realPlayers.set(socket.id, { id: socket.id, x: 1000, y: 1140, carryingAnimal: null });
        
        // Player Base setup (Platform at 1000, 1140)
        const playerBase = new Base(1000, 1140);
        playerBase.ownerId = socket.id;
        lobby.bases.set(socket.id, playerBase);

        // Spawn Human-like bots with distributed base coordinate locations
        if (lobby.bots.size < 3) {
            const bNum = lobby.bots.size + 1;
            const botId = "BOT_" + Math.floor(Math.random() * 1000);
            
            // Assign bot bases to different quadrants around the center map
            const bx = bNum === 1 ? 860 : (bNum === 2 ? 1140 : 1000);
            const by = bNum === 1 ? 1000 : (bNum === 2 ? 1000 : 860);
            
            lobby.bots.set(botId, { id: botId, isBot: true, x: bx, y: by, carryingAnimal: null, returnDelayCounter: 0 });
            const botBase = new Base(bx, by);
            botBase.ownerId = botId;
            lobby.bases.set(botId, botBase);
        }

        playersToLobby.set(socket.id, code);
        socket.join(code);
        
        socket.emit('lobbyJoined', { 
            friendCode: code, 
            players: Array.from(lobby.realPlayers.values()), 
            bots: Array.from(lobby.bots.values()), 
            animals: lobby.centralAnimals 
        });
    });

    socket.on('playerMove', (coords) => {
        const code = playersToLobby.get(socket.id);
        if(code && lobbies.get(code).realPlayers.has(socket.id)) {
            const lobby = lobbies.get(code);
            const p = lobby.realPlayers.get(socket.id);
            p.x = coords.x; p.y = coords.y;

            // Handle the real player physical platform lock validation rule
            const pBase = lobby.bases.get(socket.id);
            if(pBase) {
                const distToPad = Math.hypot(p.x - pBase.x, p.y - pBase.y);
                if(distToPad < 20) {
                    if(!pBase.isLocked) {
                        pBase.isLocked = true;
                        io.to(code).emit('baseLockState', { entityId: socket.id, locked: true });
                    }
                } else {
                    if(pBase.isLocked) {
                        pBase.isLocked = false;
                        io.to(code).emit('baseLockState', { entityId: socket.id, locked: false });
                    }
                }
            }

            socket.to(code).emit('playerMoved', { id: socket.id, x: coords.x, y: coords.y });
        }
    });

    socket.on('adminSpawnRequest', (rarity) => {
        const code = playersToLobby.get(socket.id);
        if(!code) return;
        const animal = new Animal(rarity, false);
        lobbies.get(code).centralAnimals.push(animal);
        io.to(code).emit('animalSpawned', animal);
    });

    socket.on('adminGiveIllegal', (targetId) => {
        const code = playersToLobby.get(socket.id);
        if(!code) return;
        const targetBase = lobbies.get(code).bases.get(targetId || socket.id);
        if(targetBase) {
            targetBase.animals.push(new Animal("Illegal", true));
            console.log(`Gave ILLEGAL to ${targetId || socket.id}`);
        }
    });

    socket.on('adminToggleWeather', () => {
        const code = playersToLobby.get(socket.id);
        if(!code) return;
        const lobby = lobbies.get(code);
        lobby.weather = lobby.weather === "Clear" ? "Radioactive" : "Clear";
        io.to(code).emit('weatherChanged', lobby.weather);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on ${PORT}`));
