import { createWeb3Modal } from '@web3modal/wagmi/react';
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config';
import { sepolia } from 'wagmi/chains';

// Get projectId from https://cloud.walletconnect.com
const projectId = 'YOUR_PROJECT_ID'; // Replace with your WalletConnect project ID

const metadata = {
  name: 'Irys Migrate Hub',
  description: 'Upload and migrate data between Irys and Ethereum Sepolia',
  url: 'https://irys-migrate-hub.app',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

const chains = [sepolia] as const;

export const config = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
});

createWeb3Modal({
  wagmiConfig: config,
  projectId,
  enableAnalytics: true,
  enableOnramp: true
});
