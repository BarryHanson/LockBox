-- AddColumn vaultCheckEncrypted and vaultCheckIv to VaultSettings
ALTER TABLE "VaultSettings" ADD COLUMN "vaultCheckEncrypted" TEXT,
ADD COLUMN "vaultCheckIv" TEXT;
