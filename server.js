// server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const { 
    MAX_LOBBY_PLAYERS, MAP_CENTER, MAP_RADIUS, 
    RARITIES, BASE_PRICES, getAnimalNameByRarity 
} = require('./constants');

const app = express();
app.use(express.static('.'));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- GAME STATE ---
const lobbies = new Map(); // Map of FriendCode -> LobbyInstance
const playersToLobby = new Map(); // Map of SocketID -> FriendCode

// --- CLASSES ---

class Animal {
    constructor() {
        this.id = crypto.randomUUID();
        this.rarity = this.rollRarity();
        this.name = getAnimalNameByRarity(this.rarity);
        // Spawn randomly within 500 units of the map center
        this.x = MAP_CENTER.x + (Math.random() * 1000 - 500);
        this.y = MAP_CENTER.y + (Math.random() * 1000 - 500);
        this.isCarriedBy = null;
    }

    rollRarity() {
        // Weighted random: Heavy bias towards index 0 (Regular), incredibly rare for 20 (Azure)
        const curve = Math.pow(Math.random(), 4); 
        const index = Math.floor(curve * RARITIES.length);
        return RARITIES[index];
    }
}

class Base {
    constructor() {
        this.animals = [];
        this.maxCapacity = 10;
        this.lockLevel = 1;
        this.guaranteedSpawnLevel = 0; // Index of RARITIES
    }

    addAnimal(animal) {
        if (this.animals.length < this.maxCapacity) {
            this.animals.push(animal);
            return true;
        }
        return false;
    }

    removeAnimal(animalId) {
        const index = this.animals.findIndex(a => a.id === animalId);
        if (index !== -1) {
            return this.animals.splice(index, 1)[0];
        }
        return null;
    }
}

class Lobby {
    constructor(friendCode) {
        this.friendCode = friendCode;
        this.realPlayers = new Map(); // SocketID -> PlayerData
        this.bots = new Map();        // BotID -> BotData
        this.bases = new Map();       // SocketID/BotID -> Base
        this.centralAnimals = [];     // Animals roaming the center
        this.spawnInterval = null;
        this.botAIInterval = null;

        this.startLobbyLoops();
    }

    getTotalEntities() {
        return this.realPlayers.size + this.bots.size;
    }

    addRealPlayer(socketId, savedData) {
        // Kick a bot if full
        if (this.getTotalEntities() >= MAX_LOBBY_PLAYERS) {
            if (this.bots.size > 0) {
                const botToKick = Array.from(this.bots.keys())[0];
                this.bots.delete(botToKick);
                this.bases.delete(botToKick);
                io.to(this.friendCode).emit('entityRemoved', botToKick);
            } else {
                return false; // Lobby is truly full of real players
            }
        }

        const player = {
            id: socketId,
            isBot: false,
            x: MAP_CENTER.x, y: MAP_CENTER.y,
            money: savedData?.money || 0,
            carryingAnimal: null
        };

        this.realPlayers.set(socketId, player);
        this.bases.set(socketId, new Base());
        
        // Fill remaining slots with bots
        this.backfillBots();
        return true;
    }

    backfillBots() {
        const neededBots = MAX_LOBBY_PLAYERS - this.getTotalEntities();
        for (let i = 0; i < neededBots; i++) {
            const botId = "BOT_" + crypto.randomUUID().substring(0, 6);
            this.bots.set(botId, {
                id: botId,
                isBot: true,
                name: `SkibidiSnatcher_${Math.floor(Math.random() * 999)}`,
                x: MAP_CENTER.x, y: MAP_CENTER.y,
                money: 0,
                carryingAnimal: null,
                targetAnimal: null // AI state
            });
            this.bases.set(botId, new Base());
            io.to(this.friendCode).emit('entityAdded', this.bots.get(botId));
        }
    }

    startLobbyLoops() {
        // Spawn an animal in the center every 2 seconds
        this.spawnInterval = setInterval(() => {
            if (this.centralAnimals.length < 50) { // Cap loose animals to prevent lag
                const newAnimal = new Animal();
                this.centralAnimals.push(newAnimal);
                io.to(this.friendCode).emit('animalSpawned', newAnimal);
            }
        }, 2000);

        // Simple Bot AI Loop (Runs 5 times a second)
        this.botAIInterval = setInterval(() => {
            this.bots.forEach((bot, botId) => {
                if (!bot.carryingAnimal) {
                    // Find closest animal
                    if (this.centralAnimals.length > 0) {
                        bot.targetAnimal = this.centralAnimals[0]; // Simplification for demo
                        // Move towards animal
                        bot.x += (bot.targetAnimal.x - bot.x) * 0.1;
                        bot.y += (bot.targetAnimal.y - bot.y) * 0.1;
                    }
                } else {
                    // Move to base and deposit
                    // (Assuming base is at 0,0 for bots for this example)
                    bot.x += (0 - bot.x) * 0.1;
                    bot.y += (0 - bot.y) * 0.1;
                    
                    if (Math.abs(bot.x) < 50 && Math.abs(bot.y) < 50) {
                        this.bases.get(botId).addAnimal(bot.carryingAnimal);
                        bot.carryingAnimal = null;
                        bot.targetAnimal = null;
                    }
                }
            });
            // Broadcast bot positions
            io.to(this.friendCode).emit('botPositions', Array.from(this.bots.values()));
        }, 200);
    }
}

