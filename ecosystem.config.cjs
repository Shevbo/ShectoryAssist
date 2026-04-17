/**
 * PM2 на VDS: cwd указывает на корень репозитория (в т.ч. путь с пробелом).
 * Запуск: pm2 start ecosystem.config.cjs
 */
const path = require("node:path");

const root = __dirname;

module.exports = {
  apps: [
    {
      name: "shectory-assist-bot",
      cwd: root,
      script: "apps/bot/dist/index.js",
      interpreter: "node",
      node_args: `--env-file=${path.join(root, ".env")}`,
      autorestart: true,
      max_restarts: 20,
      exp_backoff_restart_delay: 200,
    },
  ],
};
