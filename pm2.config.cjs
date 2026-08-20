module.exports = {
  apps: [
    {
      name: "lava-scoreboard-api",
      // .env і DB_PATH резолвляться від process.cwd(). Без cwd pm2 може
      // стартувати з іншої теки, тихо створити порожню базу й читати
      // дефолти замість .env — сервіс "працює", даних немає.
      cwd: __dirname,
      script: "dist/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "lava-scoreboard-collector",
      // .env і DB_PATH резолвляться від process.cwd(). Без cwd pm2 може
      // стартувати з іншої теки, тихо створити порожню базу й читати
      // дефолти замість .env — сервіс "працює", даних немає.
      cwd: __dirname,
      script: "dist/collector.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "lava-scoreboard-polli-collector",
      // .env і DB_PATH резолвляться від process.cwd(). Без cwd pm2 може
      // стартувати з іншої теки, тихо створити порожню базу й читати
      // дефолти замість .env — сервіс "працює", даних немає.
      cwd: __dirname,
      script: "dist/polliCollector.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "lava-scoreboard-governance-collector",
      // .env і DB_PATH резолвляться від process.cwd(). Без cwd pm2 може
      // стартувати з іншої теки, тихо створити порожню базу й читати
      // дефолти замість .env — сервіс "працює", даних немає.
      cwd: __dirname,
      script: "dist/governanceCollector.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};


