// public/base-rendering.js

export class BaseRenderer {
    constructor(ctx, myId) {
        this.ctx = ctx;
        this.myId = myId;
        // Assign a random coordinate for the player's base upon joining
        // In a full production game, the server would dictate this coordinate
        this.baseX = Math.random() * 1000 + 500; 
        this.baseY = Math.random() * 1000 + 500;
        this.baseRadius = 150;
        this.isLocked = false;
    }

    drawBase(myAnimals) {
        this.ctx.save();
        
        // Draw the Base Area
        this.ctx.fillStyle = this.isLocked ? "rgba(46, 204, 113, 0.3)" : "rgba(52, 152, 219, 0.2)";
        this.ctx.beginPath();
        this.ctx.arc(this.baseX, this.baseY, this.baseRadius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = this.isLocked ? "#2ecc71" : "#3498db";
        this.ctx.stroke();

        // Draw Base Label
        this.ctx.fillStyle = "#fff";
        this.ctx.font = "16px Courier New";
        this.ctx.textAlign = "center";
        this.ctx.fillText("🏠 My Base", this.baseX, this.baseY - this.baseRadius - 10);

        // Draw Animals inside the base
        if (myAnimals && myAnimals.length > 0) {
            myAnimals.forEach((animal, index) => {
                // Arrange them in a rough circle inside the base
                const angle = (index / myAnimals.length) * Math.PI * 2;
                const dist = this.baseRadius * 0.5;
                const ax = this.baseX + Math.cos(angle) * dist;
                const ay = this.baseY + Math.sin(angle) * dist;

                this.ctx.fillStyle = this.getColorForRarity(animal.rarity);
                this.ctx.beginPath();
                this.ctx.arc(ax, ay, 12, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            });
        }

        // Draw Shield Bubble if Locked
        if (this.isLocked) {
            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
            this.ctx.setLineDash([10, 10]);
            this.ctx.beginPath();
            this.ctx.arc(this.baseX, this.baseY, this.baseRadius + 10, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.setLineDash([]); // Reset
        }

        this.ctx.restore();
    }

    checkDropoff(playerX, playerY, carriedAnimal, socket) {
        const dist = Math.hypot(playerX - this.baseX, playerY - this.baseY);
        // If player enters base with an animal, deposit it
        if (dist < this.baseRadius && carriedAnimal) {
            socket.emit('depositAnimal');
            return true;
        }
        return false;
    }

getColorForRarity(rarity) {
        const colors = {
            "Regular": "#95a5a6",    // Muted Gray
            "White": "#ffffff",      // Pure White
            "Red": "#e74c3c",        // Solid Red
            "Orange": "#e67e22",     // Orange
            "Yellow": "#f1c40f",     // Bright Yellow
            "Green": "#2ecc71",      // Vibrant Green
            "Blue": "#3498db",       // Classic Blue
            "Purple": "#9b59b6",     // Royal Purple
            "Pink": "#fd79a8",       // Hot Pink
            "Teal": "#00cec9",       // Teal Deep
            "Fuchsia": "#d63031",    // Fuchsia Red
            "Turquoise": "#00cae3",  // Turquoise
            "Gold": "#ffd700",       // Metallic Gold
            "Diamond": "#74b9ff",    // Ice Diamond Blue
            "Rainbow": "#ff7675",    // Multi-gradient base (Fallback Red-Pink)
            "Crimson": "#8b0000",    // Deep Blood Red
            "Platinum": "#dfe6e9",   // Metallic Platinum/Silver
            "Coral": "#ff7f50",      // Light Coral Orange
            "Canary": "#fff200",     // Sharp Canary Yellow
            "Chartreuse": "#7fff00", // Neon Lime Green
            "Azure": "#00a8ff"       // Celestial Sky Blue
        };
        return colors[rarity] || "#95a5a6"; 
    }
}
