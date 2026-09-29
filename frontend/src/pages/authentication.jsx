import * as React from "react";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import TextField from "@mui/material/TextField";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Typography from "@mui/material/Typography";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";

import { createTheme, ThemeProvider } from "@mui/material/styles";
import { AuthContext } from "../contexts/AuthContext";
import server from "../environment";

const defaultTheme = createTheme();

export default function Authentication() {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [slowServerNotice, setSlowServerNotice] = React.useState(false);

  // 0 = Sign In, 1 = Sign Up
  const [formState, setFormState] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  const { handleRegister, handleLogin } = React.useContext(AuthContext);

  // Pre-warm backend on page load so cold start is triggered before form submission
  React.useEffect(() => {
    try {
      fetch(`${server}/api/v1/users/login`, {
        method: "OPTIONS",
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
    <ThemeProvider theme={defaultTheme}>
      <Grid container component="main" sx={{ height: "100vh" }}>
        <CssBaseline />

        <Grid
          size={{ xs: 0, sm: 4, md: 7 }}
          sx={{
            backgroundImage: "url('https://picsum.photos/1200/900')",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />

        <Grid
          size={{ xs: 12, sm: 8, md: 5 }}
          component={Paper}
          elevation={6}
          square
        >
          <Box
            sx={{
              my: 6,
              mx: 4,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <Avatar sx={{ m: 1, bgcolor: "secondary.main" }}>
              <LockOutlinedIcon />
            </Avatar>

            <Typography component="h1" variant="h5" sx={{ fontWeight: 600 }}>
              {formState === 0 ? "Sign In to Nexivo" : "Create your Account"}
            </Typography>

            {/* Tab switchers */}
            <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
              <Button
                variant={formState === 0 ? "contained" : "outlined"}
                onClick={() => {
                  setFormState(0);
                  setError("");
                }}
                disabled={loading}
                sx={{ borderRadius: "20px", textTransform: "none", px: 3 }}
              >
                Sign In
              </Button>

              <Button
                variant={formState === 1 ? "contained" : "outlined"}
                onClick={() => {
                  setFormState(1);
                  setError("");
                }}
                disabled={loading}
                sx={{ borderRadius: "20px", textTransform: "none", px: 3 }}
              >
                Sign Up
              </Button>
            </Box>

            <Box
              component="form"
              onSubmit={handleAuth}
              noValidate
              sx={{
                mt: 2,
                width: "100%",
              }}
            >
              {formState === 1 && (
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  id="name"
                  label="Full Name"
                  name="name"
                  value={name}
                  disabled={loading}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                />
              )}

              <TextField
                margin="normal"
                required
                fullWidth
                id="username"
                label="Username"
                name="username"
                value={username}
                disabled={loading}
                autoFocus={formState === 0}
                onChange={(e) => setUsername(e.target.value)}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                id="password"
                name="password"
                label="Password"
                type="password"
                value={password}
                disabled={loading}
                onChange={(e) => setPassword(e.target.value)}
              />

              {error && (
                <Alert severity="error" sx={{ mt: 2, borderRadius: "10px" }}>
                  {error}
                </Alert>
              )}

              {slowServerNotice && (
                <Alert severity="info" sx={{ mt: 2, borderRadius: "10px" }}>
                  Connecting to cloud server... On Render free tier, idle instances may take ~30–50s to wake up on first launch.
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
