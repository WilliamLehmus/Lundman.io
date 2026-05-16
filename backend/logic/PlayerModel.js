import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema({
    username: { type: String, required: true },
    identityKey: { type: String, unique: true, required: true }, // Hybrid identity key
    pin: String,
    kills: { type: Number, default: 0 },
    deaths: { type: Number, default: 0 },
    scrap: { type: Number, default: 0 },
    lastSeen: { type: Date, default: Date.now }
});

// Helper to determine the identity key
playerSchema.statics.getIdentityKey = function(username) {
    const lower = username.toLowerCase();
    const upper = username.toUpperCase();
    const capitalized = username.charAt(0).toUpperCase() + username.slice(1).toLowerCase();
    
    // If it's one of the 3 standard forms, they share a 'standard' key
    if (username === lower || username === upper || username === capitalized) {
        return `std_${lower}`;
    }
    // Otherwise, it's a unique identity (case-sensitive)
    return `exact_${username}`;
};

const PlayerModel = mongoose.model('Player', playerSchema);

export default PlayerModel;
