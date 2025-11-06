import { IWSReceivedMsg } from "@/App";
import TrendSubscribersController from "@/controllers/trend-subscribers.controller";
import TrendManager from "@/trend-manager/trend-manager";
import { WebSocket } from "@fastify/websocket";
import { FastifyInstance } from "fastify";
import joi from "joi"

interface IWSRecvSubscribeTrendData {
  identifier: string;
  symbol: string;
  rollWindowInHours: number;
  checkIntervalInMinutes: number;
}

interface IWSRecvUpdateSubscriberData {
  identifier: string;
  symbol: string;
  rollWindowInHours: number;
  newSymbol: string;
  newRollWindowInHours: number;
  checkIntervalInMinutes: number;
}

interface IWSRecvChangeSubscriberLastTrendSentData {
  identifier: string;
  symbol: string;
  rollWindowInHours: number;
  lastTrendSent: Date;
}

class TrendSubscriberRoute {
  static registerHttpRoutes(app: FastifyInstance) {
    app.get("/trend-subscribers", TrendSubscribersController.getAll);
  }

  static async handleWsMsg(connection: WebSocket, msg: IWSReceivedMsg) {
    try {
      if (msg.type === "add-subscriber") {
        const data = msg.data as IWSRecvSubscribeTrendData;
        console.log("New trend subscriber: ", data);
        const schema = joi.object<IWSRecvSubscribeTrendData>({
          checkIntervalInMinutes: joi.number().required(),
          rollWindowInHours: joi.number().required(),
          identifier: joi.string().required(),
          symbol: joi.string().required(),
        });
        const { error } = schema.validate(data);
        if (!!error) throw error.message;

        const response = await TrendManager.addSubscriber(connection, data);

        connection.on("close", () => {
          TrendManager.disableSubscriber(data.symbol, data.rollWindowInHours, data.identifier);
        });

        connection.send(JSON.stringify({
          type: `${msg.type}-response`,
          data: response,
        }))
      }

      if (msg.type === "update-subscriber") {
        const data = msg.data as IWSRecvUpdateSubscriberData;
        console.log("Update trend subscriber: ", data);

        const schema = joi.object<IWSRecvUpdateSubscriberData>({
          identifier: joi.string().required(),
          checkIntervalInMinutes: joi.number().required(),
          rollWindowInHours: joi.number().required(),
          symbol: joi.string().required(),
          newRollWindowInHours: joi.number(),
          newSymbol: joi.string(),
        });
        const { error } = schema.validate(data);
        if (!!error) throw error.message;

        const response = await TrendManager.updateSubscriber(connection, {
          identifier: data.identifier,
          oldSymbol: data.symbol,
          newSymbol: data.newSymbol || data.symbol,
          oldRollWindowInHours: data.rollWindowInHours,
          newRollWindowInHours: data.newRollWindowInHours || data.rollWindowInHours,
          checkIntervalInMinutes: data.checkIntervalInMinutes,
        });

        if (data.newSymbol !== data.symbol || data.newRollWindowInHours !== data.rollWindowInHours) {
          connection.on("close", () => {
            TrendManager.disableSubscriber(data.newSymbol, data.newRollWindowInHours, data.identifier);
          })
        }

        connection.send(JSON.stringify({
          type: `${msg.type}-response`,
          data: response,
        }))
      }

      if (msg.type === "change-subscriber-last-trend-sent") {
        const data = msg.data as IWSRecvChangeSubscriberLastTrendSentData;
        console.log("Update trend subscriber: ", data);

        const schema = joi.object<IWSRecvChangeSubscriberLastTrendSentData>({
          identifier: joi.string().required(),
          rollWindowInHours: joi.number().required(),
          symbol: joi.string().required(),
          lastTrendSent: joi.date().required(),
        });
        const { error } = schema.validate(data);
        if (!!error) throw error.message;

        const response = await TrendManager.changeSubscriberLastTrendSent(connection, {
          identifier: data.identifier,
          symbol: data.symbol,
          rollWindowInHours: data.rollWindowInHours,
          newLastSent: data.lastTrendSent
        });

        connection.send(JSON.stringify({
          type: `${msg.type}-response`,
          data: response,
        }))
      }
    } catch (rawError) {
      console.log("error: ", rawError);
      connection.send(JSON.stringify({
        type: `${msg.type}-response`,
        data: { isSuccess: false, msg: rawError || "internal server error" }
      }));
    }
  }
}

export default TrendSubscriberRoute;