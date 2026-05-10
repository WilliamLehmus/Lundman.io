import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.ELEVENLABS_API_KEY;
const OUTPUT_DIR = path.join(process.cwd(), 'frontend/public');

if (!API_KEY) {
    console.error("ERROR: ELEVENLABS_API_KEY is not set in .env");
    process.exit(1);
}

async function generateSFX(text, filename, duration = null) {
    console.log(`Generating SFX for: "${text}"...`);
    
    try {
        const response = await axios({
            method: 'post',
            url: 'https://api.elevenlabs.io/v1/sound-generation',
            headers: {
                'xi-api-key': API_KEY,
                'Content-Type': 'application/json',
            },
            data: {
                text: text,
                model_id: "eleven_text_to_sound_v2",
                duration_seconds: duration,
                prompt_influence: 0.3
            },
            responseType: 'arraybuffer'
        });

        const outputPath = path.join(OUTPUT_DIR, filename);
        fs.writeFileSync(outputPath, response.data);
        console.log(`Successfully saved to ${outputPath}`);
    } catch (error) {
        if (error.response) {
            console.error(`API Error: ${error.response.status} - ${error.response.data.toString()}`);
        } else {
            console.error(`Error: ${error.message}`);
        }
    }
}

// Map of sounds to generate
const sounds = [
    { text: "High-pressure liquid water cannon blast splash, cinematic", file: "water_cannon.mp3", dur: 0.8 },
    { text: "Crystalline ice magic shatter, frosty crunch, high fidelity", file: "ice_shatter.mp3", dur: 1.0 },
    { text: "Heavy wet mud impact, earthy thud, splat", file: "dirt_impact.mp3", dur: 0.8 }
];

async function run() {
    for (const s of sounds) {
        await generateSFX(s.text, s.file, s.dur);
    }
    console.log("All sounds generated!");
}

run();
