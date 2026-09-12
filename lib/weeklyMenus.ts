import fs from "node:fs";
import path from "node:path";

export type WeeklyMenu = {
  date: string;
  pages: string[];
};

const weeklyMenusDirectory = path.join(process.cwd(), "public", "weekly-menus");
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const pagePattern = /^page-(\d+)\.(png|jpe?g|webp)$/i;

function isValidDateFolder(value: string) {
  if (!datePattern.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getMenuPages(date: string) {
  const directory = path.join(weeklyMenusDirectory, date);

  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pagePattern.test(entry.name))
    .map((entry) => {
      const match = entry.name.match(pagePattern);
      return {
        filename: entry.name,
        pageNumber: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.pageNumber - b.pageNumber || a.filename.localeCompare(b.filename))
    .map(({ filename }) => `/weekly-menus/${date}/${filename}`);
}

export function getWeeklyMenus(): WeeklyMenu[] {
  if (!fs.existsSync(weeklyMenusDirectory)) {
    return [];
  }

  return fs
    .readdirSync(weeklyMenusDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isValidDateFolder(entry.name))
    .map((entry) => ({
      date: entry.name,
      pages: getMenuPages(entry.name),
    }))
    .filter((menu) => menu.pages.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getWeeklyMenu(date: string) {
  return getWeeklyMenus().find((menu) => menu.date === date);
}

export function formatMenuDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}
