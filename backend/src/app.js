import express from 'express';
import {createServer} from "node:http";

import { Server } from "socket.io";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import connectToSocket from './controllers/socketManager.js';
import userRoutes from "./routes/users.routes.js";
import translateRoutes from "./routes/translate.routes.js";

const app = express();
const server = createServer(app);
const io = connectToSocket(server);
app.set("port", (process.env.PORT || 8000));

// Production CORS configuration allowing Render cross-origin requests
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
  credentials: false,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Explicit preflight handler ensuring OPTIONS requests succeed across reverse proxies
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

app.use(express.json({limit: "40kb"}));
app.use(express.urlencoded({limit: "40kb", extended: true}));

// Pre-warm healthcheck endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/v1/users", userRoutes);
app.use("/api/v1/translate", translateRoutes);

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
