import "dotenv/config";
import app from "./app";
import { prisma } from "./db/prisma";
import { redis } from "./config/redis";
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log('Connected to Prisma database');
    await redis.connect();
    console.log('Connected to Redis');
    app.listen(PORT,() => {
  console.log(`Server is running on port ${PORT}`);
});
  }
  catch(error){
    console.error('Error starting server:', error);
  }}
startServer();