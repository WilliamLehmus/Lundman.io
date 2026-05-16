import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URL = process.env.MONGO_URL;

// Copy logic from PlayerModel.js since I can't import it easily here
const getIdentityKey = (username) => {
    const lower = username.toLowerCase();
    const upper = username.toUpperCase();
    const capitalized = username.charAt(0).toUpperCase() + username.slice(1).toLowerCase();
    if (username === lower || username === upper || username === capitalized) {
        return `std_${lower}`;
    }
    return `exact_${username}`;
};

mongoose.connect(MONGO_URL)
    .then(async () => {
        const players = await mongoose.connection.db.collection('players').find({}).toArray();
        
        for (const player of players) {
            const identityKey = getIdentityKey(player.username);
            console.log(`Migrating ${player.username} -> identityKey: ${identityKey}`);
            
            await mongoose.connection.db.collection('players').updateOne(
                { _id: player._id },
                { 
                    $set: { identityKey },
                    $unset: { usernameLower: "" } // Clean up old field
                }
            );
        }
        
        console.log('Hybrid Identity migration complete.');
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
