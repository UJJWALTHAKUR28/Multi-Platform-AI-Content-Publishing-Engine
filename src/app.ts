import express from 'express'
import cors from 'cors'
import "dotenv/config";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import authRoutes from "./modules/auth/auth.routes";
import { errorHandler } from "./middleware/error-handler";
const app=express()
app.use(express.json())
app.use(helmet())
app.use(cookieParser())
app.use(cors({origin: process.env.APP_URL || "http://localhost:3000",credentials: true,}),);
app.use(express.urlencoded({ extended: true }));
app.set("trust proxy", 1);

app.get('/',(req,res)=>{
    res.send('Welcome to Postly Backend!')
})
app.get('/health',(req,res)=>{
    res.send('OK')
})
app.use("/api/auth", authRoutes);
app.use(errorHandler);
export default app