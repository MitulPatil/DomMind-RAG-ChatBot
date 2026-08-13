import { useState } from "react";
import { authLogin, saveToken } from "../api";

export function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email || !password) return;
    setLoading(true);
    setError("");

    try {
      const data = await authLogin(email, password, isRegistering);

      if (!data.success) {
        setError(data.error || data.message || "Something went wrong");
        return;
      }

      if (isRegistering) {
        setIsRegistering(false);
        setError("");
        return;
      }

      saveToken(data.token);
      localStorage.setItem("docmind_user", JSON.stringify(data.user));
      onLogin(data.user);
    } catch {
      setError("Network error - please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <span className="login-badge">Secure document workspace</span>
        <h1 className="login-title">DocMind</h1>
        <p className="login-subtitle">
          {isRegistering ? "Create your account" : "Sign in to your account"}
        </p>

        {error && <div className="inline-alert error" style={{ marginTop: "20px" }}>{error}</div>}

        <div className="login-form">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            className="field"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            className="field"
          />

          <button
            onClick={handleSubmit}
            disabled={loading || !email || !password}
            className="login-submit primary-button"
          >
            {loading ? "..." : isRegistering ? "Create account" : "Sign in"}
          </button>
        </div>

        <p className="login-footer">
          {isRegistering ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError("");
            }}
            className="text-button"
          >
            {isRegistering ? "Sign in" : "Sign up"}
          </button>
        </p>
      </div>
    </div>
  );
}
