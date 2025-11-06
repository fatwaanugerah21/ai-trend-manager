import TrendManager from "@/trend-manager/trend-manager";
import { FastifyReply, FastifyRequest } from "fastify";

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

    console.log("formattedSubscribers: ", formattedSubscribers);


    return reply.send(formattedSubscribers);
  }
}

export default TrendSubscribersController;