// Automatically detect whether we are running on localhost or on a deployed server
const isLocal = Boolean(
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
   window.location.hostname === "127.0.0.1" ||
   window.location.hostname === "[::1]")
);

// Allow overriding via localStorage if explicitly wanting to test with the remote Render cloud backend
const forceRender = typeof window !== "undefined" && localStorage.getItem("USE_RENDER_SERVER") === "true";

let IS_PROD = !isLocal || forceRender;

const server = IS_PROD
  ? "https://nexivobackend.onrender.com"
  : "http://localhost:8000";

export default server;
