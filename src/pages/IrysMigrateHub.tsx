import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { WebUploader } from '@irys/web-upload';
import { WebEthereum } from '@irys/web-upload-ethereum';
import { Buffer } from 'buffer';
import { useAccount, useConnect, useDisconnect, useWalletClient, useSwitchChain } from 'wagmi';
import { useWeb3Modal } from '@web3modal/wagmi/react';

// Make Buffer available globally
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
}

// Extend Window interface for ethereum
declare global {
  interface Window {
    ethereum?: any;
    Buffer: typeof Buffer;
  }
}
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, ArrowRightLeft, ExternalLink, Loader2 } from 'lucide-react';

interface UploadedFile {
  id: string;
  name: string;
  platform: 'irys' | 'sepolia';
  txHash: string;
  gatewayUrl?: string;
  timestamp: number;
  fileData?: ArrayBuffer;
}

export default function IrysMigrateHub() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadPlatform, setUploadPlatform] = useState<'irys' | 'sepolia'>('irys');
  const [isUploading, setIsUploading] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedForMigration, setSelectedForMigration] = useState<UploadedFile | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [fileDataCache, setFileDataCache] = useState<Map<string, ArrayBuffer>>(new Map());
  
  // Wagmi hooks
  const { address, isConnected, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const { open } = useWeb3Modal();

  const connectWallet = async () => {
    try {
      await open();
    } catch (error) {
      console.error('Wallet connection error:', error);
      setStatus({ type: 'error', message: 'Failed to connect wallet' });
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      setStatus({ type: 'success', message: `Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}` });
    }
  }, [isConnected, address]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setStatus({ type: 'error', message: 'Please select an image file' });
        return;
      }
      setSelectedFile(file);
      setStatus(null);
    }
  };

  const uploadToIrys = async (file: File) => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      
      // Create Irys uploader with proper provider setup for devnet (testnet)
      const irysUploader = await WebUploader(WebEthereum)
        .withProvider(provider)
        .devnet(); // Use Irys devnet/testnet
      
      // Convert file to buffer
      const fileBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(fileBuffer);
      
      // Upload to Irys
      const tags = [
        { name: 'Content-Type', value: file.type },
        { name: 'Application', value: 'IrysMigrateHub' },
        { name: 'FileName', value: file.name },
      ];

      const receipt = await irysUploader.upload(buffer, { tags });
      
      return {
        txHash: receipt.id,
        gatewayUrl: `https://gateway.irys.xyz/${receipt.id}`,
      };
    } catch (error) {
      console.error('Irys upload error:', error);
      throw new Error('Failed to upload to Irys');
    }
  };

  const uploadToSepolia = async (file: File) => {
    try {
      if (!walletClient) {
        throw new Error('Wallet not connected');
      }

      // Check if connected to Sepolia (chainId 11155111)
      if (chain?.id !== 11155111) {
        // Request network switch to Sepolia
        try {
          await switchChain({ chainId: 11155111 });
          // Wait for network switch
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (switchError: any) {
          console.error('Failed to switch to Sepolia:', switchError);
          throw new Error('Please switch to Sepolia network in your wallet');
        }
      }
      
      // Use window.ethereum directly for better compatibility with OKX wallet
      if (!window.ethereum) {
        throw new Error('No ethereum provider found');
      }

      // Request accounts to ensure wallet is ready
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      // Create provider and signer
      const provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
      await provider.send('eth_requestAccounts', []);
      
      // Wait a bit more to ensure provider is ready
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const signer = provider.getSigner();
      
      // Verify we can get the address
      let signerAddress: string;
      try {
        signerAddress = await signer.getAddress();
        console.log('Signer address:', signerAddress);
      } catch (err) {
        console.error('Failed to get signer address:', err);
        throw new Error('Please ensure your wallet is connected and unlocked');
      }
      
      // Store file hash on-chain
      const fileBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(fileBuffer);
      const fileHash = ethers.utils.keccak256(buffer);
      
      console.log('Uploading to Sepolia:', { fileHash, signerAddress });
      
      // Simple transaction to store hash
      const tx = await signer.sendTransaction({
        to: signerAddress,
        value: 0,
        data: fileHash,
        gasLimit: 100000,
      });
      
      console.log('Transaction sent:', tx.hash);
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);
      
      return {
        txHash: tx.hash,
        fileData: fileBuffer,
      };
    } catch (error) {
      console.error('Sepolia upload error:', error);
      throw new Error(`Failed to upload to Sepolia: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setStatus({ type: 'error', message: 'Please select a file first' });
      return;
    }

    if (!isConnected) {
      setStatus({ type: 'error', message: 'Please connect your wallet first' });
      return;
    }

    setIsUploading(true);
    setStatus({ type: 'info', message: `Uploading to ${uploadPlatform === 'irys' ? 'Irys' : 'Eth Sepolia'}...` });

    try {
      let result;
      
      if (uploadPlatform === 'irys') {
        result = await uploadToIrys(selectedFile);
      } else {
        result = await uploadToSepolia(selectedFile);
      }

      const fileId = crypto.randomUUID();
      
      // Cache file data for Sepolia uploads and migration
      if (result.fileData) {
        setFileDataCache(prev => new Map(prev).set(fileId, result.fileData!));
      } else if (uploadPlatform === 'sepolia') {
        // If no fileData returned, read it again
        const fileBuffer = await selectedFile.arrayBuffer();
        setFileDataCache(prev => new Map(prev).set(fileId, fileBuffer));
      }

      const newFile: UploadedFile = {
        id: fileId,
        name: selectedFile.name,
        platform: uploadPlatform,
        txHash: result.txHash,
        gatewayUrl: result.gatewayUrl,
        timestamp: Date.now(),
      };

      setUploadedFiles(prev => [newFile, ...prev]);
      setStatus({ 
        type: 'success', 
        message: `Successfully uploaded to ${uploadPlatform === 'irys' ? 'Irys' : 'Eth Sepolia'}!` 
      });
      setSelectedFile(null);
      
      // Reset file input
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error) {
      console.error('Upload error:', error);
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Upload failed' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleMigrate = async () => {
    if (!selectedForMigration) {
      setStatus({ type: 'error', message: 'Please select a file to migrate' });
      return;
    }

    if (!isConnected) {
      setStatus({ type: 'error', message: 'Please connect your wallet first' });
      return;
    }

    setIsMigrating(true);
    const targetPlatform = selectedForMigration.platform === 'irys' ? 'sepolia' : 'irys';
    setStatus({ type: 'info', message: `Migrating to ${targetPlatform === 'irys' ? 'Irys' : 'Eth Sepolia'}...` });

    try {
      // Fetch the file from the source
      let fileData: ArrayBuffer;
      let fileName = selectedForMigration.name;
      
      if (selectedForMigration.platform === 'irys' && selectedForMigration.gatewayUrl) {
        const response = await fetch(selectedForMigration.gatewayUrl);
        if (!response.ok) throw new Error('Failed to fetch file from Irys');
        fileData = await response.arrayBuffer();
      } else if (selectedForMigration.platform === 'sepolia') {
        // Retrieve file data from cache
        const cachedData = fileDataCache.get(selectedForMigration.id);
        if (!cachedData) {
          throw new Error('Original file data not found. Please re-upload the file.');
        }
        fileData = cachedData;
      } else {
        throw new Error('Unable to retrieve file data');
      }

      // Create a File object from the data
      const mimeType = selectedForMigration.name.endsWith('.png') ? 'image/png' : 
                       selectedForMigration.name.endsWith('.jpg') || selectedForMigration.name.endsWith('.jpeg') ? 'image/jpeg' : 
                       'image/png';
      const file = new File([fileData], fileName, { type: mimeType });

      // Upload to target platform
      let result;
      if (targetPlatform === 'irys') {
        result = await uploadToIrys(file);
      } else {
        result = await uploadToSepolia(file);
      }

      const migratedFileId = crypto.randomUUID();
      
      // Cache file data for migrated files
      if (result.fileData) {
        setFileDataCache(prev => new Map(prev).set(migratedFileId, result.fileData!));
      } else if (targetPlatform === 'sepolia') {
        setFileDataCache(prev => new Map(prev).set(migratedFileId, fileData));
      }

      const migratedFile: UploadedFile = {
        id: migratedFileId,
        name: fileName,
        platform: targetPlatform,
        txHash: result.txHash,
        gatewayUrl: result.gatewayUrl,
        timestamp: Date.now(),
      };

      setUploadedFiles(prev => [migratedFile, ...prev]);
      setStatus({ 
        type: 'success', 
        message: `Successfully migrated to ${targetPlatform === 'irys' ? 'Irys' : 'Eth Sepolia'}!` 
      });
      setSelectedForMigration(null);
    } catch (error) {
      console.error('Migration error:', error);
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Migration failed' });
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-600 via-teal-500 to-teal-400 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-3">Irys Migrate Hub</h1>
          <p className="text-white/90 text-lg">Upload and migrate your data between Irys and Ethereum Sepolia</p>
        </div>

        {/* Wallet Connection */}
        <Card className="mb-6 border-white/20 bg-black/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            {!isConnected ? (
              <Button 
                onClick={connectWallet} 
                className="w-full bg-teal-500 text-white hover:bg-teal-600"
                size="lg"
              >
                Connect Wallet
              </Button>
            ) : (
              <div className="text-center text-white">
                <p className="text-sm opacity-80">Connected Wallet</p>
                <p className="font-mono font-semibold">{address?.slice(0, 6)}...{address?.slice(-4)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Alert */}
        {status && (
          <Alert className={`mb-6 ${
            status.type === 'success' ? 'bg-green-500/20 border-green-500/50 text-white' :
            status.type === 'error' ? 'bg-red-500/20 border-red-500/50 text-white' :
            'bg-blue-500/20 border-blue-500/50 text-white'
          }`}>
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="upload" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 bg-black/60 backdrop-blur-sm">
            <TabsTrigger value="upload" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white text-white">
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="migrate" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white text-white">
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Migrate
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload">
            <Card className="border-white/20 bg-black/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white">Upload Image</CardTitle>
                <CardDescription className="text-white/80">
                  Choose a platform and upload your image file
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="platform" className="text-white">Select Platform</Label>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <Button
                      variant={uploadPlatform === 'irys' ? 'default' : 'outline'}
                      onClick={() => setUploadPlatform('irys')}
                      className={uploadPlatform === 'irys' ? 'bg-teal-500 text-white' : 'border-white/30 text-white hover:bg-black/50'}
                    >
                      Irys
                    </Button>
                    <Button
                      variant={uploadPlatform === 'sepolia' ? 'default' : 'outline'}
                      onClick={() => setUploadPlatform('sepolia')}
                      className={uploadPlatform === 'sepolia' ? 'bg-teal-500 text-white' : 'border-white/30 text-white hover:bg-black/50'}
                    >
                      Eth Sepolia
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="file-upload" className="text-white">Select Image</Label>
                  <Input
                    id="file-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="mt-2 bg-black/60 border-white/30 text-white file:bg-teal-500 file:text-white"
                  />
                  {selectedFile && (
                    <p className="text-sm text-white/80 mt-2">Selected: {selectedFile.name}</p>
                  )}
                </div>

                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || isUploading || !isConnected}
                  className="w-full bg-teal-500 text-white hover:bg-teal-600"
                  size="lg"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload to {uploadPlatform === 'irys' ? 'Irys' : 'Eth Sepolia'}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Migrate Tab */}
          <TabsContent value="migrate">
            <Card className="border-white/20 bg-black/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white">Migrate Files</CardTitle>
                <CardDescription className="text-white/80">
                  Select a file to migrate between platforms
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {uploadedFiles.length === 0 ? (
                  <p className="text-white/60 text-center py-8">No files uploaded yet</p>
                ) : (
                  <>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {uploadedFiles.map((file) => (
                        <div
                          key={file.id}
                          onClick={() => setSelectedForMigration(file)}
                          className={`p-4 rounded-lg cursor-pointer transition-all ${
                            selectedForMigration?.id === file.id
                              ? 'bg-teal-500 text-white ring-2 ring-teal-300'
                              : 'bg-black/60 text-white hover:bg-black/80'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-semibold">{file.name}</p>
                              <p className="text-sm opacity-80">
                                Platform: {file.platform === 'irys' ? 'Irys' : 'Eth Sepolia'}
                              </p>
                              <p className="text-xs font-mono opacity-70 mt-1">
                                TX: {file.txHash.slice(0, 10)}...{file.txHash.slice(-8)}
                              </p>
                            </div>
                            {file.gatewayUrl && (
                              <a
                                href={file.gatewayUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="ml-2"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {selectedForMigration && (
                      <div className="bg-black/60 p-4 rounded-lg text-white">
                        <p className="text-sm mb-2">
                          Migrate <span className="font-semibold">{selectedForMigration.name}</span> from{' '}
                          <span className="font-semibold">
                            {selectedForMigration.platform === 'irys' ? 'Irys' : 'Eth Sepolia'}
                          </span>{' '}
                          to{' '}
                          <span className="font-semibold">
                            {selectedForMigration.platform === 'irys' ? 'Eth Sepolia' : 'Irys'}
                          </span>
                        </p>
                      </div>
                    )}

                    <Button
                      onClick={handleMigrate}
                      disabled={!selectedForMigration || isMigrating || !isConnected}
                      className="w-full bg-teal-500 text-white hover:bg-teal-600"
                      size="lg"
                    >
                      {isMigrating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Migrating...
                        </>
                      ) : (
                        <>
                          <ArrowRightLeft className="w-4 h-4 mr-2" />
                          Migrate to {selectedForMigration?.platform === 'irys' ? 'Eth Sepolia' : 'Irys'}
                        </>
                      )}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <Card className="mt-6 border-white/20 bg-black/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white">Recent Uploads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {uploadedFiles.slice(0, 5).map((file) => (
                  <div key={file.id} className="bg-black/60 p-4 rounded-lg text-white">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-semibold">{file.name}</p>
                        <p className="text-sm opacity-80">
                          {file.platform === 'irys' ? 'Irys' : 'Eth Sepolia'} • {new Date(file.timestamp).toLocaleString()}
                        </p>
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-mono">
                            Transaction: {file.txHash}
                          </p>
                          {file.gatewayUrl && (
                            <a
                              href={file.gatewayUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs flex items-center gap-1 hover:underline"
                            >
                              View on Gateway <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
