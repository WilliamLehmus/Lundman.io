import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URL = process.env.MONGO_URL;

console.log('Testing connection to:', MONGO_URL);

if (!MONGO_URL) {
    console.error('MONGO_URL is missing in .env');
    process.exit(1);
}

mongoose.connect(MONGO_URL)
    .then(() => {
        console.log('✅ MongoDB connection SUCCESSFUL');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ MongoDB connection FAILED');
        console.error(err);
        process.exit(1);
    });
