import TrendManager from "@/trend-manager/trend-manager";
import { FastifyReply, FastifyRequest } from "fastify";
import joi from "joi"

class TrendSubscribersController {
  static getAll(request: FastifyRequest, reply: FastifyReply) {
    const subscribers = TrendManager.getSubscribers
    const formattedSubscribers: Omit<ISubscriberDetail, "wsClient">[] = [];

    for (const symbol of Object.keys(subscribers)) {
      for (const subscriberDetails of Object.values(subscribers[symbol])) {
        const subs = subscriberDetails.map(({ wsClient, ...rest }) => rest);
        formattedSubscribers.push(...subs);
      }
    }

    return reply.send(formattedSubscribers);
  }

  static async updateSubscriber(request: FastifyRequest, reply: FastifyReply): Promise<IPostResponse> {
    try {
      const data = request.body as IUpdateSubscriberSchema;
      const schema = joi.object<IUpdateSubscriberSchema>({
        identifier: joi.string().required(),
        checkIntervalInMinutes: joi.number().required(),
        rollWindowInHours: joi.number().required(),
        symbol: joi.string().required(),
        newRollWindowInHours: joi.number(),
        newSymbol: joi.string(),
      });
      const { error } = schema.validate(data);
      if (!!error) throw error.message;

      const response = await TrendManager.updateSubscriber({
        identifier: data.identifier,
        oldSymbol: data.symbol,
        oldRollWindowInHours: data.rollWindowInHours,
        newRollWindowInHours: data.newRollWindowInHours,
        newSymbol: data.newSymbol,
        checkIntervalInMinutes: data.checkIntervalInMinutes,
      });

      return response
    } catch (error) {
      return { isSuccess: false, msg: error as string }
    }
  }

  static async changeSubscriberLastTrendSent(request: FastifyRequest, reply: FastifyReply): Promise<IPostResponse> {
    try {
      const data = request.body as IChangeSubscriberLastTrendSentSchema;
      const schema = joi.object<IChangeSubscriberLastTrendSentSchema>({
        identifier: joi.string().required(),
        rollWindowInHours: joi.number().required(),
        symbol: joi.string().required(),
        lastTrendSent: joi.date().required(),
      });
      const { error } = schema.validate(data);
      if (!!error) throw error.message;

      const response = await TrendManager.changeSubscriberLastTrendSent({
        identifier: data.identifier,
        symbol: data.symbol,
        rollWindowInHours: data.rollWindowInHours,
        newLastSent: data.lastTrendSent
      });

      return response;
    } catch (error) {
      return { isSuccess: false, msg: error as string }
    }
  }

  static async disableSubscriber(request: FastifyRequest, reply: FastifyReply): Promise<IPostResponse> {
    try {
      const data = request.body as IDisableSubscriberSchema;
      const schema = joi.object<IDisableSubscriberSchema>({
        identifier: joi.string().required(),
        rollWindowInHours: joi.number().required(),
        symbol: joi.string().required(),
        shouldDelete: joi.boolean().required(),
      });
      const { error } = schema.validate(data);
      if (!!error) throw error.message;

      const response = await TrendManager.disableSubscriber(data.symbol, data.rollWindowInHours, data.identifier, data.shouldDelete);
      if (!response) throw "Subscriber not found";

      return { isSuccess: true, msg: "Success" };
    } catch (error) {
      return { isSuccess: false, msg: error as string }
    }
  }
}

export default TrendSubscribersController;