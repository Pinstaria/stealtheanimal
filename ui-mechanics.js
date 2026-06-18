// public/ui-mechanics.js

import { savePlayerData } from './firebase-setup.js';

// Base Prices for Upgrades
const UPGRADE_COSTS = {
    capacity: 5000,
    lockTime: 2500,
    guaranteedSpawn: 10000
};

export class UIManager {
    constructor(localData, socket, myUid) {
        this.localData = localData;
        this.socket = socket;
        this.myUid = myUid;

        this.setupEventListeners();
        this.checkOfflineEarnings();
    }

    setupEventListeners() {
        // Upgrade Buttons
        document.getElementById('upgrade-capacity-btn')?.addEventListener('click', () => this.buyUpgrade('capacity'));
        document.getElementById('upgrade-lock-btn')?.addEventListener('click', () => this.buyUpgrade('lockTime'));
        
        // Daily Wheel Spin
        document.getElementById('spin-wheel-btn')?.addEventListener('click', () => this.spinWheel());

        // Locking the Base manually
        document.getElementById('lock-base-btn')?.addEventListener('click', () => {
            this.socket.emit('lockBase');
            this.triggerLockVisuals();
        });
    }

    buyUpgrade(type) {
        const cost = UPGRADE_COSTS[type];
        if (this.localData.money >= cost) {
            this.localData.money -= cost;
            this.localData[type + 'Level'] = (this.localData[type + 'Level'] || 1) + 1;
            
            // Update UI & Server
            document.getElementById('money-display').innerText = this.localData.money;
            this.socket.emit('buyUpgrade', { type, newLevel: this.localData[type + 'Level'] });
            
            // Save to Firebase
            savePlayerData(this.myUid, { 
                money: this.localData.money,
                [type + 'Level']: this.localData[type + 'Level']
            });

            alert(`Upgraded ${type} to Level ${this.localData[type + 'Level']}!`);
        } else {
            alert("Not enough money for this upgrade!");
        }
    }

    spinWheel() {
        const now = Date.now();
        const lastSpin = this.localData.lastSpinTime || 0;
        const oneDay = 24 * 60 * 60 * 1000;

        if (now - lastSpin < oneDay) {
            const hoursLeft = Math.floor((oneDay - (now - lastSpin)) / 3600000);
            alert(`Wheel is on cooldown! Come back in ${hoursLeft} hours.`);
            return;
        }

        // Logic for Spin (99% chance for money, 1% chance for god-tier animal)
        const roll = Math.random();
        if (roll > 0.99) {
            // Jackpot Animal (Diamond, Rainbow, or Crimson)
            const rareTiers = ["Diamond", "Rainbow", "Crimson"];
            const wonRarity = rareTiers[Math.floor(Math.random() * rareTiers.length)];
            alert(`🎰 JACKPOT! You won a ${wonRarity} tier animal!`);
            this.socket.emit('addRewardAnimal', wonRarity);
        } else {
            // Cash Reward scaling with lock level
            const cashWon = Math.floor(Math.random() * 5000) * (this.localData.lockTimeLevel || 1);
            this.localData.money += cashWon;
            document.getElementById('money-display').innerText = this.localData.money;
            alert(`🎰 You spun the wheel and won $${cashWon}!`);
        }

        // Save new spin time
        this.localData.lastSpinTime = now;
        savePlayerData(this.myUid, { money: this.localData.money, lastSpinTime: now });
    }

    checkOfflineEarnings() {
        const now = Date.now();
        const lastLogin = this.localData.lastLoginTime || now;
        const secondsOffline = Math.floor((now - lastLogin) / 1000);

        // Cap offline earnings to 48 hours to prevent overflow exploits
        const validSeconds = Math.min(secondsOffline, 172800); 

        if (validSeconds > 60 && this.localData.animals && this.localData.animals.length > 0) {
            let earnings = 0;
            // Simple math: each animal earns its rarity index * $1 per minute offline
            this.localData.animals.forEach(animal => {
                const rarityIndex = this.getRarityIndex(animal.rarity);
                earnings += (rarityIndex * 1) * (validSeconds / 60);
            });

            earnings = Math.floor(earnings);
            if (earnings > 0) {
                this.localData.money += earnings;
                document.getElementById('money-display').innerText = this.localData.money;
                alert(`Welcome back! Your locked animals generated $${earnings} while you were offline.`);
            }
        }

        // Update last login timestamp
        savePlayerData(this.myUid, { money: this.localData.money, lastLoginTime: now });
    }

    getRarityIndex(rarity) {
        const RARITIES = ["Regular", "White", "Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Pink", "Teal", "Fuchsia", "Turquoise", "Gold", "Diamond", "Rainbow", "Crimson", "Platinum", "Coral", "Canary", "Chartreuse", "Azure"];
        return Math.max(1, RARITIES.indexOf(rarity) + 1);
    }

    triggerLockVisuals() {
        const baseElement = document.getElementById('base-status');
        if (baseElement) {
            baseElement.innerText = "🔒 LOCKED";
            baseElement.style.color = "#2ecc71";
            setTimeout(() => {
                baseElement.innerText = "🔓 UNLOCKED";
                baseElement.style.color = "#e74c3c";
            }, (this.localData.lockTimeLevel || 1) * 10000); // 10 seconds per upgrade level
        }
    }
}
