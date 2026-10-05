import * as React from "react";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import TextField from "@mui/material/TextField";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import AlternateEmailIcon from "@mui/icons-material/AlternateEmail";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import TranslateIcon from "@mui/icons-material/Translate";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";

import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useNavigate, useLocation } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";
import server from "../environment";

// Comprehensive dark theme to guarantee optimal contrast and eliminate styling glitches
const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#3b82f6",
      light: "#60a5fa",
      dark: "#1d4ed8",
      contrastText: "#ffffff",
    },
    background: {
      default: "#090d16",
      paper: "#0f172a",
    },
    text: {
      primary: "#f8fafc",
      secondary: "#94a3b8",
    },
  },
  typography: {
    fontFamily: [
      "Inter",
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      "sans-serif",
    ].join(","),
  },
  components: {
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(30, 41, 59, 0.75)",
          borderRadius: "14px",
          color: "#f8fafc",
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255, 255, 255, 0.18)",
            borderWidth: "1.5px",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(255, 255, 255, 0.35)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#3b82f6",
            borderWidth: "2px",
          },
          "&.Mui-focused": {
            boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.25)",
          },
          // Autofill normalization inside MUI input
          "& input:-webkit-autofill": {
            WebkitBoxShadow: "0 0 0 1000px #1e293b inset !important",
            WebkitTextFillColor: "#f8fafc !important",
            caretColor: "#f8fafc !important",
            borderRadius: "inherit",
          },
        },
        input: {
          padding: "14px 14px",
          fontSize: "0.95rem",
          "&::placeholder": {
            color: "#64748b",
            opacity: 1,
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: "#94a3b8",
          fontSize: "0.95rem",
          "&.Mui-focused": {
            color: "#60a5fa",
          },
        },
      },
    },
  },
});

const inputFieldSx = {
  mt: 2,
  mb: 0.5,
  "& .MuiOutlinedInput-root": {
    borderRadius: "14px",
    backgroundColor: "rgba(30, 41, 59, 0.75)",
    backdropFilter: "blur(10px)",
    color: "#f8fafc",
    "& fieldset": {
      borderColor: "rgba(255, 255, 255, 0.18)",
      borderWidth: "1.5px",
    },
    "&:hover fieldset": {
      borderColor: "rgba(255, 255, 255, 0.35)",
    },
    "&.Mui-focused fieldset": {
      borderColor: "#3b82f6",
      borderWidth: "2px",
    },
    "&.Mui-focused": {
      boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.2)",
    },
    "& input:-webkit-autofill": {
      WebkitBoxShadow: "0 0 0 1000px #1e293b inset !important",
      WebkitTextFillColor: "#f8fafc !important",
      caretColor: "#f8fafc !important",
    },
  },
  "& .MuiInputLabel-root": {
    color: "#94a3b8",
    fontSize: "0.95rem",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#60a5fa",
  },
  "& .MuiInputAdornment-root": {
    color: "#94a3b8",
  },
};

