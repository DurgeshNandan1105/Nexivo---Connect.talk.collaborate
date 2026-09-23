import { Server } from "socket.io"

const connectToSocket = (server) => {
    const io = new Server(server);
    return io;
}

export default connectToSocket;