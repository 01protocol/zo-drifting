import {
    Cluster,
    createProgram,
    findAssociatedTokenAddress,
    Margin,
    OrderType,
    State,
    Zo,
    ZO_MAINNET_STATE_KEY,
    ZoMarket,
} from "@zero_one/client";
import * as anchor from "@project-serum/anchor";
import { Program, Provider } from "@project-serum/anchor";

export class ZoArbClient {
    private margin: Margin;
    private market: ZoMarket;
    private state: State;
    private program: Program<Zo>;
    private index: number;

    constructor() {
        this.program = createProgram(
            anchor.Provider.local(process.env.RPC_ADDRESS, {
                skipPreflight: false,
                commitment: "confirmed",
            }),
            Cluster.Mainnet
        );
    }

    async init(): Promise<void> {
        this.state = await State.load(this.program, ZO_MAINNET_STATE_KEY);
        try {
            this.margin = await Margin.load(
                this.program,
                this.state,
                this.state.cache
            );
        } catch (_) {
            console.log("Margin account does not exist, henceforth creating it", {
                event: "createMargin",
            });

            await this.checkLamports(this.program.provider, 0.04 * 10 ** 9);

            try {
                this.margin = await Margin.create(
                    this.program,
                    this.state,
                    "confirmed"
                );
            } catch (e) {
                console.log({ err: e });
                throw new Error("Failed to create margin account");
            }
        }
        try {
            this.market = await this.state.getMarketBySymbol(process.env.MARKET);
            this.index = this.state.getMarketIndexBySymbol(process.env.MARKET + "-PERP");
        } catch (e) {
            console.log(e);
            return;
        }

    }

    async refresh() { await this.margin.refresh() }

    async getTopBid() {
        let bids = await this.market.loadBids(this.program.provider.connection);
        return bids.getL2(1)[0][0];
    }

    async getTopAsk() {
        let asks = await this.market.loadAsks(this.program.provider.connection);
        return asks.getL2(1)[0][0];
    }

    async getPositions() {
        await this.margin.refresh();
        this.margin.loadPositions();
        return this.margin.positions[this.index];
    }

    async getAccountValue(): Promise<number> {
        await this.margin.refresh();
        return this.margin.unweightedAccountValue.toNumber();
    }

    async marketLong(_unused, topAsk: number, quantity: number) {
        return await this.margin.makePlacePerpOrderIx({
            symbol: process.env.MARKET + '-PERP',
            orderType: { limit: {} },
            isLong: true,
            price: topAsk,
            size: quantity,
        });
    }

    async marketShort(_unused, topBid: number, quantity: number) {
        return await this.margin.makePlacePerpOrderIx({
            symbol: process.env.MARKET + '-PERP',
            orderType: { limit: {} },
            isLong: false,
            price: topBid,
            size: quantity,
        });
    }

    async checkLamports(
        provider: Provider,
        min: number,
    ): Promise<void> {
        const lamports = (
            await provider.connection.getAccountInfo(provider.wallet.publicKey)
        ).lamports;

        if (lamports < min) {
            console.log({ err: "Insufficient lamports" });
            throw new Error("Insufficient lamports");
        }
    }
}