const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
app.use(express.static('.'));
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// EXACT RARITIES LIST (21 Natural + 1 Illegal)
const RARITIES = [
    "Regular", "White", "Red", "Orange", "yellow", "green", "blue", "purple", 
    "pink", "Teal", "Fuchsia", "Turquoise", "Gold", "Diamond", "Rainbow", 
    "Crimson", "Platinum", "Coral", "Canary", "Charteasue", "Azure"
];

// GENERATE ANIMAL DATABASE (Multiple animals per rarity with distinct spawn weights)
const ANIMAL_DB = [];
let totalSpawnWeight = 0;

RARITIES.forEach((rarity, index) => {
    const baseVal = Math.floor(Math.pow(1.6, index) * 10); // Exponential value curve
    const spawnWeight = Math.max(1, Math.floor(10000 / Math.pow(2, index))); // Rarer = exponentially lower chance
    
    // Animal A
    ANIMAL_DB.push({ rarity: rarity, name: `${rarity} Hound`, weight: spawnWeight, baseBuy: baseVal });
    totalSpawnWeight += spawnWeight;
    
    // Animal B
    ANIMAL_DB.push({ rarity: rarity, name: `${rarity} Falcon`, weight: Math.floor(spawnWeight * 0.8), baseBuy: Math.floor(baseVal * 1.2) });
    totalSpawnWeight += Math.floor(spawnWeight * 0.8);
});

const WEATHERS = ["Clear", "Clear", "Radioactive", "Blood Moon", "Blizzard", "Golden Hour"];

const lobbies = new Map();
const playersToLobby = new Map();

class Animal {
    constructor(forcedDbItem = null, forcedMutation = null, currentWeather = "Clear", isTutorial = false) {
        this.id = crypto.randomUUID();
        this.isTutorial = isTutorial;
        
        let dbItem = forcedDbItem;
        if (!dbItem) {
            // Roll based on PER ANIMAL weight
            let roll = Math.random() * totalSpawnWeight;
            for (let item of ANIMAL_DB) {
                if (roll < item.weight) { dbItem = item; break; }
                roll -= item.weight;
            }
            if(!dbItem) dbItem = ANIMAL_DB[0]; // Fallback
        }

        this.rarity = dbItem.rarity;
        this.name = dbItem.name;
        
        // Mutations
        this.mutation = forcedMutation || "None";
        if (this.mutation === "None" && currentWeather !== "Clear" && Math.random() > 0.6) {
            if (currentWeather === "Radioactive") this.mutation = "Mutated";
            if (currentWeather === "Blood Moon") this.mutation = "Vampiric";
            if (currentWeather === "Blizzard") this.mutation = "Frozen";
            if (currentWeather === "Golden Hour") this.mutation = "Midas";
        }

        let multi = 1;
        if (this.mutation === "Mutated") multi = 3;
        if (this.mutation === "Vampiric") multi = 5;
        if (this.mutation === "Frozen") multi = 2;
        if (this.mutation === "Midas") multi = 10;
        
        // Dynamic Pricing (Variance among same rarity)
        const variance = 0.8 + (Math.random() * 0.4); // +/- 20%
        this.buyPrice = Math.floor(dbItem.baseBuy * variance * multi);
        this.sellPrice = Math.floor(this.buyPrice / 2); // Sell is exactly half of Buy
        this.mps = Math.floor(this.buyPrice * 0.05) || 1; // 5% of buy price per second

        if(this.isTutorial) {
            this.name = "Beginner Pet"; this.buyPrice = 50; this.sellPrice = 25; this.mps = 5;
        }
        
        // Placement on Conveyor
        this.x = 1000 + (Math.random() * 10 - 5); 
        this.y = 800; 
    }
}

class Base {
    constructor(x, y) {
        this.animals = [];
        this.capacity = 5;
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
        this.weather = "Clear";
        this.tutorialActive = false;
        this.startLoops();
    }

