import express from 'express'
import cors from 'cors'
import "dotenv/config";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import authRoutes from "./modules/auth/auth.routes";
import { errorHandler } from "./middleware/error-handler";
import user from './modules/user/user.routes';
import content from './modules/content/content.routes';
import postRoutes from './modules/posts/posts.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';

const app = express()

// Determine allowed origins
const allowedOrigins = [
  process.env.APP_URL || "http://localhost:3000",
  "http://localhost:3000",
  "http://localhost:3001",
];

app.use(express.json())
app.use(helmet())
app.use(cookieParser())
// Support comma-separated list of allowed origins in APP_URL
// e.g. APP_URL=http://localhost:3000,https://your-app.vercel.app
const ALLOWED_ORIGINS = (process.env.APP_URL || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no origin header)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
  })
);
app.use(express.urlencoded({ extended: true }));
app.set("trust proxy", 1);

app.get('/', (req, res) => {
  res.send('Welcome to Postly Backend!')
})
app.get('/health', (req, res) => {
  res.send('OK')
})
app.use("/api/auth", authRoutes);
app.use("/api/user", user)
app.use("/api/content", content)
app.use("/api/posts", postRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use(errorHandler);
export default app

