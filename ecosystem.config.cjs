/** PM2: скрипт `scripts/run-assist-bot.sh` поднимает node с `--env-file` к `.env` в корне репо. */
const path = require("node:path");

const root = __dirname;

module.exports = {
  apps: [
    {
      name: "shectory-assist-bot",
      cwd: root,
      script: path.join(root, "scripts", "run-assist-bot.sh"),
      interpreter: "bash",
      autorestart: true,
      max_restarts: 20,
      exp_backoff_restart_delay: 200,
    },
  ],
};