// --- SOCKET CONNECTION HANDLING ---

io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);

    // JOIN / CREATE LOBBY
    socket.on('joinLobby', (data) => {
        const friendCode = data.friendCode || crypto.randomBytes(3).toString('hex').toUpperCase(); // 6-digit hex code
        
        if (!lobbies.has(friendCode)) {
            lobbies.set(friendCode, new Lobby(friendCode));
        }

        const lobby = lobbies.get(friendCode);
        const joined = lobby.addRealPlayer(socket.id, data.savedData);

        if (joined) {
            socket.join(friendCode);
            playersToLobby.set(socket.id, friendCode);
            
            socket.emit('lobbyJoined', {
                friendCode: friendCode,
                players: Array.from(lobby.realPlayers.values()),
                bots: Array.from(lobby.bots.values()),
                animals: lobby.centralAnimals
            });
            socket.to(friendCode).emit('entityAdded', lobby.realPlayers.get(socket.id));
        } else {
            socket.emit('error', { message: "Lobby is full and contains no bots to kick." });
        }
    });

    // PLAYER MOVEMENT (Relaying to other clients)
    socket.on('playerMove', (coords) => {
        const friendCode = playersToLobby.get(socket.id);
        if (friendCode) {
            const lobby = lobbies.get(friendCode);
            const player = lobby.realPlayers.get(socket.id);
            if (player) {
                player.x = coords.x;
                player.y = coords.y;
                socket.to(friendCode).emit('playerMoved', { id: socket.id, x: coords.x, y: coords.y });
            }
        }
    });

    // GRABBING AN ANIMAL FROM THE CENTER
    socket.on('grabAnimal', (animalId) => {
        const friendCode = playersToLobby.get(socket.id);
        if (!friendCode) return;

        const lobby = lobbies.get(friendCode);
        const player = lobby.realPlayers.get(socket.id);

        if (player && !player.carryingAnimal) {
            const index = lobby.centralAnimals.findIndex(a => a.id === animalId);
            if (index !== -1) {
                const grabbed = lobby.centralAnimals.splice(index, 1)[0];
                player.carryingAnimal = grabbed;
                io.to(friendCode).emit('animalGrabbed', { entityId: socket.id, animal: grabbed });
            }
        }
    });

socket.on('sellAnimal', (animalId) => {
        const friendCode = playersToLobby.get(socket.id);
        if (!friendCode) return;

        const lobby = lobbies.get(friendCode);
        const player = lobby.realPlayers.get(socket.id);
        const base = lobby.bases.get(socket.id);

        if (player && base) {
            const animalIndex = base.animals.findIndex(a => a.id === animalId);
            
            if (animalIndex !== -1) {
                const animal = base.animals.splice(animalIndex, 1)[0];
                let price = BASE_PRICES[animal.rarity] || 10;
                
                player.money += price;
                
                socket.emit('moneyUpdated', player.money);
                io.to(friendCode).emit('baseUpdated', { entityId: socket.id, animals: base.animals });
                
                console.log(`[SECURE] Player ${socket.id} sold a ${animal.rarity} for $${price}.`);
            } else {
                console.log(`[HACK ATTEMPT] Player ${socket.id} tried to sell an unowned animal.`);
            }
        }
    });

    // WEEKLY EGG LOGIC (Triggered by client for demo purposes)
    socket.on('claimWeeklyEgg', () => {
        const friendCode = playersToLobby.get(socket.id);
        if (!friendCode) return;

        const lobby = lobbies.get(friendCode);
        const base = lobby.bases.get(socket.id);
        
        let newEggRarity = "Regular";

        if (base && base.animals.length > 0) {
            // Calculate average rarity index
            const totalRarity = base.animals.reduce((sum, animal) => {
                return sum + RARITIES.indexOf(animal.rarity);
            }, 0);
            const averageIndex = Math.round(totalRarity / base.animals.length);
            newEggRarity = RARITIES[averageIndex];
        }

        socket.emit('eggHatched', { rarity: newEggRarity, animalName: getAnimalNameByRarity(newEggRarity) });
    });

    // DISCONNECT LOGIC
    socket.on('disconnect', () => {
        console.log(`[-] Player disconnected: ${socket.id}`);
        const friendCode = playersToLobby.get(socket.id);
        if (friendCode) {
            const lobby = lobbies.get(friendCode);
            lobby.realPlayers.delete(socket.id);
            // We do NOT delete the base immediately so it can be robbed if you implement offline raiding
            io.to(friendCode).emit('entityRemoved', socket.id);
            
            // Clean up empty lobbies to save server memory
            if (lobby.realPlayers.size === 0) {
                clearInterval(lobby.spawnInterval);
                clearInterval(lobby.botAIInterval);
                lobbies.delete(friendCode);
                console.log(`Destroyed empty lobby: ${friendCode}`);
            }
            playersToLobby.delete(socket.id);
        }
    });
});

// START SERVER
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[🚀] Animal Snatchers Server live on port ${PORT}`);
});
// --- GLOBAL BACKEND EXCEPTION LOGGER ---
process.on('uncaughtException', (err) => {
    console.error(`[CRITICAL CRASH] Uncaught Exception thrown: ${err.message}`);
    console.error(err.stack);
    // Keeps the Node process alive despite a critical logical failure
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[WARNING] Unhandled Async Promise Rejection at:', promise);
    console.error(`Reason: ${reason?.stack || reason}`);
});
