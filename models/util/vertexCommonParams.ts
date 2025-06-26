export const credentials = {
  client_email: process.env.GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT,
  private_key: process.env.GOOGLE_CLOUD_STORAGE_SERVICE_ACCOUNT_KEY!.replace(
    /\\n/g,
    "\n"
  ),
} as const;

const project = process.env.GOOGLE_CLOUD_PROJECT_ID;
const location = "us-east5";

export const vertexCommonParams = {
  project,
  location,
  googleAuthOptions: { credentials },
};
