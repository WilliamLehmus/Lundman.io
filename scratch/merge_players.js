import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URL = process.env.MONGO_URL;

mongoose.connect(MONGO_URL)
    .then(async () => {
        const players = await mongoose.connection.db.collection('players').find({}).toArray();
        const seen = new Map();
        
        for (const player of players) {
            const lower = player.username.toLowerCase();
            if (seen.has(lower)) {
                const original = seen.get(lower);
                console.log(`Merging ${player.username} into ${original.username}...`);
                
                // Merge stats
                const newKills = (original.kills || 0) + (player.kills || 0);
                const newDeaths = (original.deaths || 0) + (player.deaths || 0);
                const newScrap = (original.scrap || 0) + (player.scrap || 0);
                
                await mongoose.connection.db.collection('players').updateOne(
                    { _id: original._id },
                    { $set: { kills: newKills, deaths: newDeaths, scrap: newScrap } }
                );
                
                // Delete the duplicate
                await mongoose.connection.db.collection('players').deleteOne({ _id: player._id });
            } else {
                // If it's the first time seeing this name, but it's not lowercase, rename it
                if (player.username !== lower) {
                    console.log(`Renaming ${player.username} to ${lower}...`);
                    await mongoose.connection.db.collection('players').updateOne(
                        { _id: player._id },
                        { $set: { username: lower } }
                    );
                    player.username = lower;
                }
                seen.set(lower, player);
            }
        }
        
        console.log('Cleanup complete.');
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
