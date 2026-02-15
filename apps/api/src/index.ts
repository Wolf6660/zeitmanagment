import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { ensureBootstrapData } from "./db/bootstrap.js";
import { prisma } from "./db/prisma.js";

async function bootstrap() {
  await ensureBootstrapData();
  const app = createApp();

  app.listen(env.API_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API laeuft auf Port ${env.API_PORT}`);
  });

  if (env.TERMINAL_PORT !== env.API_PORT) {
    app.listen(env.TERMINAL_PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Terminal API laeuft auf Port ${env.TERMINAL_PORT}`);
    });
  }
}

bootstrap().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
