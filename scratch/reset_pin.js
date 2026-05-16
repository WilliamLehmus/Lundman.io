import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URL = process.env.MONGO_URL;

mongoose.connect(MONGO_URL)
    .then(async () => {
        // We look for 'std_lundixz' which is the identity key for Lundixz
        const result = await mongoose.connection.db.collection('players').updateOne(
            { identityKey: 'std_lundixz' },
            { $set: { pin: null } }
        );
        
        if (result.matchedCount > 0) {
            console.log('PIN for Lundixz has been reset. You can now set a new one on next login.');
        } else {
            console.log('Could not find account Lundixz.');
        }
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
