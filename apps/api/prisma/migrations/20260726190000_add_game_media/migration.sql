CREATE TABLE "GameScreenshot" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameScreenshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GameScreenshot"
ADD CONSTRAINT "GameScreenshot_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
