import { ArgusServer } from "../src";

async function main(): Promise<void> {
  const server = new ArgusServer();

  server.method("user.get", async (payload) => {
    const input = payload as {
      id: number;
    };

    return {
      id: input.id,
      name: "Williams"
    };
  });

  const port = await server.listen(7000);

  console.log(`Argus server listening on port ${port}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
