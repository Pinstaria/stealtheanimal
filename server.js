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
        
        // Spawn at the very START of the runway (Server Y: 800)
        this.x = 1000 + (Math.random() * 20 - 10); // Center belt
        this.y = 800; // Far north
    }
}

class Base {
    constructor(x, y) {
        this.animals = [];
        this.isLocked = false;
        this.ownerId = null;
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
        this.startLoops();
    }

    startLoops() {
        // SPAWNER: Drops items onto the carpet every 1.5 seconds
        this.spawnInterval = setInterval(() => {
            if (this.centralAnimals.length < 25) {
                const animal = new Animal();
                this.centralAnimals.push(animal);
                io.to(this.friendCode).emit('animalSpawned', animal);
            }
        }, 1500);

        // CONVEYOR BELT & BOT ENGINE: Runs 10 times a second
        this.botAIInterval = setInterval(() => {
            
            // 1. Move all animals down the runway
            for (let i = this.centralAnimals.length - 1; i >= 0; i--) {
                let animal = this.centralAnimals[i];
                animal.y += 2; // Slide down carpet
                
                // If it hits the portal (Y = 1200), despawn it
                if (animal.y > 1200) {
                    this.centralAnimals.splice(i, 1);
                    io.to(this.friendCode).emit('animalRemoved', animal.id);
                } else {
                    io.to(this.friendCode).emit('animalMoved', { id: animal.id, x: animal.x, y: animal.y });
                }
            }

            // 2. Bot AI Logic
            this.bots.forEach((bot, botId) => {
                const myBase = this.bases.get(botId);
                
                // Base locking check
                const distToPlatform = Math.hypot(bot.x - myBase.x, bot.y - myBase.y);
                myBase.isLocked = distToPlatform < 20;

                if (!bot.carryingAnimal) {
                    // Go after the animal furthest down the runway
                    if (this.centralAnimals.length > 0) {
                        let target = this.centralAnimals[0];
                        bot.x += (target.x - bot.x) * 0.08;
                        bot.y += (target.y - bot.y) * 0.08;

                        // Grab it!
                        if (Math.hypot(bot.x - target.x, bot.y - target.y) < 15) {
                            bot.carryingAnimal = this.centralAnimals.shift();
                            io.to(this.friendCode).emit('animalRemoved', bot.carryingAnimal.id);
                        }
                    }
                } else {
                    // Run back to base
                    bot.x += (myBase.x - bot.x) * 0.08;
                    bot.y += (myBase.y - bot.y) * 0.08;

                    // Deposit
                    if (distToPlatform < 10) {
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
        const code = "GLOBAL";
        if (!lobbies.has(code)) lobbies.set(code, new Lobby(code));
        const lobby = lobbies.get(code);

        // Player is Base 1 (Left Side)
        lobby.realPlayers.set(socket.id, { id: socket.id, x: 800, y: 1000, carryingAnimal: null });
        const playerBase = new Base(800, 1000);
        playerBase.ownerId = socket.id;
        lobby.bases.set(socket.id, playerBase);

        // Generate Bots on the right side and corners
        if (lobby.bots.size < 3) {
            const botLocs = [{x: 1200, y: 1000}, {x: 800, y: 800}, {x: 1200, y: 800}];
            const loc = botLocs[lobby.bots.size];
            const botId = "BOT_" + Math.floor(Math.random() * 1000);
            
            lobby.bots.set(botId, { id: botId, isBot: true, x: loc.x, y: loc.y, carryingAnimal: null });
            const botBase = new Base(loc.x, loc.y);
            botBase.ownerId = botId;
            lobby.bases.set(botId, botBase);
        }

        playersToLobby.set(socket.id, code);
        socket.join(code);
        
        socket.emit('lobbyJoined', { 
            friendCode: code, 
            players: Array.from(lobby.realPlayers.values()), 
            bots: Array.from(lobby.bots.values()), 
            animals: lobby.centralAnimals,
            bases: Array.from(lobby.bases.values())
        });
    });

    socket.on('playerMove', (coords) => {
        const code = playersToLobby.get(socket.id);
        if(code && lobbies.get(code).realPlayers.has(socket.id)) {
            lobbies.get(code).realPlayers.get(socket.id).x = coords.x; 
            lobbies.get(code).realPlayers.get(socket.id).y = coords.y;
            socket.to(code).emit('playerMoved', { id: socket.id, x: coords.x, y: coords.y });
        }
    });

    socket.on('grabAnimal', (animalId) => {
        const code = playersToLobby.get(socket.id);
        if(!code) return;
        const lobby = lobbies.get(code);
        const player = lobby.realPlayers.get(socket.id);
        
        if (player && !player.carryingAnimal) {
            const index = lobby.centralAnimals.findIndex(a => a.id === animalId);
            if (index !== -1) {
                player.carryingAnimal = lobby.centralAnimals.splice(index, 1)[0];
                io.to(code).emit('animalRemoved', animalId);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on ${PORT}`));
