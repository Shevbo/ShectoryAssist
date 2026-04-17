/** PM2: `--env-file` — `.env` в корне репозитория (на hoster путь без пробелов: ~/shectory-assist). */
const path = require("node:path");

const root = __dirname;
const envFile = path.join(root, ".env");

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
