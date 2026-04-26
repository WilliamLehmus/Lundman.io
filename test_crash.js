import { io } from 'socket.io-client';
import { spawn } from 'child_process';

const server = spawn('node', ['backend/server.js']);

server.stdout.on('data', d => console.log('SERVER:', d.toString()));
server.stderr.on('data', d => {
    console.error('SERVER ERR:', d.toString());
    process.exit(1);
});

setTimeout(() => {
    const socket = io('http://localhost:3000');
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('host-game', { username: 'test', chassisType: 'SCOUT' });
    });
}, 1000);
