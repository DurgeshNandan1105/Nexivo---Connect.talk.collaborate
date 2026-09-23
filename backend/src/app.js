import express from 'express';
import {createServer} from "node:http";

import { Server } from "socket.io";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import connectToSocket from './controllers/socketManager.js';

const app = express();
const server = createServer(app);
const io = connectToSocket(server);
app.set("port", (process.env.PORT || 8000));
app.use(cors());
app.use(express.json({limit: "40kb"}));
app.use(express.urlencoded({limit: "40kb", extended: true}));



server.listen(app.get("port"), () => {
  console.log('Server is running on 8000');
  connectDB();
})

const connectDB = async () => {
    try{
        await mongoose.connect(process.env.MONGO_URL);
        console.log("Connected with Database");
    } catch(error){
        console.log("Failed to connect with Db", error);
    }
}