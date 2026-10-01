import { Server } from "socket.io"
import { translateText } from "./translate.controller.js";

let connections = {}
let messages = {}
let timeOnline = {}

const normalizeRoom = (path) => {
    if (!path) return "/";
    try {
        if (typeof path === "string" && (path.startsWith("http://") || path.startsWith("https://"))) {
            const url = new URL(path);
            return url.pathname.toLowerCase().replace(/\/+$/, "") || "/";
        }
    } catch (e) {}
    return String(path).toLowerCase().replace(/\/+$/, "") || "/";
};

const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        }
    });

    io.on("connection", (socket) => {
        console.log("Client connected:", socket.id);

        socket.on("join-call", (path) => {
            const roomKey = normalizeRoom(path);

            if(connections[roomKey] === undefined){
                connections[roomKey] = []
            }
            if(!connections[roomKey].includes(socket.id)){
                connections[roomKey].push(socket.id);
            }
            timeOnline[socket.id] = new Date();

            for(let a = 0; a < connections[roomKey].length; a++){
                io.to(connections[roomKey][a]).emit("user-joined", socket.id, connections[roomKey]);
            }

            if(messages[roomKey] !== undefined){
                for(let a = 0; a < messages[roomKey].length; ++a){
                    io.to(socket.id).emit(
                        "chat-message",
                        messages[roomKey][a]['data'],
                        messages[roomKey][a]['sender'],
                        messages[roomKey][a]['socket-id-sender']
                    );
                }
            }
        });

        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        });

        socket.on("chat-message", (data, sender) => {
            const [matchingRoom, found] = Object.entries(connections)
            .reduce(([room, isFound], [roomKey, roomValue]) => {
                if(!isFound && roomValue.includes(socket.id)){
                    return [roomKey, true];
                }
                return [room, isFound];
            }, ['', false]);

            if(found === true) {
                if(messages[matchingRoom] === undefined) {
                    messages[matchingRoom] = []
                }
                messages[matchingRoom].push({'sender': sender, "data": data, "socket-id-sender": socket.id});
                connections[matchingRoom].forEach((elem) => {
                    io.to(elem).emit("chat-message", data, sender, socket.id);
                });
            }
        });

        socket.on("send-reaction", (emoji, sender) => {
            const [matchingRoom, found] = Object.entries(connections)
            .reduce(([room, isFound], [roomKey, roomValue]) => {
                if(!isFound && roomValue.includes(socket.id)){
                    return [roomKey, true];
                }
                return [room, isFound];
            }, ['', false]);

            if(found === true) {
                connections[matchingRoom].forEach((elem) => {
                    io.to(elem).emit("reaction", emoji, sender, socket.id);
                });
            }
        });

        socket.on("user-media-state", (data) => {
            const [matchingRoom, found] = Object.entries(connections)
            .reduce(([room, isFound], [roomKey, roomValue]) => {
                if(!isFound && roomValue.includes(socket.id)){
                    return [roomKey, true];
                }
                return [room, isFound];
            }, ['', false]);

            if(found === true) {
                connections[matchingRoom].forEach((elem) => {
                    if (elem !== socket.id) {
                        io.to(elem).emit("user-media-state", {
                            socketId: socket.id,
                            video: data.video,
                            audio: data.audio
                        });
                    }
                });
            }
        });

        socket.on("live-speech-caption", (captionData) => {
            const [matchingRoom, found] = Object.entries(connections)
            .reduce(([room, isFound], [roomKey, roomValue]) => {
                if(!isFound && roomValue.includes(socket.id)){
                    return [roomKey, true];
                }
                return [room, isFound];
            }, ['', false]);

            if(found === true) {
                const payload = {
                    ...captionData,
                    socketIdSender: socket.id,
                    timestamp: Date.now()
                };
                connections[matchingRoom].forEach((elem) => {
                    io.to(elem).emit("live-speech-caption", payload);
                });
            }
        });

        socket.on("translate-text", async (data, callback) => {
            try {
                const { text, to = "en", from = "auto" } = data || {};
                const result = await translateText(text, to, from);
                if (typeof callback === "function") {
                    callback(null, result);
                }
            } catch (err) {
                if (typeof callback === "function") {
                    callback(err.message, null);
                }
            }
        });

        socket.on("disconnect", () => {
            delete timeOnline[socket.id];

            var key;
            for(const [k, v] of JSON.parse(JSON.stringify(Object.entries(connections)))) {
                for(let a = 0; a < v.length; ++a){
                    if(v[a] === socket.id){
                        key = k;
                        for (let b = 0; b < connections[key].length; ++b){
                            io.to(connections[key][b]).emit('user-left', socket.id);
                        }
                        var index = connections[key].indexOf(socket.id);
                        if (index !== -1) {
                            connections[key].splice(index, 1);
                        }

                        if(connections[key].length === 0){
                            delete connections[key];
                        }
                    }
                }
            }
        });
    });
};

export default connectToSocket;