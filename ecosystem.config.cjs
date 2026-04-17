/**
 * PM2: путь к .env без пробелов (симлинк создаёт scripts/deploy.sh → ~/.shectory-assist.env).
 */
const path = require("node:path");
const os = require("node:os");

const root = __dirname;
const envFile = path.join(os.homedir(), ".shectory-assist.env");

module.exports = {
  apps: [
    {
      name: "shectory-assist-bot",
      cwd: root,
      script: "apps/bot/dist/index.js",
      interpreter: "node",
      node_args: `--env-file=${envFile}`,
      autorestart: true,
      max_restarts: 20,
      exp_backoff_restart_delay: 200,
    },
  ],
};
