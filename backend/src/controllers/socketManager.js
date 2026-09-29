import { Server } from "socket.io"
import { translate } from '@vitalets/google-translate-api';

let connections = {}
let messages = {}
let timeOnline = {}

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
        console.log("Something Connected")
        socket.on("join-call", (path) => {
           
            if(connections[path] === undefined){
                connections[path] = []
            }
            connections[path].push(socket.id);
            timeOnline[socket.id] = new Date();

            for(let a = 0; a<connections[path].length; a++){
                io.to(connections[path][a]).emit("user-joined", socket.id, connections[path])
            }
            if(messages[path] !== undefined){
                for(let a=0; a<messages[path].length; ++a){
                    io.to(socket.id).emit("chat-message", messages[path][a]['data'],
                        messages[path][a]['sender'], messages[path][a]['socket-id-sender']
                    )
                }
            }



        })
        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        })
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
                messages[matchingRoom].push({'sender': sender, "data":data, "socket-id-sender": socket.id})
                console.log("message", matchingRoom, ":", sender, data)
                connections[matchingRoom].forEach((elem) => {
                    io.to(elem).emit("chat-message", data, sender, socket.id)
                })
            }

        })

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
                    io.to(elem).emit("reaction", emoji, sender, socket.id)
                })
            }
        })

        socket.on("send-speech-chunk", (data) => {
            const { text, sourceLang, sender } = data;
            const [matchingRoom, found] = Object.entries(connections)
            .reduce(([room, isFound], [roomKey, roomValue]) => {
                if(!isFound && roomValue.includes(socket.id)){
                    return [roomKey, true];
                }
                return [room, isFound];
            }, ['', false]);

            if(found === true) {
                connections[matchingRoom].forEach((elem) => {
                    io.to(elem).emit("receive-speech-chunk", {
                        text,
                        sourceLang,
                        sender,
                        socketIdSender: socket.id
                    });
                });
            }
        })

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

        socket.on("request-translation", async (data) => {
            const { text, sourceLang, targetLang } = data;
            let translatedText = text;

            try {
                // Try auto detection first so spoken language is properly detected regardless of setting
                const result = await translate(text, { from: 'auto', to: targetLang });
                if (result && result.text) {
                    translatedText = result.text;
                }
            } catch (err) {
                console.error("Primary translate with auto failed, trying specific source:", err.message);
                try {
                    const fallbackResult = await translate(text, { from: sourceLang || 'auto', to: targetLang });
                    if (fallbackResult && fallbackResult.text) {
                        translatedText = fallbackResult.text;
                    }
                } catch (secondErr) {
                    console.error("Primary translate error, trying MyMemory fallback:", secondErr.message);
                    try {
                        const fromCode = (sourceLang && sourceLang !== 'auto') ? sourceLang : 'autodetect';
                        const response = await fetch(
                            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromCode}|${targetLang}`
                        );
                        const json = await response.json();
                        if (json && json.responseData && json.responseData.translatedText) {
                            translatedText = json.responseData.translatedText;
                        }
                    } catch (fallbackErr) {
                        console.error("MyMemory fallback error:", fallbackErr.message);
                    }
                }
            }

            socket.emit("deliver-translated-voice", {
                originalText: text,
                translatedText: translatedText,
                targetLang
            });
        })

        socket.on("disconnect", () => {

            var diffTime = Math.abs(timeOnline[socket.id] - new Date())

            var key

            for(const [k, v] of JSON.parse(JSON.stringify(Object.entries(connections)))) {

                for(let a = 0; a < v.length; ++a){
                    if(v[a] === socket.id){
                        key = k;
                        for (let a = 0; a < connections[key].length; ++a){
                            io.to(connections[key][a]).emit('user-left', socket.id)
                        }
                        var index = connections[key].indexOf(socket.id)
                        connections[key].splice(index, 1)

                        if(connections[key].length === 0){
                            delete connections[key]
                        }
                    }
                }
            }

        })
    })
}

export default connectToSocket;