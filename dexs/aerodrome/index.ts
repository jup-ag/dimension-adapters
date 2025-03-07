import { FetchResultFees, FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { ethers } from "ethers";
import { getPrices } from "../../utils/prices";

const gurar = '0x2073D8035bB2b0F2e85aAF5a8732C6f397F9ff9b';
type TPrice = {
  [s: string]: {
    price: number;
    decimals: number
  };
}
const abis: any = {
  forSwaps:{
    "stateMutability": "view",
    "type": "function",
    "name": "forSwaps",
    "inputs": [],
    "outputs": [
        {
            "name": "",
            "type": "tuple[]",
            "components": [
                {
                    "name": "lp",
                    "type": "address"
                },
                {
                    "name": "stable",
                    "type": "bool"
                },
                {
                    "name": "token0",
                    "type": "address"
                },
                {
                    "name": "token1",
                    "type": "address"
                },
                {
                    "name": "factory",
                    "type": "address"
                }
            ]
        }
    ]
  }
}

interface IForSwap {
  lp: string;
  token0: string;
  token1: string;
}

interface ILog {
  address: string;
  data: string;
  transactionHash: string;
  topics: string[];
}
const topic0_swap = '0xb3e2773606abfd36b5bd91394b3a54d1398336c65005baf7bf7a05efeffaf75b'
const event_swap = 'event Swap(address indexed sender,address indexed to,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out)'

const contract_interface = new ethers.Interface([
  event_swap
])

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
    const forSwaps: IForSwap[] = (await sdk.api2.abi.call({
      target: gurar,
      abi: abis.forSwaps,
      chain: CHAIN.BASE,
    })).map((e: any) => {
      return {
        lp: e.lp,
        token0: e.token0,
        token1: e.token1,
      }
    })

    const fromBlock = (await getBlock(fromTimestamp, CHAIN.BASE, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.BASE, {}));

    const logs: ILog[] = (await Promise.all(forSwaps.map((forSwaps: IForSwap) => sdk.getEventLogs({
      target: forSwaps.lp,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.BASE,
      topics: [topic0_swap]
    })))).flat();

    const coins = [...new Set([
      ...forSwaps.map((log: IForSwap) => `${CHAIN.BASE}:${log.token0}`),
      ...forSwaps.map((log: IForSwap) => `${CHAIN.BASE}:${log.token1}`)
    ])]

    const coins_split: string[][] = [];
    for(let i = 0; i < coins.length; i+=100) {
      coins_split.push(coins.slice(i, i + 100))
    }
    const prices_result: any =  (await Promise.all(coins_split.map((a: string[]) =>  getPrices(a, timestamp)))).flat().flat().flat();
    const prices: TPrice = Object.assign({}, {});
    prices_result.map((a: any) => Object.assign(prices, a))
    const volumeUSD: number = logs.map((log: ILog) => {
      const value = contract_interface.parseLog(log);
      const amount0In = Number(value!.args.amount0In);
      const amount1In = Number(value!.args.amount1In);
      const amount0Out = Number(value!.args.amount0Out);
      const amount1Out = Number(value!.args.amount1Out);
      const {token0, token1} = forSwaps.find((forSwap: IForSwap) => forSwap.lp.toLowerCase() === log.address.toLowerCase()) as IForSwap
      const token0Decimals = prices[`${CHAIN.BASE}:${token0}`]?.decimals || 0
      const token1Decimals = prices[`${CHAIN.BASE}:${token1}`]?.decimals || 0
      const price0 = prices[`${CHAIN.BASE}:${token0}`]?.price || 0
      const price1 = prices[`${CHAIN.BASE}:${token1}`]?.price || 0
      const totalAmount0 = ((amount0In + amount0Out) / 10 ** token0Decimals) * price0
      const totalAmount1 = ((amount1In + amount1Out) / 10 ** token1Decimals) * price1
      const untrackAmountUSD = price0 !== 0 ? totalAmount0 : price1 !== 0 ? totalAmount1 : 0;
      return untrackAmountUSD;
    }).reduce((a: number, b: number) => a+b, 0)

    return {
      dailyVolume: `${volumeUSD}`,
      timestamp
    }
  } catch(e) {
    console.error(e)
    throw e;
  }

}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch,
      start: async () => 1693180800,
    }
  }
}
export default adapters;
