import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SystemOption from './src/models/SystemOption.js';

dotenv.config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        const indexes = await SystemOption.collection.indexes();
        console.log(JSON.stringify(indexes, null, 2));

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

connectDB();
