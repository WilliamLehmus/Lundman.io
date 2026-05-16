import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URL = process.env.MONGO_URL;

mongoose.connect(MONGO_URL)
    .then(async () => {
        const players = await mongoose.connection.db.collection('players').find({}).toArray();
        console.log('Players found:', players.map(p => ({ username: p.username, hasPin: !!p.pin })));
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
