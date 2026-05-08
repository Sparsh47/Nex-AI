import fastify from "fastify";

const server = fastify({
  logger: true,
});

server.get("/ping", async (request, reply) => {
  return { message: "pong", status: "ok" };
});

const start = async () => {
  try {
    await server.listen({ port: 8000, host: "0.0.0.0" });
    console.log(`Server is listening on http://0.0.0.0:8000`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
