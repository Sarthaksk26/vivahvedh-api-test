-- Create StoryStatus enum if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StoryStatus') THEN
        CREATE TYPE "StoryStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    END IF;
END $$;

-- Update User table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='profileCreatedBy') THEN
        ALTER TABLE "User" ADD COLUMN "profileCreatedBy" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='requiresPasswordChange') THEN
        ALTER TABLE "User" ADD COLUMN "requiresPasswordChange" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- Update Enquiry table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Enquiry' AND column_name='isResolved') THEN
        ALTER TABLE "Enquiry" ADD COLUMN "isResolved" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- Create SuccessStory table if not exists
CREATE TABLE IF NOT EXISTS "SuccessStory" (
    "id" TEXT NOT NULL,
    "groomName" TEXT NOT NULL,
    "brideName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "photoUrl" TEXT,
    "status" "StoryStatus" NOT NULL DEFAULT 'PENDING',
    "submittedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuccessStory_pkey" PRIMARY KEY ("id")
);
