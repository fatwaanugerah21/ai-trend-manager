import type { ICandleInfo, TCandleResolution } from "./exchange-type";
import MexcExchange from "./mexc-exchange/mexc-exchange";


export interface IExchangeInstance {
  prepare: () => Promise<void>;
  getCandles: (symbol: string, startDate: Date, endDate: Date, resolution: TCandleResolution) => Promise<ICandleInfo[]>
  getMarkPrice: (symbol: string) => Promise<number>
  hookPriceListener: (symbol: string, callback: (price: number) => void) => () => void;
}

class ExchangeService {
  private static exchangeInstance: IExchangeInstance;

  static async configure() {
    this.exchangeInstance = new MexcExchange();
    await this.exchangeInstance.prepare()
  }

  static async getCandles(symbol: string, startDate: Date, endDate: Date, resolution: TCandleResolution): Promise<ICandleInfo[]> {
    return await this.exchangeInstance.getCandles(symbol, startDate, endDate, resolution);
  }

  static async getMarkPrice(symbol: string): Promise<number> {
    return await this.exchangeInstance.getMarkPrice(symbol)
  }

  static hookPriceListener(symbol: string, callback: (price: number) => void): () => void {
    return this.exchangeInstance.hookPriceListener(symbol, callback);
  }
}

export default ExchangeService;