export default function Authentication() {
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [slowServerNotice, setSlowServerNotice] = React.useState(false);

  // 0 = Sign In, 1 = Sign Up
  const [formState, setFormState] = React.useState(() => {
    return location.state?.tab === 1 ? 1 : 0;
  });
  const [open, setOpen] = React.useState(false);

  const { handleRegister, handleLogin } = React.useContext(AuthContext);

  // Sync tab state if navigating with state
  React.useEffect(() => {
    if (location.state?.tab !== undefined) {
      setFormState(location.state.tab);
    }
  }, [location.state]);

  // Pre-warm backend on page load so cold start is triggered before form submission
  React.useEffect(() => {
    try {
      fetch(`${server}/health`, {
        method: "GET",
      }).catch(() => {});
    } catch (e) {}
  }, []);

  const handleAuth = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }

    setError("");

    // Validate inputs
    if (formState === 1 && !name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password.");
      return;
    }

    setLoading(true);
    setSlowServerNotice(false);

    // If server takes longer than 2.5 seconds, notify user about cloud wake-up
    const timer = setTimeout(() => {
      setSlowServerNotice(true);
    }, 2500);

    try {
      if (formState === 0) {
        await handleLogin(username.trim(), password);
      } else if (formState === 1) {
        const result = await handleRegister(name.trim(), username.trim(), password);
        setUsername("");
        setPassword("");
        setName("");
        setMessage(result || "Registration successful! Please sign in.");
        setOpen(true);
        setFormState(0);
      }
    } catch (err) {
      console.error("Auth error:", err);
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "Something went wrong. Please check your credentials or server status.";
      setError(errorMessage);
    } finally {
      clearTimeout(timer);
      setLoading(false);
      setSlowServerNotice(false);
    }
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <Grid
        container
        component="main"
        sx={{
          minHeight: "100dvh",
          width: "100%",
          backgroundColor: "#090d16",
        }}
      >
        <CssBaseline />

        {/* Hero visual side - hidden on mobile, visible on tablet & desktop */}
        <Grid
          size={{ xs: 12, sm: 4, md: 7 }}
          sx={{
            display: { xs: "none", sm: "block" },
            backgroundImage: "url('/background.png'), radial-gradient(circle at center, #1e1b4b, #0f172a)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
            position: "relative",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to right, rgba(9, 13, 22, 0.5), rgba(15, 23, 42, 0.9))",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              p: { sm: 4, md: 6 },
            }}
          >
            {/* Header Brand */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                cursor: "pointer",
                width: "fit-content",
              }}
              onClick={() => navigate("/")}
            >
              <img
                src="/logo.png"
                alt="Nexivo"
                style={{ width: 36, height: 36, objectFit: "contain" }}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 800,
                  color: "#ffffff",
                  letterSpacing: "-0.5px",
                }}
              >
                Nexivo
              </Typography>
            </Box>

            {/* Bottom Hero Highlights */}
            <Box sx={{ maxWidth: 600 }}>
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1.8,
                  py: 0.6,
                  borderRadius: "20px",
                  backgroundColor: "rgba(99, 102, 241, 0.2)",
                  border: "1px solid rgba(129, 140, 248, 0.35)",
                  color: "#c7d2fe",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  mb: 2.5,
                }}
              >
                <TranslateIcon sx={{ fontSize: 18 }} />
                <span>Next-Gen Video Dubbing & Translation</span>
              </Box>

              <Typography
                variant="h3"
                sx={{
                  fontWeight: 800,
                  color: "#f8fafc",
                  fontSize: { sm: "1.8rem", md: "2.6rem" },
                  lineHeight: 1.25,
                  mb: 2,
                  letterSpacing: "-0.5px",
                }}
              >
                Break language barriers with live voice dubbing.
              </Typography>

              <Typography
                variant="body1"
                sx={{
                  color: "#94a3b8",
                  fontSize: { sm: "0.95rem", md: "1.1rem" },
                  lineHeight: 1.6,
                  mb: 4,
                }}
              >
                Seamless video conferencing with instant translation across Indian and global languages.
              </Typography>

              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 2,
                    py: 1,
                    borderRadius: "12px",
                    backgroundColor: "rgba(30, 41, 59, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    color: "#cbd5e1",
                    fontSize: "0.88rem",
                  }}
                >
                  <VideocamOutlinedIcon sx={{ fontSize: 18, color: "#60a5fa" }} />
                  <span>Ultra-HD Video & Audio</span>
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 2,
                    py: 1,
                    borderRadius: "12px",
                    backgroundColor: "rgba(30, 41, 59, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    color: "#cbd5e1",
                    fontSize: "0.88rem",
                  }}
                >
                  <SecurityOutlinedIcon sx={{ fontSize: 18, color: "#34d399" }} />
                  <span>Encrypted Peer Rooms</span>
                </Box>
              </Box>
            </Box>
          </Box>
        </Grid>

        {/* Form side - responsive across mobile, tablet, and desktop */}
        <Grid
          size={{ xs: 12, sm: 8, md: 5 }}
          component={Paper}
          elevation={0}
          square
          sx={{
            backgroundColor: "#0b0f19",
            color: "#f8fafc",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            minHeight: { xs: "100dvh", sm: "100vh" },
            p: { xs: 2.5, sm: 4, md: 5 },
            position: "relative",
          }}
        >
          {/* Mobile Back to Home Navigation */}
          <Box
            sx={{
              display: { xs: "flex", sm: "none" },
              width: "100%",
              maxWidth: "420px",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 1.5,
            }}
          >
            <Button
              startIcon={<ArrowBackIcon sx={{ fontSize: 18 }} />}
              onClick={() => navigate("/")}
              sx={{
                color: "#94a3b8",
                textTransform: "none",
                fontSize: "0.88rem",
                fontWeight: 500,
                p: "4px 8px",
                "&:hover": { color: "#ffffff", backgroundColor: "rgba(255, 255, 255, 0.06)" },
              }}
            >
              Back to Home
            </Button>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, color: "#60a5fa" }}
            >
              Nexivo
            </Typography>
          </Box>

          <Box
            sx={{
              width: "100%",
              maxWidth: "420px",
              my: "auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Lock avatar with modern gradient and shadow */}
            <Avatar
              sx={{
                m: 1,
                width: 52,
                height: 52,
                background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
                boxShadow: "0 8px 24px rgba(59, 130, 246, 0.35)",
              }}
            >
              <LockOutlinedIcon sx={{ fontSize: 26, color: "#ffffff" }} />
            </Avatar>

            <Typography
              component="h1"
              variant="h5"
              sx={{
                fontWeight: 700,
                color: "#f8fafc",
                fontSize: { xs: "1.45rem", sm: "1.7rem" },
                textAlign: "center",
                mt: 1,
              }}
            >
              {formState === 0 ? "Sign In to Nexivo" : "Create your Account"}
            </Typography>

            <Typography
              variant="body2"
              sx={{
                color: "#94a3b8",
                mt: 0.8,
                mb: 1.5,
                textAlign: "center",
                fontSize: { xs: "0.88rem", sm: "0.95rem" },
              }}
            >
              {formState === 0
                ? "Enter your credentials to access your meetings"
                : "Join thousands of users connecting globally"}
            </Typography>

            {/* Segmented Tab Controller (Pill Toggle) */}
            <Box
              sx={{
                mt: 2,
                mb: 1,
                p: "4px",
                display: "flex",
                backgroundColor: "rgba(30, 41, 59, 0.8)",
                borderRadius: "14px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                width: "100%",
              }}
            >
              <Button
                fullWidth
                onClick={() => {
                  setFormState(0);
                  setError("");
                }}
                disabled={loading}
                sx={{
                  borderRadius: "10px",
                  py: 1,
                  fontSize: "0.92rem",
                  fontWeight: 600,
                  textTransform: "none",
                  transition: "all 0.25s ease",
                  backgroundColor: formState === 0 ? "#2563eb" : "transparent",
                  color: formState === 0 ? "#ffffff" : "#94a3b8",
                  boxShadow: formState === 0 ? "0 4px 14px rgba(37, 99, 235, 0.4)" : "none",
                  "&:hover": {
                    backgroundColor: formState === 0 ? "#1d4ed8" : "rgba(255, 255, 255, 0.05)",
                    color: "#ffffff",
                  },
                }}
              >
                Sign In
              </Button>

              <Button
                fullWidth
                onClick={() => {
                  setFormState(1);
                  setError("");
                }}
                disabled={loading}
                sx={{
                  borderRadius: "10px",
                  py: 1,
                  fontSize: "0.92rem",
                  fontWeight: 600,
                  textTransform: "none",
                  transition: "all 0.25s ease",
                  backgroundColor: formState === 1 ? "#2563eb" : "transparent",
                  color: formState === 1 ? "#ffffff" : "#94a3b8",
                  boxShadow: formState === 1 ? "0 4px 14px rgba(37, 99, 235, 0.4)" : "none",
                  "&:hover": {
                    backgroundColor: formState === 1 ? "#1d4ed8" : "rgba(255, 255, 255, 0.05)",
                    color: "#ffffff",
                  },
                }}
              >
                Sign Up
              </Button>
            </Box>

            <Box
              component="form"
              onSubmit={handleAuth}
              noValidate
              sx={{
                mt: 1.5,
                width: "100%",
              }}
            >
              {formState === 1 && (
                <TextField
                  required
                  fullWidth
                  id="name"
                  label="Full Name"
                  name="name"
                  placeholder="e.g. Alex Johnson"
                  value={name}
                  disabled={loading}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  sx={inputFieldSx}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonOutlinedIcon sx={{ color: "#94a3b8", fontSize: 20 }} />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              )}

              <TextField
                required
                fullWidth
                id="username"
                label="Username"
                name="username"
                placeholder="Enter your username"
                value={username}
                disabled={loading}
                autoFocus={formState === 0}
                onChange={(e) => setUsername(e.target.value)}
                sx={inputFieldSx}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <AlternateEmailIcon sx={{ color: "#94a3b8", fontSize: 20 }} />
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <TextField
                required
                fullWidth
                id="password"
                name="password"
                label="Password"
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                value={password}
                disabled={loading}
                onChange={(e) => setPassword(e.target.value)}
                sx={inputFieldSx}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlinedIcon sx={{ color: "#94a3b8", fontSize: 20 }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle password visibility"
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          size="small"
                          sx={{ color: "#94a3b8", "&:hover": { color: "#ffffff" } }}
                        >
                          {showPassword ? (
                            <VisibilityOff sx={{ fontSize: 20 }} />
                          ) : (
                            <Visibility sx={{ fontSize: 20 }} />
                          )}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />

              {error && (
                <Alert
                  severity="error"
                  sx={{
                    mt: 2,
                    borderRadius: "12px",
                    backgroundColor: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                    color: "#fca5a5",
                    "& .MuiAlert-icon": { color: "#f87171" },
                  }}
                >
                  {error}
                </Alert>
              )}

              {slowServerNotice && (
                <Alert
                  severity="info"
                  sx={{
                    mt: 2,
                    borderRadius: "12px",
                    backgroundColor: "rgba(59, 130, 246, 0.15)",
                    border: "1px solid rgba(59, 130, 246, 0.35)",
                    color: "#93c5fd",
                    "& .MuiAlert-icon": { color: "#60a5fa" },
                  }}
                >
                  Connecting to cloud server... Idle free-tier instances may take ~30–50s to wake up on first launch.
                </Alert>
              )}

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading}
                sx={{
                  mt: 3,
                  mb: 2,
                  py: 1.4,
                  fontSize: "1rem",
                  fontWeight: 600,
                  textTransform: "none",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
                  boxShadow: "0 8px 24px rgba(59, 130, 246, 0.35)",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    transform: "translateY(-1px)",
                    boxShadow: "0 12px 28px rgba(99, 102, 241, 0.5)",
                  },
                }}
              >
                {loading ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <CircularProgress size={20} color="inherit" />
                    <span>{formState === 0 ? "Signing in..." : "Creating account..."}</span>
                  </Box>
                ) : (
                  formState === 0 ? "Sign In" : "Register"
                )}
              </Button>

              {/* Bottom Quick Switch Link */}
              <Box sx={{ textAlign: "center", mt: 1 }}>
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                  {formState === 0 ? "Don't have an account? " : "Already have an account? "}
                  <Box
                    component="span"
                    onClick={() => {
                      setFormState(formState === 0 ? 1 : 0);
                      setError("");
                    }}
                    sx={{
                      color: "#60a5fa",
                      fontWeight: 600,
                      cursor: "pointer",
                      "&:hover": { textDecoration: "underline", color: "#93c5fd" },
                    }}
                  >
                    {formState === 0 ? "Sign Up" : "Sign In"}
                  </Box>
                </Typography>
              </Box>
            </Box>
          </Box>
        </Grid>
      </Grid>

      <Snackbar
        open={open}
        autoHideDuration={5000}
        message={message}
        onClose={() => setOpen(false)}
      />
    </ThemeProvider>
  );
}
