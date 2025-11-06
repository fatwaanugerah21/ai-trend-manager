import type { IMexcApiResponse, IMexcKlineResponse, IWSMessageData, TMexcKlineResolution } from './mexc-types';
import type { ICandleInfo, TCandleResolution } from '../exchange-type';
import type { IExchangeInstance } from '@/services/exchange-service/exchange-service';
import { generateRandomString } from '@/utils/string.util';

class MexcExchange implements IExchangeInstance {
  private _baseUrl = "https://contract.mexc.com"

  private _symbols: string[] = [];

  private _wsClient!: WebSocket;
  private _prices: { [symbol: string]: number } = {}
  private _subscribedTickerSymbols: { [symbol: string]: boolean } = {};
  private _pingerTimer?: NodeJS.Timeout;

  private _priceListenerCallbacks: { [symbol: string]: { [id: string]: (price: number) => void } } = {};

  constructor() {
    this._setupWsClient();
  }

  async prepare() {
    console.log("MEXC Prepare function");
  }

  private _setupWsClient() {
    console.log("[MEXC WS] Setting up WS client");

    if (!!this._pingerTimer) clearInterval(this._pingerTimer);
    this._prices = {};
    this._subscribedTickerSymbols = {};

    console.log("[MEXC WS] Initiating WS client");
    this._wsClient = new WebSocket("wss://contract.mexc.com/edge");
    this._mapWsClientListener();
    for (const symbol of this._symbols) {
      console.log("[MEXC WS] First subscribe ws ticker");
      this._subscribeTicker(symbol);
    }
  }

  private _startSendPingEvery10Seconds() {
    if (!!this._pingerTimer) clearInterval(this._pingerTimer);

    this._pingerTimer = setInterval(() => {
      if (this._wsClient.OPEN) {
        this._wsClient.send(JSON.stringify({
          method: "ping"
        }));
      } else if (this._wsClient.readyState === this._wsClient.CLOSED || this._wsClient.readyState === this._wsClient.CLOSING) {
        // Force reconnect
        this._setupWsClient();
      }
    }, 10 * 1000)
  }

  private isWsClientReady(): boolean {
    return this._wsClient.readyState === this._wsClient.OPEN;
  }

  private _mapWsClientListener() {
    console.log("[MEXC WS]: Map WS Client Listener");

    this._wsClient.addEventListener("message", (msg) => {
      const data = JSON.parse(msg.data) as IWSMessageData;

      if (data.channel === "push.ticker" && !!data.data.lastPrice) {
        this._prices[data.data.symbol] = data.data.lastPrice;
        if (!!this._priceListenerCallbacks[data.data.symbol]) {
          for (const id in this._priceListenerCallbacks[data.data.symbol]) {
            const callback = this._priceListenerCallbacks[data.data.symbol][id];
            callback(data.data.lastPrice);
          }
        }
      }
    });

    this._wsClient.addEventListener("open", () => {
      console.log("[MEXC WS] WS CLIENT CONNECTION OPENED: ");
      this._startSendPingEvery10Seconds();
    });

    this._wsClient.addEventListener("close", () => {
      console.log("[MEXC WS] WS CLIENT CONNECTION CLOSED: ");
      this._setupWsClient();
    });
  }

  private _formatUrl(endpoint: string, urlParams?: URLSearchParams) {
    let url = `${this._baseUrl}/${endpoint}`;

    if (!!urlParams?.toString()) {
      url += `?${urlParams.toString()}`
    }

    return url;
  }

  private _convertEACandleResolutionToMexcCandleResolution(eaCandleResolution: TCandleResolution): TMexcKlineResolution {
    if (eaCandleResolution === "3Min") throw "MEXC_DOES_NOT_SUPPORT_3MIN_CANDLE"
    const resolutions: { [eaRes in TCandleResolution]: TMexcKlineResolution } = {
      "1Min": "Min1",
      "3Min": "Min5", // This will not returned anyway
      "5Min": "Min5",
      "15Min": "Min15",
      "30Min": "Min30",
      "60Min": "Min60",
      "4Hour": "Hour4",
      "8Hour": "Hour8",
      "1Day": "Day1",
      "1Week": "Week1",
      "1Month": "Month1",
    }

    return resolutions[eaCandleResolution];
  }

  private async _subscribeTicker(symbol: string): Promise<boolean> {
    if (!!this._subscribedTickerSymbols[symbol]) {
      console.log(`[MEXC WS]: Trying to subscribe  ${symbol} ticker, but it's already subscribed`);
      return true
    }
    this._subscribedTickerSymbols[symbol] = true;

    while (!this.isWsClientReady()) {
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[MEXC WS]: Success to subscribe ${symbol} ticker`);
    this._wsClient.send(JSON.stringify({
      "method": "sub.ticker",
      "param": {
        "symbol": symbol,
      }
    }));

    return true;
  }

  async getCandles(symbol: string, startDate: Date, endDate: Date, resolution: TCandleResolution): Promise<ICandleInfo[]> {
    try {
      const endpoint = `api/v1/contract/kline/${symbol}`;

      const params = new URLSearchParams({
        start: Math.floor(startDate.getTime() / 1000).toString(), // Unix timestamp in seconds
        end: Math.floor(endDate.getTime() / 1000).toString(),
        interval: this._convertEACandleResolutionToMexcCandleResolution(resolution),
      });

      const url = this._formatUrl(endpoint, params);
      const res = await fetch(url);
      const data = await res.json() as IMexcApiResponse<IMexcKlineResponse>;
      if (!data.data || !data.success) console.error("Error response on fetching candles: ", data);

      const { open, close, high, low, time } = data.data;
      const length = Math.min(open.length, close.length, high.length, low.length, time.length);

      const candles: ICandleInfo[] = [];

      for (let i = 0; i < length; i++) {
        candles.push({
          timestamp: time[i] * 1000,
          openPrice: open[i],
          highPrice: high[i],
          lowPrice: low[i],
          closePrice: close[i],
        });
      }
      return candles.sort((a, b) => a.timestamp - b.timestamp); // adjust this line depending on the API response shape
    } catch (error) {
      console.log("Error on get candles: ", error);
      throw error;
    }
  }

  async getMarkPrice(symbol: string): Promise<number> {
    if (!this._symbols.includes(symbol)) {
      this._symbols.push(symbol);
    }

    if (!this._prices[symbol]) {
      await this._subscribeTicker(symbol);
    }

    while (!this._prices[symbol]) {
      await new Promise(r => setTimeout(r, 100));
    }

    return this._prices[symbol];
  }

  hookPriceListener(symbol: string, callback: (price: number) => void): () => void {
    const id = generateRandomString(10);
    console.log(`[MEXC]: Hook price listener ${symbol} ${id}`);

    if (!this._priceListenerCallbacks[symbol]) this._priceListenerCallbacks[symbol] = {};
    this._priceListenerCallbacks[symbol][id] = callback;
    console.log(`[MEXC]: Callbacks for ${symbol}: ${Object.keys(this._priceListenerCallbacks[symbol])}`);

    return () => {
      console.log(`[MEXC]: Finished hook price listener ${symbol} ${id}`);
      delete this._priceListenerCallbacks[symbol][id]
      console.log(`[MEXC]: Callbacks for ${symbol}: ${Object.keys(this._priceListenerCallbacks[symbol])}`);
    }
  }
}

export default MexcExchange;