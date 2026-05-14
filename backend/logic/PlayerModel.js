import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    pin: String,
    kills: { type: Number, default: 0 },
    deaths: { type: Number, default: 0 },
    scrap: { type: Number, default: 0 },
    lastSeen: { type: Date, default: Date.now }
});

const PlayerModel = mongoose.model('Player', playerSchema);

export default PlayerModel;
