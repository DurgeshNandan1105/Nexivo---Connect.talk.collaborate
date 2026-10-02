// Automatically detect whether we are running on localhost or on a deployed server
const isLocal = Boolean(
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
   window.location.hostname === "127.0.0.1" ||
   window.location.hostname === "[::1]" ||
   window.location.hostname.startsWith("192.168.") ||
   window.location.hostname.startsWith("10.") ||
   window.location.hostname.endsWith(".local") ||
   window.location.port === "3000")
);

// Allow overriding via localStorage if explicitly wanting to test with the remote Render cloud backend
const forceRender = typeof window !== "undefined" && localStorage.getItem("USE_RENDER_SERVER") === "true";

let IS_PROD = !isLocal || forceRender;

const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
const server = IS_PROD
  ? "https://nexivobackend.onrender.com"
  : `http://${host}:8000`;

export default server;