    startLoops() {
        // SPAWNER (20 Spaced-Out Pets)
        this.spawnInterval = setInterval(() => {
            if (this.centralAnimals.length < 20) {
                // Ensure nice spacing by checking the last spawned animal's Y position
                const lastAnimal = this.centralAnimals[this.centralAnimals.length - 1];
                if (!lastAnimal || lastAnimal.y > 820) { 
                    
                    // Tutorial Beginner Pet Logic
                    let isTutorialPet = false;
                    if (this.tutorialActive) {
                        const hasBeginnerOnBelt = this.centralAnimals.some(a => a.isTutorial);
                        if (!hasBeginnerOnBelt) isTutorialPet = true;
                    }

                    const animal = new Animal(null, null, this.weather, isTutorialPet);
                    this.centralAnimals.push(animal);
                    io.to(this.friendCode).emit('animalSpawned', animal);
                }
            }
        }, 500); // Check rapidly, but spacing logic prevents clumping

        // GUARANTEED SPAWNS (Every 3 minutes - Modified to Mid-Tier: Teal to Diamond)
        this.guaranteedInterval = setInterval(() => {
            const midTierDb = ANIMAL_DB.filter(a => {
                const idx = RARITIES.indexOf(a.rarity);
                return idx >= 9 && idx <= 13; // Index 9 is Teal, Index 13 is Diamond
            });
            const forceDb = midTierDb[Math.floor(Math.random() * midTierDb.length)];
            const rareAnimal = new Animal(forceDb, "Midas", this.weather, false);
            this.centralAnimals.push(rareAnimal);
            io.to(this.friendCode).emit('animalSpawned', rareAnimal);
        }, 180000); // 3 mins

        // MONEY PER SECOND (MPS) ENGINE
        this.mpsInterval = setInterval(() => {
            this.realPlayers.forEach((player, socketId) => {
                const myBase = this.bases.get(socketId);
                if (myBase && myBase.animals.length > 0) {
                    let totalMps = 0;
                    myBase.animals.forEach(a => totalMps += a.mps);
                    player.money += totalMps;
                    io.to(socketId).emit('moneyUpdated', player.money);
                }
            });
        }, 1000); // Every 1 second

        this.weatherInterval = setInterval(() => {
            this.weather = WEATHERS[Math.floor(Math.random() * WEATHERS.length)];
            io.to(this.friendCode).emit('weatherChanged', this.weather);
        }, 30000);

        // CONVEYOR & ADVANCED BOT AI
        this.botAIInterval = setInterval(() => {
            for (let i = this.centralAnimals.length - 1; i >= 0; i--) {
                let animal = this.centralAnimals[i];
                animal.y += 1.5; // Conveyor speed
                if (animal.y > 1200) { 
                    this.centralAnimals.splice(i, 1);
                    io.to(this.friendCode).emit('animalRemoved', animal.id);
                } else {
                    io.to(this.friendCode).emit('animalMoved', { id: animal.id, x: animal.x, y: animal.y });
                }
            }

            this.bots.forEach((bot, botId) => {
                const myBase = this.bases.get(botId);
                
                // FORGETFUL BOTS: 2% chance per tick to get distracted
                if(Math.random() < 0.02 && !bot.distractedTimer) {
                    bot.distractedTimer = Math.floor(Math.random() * 20) + 10;
                }

                if (bot.distractedTimer > 0) {
                    bot.distractedTimer--;
                    bot.x += (Math.random() * 4 - 2); // Wander aimlessly
                    bot.y += (Math.random() * 4 - 2);
                    return; // Skip normal logic this tick
                }

                if (!bot.carryingAnimal) {
                    if (this.centralAnimals.length > 0) {
                        let target = this.centralAnimals[0];
                        bot.x += (target.x - bot.x) * 0.06;
                        bot.y += (target.y - bot.y) * 0.06;

                        if (Math.hypot(bot.x - target.x, bot.y - target.y) < 15) {
                            bot.carryingAnimal = this.centralAnimals.shift();
                            io.to(this.friendCode).emit('animalRemoved', bot.carryingAnimal.id);
                            io.to(this.friendCode).emit('entityCarrying', { id: botId, carrying: true });
                        }
                    }
                } else {
                    bot.x += (myBase.x - bot.x) * 0.06;
                    bot.y += (myBase.y - bot.y) * 0.06;

                    if (Math.hypot(bot.x - myBase.x, bot.y - myBase.y) < 15) {
                        if (myBase.animals.length < myBase.capacity) {
                            myBase.animals.push(bot.carryingAnimal);
                            io.to(this.friendCode).emit('basesUpdated', Array.from(this.bases.values()));
                        }
                        bot.carryingAnimal = null; 
                        io.to(this.friendCode).emit('entityCarrying', { id: botId, carrying: false });
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

        // Mark tutorial true if player has 0 money/animals
        if (!data.savedData?.money || data.savedData.money === 0) {
            lobby.tutorialActive = true;
        }

        lobby.realPlayers.set(socket.id, { id: socket.id, x: 800, y: 1000, carryingAnimal: null, money: data.savedData?.money || 0, wasOnLockPad: false });
        const playerBase = new Base(800, 1000); 
        playerBase.ownerId = socket.id;
        lobby.bases.set(socket.id, playerBase);

        if (lobby.bots.size < 3) {
            const botLocs = [{x: 1200, y: 1000}, {x: 800, y: 800}, {x: 1200, y: 800}];
            const loc = botLocs[lobby.bots.size];
            const botId = "BOT_" + Math.floor(Math.random() * 1000);
            
            lobby.bots.set(botId, { id: botId, isBot: true, x: loc.x, y: loc.y, carryingAnimal: null });
            const botBase = new Base(loc.x, loc.y);
            botBase.ownerId = botId;
            botBase.isLocked = true; 
            lobby.bases.set(botId, botBase);
        }

        playersToLobby.set(socket.id, code);
        socket.join(code);
        
        socket.emit('lobbyJoined', { 
            friendCode: code, 
            players: Array.from(lobby.realPlayers.values()), 
            bots: Array.from(lobby.bots.values()), 
            animals: lobby.centralAnimals,
            bases: Array.from(lobby.bases.values()),
            currentWeather: lobby.weather
        });
    });

    socket.on('playerMove', (coords) => {
        const code = playersToLobby.get(socket.id);
        if(!code) return;
        const lobby = lobbies.get(code);
        const player = lobby.realPlayers.get(socket.id);
        
        if(player) {
            player.x = coords.x; player.y = coords.y;
            const myBase = lobby.bases.get(socket.id);
            
            if(myBase) {
                const distToLockPad = Math.hypot(player.x - (myBase.x - 40), player.y - (myBase.y + 40));
                if (distToLockPad < 20 && !player.wasOnLockPad) {
                    myBase.isLocked = !myBase.isLocked;
                    player.wasOnLockPad = true;
                    io.to(code).emit('basesUpdated', Array.from(lobby.bases.values()));
                } else if (distToLockPad >= 20) {
                    player.wasOnLockPad = false;
                }

                if(player.carryingAnimal) {
                    const distToCenter = Math.hypot(player.x - myBase.x, player.y - myBase.y);
                    if (distToCenter < 40) {
                        if (myBase.animals.length < myBase.capacity) {
                            myBase.animals.push(player.carryingAnimal);
                            
                            // Tutorial finish check
                            if (player.carryingAnimal.isTutorial) {
                                lobby.tutorialActive = false;
                                socket.emit('tutorialComplete');
                            }

                            // Add SELL VALUE to money upon deposit
                            player.money += player.carryingAnimal.sellPrice;
                            socket.emit('moneyUpdated', player.money);
                            
                            io.to(code).emit('basesUpdated', Array.from(lobby.bases.values()));
                            player.carryingAnimal = null;
                            io.to(code).emit('entityCarrying', { id: socket.id, carrying: false });
                        }
                    }
                }
            }
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
                io.to(code).emit('entityCarrying', { id: socket.id, carrying: true });
            }
        }
    });

    // STEALING MECHANIC (Take from bots or other players)
    socket.on('stealAnimal', (targetId) => {
        const code = playersToLobby.get(socket.id);
        if(!code) return;
        const lobby = lobbies.get(code);
        const player = lobby.realPlayers.get(socket.id);

        if (player && !player.carryingAnimal) {
            // Check Bots
            const targetBot = lobby.bots.get(targetId);
            if (targetBot && targetBot.carryingAnimal) {
                const dist = Math.hypot(player.x - targetBot.x, player.y - targetBot.y);
                if (dist < 20) {
                    player.carryingAnimal = targetBot.carryingAnimal;
                    targetBot.carryingAnimal = null;
                    io.to(code).emit('entityCarrying', { id: socket.id, carrying: true });
                    io.to(code).emit('entityCarrying', { id: targetBot.id, carrying: false });
                    return;
                }
            }
            // Check Players
            const targetPlayer = lobby.realPlayers.get(targetId);
            if (targetPlayer && targetPlayer.carryingAnimal && targetId !== socket.id) {
                const dist = Math.hypot(player.x - targetPlayer.x, player.y - targetPlayer.y);
                if (dist < 20) {
                    player.carryingAnimal = targetPlayer.carryingAnimal;
                    targetPlayer.carryingAnimal = null;
                    io.to(code).emit('entityCarrying', { id: socket.id, carrying: true });
                    io.to(code).emit('entityCarrying', { id: targetPlayer.id, carrying: false });
                }
            }
        }
    });

    // EGG SYSTEM
    socket.on('claimWeeklyEgg', () => {
        const code = playersToLobby.get(socket.id);
        if(!code) return;
        const lobby = lobbies.get(code);
        const base = lobby.bases.get(socket.id);
        
        if (base && base.animals.length > 0) {
            let totalIndex = 0;
            base.animals.forEach(a => {
                totalIndex += Math.max(0, RARITIES.indexOf(a.rarity));
            });
            const avgIndex = Math.floor(totalIndex / base.animals.length);
            
            // Give an egg based on that average index
            const eggDbItem = ANIMAL_DB.find(a => a.rarity === RARITIES[avgIndex]);
            const eggAnimal = new Animal(eggDbItem, null, "Clear", false);
            
            lobby.realPlayers.get(socket.id).carryingAnimal = eggAnimal;
            io.to(code).emit('entityCarrying', { id: socket.id, carrying: true });
            socket.emit('eggHatched', eggAnimal);
        }
    });

    socket.on('buyCapacity', () => {
        const code = playersToLobby.get(socket.id);
        if(!code) return;
        const lobby = lobbies.get(code);
        const player = lobby.realPlayers.get(socket.id);
        const base = lobby.bases.get(socket.id);

        if (player && base) {
            const cost = base.capacity * 200; 
            if (player.money >= cost) {
                player.money -= cost;
                base.capacity += 5;
                socket.emit('moneyUpdated', player.money);
                io.to(code).emit('basesUpdated', Array.from(lobby.bases.values()));
            }
        }
    });

    socket.on('adminSpawnRequest', (rarity) => {
        const code = playersToLobby.get(socket.id);
        if(!code) return;
        const forceDb = ANIMAL_DB.find(a => a.rarity === rarity) || ANIMAL_DB[0];
        const animal = new Animal(forceDb, null, lobbies.get(code).weather);
        lobbies.get(code).centralAnimals.push(animal);
        io.to(code).emit('animalSpawned', animal);
    });

    socket.on('adminGiveIllegal', () => {
        const code = playersToLobby.get(socket.id);
        if(!code) return;
        const animal = new Animal({ rarity: "Illegal", name: "Illegal Glitch", weight: 0, baseBuy: 50000 }, "Mutated", "Clear");
        lobbies.get(code).centralAnimals.push(animal);
        io.to(code).emit('animalSpawned', animal);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on ${PORT}`));
