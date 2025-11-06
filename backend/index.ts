import dotenv from "dotenv";
dotenv.config();

import App from "@/App";
import DatabaseService from "@/services/database.service";
import ExchangeService from "@/services/exchange-service/exchange-service";


async function main() {
  await DatabaseService.configure();
  await ExchangeService.configure();

  const app = new App();

  await app.init();
  await app.startServer();
}

main();
