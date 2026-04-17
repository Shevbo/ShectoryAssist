/**
 * PM2: `interpreter: node` + `node_args: --env-file=…` на hoster давал «висение» на getMe;
 * `interpreter: none` + `script: node` + `args` — нормальный exec без обёртки PM2 над node.
 */
const path = require("node:path");

const root = __dirname;
const envFile = path.join(root, ".env");
const entry = path.join(root, "apps", "bot", "dist", "index.js");
/** Тот же бинарник Node, что запускает `pm2 start` (актуально при nvm / нестандартном PATH). */
const nodeBin = process.execPath;

module.exports = {
  apps: [
    {
      name: "shectory-assist-bot",
      cwd: root,
      script: nodeBin,
      args: [`--env-file=${envFile}`, entry],
      interpreter: "none",
      autorestart: true,
      max_restarts: 20,
      exp_backoff_restart_delay: 200,
    },
  ],
};
