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

// --- HARDCODED CONSTANTS (No external file needed = No crashes) ---
const RARITIES = ["Regular", "Regular", "Regular", "Diamond", "Azure"];
const BASE_PRICES = { "Regular": 10, "Diamond": 100, "Azure": 1000, "Illegal": 50000 };

const lobbies = new Map();
const playersToLobby = new Map();

class Animal {
    constructor(forcedRarity = null, forceMutate = false) {
        this.id = crypto.randomUUID();
        // If not forced, roll naturally (Illegal is impossible to roll naturally)
        this.rarity = forcedRarity || RARITIES[Math.floor(Math.pow(Math.random(), 4) * RARITIES.length)];
        this.isMutated = forceMutate; 
        
        // Boost prices if mutated
        this.value = (BASE_PRICES[this.rarity] || 10) * (this.isMutated ? 3 : 1); 

        // Spawn in center
        this.x = 1000 + (Math.random() * 60 - 30);
        this.y = 1000 + (Math.random() * 60 - 30);
    }
}

class Base {
    constructor() {
        this.animals = [];
        this.isLocked = false;
        this.ownerId = null;
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
        // SPAWN LOOP
        this.spawnInterval = setInterval(() => {
            if (this.centralAnimals.length < 30) {
                // If weather is Radioactive, 50% chance to spawn Mutated
                const isMutated = this.weather === "Radioactive" && Math.random() > 0.5;
                const animal = new Animal(null, isMutated);
                this.centralAnimals.push(animal);
                io.to(this.friendCode).emit('animalSpawned', animal);
            }
        }, 2000);

        // WEATHER LOOP (Changes every 30 seconds randomly)
        this.weatherInterval = setInterval(() => {
            this.weather = Math.random() > 0.8 ? "Radioactive" : "Clear";
            io.to(this.friendCode).emit('weatherChanged', this.weather);
        }, 30000);

        // ADVANCED BOT AI LOOP
        this.botAIInterval = setInterval(() => {
            this.bots.forEach((bot, botId) => {
                const myBase = this.bases.get(botId);
                
                if (!bot.carryingAnimal) {
                    // 1. Look for unlocked enemy bases to STEAL from
                    let targetBaseId = null;
                    for (let [id, base] of this.bases.entries()) {
                        if (id !== botId && !base.isLocked && base.animals.length > 0) {
                            targetBaseId = id; break;
                        }
                    }

                    if (targetBaseId) {
                        // Move to steal
                        bot.x += (1000 - bot.x) * 0.1; // Assuming bases are near center for logic
                        bot.y += (1000 - bot.y) * 0.1;
                    } else if (this.centralAnimals.length > 0) {
                        // 2. Normal grabbing
                        let target = this.centralAnimals[0];
                        bot.x += (target.x - bot.x) * 0.1;
                        bot.y += (target.y - bot.y) * 0.1;

                        if (Math.hypot(bot.x - target.x, bot.y - target.y) < 15) {
                            bot.carryingAnimal = this.centralAnimals.shift();
                            io.to(this.friendCode).emit('animalGrabbed', { entityId: botId, animalId: bot.carryingAnimal.id });
                        }
                    }
                } else {
                    // Return to base (Simulated at 1000, 1100)
                    bot.x += (1000 - bot.x) * 0.1;
                    bot.y += (1100 - bot.y) * 0.1;

                    if (Math.hypot(bot.x - 1000, bot.y - 1100) < 10) {
                        myBase.animals.push(bot.carryingAnimal);
                        bot.carryingAnimal = null;
                    }
                }
            });
            io.to(this.friendCode).emit('botPositions', Array.from(this.bots.values()));
        }, 100);
    }
}

io.on('connection', (socket) => {
    socket.on('joinLobby', (data) => {
        const code = "GLOBAL"; // Forced single lobby for debugging
        if (!lobbies.has(code)) lobbies.set(code, new Lobby(code));
        const lobby = lobbies.get(code);

        lobby.realPlayers.set(socket.id, { id: socket.id, x: 1000, y: 1140, carryingAnimal: null });
        
        const playerBase = new Base();
        playerBase.ownerId = socket.id;
        lobby.bases.set(socket.id, playerBase);

        // Fill bots that immediately lock their base
        if (lobby.bots.size < 3) {
            const botId = "BOT_" + Math.floor(Math.random() * 1000);
            lobby.bots.set(botId, { id: botId, isBot: true, x: 1000, y: 1000, carryingAnimal: null });
            
            const botBase = new Base();
            botBase.isLocked = true; // Bot acts like a human and locks instantly
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
            const p = lobbies.get(code).realPlayers.get(socket.id);
            p.x = coords.x; p.y = coords.y;
            socket.to(code).emit('playerMoved', { id: socket.id, x: coords.x, y: coords.y });
        }
    });

    // --- ADMIN CONTROLS ---
    socket.on('adminSpawnRequest', (rarity) => {
        const code = playersToLobby.get(socket.id);
        if(!code) return;
        const animal = new Animal(rarity, false);
        lobbies.get(code).centralAnimals.push(animal);
        io.to(code).emit('animalSpawned', animal);
    });

    // Admin Give "Illegal" Target
    socket.on('adminGiveIllegal', (targetId) => {
        const code = playersToLobby.get(socket.id);
        if(!code) return;
        const targetBase = lobbies.get(code).bases.get(targetId || socket.id);
        if(targetBase) {
            targetBase.animals.push(new Animal("Illegal", true)); // Illegal is auto-mutated
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
