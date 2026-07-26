-- Access and refresh tokens carry this version. Changing a password increments
-- it so every token issued before the change becomes invalid immediately.
ALTER TABLE "User"
ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "RefreshToken"
ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
