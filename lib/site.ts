export function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (!process.env.VERCEL) return "http://localhost:3000";
  throw new Error("The application URL is not configured.");
}
