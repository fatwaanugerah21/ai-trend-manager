import eventBus from "@/utils/event-bus.util";
import { WebSocket } from "@fastify/websocket";
import TMUtil from "./tm-util";

class TrendManager {
  private static subscribers: { [symbol: string]: { [rollWindowInHours: number]: ISubscriberDetail[] } } = {};
  private static watchedTrend: { [symbol: string]: { [rollWindowInHours: number]: boolean } } = {};

  // INTERNAL WORKER
  private static async _ensureWatcher(symbol: string, rollWindowInHours: number, checkIntervalInMinutes: number) {
    this.watchedTrend[symbol] ??= {};

    if (!this.watchedTrend[symbol][rollWindowInHours]) {
      this.watchedTrend[symbol][rollWindowInHours] = true;

      this.watchTrends(symbol, rollWindowInHours).finally(() => {
        this.watchedTrend[symbol][rollWindowInHours] = false;
      });
    } else {
      eventBus.emit("check-timer", checkIntervalInMinutes);
    }
  }

  private static async watchTrends(symbol: string, rollWindowInHours: number) {
    console.log(`Watching trend for ${symbol}-${rollWindowInHours}...`);

    while (true) {
      const subscribers = this.subscribers[symbol]?.[rollWindowInHours];
      if (!subscribers || subscribers.filter(s => s.isListening).length === 0) {
        console.log("No more subscribers for this symbol and rollWindowInHours, stopping trend watcher");
        return;
      }

      const closestNextCheckInMinutes = TMUtil.getSubscribersClosesNextCheckInMinutes(subscribers);
      await TMUtil.waitForNextCheck(closestNextCheckInMinutes || 1);

      const candlesEndDate = new Date();
      const candlesData = await TMUtil.getCandlesData(symbol, candlesEndDate, rollWindowInHours);

      for (const sub of subscribers) {
        if (!sub.isListening) continue;

        if (sub.wsClient.readyState === sub.wsClient.CLOSED) {
          console.log(`${sub.identifier} wsClient is closed, but status is still listening, disabling it`);
          this.disableSubscriber(symbol, rollWindowInHours, sub.identifier);
          continue;
        }

        const { checkIntervalInMinutes, lastTrendSent } = sub;

        const elapsed = candlesEndDate.getTime() - lastTrendSent.getTime();
        const intervalInMs = checkIntervalInMinutes * 60_000;

        if (elapsed < intervalInMs) continue;

        TMUtil.sendTrendData(sub, candlesData);
        sub.lastTrendSent = new Date(candlesEndDate);
        sub.lastTrendSent.setSeconds(0, 0);
      }

      TMUtil.saveTrendDataToDb(symbol, rollWindowInHours, candlesData);
    }
  }

  // EXPOSED FOR USED EXTERNALLY
  static get getSubscribers() {
    return this.subscribers;
  }

  static async addSubscriber(wsClient: WebSocket, params: ITMAddSubsriberParams): Promise<IPostResponse> {
    const { symbol, rollWindowInHours, checkIntervalInMinutes, identifier } = params;

    const now = new Date();
    now.setSeconds(0, 0);

    this.subscribers[symbol] ??= {};
    this.subscribers[symbol][rollWindowInHours] ??= [];

    const subscribers = this.subscribers[symbol][rollWindowInHours];

    let subscriber = subscribers.find((s) => s.identifier === identifier);
    if (subscriber) {
      if (subscriber.isListening && subscriber.wsClient.readyState === subscriber.wsClient.OPEN) {
        const msg = "This subscriber is still listening, abort adding listener";
        console.log(msg);
        return { isSuccess: false, msg };
      }

      console.log("Re-listen identifier:", identifier);
      subscriber.isListening = true;
      subscriber.wsClient = wsClient;
      subscriber.checkIntervalInMinutes = checkIntervalInMinutes;

      const elapsed = now.getTime() - subscriber.lastTrendSent.getTime();
      const intervalInMs = subscriber.checkIntervalInMinutes * 60_000;

      console.log(`subscriber.lastTrendSent: ${subscriber.lastTrendSent}, elapsed: ${elapsed}ms, intervalInMs: ${intervalInMs}ms`);

      if (elapsed >= intervalInMs) {
        const candlesData = await TMUtil.getCandlesData(symbol, now, rollWindowInHours);
        TMUtil.sendTrendData(subscriber, candlesData);
        subscriber.lastTrendSent = now;
      }
    } else {
      subscriber = {
        identifier: identifier,
        symbol,
        rollWindowInHours,
        wsClient,
        lastTrendSent: now,
        checkIntervalInMinutes: checkIntervalInMinutes,
        isListening: true,
      };
      this.subscribers[symbol][rollWindowInHours].push(subscriber);

      const candlesData = await TMUtil.getCandlesData(symbol, now, rollWindowInHours);
      TMUtil.sendTrendData(subscriber, candlesData);
    }

    const lastTrendSent = subscriber.lastTrendSent;
    const minutesPassed = Math.floor((now.getTime() - lastTrendSent.getTime()) / (60_000));
    this._ensureWatcher(symbol, rollWindowInHours, Math.max(checkIntervalInMinutes - minutesPassed, 0));

    TMUtil.logAllSubscribers(this.subscribers);
    return { isSuccess: true, msg: "Success subscribe" };
  }

