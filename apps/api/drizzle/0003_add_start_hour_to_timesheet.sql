-- Add startHour column to timesheet_entry table
ALTER TABLE "timesheet_entry" ADD COLUMN "start_hour" real DEFAULT 9;
