import { fastify } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyFormbody from "@fastify/formbody";
import fastifyHelmet from "@fastify/helmet";
import fastifyWebsocket from "@fastify/websocket";
import { FastifyInstance } from "fastify";
import TrendSubscriberRoute from "./routes/trend-subscribers.route";

type TWSReceivedMsgType = "add-subscriber" | "update-subscriber" | "change-subscriber-last-trend-sent" | "disable-subscriber";
export interface IWSReceivedMsg {
  type: TWSReceivedMsgType;
  data: any;
}

class App {
  private app: FastifyInstance = fastify();
  private port = Number(process.env.PORT || "8080");

  async init() {
    await this.initializeMiddlewares();
    await this.initializeWebsocket();
    this.initilalizeRoutes();
  }

  private initilalizeRoutes() {
    this.app.get("/", async (request, reply) => {
      reply.header('Content-Type', 'text/html; charset=utf-8');
      return `<div><h1>AI Trend AGENT BACKEND</h1> <p>Backend Running</p></div>`;
    });

    TrendSubscriberRoute.registerHttpRoutes(this.app);
  }

  // Register websocket plugin
  private async initializeWebsocket() {
    await this.app.register(fastifyWebsocket);

    this.app.get('/ws', { websocket: true }, (connection) => {
      try {
        console.log("New client connected");

        connection.on('close', () => {
          console.log('Client disconnected');
        });

        connection.on("message", (rawMsg: any) => {
          try {
            const msg =
              typeof rawMsg === "string" ? rawMsg : rawMsg.toString("utf-8");
            // NOTE: Add wsMsg handler here
            TrendSubscriberRoute.handleWsMsg(connection, JSON.parse(msg));
          } catch (err) {
            console.error("Invalid WS message:", err);
            connection.send(JSON.stringify({ error: "Invalid message format" }));
          }
        });
      } catch (error) {
        console.log("Error on client connected: ", error);
      }
    });
  }

  private async initializeMiddlewares() {
    await this.app.register(fastifyCors, {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    });
    await this.app.register(fastifyFormbody);
    await this.app.register(fastifyHelmet);
  }

  async startServer() {
    try {
      await this.app.listen({ port: this.port });

      console.log(`Server running on: http://127.0.0.1:${this.port}`)
    } catch (error) {
      console.error(`Error: `, error);
    }
  }
}

export default App;