  static async updateSubscriber(params: ITMUpdateSubsriberParams): Promise<IPostResponse> {
    const now = new Date();
    now.setSeconds(0, 0);

    const { oldSymbol, oldRollWindowInHours, newSymbol, newRollWindowInHours, checkIntervalInMinutes, identifier } = params;

    if (oldSymbol !== newSymbol || oldRollWindowInHours !== newRollWindowInHours) {
      const deletedSubscriber = this.disableSubscriber(oldSymbol, oldRollWindowInHours, identifier, true);
      if (!deletedSubscriber) {
        console.log("Something went wrong while deleting the old subscriber data, old subscriber data not found");
        return { isSuccess: false, msg: "Old subscriber data not found" };
      }

      const subscriber = {
        wsClient: deletedSubscriber.wsClient,
        identifier: identifier,
        symbol: newSymbol,
        rollWindowInHours: newRollWindowInHours,
        lastTrendSent: now,
        checkIntervalInMinutes: checkIntervalInMinutes,
        isListening: true,
      };

      this.subscribers[newSymbol] ??= {};
      this.subscribers[newSymbol][newRollWindowInHours] ??= [];
      this.subscribers[newSymbol][newRollWindowInHours].push(subscriber);

      const candlesData = await TMUtil.getCandlesData(newSymbol, now, newRollWindowInHours);
      TMUtil.sendTrendData(subscriber, candlesData);

      this._ensureWatcher(newSymbol, newRollWindowInHours, checkIntervalInMinutes);

      return { isSuccess: true, msg: "Success" };
    } else {
      if (!this.subscribers[oldSymbol]) return { isSuccess: false, msg: "No subscribers found" };

      const subscribers = this.subscribers[oldSymbol][oldRollWindowInHours];
      if (!subscribers) return { isSuccess: false, msg: "No subscribers found for this roll window" };

      const idx = subscribers.findIndex(s => s.identifier === identifier);
      if (idx === -1) return { isSuccess: false, msg: "Subscriber with that identifier not found" };

      const subscriber = subscribers[idx];
      subscriber.checkIntervalInMinutes = checkIntervalInMinutes;

      this._ensureWatcher(oldSymbol, oldRollWindowInHours, TMUtil.getMinutesPassedAndCheckIntervalElapsed(subscriber));

      return { isSuccess: true, msg: "Success" };
    }
  }

  static async changeSubscriberLastTrendSent(params: ITMChangeSubsriberLastSentParams): Promise<IPostResponse> {
    console.log("Changing subscriber last trend sent data: ", params);

    const subscriber = this.subscribers[params.symbol]?.[params.rollWindowInHours]?.find(s => s.identifier === params.identifier);
    if (!subscriber) return { isSuccess: false, msg: "Subscriber not found" };

    subscriber.lastTrendSent = new Date(params.newLastSent);
    subscriber.lastTrendSent.setSeconds(0, 0);

    this._ensureWatcher(params.symbol, params.rollWindowInHours, TMUtil.getMinutesPassedAndCheckIntervalElapsed(subscriber));

    return { isSuccess: true, msg: "Success update last trend sent" };
  }

  static disableSubscriber(symbol: string, rollWindowInHours: number, identifier: string, shouldDelete?: boolean): ISubscriberDetail | undefined {
    if (!this.subscribers[symbol]) return undefined;

    const subs = this.subscribers[symbol][rollWindowInHours];
    if (!subs || !subs.length) return undefined;

    const idx = subs.findIndex(s => s.identifier === identifier);
    if (idx === -1) return undefined;

    const subscriber = subs[idx];
    if (!subscriber) return undefined;

    console.log(`Disabling subscriber: ${identifier}`);
    subscriber.isListening = false;
    subscriber.removedAt = new Date();

    if (shouldDelete) {
      this.subscribers[symbol][rollWindowInHours].splice(idx, 1);
    }

    console.log(`Subscriber disabled: ${identifier} at: ${subscriber.removedAt.toLocaleDateString()}`);
    return subscriber;
  }
}

export default TrendManager;