export function getEnv(name: any): string;
export function getChainInfo(chain: any): {
    rpcUrl: string | undefined;
    chainId: number;
};
