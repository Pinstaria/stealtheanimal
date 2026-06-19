const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
app.use(express.static('.'));
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const RARITIES = ["Regular", "Regular", "Regular", "Diamond", "Azure"];
const BASE_PRICES = { "Regular": 10, "Diamond": 100, "Azure": 1000, "Illegal": 50000 };
const WEATHERS = ["Clear", "Clear", "Radioactive", "Blood Moon", "Blizzard", "Golden Hour"];

const lobbies = new Map();
const playersToLobby = new Map();

class Animal {
    constructor(forcedRarity = null, forcedMutation = null, currentWeather = "Clear") {
        this.id = crypto.randomUUID();
        this.rarity = forcedRarity || RARITIES[Math.floor(Math.pow(Math.random(), 4) * RARITIES.length)];
        
        // Apply mutations based on active weather (40% chance during weather event)
        this.mutation = forcedMutation || "None";
        if (this.mutation === "None" && currentWeather !== "Clear" && Math.random() > 0.6) {
            if (currentWeather === "Radioactive") this.mutation = "Mutated";
            if (currentWeather === "Blood Moon") this.mutation = "Vampiric";
            if (currentWeather === "Blizzard") this.mutation = "Frozen";
            if (currentWeather === "Golden Hour") this.mutation = "Midas";
        }

        // Calculate Multipliers
        let multi = 1;
        if (this.mutation === "Mutated") multi = 3;
        if (this.mutation === "Vampiric") multi = 5;
        if (this.mutation === "Frozen") multi = 2;
        if (this.mutation === "Midas") multi = 10;
        
        this.value = (BASE_PRICES[this.rarity] || 10) * multi;
        
        // Spawn on the Conveyor Belt
        this.x = 1000 + (Math.random() * 20 - 10); 
        this.y = 800; 
    }
}

class Base {
    constructor(x, y) {
        this.animals = [];
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
        this.startLoops();
    }

    startLoops() {
        // SPAWNER
        this.spawnInterval = setInterval(() => {
            if (this.centralAnimals.length < 25) {
                const animal = new Animal(null, null, this.weather);
                this.centralAnimals.push(animal);
                io.to(this.friendCode).emit('animalSpawned', animal);
            }
        }, 1500);

        // WEATHER CYCLE (Changes every 20 seconds)
        this.weatherInterval = setInterval(() => {
            this.weather = WEATHERS[Math.floor(Math.random() * WEATHERS.length)];
            io.to(this.friendCode).emit('weatherChanged', this.weather);
        }, 20000);

        // CONVEYOR & AI
        this.botAIInterval = setInterval(() => {
            // Move items down belt
            for (let i = this.centralAnimals.length - 1; i >= 0; i--) {
                let animal = this.centralAnimals[i];
                animal.y += 2; 
                if (animal.y > 1200) { // Hit portal
                    this.centralAnimals.splice(i, 1);
                    io.to(this.friendCode).emit('animalRemoved', animal.id);
                } else {
                    io.to(this.friendCode).emit('animalMoved', { id: animal.id, x: animal.x, y: animal.y });
                }
            }

            // Bot AI
            this.bots.forEach((bot, botId) => {
                const myBase = this.bases.get(botId);
                if (!bot.carryingAnimal) {
                    if (this.centralAnimals.length > 0) {
                        let target = this.centralAnimals[0];
                        bot.x += (target.x - bot.x) * 0.08;
                        bot.y += (target.y - bot.y) * 0.08;

                        if (Math.hypot(bot.x - target.x, bot.y - target.y) < 15) {
                            bot.carryingAnimal = this.centralAnimals.shift();
                            io.to(this.friendCode).emit('animalRemoved', bot.carryingAnimal.id);
                        }
                    }
                } else {
                    bot.x += (myBase.x - bot.x) * 0.08;
                    bot.y += (myBase.y - bot.y) * 0.08;

                    if (Math.hypot(bot.x - myBase.x, bot.y - myBase.y) < 15) {
                        bot.carryingAnimal = null; // Bot deposits and deletes item
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

        lobby.realPlayers.set(socket.id, { id: socket.id, x: 800, y: 1000, carryingAnimal: null, money: data.savedData?.money || 0 });
        const playerBase = new Base(800, 1000); // Player base is at X:800, Y:1000
        playerBase.ownerId = socket.id;
        lobby.bases.set(socket.id, playerBase);

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
            
            // --- RESTORED: BASE AUTO-SELL DEPOSIT LOGIC ---
            const myBase = lobby.bases.get(socket.id);
            if(player.carryingAnimal && myBase) {
                const distToPad = Math.hypot(player.x - myBase.x, player.y - myBase.y);
                if (distToPad < 20) {
                    player.money += player.carryingAnimal.value;
                    socket.emit('moneyUpdated', player.money); // Tells UI to update and save
                    player.carryingAnimal = null;
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
            }
        }
    });

    socket.on('adminSpawnRequest', (rarity) => {
        const code = playersToLobby.get(socket.id);
        if(!code) return;
        const animal = new Animal(rarity, null, lobbies.get(code).weather);
        lobbies.get(code).centralAnimals.push(animal);
        io.to(code).emit('animalSpawned', animal);
    });

    socket.on('adminGiveIllegal', () => {
        const code = playersToLobby.get(socket.id);
        if(!code) return;
        const animal = new Animal("Illegal", "Mutated", "Clear");
        lobbies.get(code).centralAnimals.push(animal);
        io.to(code).emit('animalSpawned', animal);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on ${PORT}`));
