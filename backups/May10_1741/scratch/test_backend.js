import { io } from "socket.io-client";

const socket = io("http://127.0.0.1:3000", {
    transports: ["polling"],
    timeout: 5000
});

socket.on("connect", () => {
    console.log("SUCCESS: Connected to backend!");
    process.exit(0);
});

socket.on("connect_error", (err) => {
    console.error("FAILURE: Connection error:", err.message);
    if (err.description) console.error("Description:", err.description);
    process.exit(1);
});

setTimeout(() => {
    console.error("FAILURE: Connection timeout");
    process.exit(1);
}, 6000);
