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

import { createTheme, ThemeProvider } from "@mui/material/styles";
import { AuthContext } from "../contexts/AuthContext";

const defaultTheme = createTheme();

export default function Authentication() {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

 
  const [formState, setFormState] = React.useState(0);

  const [open, setOpen] = React.useState(false);

  const { handleRegister, handleLogin } = React.useContext(AuthContext);

  const handleAuth = async () => {
    try {
      setError("");

   
      if (formState === 0) {
        await handleLogin(username, password);
      }
  
      if (formState === 1) {
        const result = await handleRegister(name, username, password);

        console.log(result);

        setUsername("");
        setPassword("");
        setName("");

        setMessage(result);
        setOpen(true);

  
        setFormState(0);
      }
    } catch (err) {
      console.log(err);

      const errorMessage =
        err.response?.data?.message ||
        "Something went wrong. Please try again.";

      setError(errorMessage);
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
              my: 8,
              mx: 4,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
 
            <Avatar
              sx={{
                m: 1,
                bgcolor: "secondary.main",
              }}
            >
              <LockOutlinedIcon />
            </Avatar>

          
            <Typography component="h1" variant="h5">
              {formState === 0 ? "Sign In" : "Sign Up"}
            </Typography>

           
            <Box sx={{ mt: 2 }}>
              <Button
                variant={formState === 0 ? "contained" : "outlined"}
                onClick={() => {
                  setFormState(0);
                  setError("");
                }}
              >
                Sign In
              </Button>

              <Button
                variant={formState === 1 ? "contained" : "outlined"}
                onClick={() => {
                  setFormState(1);
                  setError("");
                }}
                sx={{ ml: 1 }}
              >
                Sign Up
              </Button>
            </Box>

           
            <Box
              component="form"
              noValidate
              sx={{
                mt: 1,
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
                onChange={(e) => setPassword(e.target.value)}
              />

            
              {error && (
                <Typography
                  sx={{
                    color: "red",
                    mt: 1,
                  }}
                >
                  {error}
                </Typography>
              )}

            
              <Button
                type="button"
                fullWidth
                variant="contained"
                sx={{
                  mt: 3,
                  mb: 2,
                }}
                onClick={handleAuth}
              >
                {formState === 0 ? "Login" : "Register"}
              </Button>
            </Box>
          </Box>
        </Grid>
      </Grid>

     
      <Snackbar
        open={open}
        autoHideDuration={4000}
        message={message}
        onClose={() => setOpen(false)}
      />
    </ThemeProvider>
  );
}
