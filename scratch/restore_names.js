import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URL = process.env.MONGO_URL;

mongoose.connect(MONGO_URL)
    .then(async () => {
        const players = await mongoose.connection.db.collection('players').find({}).toArray();
        
        for (const player of players) {
            let finalUsername = player.username;
            
            // Om det är ditt konto, tvinga det till Lundixz
            if (player.username.toLowerCase() === 'lundixz') {
                finalUsername = 'Lundixz';
            }
            
            console.log(`Updating ${player.username} -> ${finalUsername} (lowered: ${finalUsername.toLowerCase()})`);
            
            await mongoose.connection.db.collection('players').updateOne(
                { _id: player._id },
                { 
                    $set: { 
                        username: finalUsername,
                        usernameLower: finalUsername.toLowerCase()
                    } 
                }
            );
        }
        
        console.log('Final restoration complete.');
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
