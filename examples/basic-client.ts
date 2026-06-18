import { ArgusClient } from "../src";

async function main(): Promise<void> {
  const client = new ArgusClient({
    host: "127.0.0.1",
    port: 7000
  });

  const user = await client.call("user.get", {
    id: 1
  });

  console.log(user);

  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
